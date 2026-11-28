import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCorsOrigins } from './cors.mjs';
import { resolveExecutable } from './tools.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function packageBinary(packageName) {
  try {
    const resolved = require(packageName);
    return typeof resolved === 'string' ? resolved : (resolved?.path ?? '');
  } catch {
    return '';
  }
}

const ffmpegPath = resolveExecutable({
  envPath: process.env.FFMPEG_PATH ?? '',
  packagePath: packageBinary('ffmpeg-static'),
  name: 'ffmpeg',
});

const ffprobePath = resolveExecutable({
  envPath: process.env.FFPROBE_PATH ?? '',
  packagePath: packageBinary('ffprobe-static'),
  name: 'ffprobe',
});

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 12000),
  upstreamApi: (process.env.UPSTREAM_API ?? 'https://flacplay-ik32bcxq.manus.space').replace(/\/+$/, ''),
  neteaseNative: (process.env.NETEASE_NATIVE ?? 'true') !== 'false',
  // Cuando el FLAC del catálogo pedido no pasa el análisis, buscar la misma
  // pista en el otro catálogo antes de rechazar la descarga.
  rescueFlac: (process.env.FLAC_RESCUE ?? 'true') !== 'false',
  neteaseCookie: process.env.NETEASE_COOKIE ?? '',
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 25_000),
  connectTimeoutMs: Number(process.env.CONNECT_TIMEOUT_MS ?? 20_000),
  headersTimeoutMs: Number(process.env.HEADERS_TIMEOUT_MS ?? 60_000),
  downloadTimeoutMs: Number(process.env.DOWNLOAD_TIMEOUT_MS ?? 180_000),
  maxDownloadBytes: Number(process.env.MAX_DOWNLOAD_BYTES ?? 240 * 1024 * 1024),
  maxCoverBytes: 12 * 1024 * 1024,
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  tempDir: process.env.TEMP_DIR ?? path.join(here, '..', '.tmp', 'downloads'),
  ffmpegPath,
  ffprobePath,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  // Wikimedia rechaza con 429 los User-Agent de navegador y pide uno identificable.
  wikimediaUserAgent: `FLACPlay/${require('../package.json').version} (https://github.com/allan506/flac-play; flac-play@users.noreply.github.com)`,
  audioHostSuffixes: [
    '.kuwo.cn',
    '.kuwo.com',
    '.126.net',
    '.126.com',
    '.music.126.net',
    '.music.163.com',
    '.archive.org',
    'archive.org',
    '.jamendo.com',
    'jamendo.com',
    '.wikimedia.org',
    'wikimedia.org',
  ],
  coverHostSuffixes: [
    '.kuwo.cn',
    '.kuwo.com',
    '.126.net',
    '.126.com',
    '.music.126.net',
    '.archive.org',
    'archive.org',
    '.jamendo.com',
    'jamendo.com',
    '.wikimedia.org',
    'wikimedia.org',
  ],
  cache: {
    searchMs: 60_000,
    resolveMs: 60_000,
    lyricsMs: 6 * 60 * 60_000,
    albumMs: 15 * 60_000,
    probeMs: 60_000,
  },
  limits: {
    apiPerMinute: 180,
    downloadPerMinute: 12,
  },
};
