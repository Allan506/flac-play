import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  audioFormatLabel,
  codecToAudioFormat,
  observedBitrateKbps,
  sniffAudioFormat,
} from './audio-format.mjs';
import { config } from './config.mjs';
import { HttpError, PreviewOnlyError, UpstreamError } from './errors.mjs';
import { resolveAudio } from './upstream.mjs';
import { assertAudioUrl, assertCoverUrl, sanitizeFilename, sleep } from './utils.mjs';

const execFileAsync = promisify(execFile);

const AUDIO_MIME = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
};

const COVER_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function ensureTempRoot() {
  await fs.mkdir(config.tempDir, { recursive: true });
}

export async function createJobDir() {
  await ensureTempRoot();
  return fs.mkdtemp(path.join(config.tempDir, 'job-'));
}

export async function removeJobDir(dir) {
  if (!dir) return;
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

function requestHeaders(url) {
  const headers = {
    'User-Agent': config.userAgent,
    Accept: '*/*',
  };
  try {
    const host = new URL(url).hostname;
    if (host.endsWith('.kuwo.cn') || host.endsWith('.kuwo.com')) {
      headers.Referer = 'https://www.kuwo.cn/';
    } else if (host.endsWith('.126.net') || host.endsWith('.126.com')) {
      headers.Referer = 'https://music.163.com/';
    }
  } catch {
    // The URL is validated by assertAudioUrl before this helper is used.
  }
  return headers;
}

async function fetchToFile(url, destination, { maxBytes, timeoutMs, label }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let received = 0;

  try {
    const response = await fetch(url, {
      headers: requestHeaders(url),
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new UpstreamError(`${label} respondió HTTP ${response.status}.`, 502);
    }

    assertAudioUrl(response.url || url);

    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new HttpError(413, 'FILE_TOO_LARGE', 'El archivo supera el límite de descarga permitido.');
    }

    if (!response.body) {
      throw new UpstreamError(`${label} no devolvió contenido.`, 502);
    }

    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > maxBytes) {
          callback(new HttpError(413, 'FILE_TOO_LARGE', 'El archivo supera el límite de descarga permitido.'));
          return;
        }
        callback(null, chunk);
      },
    });

    await pipeline(
      Readable.fromWeb(response.body),
      limiter,
      createWriteStream(destination),
    );

    return {
      bytes: received,
      contentType: response.headers.get('content-type') ?? '',
      contentLength: Number.isFinite(declared) ? declared : received,
    };
  } catch (error) {
    if (error instanceof HttpError || error instanceof UpstreamError) throw error;
    if (
      error?.name === 'AbortError' ||
      error?.cause?.name === 'ConnectTimeoutError' ||
      error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
    ) {
      throw new UpstreamError(
        'La descarga desde la fuente tardó demasiado. Inténtalo de nuevo.',
        504,
      );
    }
    throw new UpstreamError(
      'No se pudo conectar con el servidor de audio. Inténtalo de nuevo.',
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function probeFile(file) {
  try {
    const { stdout } = await execFileAsync(
      config.ffprobePath,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration,format_name,bit_rate:stream=codec_name,sample_rate,channels',
        '-of',
        'json',
        file,
      ],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout);
    const format = parsed.format ?? {};
    const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : {};
    return {
      duration: Number(format.duration) || 0,
      formatName: String(format.format_name ?? ''),
      bitRate: Number(format.bit_rate) || 0,
      codec: String(stream.codec_name ?? ''),
      sampleRate: Number(stream.sample_rate) || 0,
      channels: Number(stream.channels) || 0,
    };
  } catch {
    throw new UpstreamError('No se pudo verificar el audio descargado.', 502);
  }
}

async function fetchCover(coverUrl, jobDir) {
  const url = assertCoverUrl(coverUrl);
  const response = await fetch(url, {
    headers: requestHeaders(coverUrl),
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new UpstreamError(`La portada respondió HTTP ${response.status}.`, 502);
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const extension = COVER_EXT[contentType];
  if (!extension) {
    throw new UpstreamError('La fuente no devolvió una imagen de portada válida.', 502);
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > config.maxCoverBytes) {
    throw new UpstreamError('La portada es demasiado grande.', 502);
  }

  const filePath = path.join(jobDir, `cover.${extension}`);
  let received = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > config.maxCoverBytes) {
        callback(new UpstreamError('La portada es demasiado grande.', 502));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(filePath));
  return filePath;
}

async function transcode({ sourcePath, outputPath, sourceFormat, outputFormat, bitrate, metadata, coverPath }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath];
  if (coverPath) args.push('-i', coverPath);

  args.push('-map', '0:a:0');
  if (coverPath) {
    args.push('-map', '1:v:0', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic');
  } else {
    args.push('-vn');
  }

  if (sourceFormat === outputFormat) {
    args.push('-c:a', 'copy');
  } else if (outputFormat === 'flac') {
    args.push('-c:a', 'flac', '-compression_level', '8');
  } else {
    const kbps = Math.min(320, Math.max(96, Number(bitrate) || 320));
    args.push('-c:a', 'libmp3lame', '-b:a', `${kbps}k`);
  }

  if (outputFormat === 'mp3') {
    args.push('-id3v2_version', '3', '-write_id3v1', '1');
  }

  args.push('-map_metadata', '-1');
  for (const [key, value] of Object.entries(metadata)) {
    if (value) args.push('-metadata', `${key}=${value}`);
  }

  if (coverPath) {
    args.push(
      '-metadata:s:v',
      'title=Portada del álbum',
      '-metadata:s:v',
      'comment=Cover (front)',
    );
  }

  args.push(outputPath);

  try {
    await execFileAsync(config.ffmpegPath, args, {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    throw new HttpError(
      502,
      'PREPARATION_FAILED',
      'No se pudo preparar el archivo final. Prueba otra calidad.',
    );
  }
}

async function readPrefix(response, maxBytes = 65_536) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - received;
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(Buffer.from(slice));
      received += slice.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return Buffer.concat(chunks);
}

async function fetchAudioPrefix(url, maxBytes = 65_536) {
  let response = null;
  for (const range of [null, `bytes=0-${maxBytes - 1}`]) {
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          ...requestHeaders(url),
          ...(range ? { Range: range } : {}),
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok || response.status === 206) break;
      await response.body?.cancel().catch(() => {});
      response = null;
    } catch {
      response = null;
    }
  }

  if (!response) {
    throw new UpstreamError('No se pudo comprobar el audio de la fuente.', 502);
  }
  return response;
}

export async function probeSource(input) {
  let lastResult = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const resolved = await resolveAudio(input);
    const url = assertAudioUrl(resolved.url);
    const expected = input.expectedDurationSeconds || resolved.duration || 0;
    const bitrate = Number(input.bitrate) || 0;
    const response = await fetchAudioPrefix(url);
    const contentRange = response.headers.get('content-range');
    const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1];
    const contentLength = Number(rangeTotal ?? response.headers.get('content-length') ?? 0) || 0;
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    const prefix = await readPrefix(response);
    const sniffedFormat = sniffAudioFormat(prefix);
    const declaredFormat = codecToAudioFormat({ codec: resolved.format });
    const actualFormat = sniffedFormat === 'unknown' ? declaredFormat : sniffedFormat;
    const observedKbps = observedBitrateKbps(contentLength, expected);
    const actualBitrate = Math.round(observedKbps) || bitrate;
    const likelyPreview =
      expected > 60 &&
      contentLength > 0 &&
      (actualFormat === 'flac'
        ? observedKbps < 400
        : actualFormat !== 'unknown' && observedKbps < 64);

    lastResult = {
      available: true,
      sourceFormat: actualFormat,
      actualFormat,
      actualBitrate,
      formatMismatch:
        actualFormat !== 'unknown' &&
        actualFormat !== input.format &&
        !(input.format === 'mp3' && actualFormat === 'flac'),
      contentType,
      contentLength,
      expectedDurationSeconds: expected,
      likelyPreview,
    };

    const acceptable =
      actualFormat === input.format ||
      actualFormat === 'unknown' ||
      (input.format === 'mp3' && actualFormat === 'flac');
    if (acceptable || attempt === 2) return lastResult;
    await sleep(250);
  }

  return lastResult;
}

