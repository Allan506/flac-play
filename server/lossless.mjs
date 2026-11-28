import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { cached } from './cache.mjs';
import { config } from './config.mjs';
import { sniffAudioFormat } from './audio-format.mjs';
import { fetchWithRetry, httpFetch } from './http.mjs';
import { audioRequestHeaders } from './utils.mjs';

const execFileAsync = promisify(execFile);

const WINDOW = 8192;
const HOP = 4096;
const DECODE_SECONDS = 12;
// El contenido debe llegar al 99,5 % del Nyquist real del archivo: en 44,1 kHz
// son 21,9 kHz, unos 110 Hz por debajo del techo. Cualquier codificador con
// pérdida deja su corte por debajo (MP3 128-320: 20,3-20,8 kHz).
const LOSSLESS_RATIO = 0.995;
const HIGH_CUT_RATIO = 0.86;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const nextR = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nextR;
      }
    }
  }
}

function hann(size) {
  const ventana = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    ventana[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return ventana;
}

const HANN = hann(WINDOW);

/**
 * Frecuencia más alta con contenido audible: un FLAC real llega hasta el límite
 * del formato; un MP3 recodificado a FLAC deja un acantilado en 16 o 20 kHz.
 */
export function spectrumCutoff(samples, sampleRate) {
  if (!samples || samples.length < WINDOW) return 0;
  const bins = WINDOW / 2;
  const acumulado = new Float64Array(bins);
  let ventanas = 0;

  for (let start = 0; start + WINDOW <= samples.length; start += HOP) {
    const re = new Float64Array(WINDOW);
    const im = new Float64Array(WINDOW);
    for (let i = 0; i < WINDOW; i += 1) re[i] = samples[start + i] * HANN[i];
    fft(re, im);
    for (let i = 0; i < bins; i += 1) acumulado[i] += re[i] * re[i] + im[i] * im[i];
    ventanas += 1;
    if (ventanas >= 120) break;
  }
  if (!ventanas) return 0;

  const db = new Float64Array(bins);
  let pico = -Infinity;
  for (let i = 0; i < bins; i += 1) {
    const valor = 10 * Math.log10(acumulado[i] / ventanas + 1e-20);
    db[i] = valor;
    if (valor > pico) pico = valor;
  }

  const suave = new Float64Array(bins);
  for (let i = 0; i < bins; i += 1) {
    const a = db[Math.max(0, i - 1)];
    const b = db[i];
    const c = db[Math.min(bins - 1, i + 1)];
    suave[i] = (a + b + c) / 3;
  }

  const umbral = pico - 85;
  for (let i = bins - 1; i >= 0; i -= 1) {
    if (suave[i] > umbral) return (i * sampleRate) / WINDOW;
  }
  return 0;
}

export function judgeSpectrum({ codec, sampleRate, cutoffHz }) {
  // El límite es el Nyquist real del archivo, sin tope: un FLAC de 96 kHz debe
  // llevar contenido hasta 48 kHz, así que uno sobremuestreado desde 44,1 kHz
  // (corte en 22 kHz) queda al descubierto en vez de pasar por bueno.
  const limite = sampleRate > 0 ? sampleRate / 2 : 22050;
  if (String(codec).toLowerCase() !== 'flac') {
    return { verdict: 'not-flac', ratio: 0, limitHz: limite };
  }
  if (!(cutoffHz > 0)) {
    return { verdict: 'unknown', ratio: 0, limitHz: limite };
  }
  const ratio = limite > 0 ? cutoffHz / limite : 0;
  if (ratio >= LOSSLESS_RATIO) return { verdict: 'lossless', ratio, limitHz: limite };
  if (ratio >= HIGH_CUT_RATIO) return { verdict: 'high-cut', ratio, limitHz: limite };
  return { verdict: 'transcoded', ratio, limitHz: limite };
}

export const VERDICT_LABELS = {
  lossless: 'FLAC íntegro con espectro completo',
  'high-cut': 'FLAC con el espectro recortado, compatible con audio recodificado con pérdida',
  transcoded: 'FLAC recodificado desde audio con pérdida',
  'not-flac': 'No es FLAC',
  unknown: 'Sin datos suficientes',
};

export function verdictLabel(verdict) {
  return VERDICT_LABELS[verdict] ?? VERDICT_LABELS.unknown;
}

async function probeAudio(file) {
  if (!config.ffprobePath) return null;
  try {
    const { stdout } = await execFileAsync(
      config.ffprobePath,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration,bit_rate:stream=codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample',
        '-of',
        'json',
        file,
      ],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout);
    const stream = parsed.streams?.[0] ?? {};
    return {
      codec: String(stream.codec_name ?? ''),
      sampleRate: Number(stream.sample_rate) || 0,
      channels: Number(stream.channels) || 0,
      bits: Number(stream.bits_per_raw_sample || stream.bits_per_sample) || 0,
      duration: Number(parsed.format?.duration) || 0,
      bitRate: Number(parsed.format?.bit_rate) || 0,
    };
  } catch {
    return null;
  }
}

