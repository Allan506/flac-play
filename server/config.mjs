import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 12000),
  upstreamApi: (process.env.UPSTREAM_API ?? 'https://flacplay-ik32bcxq.manus.space').replace(/\/+$/, ''),
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 25_000),
  downloadTimeoutMs: Number(process.env.DOWNLOAD_TIMEOUT_MS ?? 180_000),
  maxDownloadBytes: Number(process.env.MAX_DOWNLOAD_BYTES ?? 240 * 1024 * 1024),
  maxCoverBytes: 12 * 1024 * 1024,
  tempDir: process.env.TEMP_DIR ?? path.join(here, '..', '.tmp', 'downloads'),
  ffmpegPath: process.env.FFMPEG_PATH ?? path.join(here, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ffprobePath:
    process.env.FFPROBE_PATH ??
    path.join(here, '..', 'node_modules', 'ffprobe-static', 'bin', 'linux', 'x64', 'ffprobe'),
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  audioHostSuffixes: ['.kuwo.cn', '.kuwo.com', '.126.net', '.126.com', '.music.126.net'],
  coverHostSuffixes: ['.kuwo.cn', '.kuwo.com', '.126.net', '.126.com', '.music.126.net'],
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