export async function checkQualities(input) {
  const checks = [];
  for (const quality of input.qualities) {
    try {
      const probe = await probeSource({
        platform: input.platform,
        songid: input.songid,
        format: quality.format,
        bitrate: quality.bitrate,
        time: input.time,
        sign: input.sign,
        expectedDurationSeconds: input.expectedDurationSeconds,
      });
      checks.push({ ...quality, ...probe, error: '' });
    } catch (error) {
      checks.push({
        ...quality,
        available: false,
        sourceFormat: quality.format,
        actualFormat: 'unknown',
        actualBitrate: 0,
        formatMismatch: false,
        contentType: '',
        contentLength: 0,
        expectedDurationSeconds: input.expectedDurationSeconds,
        likelyPreview: false,
        error: error instanceof Error ? error.message : 'No se pudo comprobar esta calidad.',
      });
    }
    if (checks.length < input.qualities.length) await sleep(150);
  }

  const rank = (item) => {
    const format = item.actualFormat ?? item.format;
    const bitrate = Number(item.actualBitrate || item.bitrate) || 0;
    if (format === 'flac') return 100_000 + bitrate;
    if (format === 'mp3') return bitrate;
    return 0;
  };
  const full = checks
    .filter(
      (item) =>
        item.available &&
        !item.likelyPreview &&
        !item.formatMismatch &&
        (item.actualFormat ?? item.format) === item.format,
    )
    .sort((a, b) => rank(b) - rank(a));
  const recommended = full[0] ?? null;

  return {
    qualities: checks,
    recommended: recommended
      ? { format: recommended.format, bitrate: recommended.bitrate }
      : null,
    allPreview: checks.length > 0 && checks.every((item) => item.likelyPreview),
  };
}

