import { execFile } from 'node:child_process';
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
  if (String(codec).toLowerCase() !== 'flac') {
    return { verdict: 'not-flac', ratio: 0, limitHz: 0 };
  }
  if (!(cutoffHz > 0)) {
    return { verdict: 'unknown', ratio: 0, limitHz: Math.min(sampleRate > 0 ? sampleRate / 2 : 22050, 22050) };
  }
  const limite = Math.min(sampleRate > 0 ? sampleRate / 2 : 22050, 22050);
  const ratio = limite > 0 ? cutoffHz / limite : 0;
  // 0.97 exige contenido audible a menos de 0.7 kHz del límite: los
  // codificadores con pérdida medidos (MP3 128-320) se quedan en 0.92-0.94.
  if (ratio >= 0.97) return { verdict: 'lossless', ratio, limitHz: limite };
  if (ratio >= 0.86) return { verdict: 'high-cut', ratio, limitHz: limite };
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

async function decodeSamples(file, seconds, offsetSeconds = 0) {
  if (!config.ffmpegPath) return null;
  try {
    const { stdout } = await execFileAsync(
      config.ffmpegPath,
      [
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
        '-ar',
        '44100',
        '-f',
        'f32le',
        '-',
      ],
      { timeout: 120_000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' },
    );
    const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    const usable = buffer.length - (buffer.length % 4);
    const samples = new Float32Array(usable / 4);
    for (let i = 0; i < samples.length; i += 1) samples[i] = buffer.readFloatLE(i * 4);
    return samples;
  } catch {
    return null;
  }
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

export async function analyzeFile(file, { deep = false, headerBytes = null } = {}) {
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
  const offsets =
    probe.duration > DECODE_SECONDS * 3
      ? [probe.duration * 0.15, probe.duration * 0.5, probe.duration * 0.85]
      : probe.duration > DECODE_SECONDS * 2
        ? [probe.duration * 0.25, probe.duration * 0.75]
        : [0];
  let cutoffHz = 0;
  for (const offset of offsets) {
    const samples = await decodeSamples(file, DECODE_SECONDS, offset);
    if (!samples || samples.length < 44100) continue;
    cutoffHz = Math.max(cutoffHz, spectrumCutoff(samples, 44100));
  }
  // Un origen de 11 kHz analizado a 44,1 kHz puede marcar imágenes por encima de
  // su propio Nyquist: se recorta al límite del formato para que la razón no pase de 1.
  const limiteFormato = Math.min(probe.sampleRate > 0 ? probe.sampleRate / 2 : 22050, 22050);
  const corteAjustado = limiteFormato > 0 ? Math.min(cutoffHz, limiteFormato) : cutoffHz;
  const juicio = judgeSpectrum({ codec, sampleRate: probe.sampleRate || 44100, cutoffHz: corteAjustado });
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
    return await analyzeFile(file, { headerBytes: buffer.subarray(0, 64) });
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
export function evaluateFlacDelivery(analysis) {
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
      }
    : { verdict: 'unknown', label: verdictLabel('unknown') };

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
  return {
    deliverable: true,
    code: null,
    message: `FLAC sin pérdida verificado (${khz(analysis.cutoffHz)} de ${khz(analysis.limitHz)}).`,
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
