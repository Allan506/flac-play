import { config } from './config.mjs';
import { UpstreamError } from './errors.mjs';
import {
  decodeEntities,
  normalizeQuality,
  qualityRank,
  sleep,
  toHttps,
  toSeconds,
} from './utils.mjs';

async function requestOnce(path, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.upstreamApi}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': config.userAgent,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new UpstreamError('La fuente devolvió una respuesta ilegible.', 502);
    }

    if (!response.ok) {
      const message =
        body?.message || body?.error?.message || `La fuente respondió HTTP ${response.status}.`;
      throw new UpstreamError(message, response.status >= 500 ? 502 : response.status);
    }

    if (typeof body?.code === 'number' && body.code !== 0) {
      throw new UpstreamError(body.msg || 'La fuente no pudo completar la solicitud.', 502);
    }

    return body;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error?.name === 'AbortError') {
      throw new UpstreamError('La fuente tardó demasiado en responder.', 504);
    }
    throw new UpstreamError('No se pudo conectar con la fuente de música.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function requestUpstream(path, payload) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestOnce(path, payload, config.upstreamTimeoutMs);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof UpstreamError && (error.status === 502 || error.status === 504);
      if (!retryable || attempt === 1) break;
      await sleep(450 + attempt * 350);
    }
  }
  throw lastError;
}

export function normalizeTrack(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').trim();
  if (!id) return null;

  const qualities = Array.isArray(raw.minfo)
    ? raw.minfo
        .map(normalizeQuality)
        .filter(Boolean)
        .sort((a, b) => qualityRank(b) - qualityRank(a))
    : [];

  return {
    id,
    name: decodeEntities(raw.name ?? raw.songname) || 'Pista sin título',
    artist: decodeEntities(raw.artist) || 'Artista no indicado',
    artist_id: raw.artist_id ? String(raw.artist_id) : '',
    album_name: decodeEntities(raw.album_name ?? raw.album),
    album_id: raw.album_id && String(raw.album_id) !== '0' ? String(raw.album_id) : '',
    pic_url: toHttps(raw.pic_url ?? raw.pic ?? ''),
    duration: toSeconds(raw.duration),
    minfo: qualities,
    link: toHttps(raw.link ?? ''),
    time: Number(raw.time) || 0,
    sign: raw.sign ? String(raw.sign) : '',
    hasHQ: Boolean(raw.hasHQ),
    hasSQ: Boolean(raw.hasSQ),
  };
}

export async function searchTracks({ platform, keyword, page }) {
  const body = await requestUpstream('/api/search', { platform, keyword, page });
  const data = body?.data ?? {};
  const list = Array.isArray(data.list) ? data.list.map(normalizeTrack).filter(Boolean) : [];
  return {
    list,
    total: Number(data.total) || list.length,
    page,
  };
}

export async function resolveAudio({ platform, songid, format, bitrate, time, sign }) {
  const body = await requestUpstream('/api/resolve', {
    platform,
    songid,
    format,
    bitrate,
    time,
    sign,
  });
  const data = body?.data ?? {};
  if (!data.url) {
    throw new UpstreamError('La fuente no devolvió un enlace de audio para esta calidad.', 502);
  }
  return {
    url: toHttps(data.url),
    format: String(data.format ?? format).toLowerCase(),
    bitrate: String(data.bitrate ?? bitrate),
    duration: toSeconds(data.duration),
    songid: String(data.songid ?? songid),
  };
}

export async function fetchLyrics({ platform, songid, time, sign }) {
  const body = await requestUpstream('/api/lyrics', { platform, songid, time, sign });
  const data = body?.data;
  const lyrics =
    typeof data === 'string'
      ? data
      : typeof data?.lyric === 'string'
        ? data.lyric
        : typeof data?.lrc === 'string'
          ? data.lrc
          : '';
  return lyrics.replace(/^\uFEFF/, '').trim();
}

export async function fetchAlbum({ platform, id, page, size }) {
  const body = await requestUpstream('/api/album', { platform, id, page, size });
  const data = body?.data ?? {};
  const info = data.info ?? {};
  const list = Array.isArray(data.list) ? data.list.map(normalizeTrack).filter(Boolean) : [];
  const total = Number(data.total) || list.length;

  return {
    info: {
      id: String(info.id ?? id),
      name: decodeEntities(info.name) || 'Álbum sin título',
      artist: decodeEntities(info.artist) || 'Artista no indicado',
      description: decodeEntities(info.description),
      pic_url: toHttps(info.pic_url ?? ''),
      link: toHttps(info.link ?? ''),
      release_date: info.release_date ? String(info.release_date) : '',
    },
    list,
    total,
    page,
    size,
    hasMore: page * size < total,
  };
}
