import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { sniffAudioFormat } from '../server/audio-format.mjs';
import { analyzeFile, evaluateFlacDelivery } from '../server/lossless.mjs';

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

  it('no entrega un FLAC con el espectro recortado', async () => {
    const analisis = await analyzeFile(rutas.reducido);
    expect(analisis?.verdict).not.toBe('lossless');
    expect(evaluateFlacDelivery(analisis).deliverable).toBe(false);
  });
});