export async function downloadAndPrepare(input, jobDir) {
  const sourcePath = path.join(jobDir, 'source.bin');
  let resolved = null;
  let transfer = null;
  let actual = 0;
  let actualFormat = 'unknown';
  let sourceProbe = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      resolved = await resolveAudio(input);
      const sourceUrl = assertAudioUrl(resolved.url);
      transfer = await fetchToFile(sourceUrl, sourcePath, {
        maxBytes: config.maxDownloadBytes,
        timeoutMs: config.downloadTimeoutMs,
        label: 'La fuente de audio',
      });

      const probe = await probeFile(sourcePath);
      const expected = input.expectedDurationSeconds || resolved.duration || 0;
      actual = probe.duration;
      sourceProbe = probe;
      actualFormat = codecToAudioFormat(probe);

      if (actualFormat === 'unknown') {
        throw new HttpError(
          502,
          'UNKNOWN_AUDIO_FORMAT',
          'No se pudo identificar el formato real del audio descargado. No se entrega para evitar un formato falso.',
        );
      }

      if (input.outputFormat === 'flac' && actualFormat !== 'flac') {
        const actualBitrate = probe.bitRate ? Math.round(probe.bitRate / 1000) : 0;
        throw new HttpError(
          422,
          'SOURCE_FORMAT_MISMATCH',
          `La fuente entrega ${audioFormatLabel(actualFormat)}${actualBitrate ? ` ${actualBitrate} kb/s` : ''} en lugar de FLAC. No se convierte a FLAC para no simular audio sin pérdida.`,
          {
            actualFormat,
            actualBitrate,
            requestedFormat: input.outputFormat,
            contentLength: transfer.contentLength,
            codec: probe.codec,
          },
        );
      }

      if (expected > 0 && actual > 0) {
        const short = actual <= 45 && expected > 60;
        const proportionallyShort = actual < expected * 0.8 && expected - actual > 15;
        if (short || proportionallyShort) {
          throw new PreviewOnlyError(
            `La fuente sólo entregó una vista previa de ${Math.round(actual)} s frente a los ${Math.round(expected)} s anunciados. No se guardó un archivo incompleto.`,
            {
              actualDuration: Math.round(actual),
              expectedDuration: Math.round(expected),
              contentLength: transfer.contentLength,
            },
          );
        }
      }

      break;
    } catch (error) {
      const retryable =
        error instanceof PreviewOnlyError ||
        (error instanceof HttpError &&
          error.code === 'SOURCE_FORMAT_MISMATCH' &&
          input.outputFormat === 'flac') ||
        (error instanceof UpstreamError && (error.status === 502 || error.status === 504));
      if (!retryable || attempt === 2) throw error;
      await fs.rm(sourcePath, { force: true });
      await sleep(600);
    }
  }

  if (!resolved || !transfer) {
    throw new UpstreamError('No se pudo obtener el audio de la fuente.', 502);
  }

  const sourceFormat = actualFormat;
  const outputFormat = input.outputFormat;
  const needsConversion = sourceFormat !== outputFormat;
  const wantsCover = input.embedMetadata && Boolean(input.coverUrl);
  const needsWork = needsConversion || input.embedMetadata || wantsCover;

  let outputPath = sourcePath;
  let coverPath = '';

  if (wantsCover) {
    try {
      coverPath = await fetchCover(input.coverUrl, jobDir);
    } catch {
      coverPath = '';
    }
  }

  if (needsWork) {
    outputPath = path.join(jobDir, `output.${outputFormat}`);
    await transcode({
      sourcePath,
      outputPath,
      sourceFormat,
      outputFormat,
      bitrate: input.bitrate,
      coverPath,
      metadata: input.embedMetadata
        ? {
            title: input.title,
            artist: input.artist,
            album: input.album,
            comment: 'Preparado con FLAC Play',
          }
        : {},
    });
  }

  const finalProbe = await probeFile(outputPath);
  const finalFormat = codecToAudioFormat(finalProbe);
  if (finalFormat !== outputFormat) {
    throw new HttpError(
      502,
      'OUTPUT_FORMAT_MISMATCH',
      `El archivo preparado no es ${audioFormatLabel(outputFormat)} real. No se entrega para evitar un formato falso.`,
      {
        expected: outputFormat,
        actual: finalFormat,
        codec: finalProbe.codec,
      },
    );
  }

  const stats = await fs.stat(outputPath);
  if (!stats.size) {
    throw new HttpError(502, 'EMPTY_FILE', 'El archivo preparado quedó vacío. Prueba otra calidad.');
  }

  const baseName = input.title || 'flacplay-audio';
  const prefix = input.artist && input.artist !== 'Artista no indicado' ? `${input.artist} - ` : '';
  const filename = `${sanitizeFilename(`${prefix}${baseName}`)}.${outputFormat}`;

  return {
    path: outputPath,
    filename,
    mime: AUDIO_MIME[outputFormat],
    size: stats.size,
    actualDuration: actual,
    sourceFormat,
    sourceCodec: sourceProbe?.codec ?? '',
    actualBitrate: Math.round((finalProbe.bitRate || sourceProbe?.bitRate || 0) / 1000),
    requestedFormat: input.format,
    outputFormat,
    converted: needsConversion,
    hasCover: Boolean(coverPath),
    verified: true,
  };
}
