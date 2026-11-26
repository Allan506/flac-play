import { config } from '../config.mjs';
import { UpstreamError } from '../errors.mjs';
import { httpFetch } from '../http.mjs';
import { decodeEntities, toSeconds } from '../utils.mjs';

const SEARCH_URL = 'https://archive.org/advancedsearch.php';
const METADATA_URL = 'https://archive.org/metadata';
const DOWNLOAD_URL = 'https://archive.org/download';
const IMAGE_URL = 'https://archive.org/services/img';

const ITEMS_PER_PAGE = 10;
const ITEMS_EXPANDED = 4;
const TRACKS_PER_ITEM = 6;

async function getJson(url, timeoutMs = config.upstreamTimeoutMs) {
  let response;
  try {
    response = await httpFetch(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new UpstreamError('Internet Archive no respondió a tiempo.', 504);
  }
  if (!response.ok) {
    throw new UpstreamError(`Internet Archive respondió ${response.status}.`, 502);
  }
  return response.json();
}

export function archiveAudioUrl(identifier, file) {
  const safeId = encodeURIComponent(identifier);
  const safeFile = String(file).split('/').map(encodeURIComponent).join('/');
  return `${DOWNLOAD_URL}/${safeId}/${safeFile}`;
}

export function archiveCoverUrl(identifier) {
  return `${IMAGE_URL}/${encodeURIComponent(identifier)}`;
}

export function archiveTrackId(identifier, file) {
  return `${identifier}/${file}`;
}

export function parseArchiveTrackId(id) {
  const value = String(id ?? '');
  const cut = value.indexOf('/');
  if (cut <= 0 || cut === value.length - 1) return null;
  return { identifier: value.slice(0, cut), file: value.slice(cut + 1) };
}

export function flacFiles(item) {
  const files = Array.isArray(item?.files) ? item.files : [];
  return files.filter((file) => {
    const name = String(file?.name ?? '');
    if (!/\.flac$/i.test(name)) return false;
    if (file.private === true || file.private === 'true') return false;
    if (file.source && file.source !== 'original' && file.format !== 'Flac') return false;
    return true;
  });
}

function fileDuration(file) {
  const raw = String(file?.length ?? '');
  if (raw.includes(':')) {
    return raw.split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);
  }
  return toSeconds(raw);
}

function fileBitrate(file, duration) {
  const size = Number(file?.size ?? 0);
  if (!size || !duration) return '1000';
  return String(Math.max(320, Math.round((size * 8) / duration / 1000)));
}

function cleanTitle(file) {
  const raw = String(file?.title ?? '').trim();
  const base = raw || String(file?.name ?? '').replace(/\.[^.]+$/, '');
  return decodeEntities(base).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function mapArchiveTrack({ identifier, item, file }) {
  const meta = item?.metadata ?? {};
  const duration = fileDuration(file);
  const albumName = decodeEntities(String(meta.title ?? identifier)) || identifier;
  const artist = decodeEntities(String(meta.creator ?? '')) || 'Internet Archive';
  return {
    id: archiveTrackId(identifier, file.name),
    name: cleanTitle(file),
    artist,
    artist_id: '',
    album_name: albumName,
    album_id: identifier,
    pic_url: archiveCoverUrl(identifier),
    duration,
    minfo: [{ level: 'lossless', format: 'flac', bitrate: fileBitrate(file, duration) }],
    link: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    time: duration,
    sign: '',
    hasHQ: true,
    hasSQ: true,
  };
}

async function itemTracks(identifier, limit = TRACKS_PER_ITEM) {
  const item = await getJson(`${METADATA_URL}/${encodeURIComponent(identifier)}`).catch(() => null);
  if (!item) return [];
  return flacFiles(item)
    .slice(0, limit)
    .map((file) => mapArchiveTrack({ identifier, item, file }));
}

export async function searchArchive({ keyword, page }) {
  const query =
    `(${keyword}) AND mediatype:(audio) AND format:(Flac)` +
    ' AND collection:(etree OR netlabels OR audio_music OR 78rpm)';
  const url =
    `${SEARCH_URL}?q=${encodeURIComponent(query)}` +
    '&fl%5B%5D=identifier&rows=' +
    ITEMS_PER_PAGE +
    `&page=${page}&output=json&sort%5B%5D=downloads+desc`;
  const body = await getJson(url);
  const docs = Array.isArray(body?.response?.docs) ? body.response.docs : [];
  const total = Number(body?.response?.numFound) || 0;

  const expanded = await Promise.all(
    docs.slice(0, ITEMS_EXPANDED).map((doc) => itemTracks(String(doc?.identifier ?? ''))),
  );
  const list = expanded.flat().filter(Boolean);
  return { list, total: total || list.length, page };
}

export async function archiveAlbum({ id, page, size }) {
  const identifier = String(id ?? '').trim();
  const item = await getJson(`${METADATA_URL}/${encodeURIComponent(identifier)}`);
  const meta = item?.metadata ?? {};
  const tracks = flacFiles(item).map((file) => mapArchiveTrack({ identifier, item, file }));
  const from = (page - 1) * size;
  const list = tracks.slice(from, from + size);
  return {
    info: {
      id: identifier,
      name: decodeEntities(String(meta.title ?? identifier)) || identifier,
      artist: decodeEntities(String(meta.creator ?? '')) || 'Internet Archive',
      description: decodeEntities(String(meta.description ?? '')).slice(0, 600),
      pic_url: archiveCoverUrl(identifier),
      link: `https://archive.org/details/${encodeURIComponent(identifier)}`,
      release_date: String(meta.date ?? meta.year ?? ''),
    },
    list,
    total: tracks.length,
    page,
    size,
    hasMore: from + list.length < tracks.length,
  };
}

export async function resolveArchive({ songid, format, time }) {
  const parsed = parseArchiveTrackId(songid);
  if (!parsed) {
    throw new UpstreamError('La pista de Internet Archive no es válida.', 400);
  }
  if (String(format).toLowerCase() !== 'flac') {
    throw new UpstreamError('Internet Archive solo publica FLAC para esta pista.', 422);
  }
  return {
    url: archiveAudioUrl(parsed.identifier, parsed.file),
    format: 'flac',
    bitrate: '1000',
    duration: Number(time) || 0,
    songid,
    sourcePlatform: 'archive',
  };
}
