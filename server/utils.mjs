import { config } from './config.mjs';
import { HttpError } from './errors.mjs';

const NAMED_ENTITIES = {
  amp: '&',
  apos: "'",
  quot: '"',
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

export function decodeEntities(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

export function toHttps(value) {
  if (typeof value !== 'string' || !value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('http://')) return `https://${value.slice(7)}`;
  return value;
}

export function toSeconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function sanitizeFilename(value, fallback = 'flacplay-audio') {
  const cleaned = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function assertHttpUrl(rawUrl, suffixes, label = 'URL') {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, 'INVALID_URL', `La ${label} no es válida.`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HttpError(400, 'INVALID_URL', `La ${label} debe usar HTTP o HTTPS.`);
  }

  const hostname = url.hostname.toLowerCase();
  const allowed = suffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
  if (!allowed) {
    throw new HttpError(400, 'URL_NOT_ALLOWED', `La ${label} apunta a un servidor no permitido.`);
  }

  return url;
}

export function assertAudioUrl(rawUrl) {
  return assertHttpUrl(rawUrl, config.audioHostSuffixes, 'dirección de audio');
}

export function assertCoverUrl(rawUrl) {
  return assertHttpUrl(rawUrl, config.coverHostSuffixes, 'portada');
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function qualityRank(quality) {
  const format = String(quality?.format ?? '').toLowerCase();
  const bitrate = Number(quality?.bitrate ?? 0);
  if (format === 'flac') return 100_000 + bitrate;
  if (format === 'mp3') return bitrate;
  return 0;
}

export function normalizeQuality(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const format = String(raw.format ?? '').toLowerCase();
  if (format !== 'mp3' && format !== 'flac') return null;
  return {
    level: raw.level ? String(raw.level) : '',
    bitrate: String(raw.bitrate ?? ''),
    format,
    size: raw.size ? String(raw.size) : '',
  };
}