async function decodeSamples(file, seconds, offsetSeconds = 0, sampleRate = 0) {
  if (!config.ffmpegPath) return null;
  const args = [
    '-v',
    'error',
    '-nostdin',
    ...(offsetSeconds > 0 ? ['-ss', String(Math.round(offsetSeconds))] : []),
    '-i',
    file,
    '-t',
    String(seconds),
    '-ac',
    '1',
    ...(sampleRate > 0 ? ['-ar', String(sampleRate)] : []),
    '-f',
    'f32le',
    '-',
  ];
  let buffer = null;
  try {
    const { stdout } = await execFileAsync(config.ffmpegPath, args, {
      timeout: 120_000,
      maxBuffer: 128 * 1024 * 1024,
      encoding: 'buffer',
    });
    buffer = stdout;
  } catch (error) {
    // Un prefijo remoto truncado hace que ffmpeg salga con error después de
    // entregar las muestras buenas: se aprovechan en vez de perder la medida.
    buffer = error?.stdout ?? null;
  }
  if (!buffer) return null;
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const usable = bytes.length - (bytes.length % 4);
  if (usable < 4) return null;
  const samples = new Float32Array(usable / 4);
  for (let i = 0; i < samples.length; i += 1) samples[i] = bytes.readFloatLE(i * 4);
  return samples;
}

export function audioDigest(file) {
  if (!config.ffmpegPath) return Promise.resolve(null);
  return new Promise((resolve) => {
    const hash = createHash('sha256');
    const child = spawn(
      config.ffmpegPath,
      ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-f', 's32le', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null);
    }, 600_000);
    child.stdout.on('data', (chunk) => hash.update(chunk));
    child.stderr.resume();
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code === 0 ? hash.digest('hex') : null));
  });
}

