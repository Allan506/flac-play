import { config } from '../config.mjs';
import { UpstreamError } from '../errors.mjs';
import { httpFetch } from '../http.mjs';
import { decodeEntities, toSeconds } from '../utils.mjs';

const STORAGE_URL = 'https://prod-1.storage.jamendo.com/';
const API_URL = 'https://api.jamendo.com/v3.0';
const OPENVERSE_URL = 'https://api.openverse.org/v1/audio/';
const PAGE_SIZE = 20;

async function getJson(url, timeoutMs = config.upstreamTimeoutMs) {
  let response;
  try {
    response = await httpFetch(url, {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new UpstreamError('Jamendo no respondió a tiempo.', 504);
  }
  if (!response.ok) {
    throw new UpstreamError(`Jamendo respondió ${response.status}.`, 502);
  }
  return response.json();
}

export function jamendoAudioUrl(trackId, format) {
  const kind = String(format).toLowerCase() === 'mp3' ? 'mp32' : 'flac';
  return `${STORAGE_URL}?trackid=${encodeURIComponent(trackId)}&format=${kind}`;
}

export function jamendoTrackIdFromUrl(url) {
  const match = /[?&]trackid=(\d+)/.exec(String(url ?? ''));
  return match ? match[1] : '';
}

const QUALITIES = [
  { level: 'lossless', format: 'flac', bitrate: '1000' },
  { level: 'estándar', format: 'mp3', bitrate: '192' },
];

export function mapJamendoTrack(raw, { durationInMs = false } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const id = jamendoTrackIdFromUrl(raw.url) || String(raw.id ?? '');
  if (!id) return null;
  const rawDuration = Number(raw.duration ?? 0);
  const duration = toSeconds(durationInMs ? rawDuration / 1000 : rawDuration);
  const albumId = raw.album_id ? String(raw.album_id) : '';
  return {
    id,
    name: decodeEntities(raw.name ?? raw.title) || 'Pista sin título',
    artist: decodeEntities(raw.artist_name ?? raw.creator) || 'Jamendo',
    artist_id: raw.artist_id ? String(raw.artist_id) : '',
    album_name: decodeEntities(raw.album_name ?? ''),
    album_id: albumId && albumId !== '0' ? albumId : '',
    pic_url: String(raw.image ?? raw.thumbnail ?? ''),
    duration,
    minfo: QUALITIES,
    link: String(raw.shareurl ?? raw.foreign_landing_url ?? `https://www.jamendo.com/track/${id}`),
    time: duration,
    sign: '',
    hasHQ: true,
    hasSQ: true,
  };
}

async function searchOfficial({ keyword, page }) {
  const offset = (page - 1) * PAGE_SIZE;
  const url =
    `${API_URL}/tracks/?client_id=${encodeURIComponent(config.jamendoClientId)}` +
    `&format=json&limit=${PAGE_SIZE}&offset=${offset}` +
    `&search=${encodeURIComponent(keyword)}&audioformat=flac`;
  const body = await getJson(url);
  const list = (Array.isArray(body?.results) ? body.results : []).map(mapJamendoTrack).filter(Boolean);
  return { list, total: Number(body?.headers?.results_count) || list.length, page };
}

async function searchOpenverse({ keyword, page }) {
  const url =
    `${OPENVERSE_URL}?q=${encodeURIComponent(keyword)}&source=jamendo` +
    `&page_size=${PAGE_SIZE}&page=${page}`;
  const body = await getJson(url);
  const list = (Array.isArray(body?.results) ? body.results : [])
    .map((item) => mapJamendoTrack(item, { durationInMs: true }))
    .filter(Boolean);
  return { list, total: Number(body?.result_count) || list.length, page };
}

export function searchJamendo(input) {
  return config.jamendoClientId ? searchOfficial(input) : searchOpenverse(input);
}

export async function jamendoAlbum({ id, page, size }) {
  if (!config.jamendoClientId) {
    throw new UpstreamError('Jamendo no expone álbumes sin una clave de API configurada.', 501);
  }
  const url =
    `${API_URL}/albums/tracks/?client_id=${encodeURIComponent(config.jamendoClientId)}` +
    `&format=json&id=${encodeURIComponent(id)}&limit=${size}&offset=${(page - 1) * size}`;
  const body = await getJson(url);
  const results = Array.isArray(body?.results) ? body.results : [];
  const album = results[0] ?? {};
  const list = (Array.isArray(album.tracks) ? album.tracks : []).map(mapJamendoTrack).filter(Boolean);
  return {
    info: {
      id: String(id),
      name: decodeEntities(album.name ?? '') || 'Álbum de Jamendo',
      artist: decodeEntities(album.artist_name ?? '') || 'Jamendo',
      description: '',
      pic_url: String(album.image ?? ''),
      link: String(album.shareurl ?? `https://www.jamendo.com/album/${id}`),
      release_date: String(album.releasedate ?? ''),
    },
    list,
    total: Number(album.tracks_count) || list.length,
    page,
    size,
    hasMore: false,
  };
}

async function headExists(url) {
  try {
    const response = await httpFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': config.userAgent, Range: 'bytes=0-3' },
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    await response.body?.cancel().catch(() => {});
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

export async function resolveJamendo({ songid, format, time }) {
  const id = String(songid ?? '').replace(/[^\d]/g, '');
  if (!id) {
    throw new UpstreamError('La pista de Jamendo no es válida.', 400);
  }
  const wanted = String(format).toLowerCase() === 'mp3' ? 'mp3' : 'flac';
  const url = jamendoAudioUrl(id, wanted);
  if (!(await headExists(url))) {
    if (wanted === 'flac') {
      throw new UpstreamError('Jamendo no tiene FLAC para esta pista; elige MP3 192.', 422);
    }
    throw new UpstreamError('Jamendo no entrega audio para esta pista.', 502);
  }
  return {
    url,
    format: wanted,
    bitrate: wanted === 'flac' ? '1000' : '192',
    duration: Number(time) || 0,
    songid: id,
    sourcePlatform: 'jamendo',
  };
}
