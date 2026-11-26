import { config } from '../config.mjs';
import { UpstreamError } from '../errors.mjs';
import { httpFetch } from '../http.mjs';
import { decodeEntities, toSeconds } from '../utils.mjs';

const API_URL = 'https://commons.wikimedia.org/w/api.php';
const PAGE_SIZE = 50;
const FLAC_MIME = new Set(['audio/x-flac', 'audio/flac']);

async function getJson(url, timeoutMs = config.upstreamTimeoutMs) {
  let response;
  try {
    response = await httpFetch(url, {
      headers: { 'User-Agent': config.wikimediaUserAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new UpstreamError('Wikimedia Commons no respondió a tiempo.', 504);
  }
  if (!response.ok) {
    throw new UpstreamError(`Wikimedia Commons respondió ${response.status}.`, 502);
  }
  return response.json();
}

function stripHtml(value) {
  return decodeEntities(String(value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function commonsPageUrl(title) {
  const page = String(title ?? '').replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(page)
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')}`;
}

export function mapCommonsTrack(page) {
  const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
  if (!info?.url) return null;
  const mime = String(info.mime ?? '').toLowerCase();
  const name = String(page.title ?? '');
  const isFlac = FLAC_MIME.has(mime) || /\.flac$/i.test(name);
  if (!isFlac) return null;

  const meta = info.extmetadata ?? {};
  const duration = toSeconds(info.duration ?? 0);
  const title = name.replace(/^File:/, '').replace(/\.flac$/i, '').replace(/[_-]+/g, ' ');
  const artist = stripHtml(meta.Artist?.value) || 'Wikimedia Commons';
  const album = stripHtml(meta.Categories?.value).split('|')[0] ?? '';

  return {
    id: name,
    name: decodeEntities(title) || 'Pista sin título',
    artist,
    artist_id: '',
    album_name: album,
    album_id: '',
    pic_url: '',
    duration,
    minfo: [{ level: 'lossless', format: 'flac', bitrate: '1000' }],
    link: commonsPageUrl(name),
    time: duration,
    sign: '',
    hasHQ: true,
    hasSQ: true,
  };
}

export async function searchCommons({ keyword, page }) {
  const offset = (page - 1) * PAGE_SIZE;
  const search = `filetype:audio flac ${keyword}`;
  const url =
    `${API_URL}?action=query&generator=search&gsrsearch=${encodeURIComponent(search)}` +
    `&gsrnamespace=6&gsrlimit=${PAGE_SIZE}&gsroffset=${offset}` +
    '&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cduration%7Cextmetadata&format=json&formatversion=2';
  const body = await getJson(url);
  const pages = Array.isArray(body?.query?.pages) ? body.query.pages : [];
  const list = pages.map(mapCommonsTrack).filter(Boolean);
  const total = Number(body?.query?.searchinfo?.totalhits) || offset + list.length;
  return { list, total, page };
}

export async function resolveCommons({ songid, format, time }) {
  if (String(format).toLowerCase() !== 'flac') {
    throw new UpstreamError('Wikimedia Commons solo publica FLAC en este catálogo.', 422);
  }
  const title = String(songid ?? '').trim();
  if (!title) {
    throw new UpstreamError('La pista de Wikimedia Commons no es válida.', 400);
  }
  const url =
    `${API_URL}?action=query&titles=${encodeURIComponent(title)}` +
    '&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cduration&format=json&formatversion=2';
  const body = await getJson(url);
  const info = Array.isArray(body?.query?.pages) ? body.query.pages[0]?.imageinfo?.[0] : null;
  if (!info?.url) {
    throw new UpstreamError('Wikimedia Commons ya no tiene ese archivo.', 404);
  }
  const clean = new URL(info.url);
  for (const key of ['utm_source', 'utm_campaign', 'utm_content', 'utm_medium']) {
    clean.searchParams.delete(key);
  }
  return {
    url: clean.toString(),
    format: 'flac',
    bitrate: '1000',
    duration: Number(info.duration) || Number(time) || 0,
    songid: title,
    sourcePlatform: 'commons',
  };
}