export async function verifyFlacIntegrity(file) {
  if (!config.ffmpegPath) return false;
  try {
    const { stderr } = await execFileAsync(
      config.ffmpegPath,
      ['-v', 'error', '-nostdin', '-i', file, '-f', 'null', '-'],
      { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return !/md5 mismatch|invalid|corrupt/i.test(String(stderr ?? ''));
  } catch {
    return false;
  }
}

export async function analyzeFile(file, { deep = false, headerBytes = null, prefixRatio = null } = {}) {
  const container = headerBytes ? sniffAudioFormat(headerBytes) : null;
  const probe = await probeAudio(file);
  if (!probe) {
    return { verdict: 'unknown', label: verdictLabel('unknown'), error: 'ffprobe no pudo leer el archivo.' };
  }

  const codec = probe.codec || container || '';
  if (codec !== 'flac') {
    return {
      ...probe,
      container,
      cutoffHz: 0,
      limitHz: 0,
      ratio: 0,
      verdict: 'not-flac',
      label: verdictLabel('not-flac'),
      integrityOk: false,
    };
  }

  // Varias ventanas: una pasada tranquila puede parecer recortada y un archivo
  // con pérdida nunca supera su techo en ninguna. Se queda el máximo medido.
  // En un prefijo remoto el contenedor anuncia la duración completa, pero sólo
  // hay audio hasta donde llegan los bytes descargados: las ventanas se colocan
  // dentro de lo que de verdad se puede decodificar.
  const completa = probe.duration || 0;
  const disponible =
    completa > 0 && prefixRatio !== null && prefixRatio > 0 && prefixRatio < 1
      ? completa * prefixRatio
      : completa;
  const offsets =
    disponible > DECODE_SECONDS * 3
      ? [disponible * 0.15, disponible * 0.5, disponible * 0.85]
      : disponible > DECODE_SECONDS * 2
        ? [disponible * 0.25, disponible * 0.75]
        : [0];
  const tasa = probe.sampleRate > 0 ? probe.sampleRate : 44100;
  let cutoffHz = 0;
  for (const offset of offsets) {
    const samples = await decodeSamples(file, DECODE_SECONDS, offset, tasa);
    if (!samples || samples.length < WINDOW) continue;
    cutoffHz = Math.max(cutoffHz, spectrumCutoff(samples, tasa));
  }
  const limiteFormato = tasa / 2;
  const corteAjustado = limiteFormato > 0 ? Math.min(cutoffHz, limiteFormato) : cutoffHz;
  const juicio = judgeSpectrum({ codec, sampleRate: tasa, cutoffHz: corteAjustado });
  const integrityOk = deep ? await verifyFlacIntegrity(file) : null;

  return {
    ...probe,
    container,
    cutoffHz: Math.round(corteAjustado),
    limitHz: Math.round(juicio.limitHz),
    ratio: Number(juicio.ratio.toFixed(3)),
    verdict: juicio.verdict,
    label: verdictLabel(juicio.verdict),
    integrityOk,
  };
}

/**
 * El mismo archivo se analiza al comprobar calidades y otra vez al descargarlo.
 * Cachear por URL evita repetir la descarga de la muestra y el análisis espectral.
 */
export function analyzeRemote(url, options = {}) {
  return cached(`spectrum:${url}`, config.cache.probeMs * 10, () => analyzeRemoteUncached(url, options));
}

async function analyzeRemoteUncached(url, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flacplay-lossless-'));
  const file = path.join(dir, 'muestra.bin');
  try {
    const response = await fetchWithRetry(url, {
      headers: { ...audioRequestHeaders(url), Range: `bytes=0-${maxBytes - 1}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok && response.status !== 206) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 4096) return null;
    await fs.writeFile(file, buffer);
    // Con Range el servidor dice el tamaño total: así sabemos qué parte de la
    // duración anunciada cabe en el prefijo y no buscamos fuera de él.
    const rango = String(response.headers.get('content-range') ?? '');
    const total = Number(rango.match(/\/(\d+)$/)?.[1] ?? 0);
    const prefixRatio = total > buffer.length ? buffer.length / total : null;
    return await analyzeFile(file, { headerBytes: buffer.subarray(0, 64), prefixRatio });
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function khz(hz) {
  return `${((hz ?? 0) / 1000).toFixed(1).replace('.', ',')} kHz`;
}

function rejectionMessage(analysis) {
  const corte = khz(analysis.cutoffHz);
  const limite = khz(analysis.limitHz);
  if (analysis.verdict === 'high-cut') {
    return `El FLAC se corta en ${corte} de ${limite} posibles: el espectro no llega al límite del formato y encaja con audio recodificado con pérdida. No se entrega como FLAC sin pérdida.`;
  }
  if (analysis.verdict === 'transcoded') {
    return `El FLAC se corta en ${corte} de ${limite}: viene de audio con pérdida recodificado. No se entrega como FLAC sin pérdida.`;
  }
  if (analysis.verdict === 'not-flac') {
    return 'El archivo no es un FLAC real. No se entrega con extensión .flac.';
  }
  return `No se pudo medir el espectro del archivo (${verdictLabel(analysis.verdict)}), así que no se puede confirmar que sea FLAC sin pérdida.`;
}

/**
 * Regla única de entrega: un archivo con extensión .flac sólo sale del servidor
 * si el espectro llega al límite del formato y la integridad MD5 es correcta.
 * No hay opción para forzar lo contrario.
 */
export function evaluateFlacDelivery(analysis, { bitexact = null } = {}) {
  const details = analysis
    ? {
        verdict: analysis.verdict ?? 'unknown',
        label: verdictLabel(analysis.verdict),
        cutoffHz: analysis.cutoffHz ?? 0,
        limitHz: analysis.limitHz ?? 0,
        ratio: analysis.ratio ?? 0,
        sampleRate: analysis.sampleRate ?? 0,
        bits: analysis.bits ?? 0,
        integrityOk: analysis.integrityOk ?? null,
        bitexact,
      }
    : { verdict: 'unknown', label: verdictLabel('unknown'), bitexact };

  if (!analysis) {
    return {
      deliverable: false,
      code: 'LOSSLESS_NOT_VERIFIED',
      message: 'No se pudo analizar el archivo, así que no se entrega como FLAC sin pérdida.',
      details,
    };
  }
  if (analysis.integrityOk === false) {
    return {
      deliverable: false,
      code: 'LOSSLESS_INTEGRITY_FAILED',
      message:
        'El FLAC no supera la comprobación de integridad (la firma MD5 del audio no coincide). No se entrega.',
      details,
    };
  }
  if (analysis.verdict !== 'lossless') {
    return {
      deliverable: false,
      code: 'LOSSLESS_NOT_VERIFIED',
      message: rejectionMessage(analysis),
      details,
    };
  }
  if (bitexact === false) {
    return {
      deliverable: false,
      code: 'LOSSLESS_AUDIO_CHANGED',
      message:
        'El archivo preparado no contiene exactamente las mismas muestras que el original: algún paso cambió el audio. No se entrega.',
      details,
    };
  }
  return {
    deliverable: true,
    code: null,
    message: `FLAC sin pérdida verificado (${khz(analysis.cutoffHz)} de ${khz(analysis.limitHz)}, audio idéntico al origen).`,
    details,
  };
}

export function isLosslessVerified(analysis) {
  return Boolean(
    analysis &&
      analysis.verdict === 'lossless' &&
      analysis.integrityOk !== false,
  );
}
