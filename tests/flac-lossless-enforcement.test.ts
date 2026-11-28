import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { sniffAudioFormat } from '../server/audio-format.mjs';
import {
  analyzeFile,
  audioDigest,
  evaluateFlacDelivery,
  verifyFlacIntegrity,
} from '../server/lossless.mjs';

const require = createRequire(import.meta.url);
const ffmpegBin = require('ffmpeg-static') as string | null;
const ffprobeBin = (require('ffprobe-static') as { path: string }).path;
const TOOLS = Boolean(ffmpegBin && existsSync(ffmpegBin) && existsSync(ffprobeBin));

const exec = promisify(execFile);

async function ffmpeg(args: string[]) {
  await exec(ffmpegBin as string, ['-v', 'error', '-nostdin', '-y', ...args], {
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe('evaluateFlacDelivery', () => {
  const lossless = { verdict: 'lossless', cutoffHz: 22045, limitHz: 22050, integrityOk: true };

  it('entrega un FLAC con espectro completo e integridad correcta', () => {
    const resultado = evaluateFlacDelivery({ ...lossless } as never);
    expect(resultado.deliverable).toBe(true);
    expect(resultado.code).toBeNull();
  });

  it('rechaza un FLAC compatible con MP3 320', () => {
    const resultado = evaluateFlacDelivery({
      ...lossless,
      verdict: 'high-cut',
      cutoffHz: 20000,
      ratio: 0.907,
    } as never);
    expect(resultado.deliverable).toBe(false);
    expect(resultado.code).toBe('LOSSLESS_NOT_VERIFIED');
    expect(resultado.message).toContain('pérdida');
  });

  it('rechaza un FLAC recodificado desde audio con pérdida', () => {
    const resultado = evaluateFlacDelivery({ ...lossless, verdict: 'transcoded', cutoffHz: 16000 } as never);
    expect(resultado.deliverable).toBe(false);
    expect(resultado.code).toBe('LOSSLESS_NOT_VERIFIED');
    expect(resultado.message).toContain('pérdida');
  });

  it('rechaza cuando no se pudo medir el espectro', () => {
    const resultado = evaluateFlacDelivery({ ...lossless, verdict: 'unknown', cutoffHz: 0 } as never);
    expect(resultado.deliverable).toBe(false);
    expect(resultado.code).toBe('LOSSLESS_NOT_VERIFIED');
  });

  it('rechaza cuando el análisis falta por completo', () => {
    const resultado = evaluateFlacDelivery(null);
    expect(resultado.deliverable).toBe(false);
    expect(resultado.code).toBe('LOSSLESS_NOT_VERIFIED');
  });

  it('rechaza por integridad aunque el espectro sea completo', () => {
    const resultado = evaluateFlacDelivery({ ...lossless, integrityOk: false } as never);
    expect(resultado.deliverable).toBe(false);
    expect(resultado.code).toBe('LOSSLESS_INTEGRITY_FAILED');
  });
});

describe.skipIf(!TOOLS)('archivos que dicen ser FLAC', () => {
  let dir = '';
  const rutas: Record<string, string> = {};

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flacplay-flac-'));
    const fuente = path.join(dir, 'fuente.wav');
    // Ruido blanco: energía hasta el límite del formato, el peor caso para un
    // codificador con pérdida y el mejor para detectar el corte.
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=color=white:duration=6:sample_rate=44100:amplitude=0.3',
      '-c:a',
      'pcm_s16le',
      fuente,
    ]);

    rutas.real = path.join(dir, 'real.flac');
    await ffmpeg(['-i', fuente, '-c:a', 'flac', rutas.real]);

    const mp3 = path.join(dir, 'origen.mp3');
    const mp3Alto = path.join(dir, 'origen-alto.mp3');
    await ffmpeg(['-i', fuente, '-c:a', 'libmp3lame', '-b:a', '128k', mp3]);
    await ffmpeg(['-i', fuente, '-c:a', 'libmp3lame', '-b:a', '320k', mp3Alto]);

    rutas.mp3_128 = path.join(dir, 'pseudo-128.flac');
    rutas.mp3_320 = path.join(dir, 'pseudo-320.flac');
    await ffmpeg(['-i', mp3, '-c:a', 'flac', rutas.mp3_128]);
    await ffmpeg(['-i', mp3Alto, '-c:a', 'flac', rutas.mp3_320]);

    rutas.renombrado = path.join(dir, 'es-un-mp3.flac');
    await fs.copyFile(mp3, rutas.renombrado);

    // Audio que sólo lleva contenido hasta 8 kHz y luego se reescala a 44,1 kHz:
    // el mismo perfil que deja un códec con pérdida al recodificarse a FLAC.
    rutas.reducido = path.join(dir, 'banda-reducida.flac');
    await ffmpeg([
      '-i',
      fuente,
      '-af',
      'aresample=16000,aresample=44100',
      '-c:a',
      'flac',
      rutas.reducido,
    ]);

    // 96 kHz de verdad: el generador ya trabaja a esa tasa.
    rutas.altaTasa = path.join(dir, 'hi-res.flac');
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=color=white:duration=4:sample_rate=96000:amplitude=0.3',
      '-c:a',
      'flac',
      rutas.altaTasa,
    ]);

    // 96 kHz inflados: el mismo audio de 44,1 kHz sobremuestreado. El contenido
    // sigue parando en 22 kHz, así que su Nyquist de 48 kHz queda vacío.
    rutas.altaTasaInflada = path.join(dir, 'hi-res-inflado.flac');
    await ffmpeg(['-i', rutas.real, '-ar', '96000', '-c:a', 'flac', rutas.altaTasaInflada]);

    // 24 bits reales, y las dos formas de degradarlo: copiar el flujo o bajar a 16.
    const fuente24 = path.join(dir, 'origen-24.wav');
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=color=white:duration=4:sample_rate=44100:amplitude=0.3',
      '-c:a',
      'pcm_s24le',
      fuente24,
    ]);
    rutas.veinticuatro = path.join(dir, '24-bits.flac');
    await ffmpeg(['-i', fuente24, '-c:a', 'flac', rutas.veinticuatro]);
    rutas.veinticuatroCopia = path.join(dir, '24-bits-metadatos.flac');
    await ffmpeg([
      '-i',
      rutas.veinticuatro,
      '-map',
      '0:a:0',
      '-c:a',
      'copy',
      '-map_metadata',
      '-1',
      '-metadata',
      'title=Título de prueba',
      rutas.veinticuatroCopia,
    ]);
    rutas.veinticuatroA16 = path.join(dir, '24-bits-a-16.flac');
    await ffmpeg(['-i', rutas.veinticuatro, '-c:a', 'flac', '-sample_fmt', 's16', rutas.veinticuatroA16]);
  }, 240_000);

  afterAll(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('acepta un FLAC real de banda completa', async () => {
    const analisis = await analyzeFile(rutas.real);
    expect(analisis?.verdict).toBe('lossless');
    expect(analisis?.cutoffHz).toBeGreaterThan(20_000);
    expect(evaluateFlacDelivery(analisis).deliverable).toBe(true);
  });

  it('acepta un FLAC real de alta tasa de muestreo', async () => {
    const analisis = await analyzeFile(rutas.altaTasa);
    expect(analisis?.verdict).toBe('lossless');
    expect(evaluateFlacDelivery(analisis).deliverable).toBe(true);
  });

  it('rechaza un FLAC de 96 kHz sobremuestreado desde 44,1 kHz', async () => {
    const analisis = await analyzeFile(rutas.altaTasaInflada);
    expect(analisis?.sampleRate).toBe(96_000);
    // El contenido real para en 22 kHz, muy lejos del Nyquist de 48 kHz.
    expect(analisis?.ratio).toBeLessThan(0.86);
    expect(analisis?.verdict).not.toBe('lossless');
    expect(evaluateFlacDelivery(analisis).deliverable).toBe(false);
  });

  it('detecta el FLAC que esconde un MP3 128 y no lo entrega', async () => {
    const analisis = await analyzeFile(rutas.mp3_128);
    expect(analisis?.cutoffHz).toBeLessThan(21_500);
    expect(analisis?.verdict).not.toBe('lossless');
    const entrega = evaluateFlacDelivery(analisis);
    expect(entrega.deliverable).toBe(false);
    expect(entrega.code).toBe('LOSSLESS_NOT_VERIFIED');
  });

  it('detecta el FLAC que esconde un MP3 320 y no lo entrega', async () => {
    const analisis = await analyzeFile(rutas.mp3_320);
    expect(analisis?.cutoffHz).toBeLessThan(21_500);
    expect(analisis?.verdict).not.toBe('lossless');
    expect(evaluateFlacDelivery(analisis).deliverable).toBe(false);
  });

  it('detecta un MP3 sólo renombrado a .flac', async () => {
    const cabecera = (await fs.readFile(rutas.renombrado)).subarray(0, 64);
    expect(sniffAudioFormat(new Uint8Array(cabecera))).toBe('mp3');
    const analisis = await analyzeFile(rutas.renombrado);
    expect(analisis?.verdict).toBe('not-flac');
    expect(evaluateFlacDelivery(analisis).deliverable).toBe(false);
  });

  it('la copia con metadatos conserva las muestras y la profundidad de 24 bits', async () => {
    const original = await analyzeFile(rutas.veinticuatro);
    const copia = await analyzeFile(rutas.veinticuatroCopia);
    expect(original?.bits).toBe(24);
    expect(copia?.bits).toBe(24);
    expect(await audioDigest(rutas.veinticuatroCopia)).toBe(await audioDigest(rutas.veinticuatro));
  });

  it('la huella del audio detecta una bajada de 24 a 16 bits', async () => {
    const dieciseis = await analyzeFile(rutas.veinticuatroA16);
    expect(dieciseis?.bits).toBe(16);
    expect(await audioDigest(rutas.veinticuatroA16)).not.toBe(await audioDigest(rutas.veinticuatro));
  });

  it('acepta la integridad de un FLAC completo y rechaza uno truncado', async () => {
    expect(await verifyFlacIntegrity(rutas.real)).toBe(true);
    const datos = await fs.readFile(rutas.real);
    const truncado = path.join(dir as string, 'truncado.flac');
    await fs.writeFile(truncado, datos.subarray(0, Math.floor(datos.length * 0.6)));
    expect(await verifyFlacIntegrity(truncado)).toBe(false);
  });

  it('rechaza la entrega cuando el audio preparado no es idéntico al origen', () => {
    const analisis = {
      verdict: 'lossless',
      cutoffHz: 22_045,
      limitHz: 22_050,
      integrityOk: true,
    };
    const entrega = evaluateFlacDelivery(analisis as never, { bitexact: false });
    expect(entrega.deliverable).toBe(false);
    expect(entrega.code).toBe('LOSSLESS_AUDIO_CHANGED');
    expect(entrega.message).toContain('muestras');
  });

  it('no entrega un FLAC con el espectro recortado', async () => {
    const analisis = await analyzeFile(rutas.reducido);
    expect(analisis?.verdict).not.toBe('lossless');
    expect(evaluateFlacDelivery(analisis).deliverable).toBe(false);
  });
});
