import { cached } from './cache.mjs';
import { config } from './config.mjs';
import { UpstreamError } from './errors.mjs';
import { httpFetch } from './http.mjs';
import {
  neteaseAlbum,
  neteaseAudio,
  neteaseLyrics,
  neteaseSongDetail,
  searchNetease,
} from './netease.mjs';
import {
  decodeEntities,
  normalizeQuality,
  qualityRank,
  sleep,
  toHttps,
  toSeconds,
} from './utils.mjs';

function logUpstream(event, path, payload, status) {
  console.warn(
    `[${new Date().toISOString()}] upstream_${event} path=${path} status=${status} payload=${JSON.stringify(payload).slice(0, 500)}`,
  );
}

export function upstreamAppErrorMessage(path, payload) {
  if (path.includes('/search')) {
    if (payload?.platform === 'wyy') {
      return 'NetEase no está entregando resultados ahora mismo. Busca en Kuwo mientras se recupera.';
    }
    return 'El catálogo no devolvió resultados para esta búsqueda. Prueba otra palabra o cambia de catálogo.';
  }
  if (path.includes('/resolve')) {
    return 'El catálogo no pudo entregar el audio de esta pista. Prueba otra versión o cambia de catálogo.';
  }
  if (path.includes('/lyrics')) {
    return 'El catálogo no tiene la letra de esta pista.';
  }
  if (path.includes('/album')) {
    return 'El catálogo no pudo abrir ese álbum.';
  }
  return 'El catálogo no pudo completar la solicitud. Inténtalo de nuevo en unos segundos.';
}

function upstreamNotFoundMessage(path) {
  if (path.includes('/album')) {
    return 'La fuente no encontró ese álbum. Vuelve a buscar la pista o abre la ficha original.';
  }
  if (path.includes('/search')) {
    return 'La fuente no encontró resultados para esta búsqueda. Inténtalo de nuevo o cambia de catálogo.';
  }
  return 'La fuente no encontró el recurso solicitado. Inténtalo de nuevo.';
}

async function requestOnce(path, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await httpFetch(`${config.upstreamApi}${path}`, {
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
      if (!response.ok) {
        if (response.status === 404) {
          logUpstream('not_found', path, payload, response.status);
          throw new UpstreamError(upstreamNotFoundMessage(path), 502);
        }
        if (response.status === 429) {
          logUpstream('rate_limited', path, payload, response.status);
          throw new UpstreamError(
            'La fuente está limitando las solicitudes. Espera unos segundos y vuelve a intentarlo.',
            503,
          );
        }
        throw new UpstreamError(
          `La fuente respondió HTTP ${response.status}.`,
          response.status >= 500 ? 502 : response.status,
        );
      }
      throw new UpstreamError('La fuente devolvió una respuesta ilegible.', 502);
    }

    if (!response.ok) {
      if (response.status === 404) {
        logUpstream('not_found', path, payload, response.status);
        throw new UpstreamError(upstreamNotFoundMessage(path), 502);
      }
      if (response.status === 429) {
        logUpstream('rate_limited', path, payload, response.status);
        throw new UpstreamError(
          'La fuente está limitando las solicitudes. Espera unos segundos y vuelve a intentarlo.',
          503,
        );
      }
      const message =
        body?.message || body?.error?.message || `La fuente respondió HTTP ${response.status}.`;
      throw new UpstreamError(message, response.status >= 500 ? 502 : response.status);
    }

    if (typeof body?.code === 'number' && body.code !== 0) {
      logUpstream('app_error', path, { ...payload, upstreamMessage: body.msg }, response.status);
      throw new UpstreamError(upstreamAppErrorMessage(path, payload), 502);
    }

    return body;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error?.name === 'AbortError') {
      throw new UpstreamError('La fuente tardó demasiado en responder.', 504);
    }
    const failure = new UpstreamError('No se pudo conectar con la fuente de música.', 502);
    failure.unreachable = true;
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

async function requestUpstream(path, payload) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestOnce(path, payload, config.upstreamTimeoutMs);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof UpstreamError &&
        (error.status === 502 || error.status === 503 || error.status === 504);
      if (!retryable || attempt === 2) break;
      await sleep(attempt === 0 ? 700 : 1800);
    }
  }
  if (lastError instanceof UpstreamError && lastError.unreachable) {
    throw new UpstreamError(
      'El catálogo no respondió. Puede estar despertando; vuelve a intentarlo en unos segundos.',
      502,
    );
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

const TRACK_CACHE_MS = 6 * 60 * 60_000;

function rememberTrack(track) {
  return cached(`wyy-track:${track.id}`, TRACK_CACHE_MS, async () => track);
}

function normalizeTitle(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\((?!feat)[^)]*\)|\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function pickKuwoMatch(meta, candidates) {
  const objetivo = normalizeTitle(meta.name);
  if (!objetivo) return null;
  const puntuados = candidates
    .map((track) => {
      const titulo = normalizeTitle(track.name);
      const mismoTitulo = titulo === objetivo || titulo.includes(objetivo) || objetivo.includes(titulo);
      const desvio = meta.duration ? Math.abs(track.duration - meta.duration) : 0;
      return { track, mismoTitulo, desvio };
    })
    .filter((item) => item.mismoTitulo && item.desvio <= 8)
    .sort((a, b) => a.desvio - b.desvio);
  return puntuados[0]?.track ?? null;
}

export function chooseQuality(minfo, format, bitrate) {
  const peso = (item) => Number(item.bitrate) || (item.format === 'flac' ? 2000 : 128);
  const objetivo = format === 'flac' ? 2000 : Number(bitrate) || 128;
  const dentro = minfo.filter((item) => peso(item) <= objetivo);
  const elegida = (dentro.length ? dentro : minfo).sort((a, b) => peso(b) - peso(a))[0];
  return elegida ? { format: elegida.format, bitrate: elegida.bitrate } : { format, bitrate };
}

async function neteaseTrackMeta(songid) {
  return cached(`wyy-track:${songid}`, TRACK_CACHE_MS, () => neteaseSongDetail(songid));
}

async function resolveNeteaseAudio({ songid, format, bitrate }) {
  const directo = await neteaseAudio({ songid, format, bitrate }).catch(() => null);
  if (directo?.url) return directo;

  const meta = await neteaseTrackMeta(songid);
  if (!meta) {
    throw new UpstreamError('No se pudo identificar esta pista de NetEase.', 502);
  }

  const { list } = await searchTracks({
    platform: 'kuwo',
    keyword: `${meta.artist} ${meta.name}`.trim(),
    page: 1,
  });
  const gemela = pickKuwoMatch(meta, list);
  if (!gemela) {
    throw new UpstreamError(
      'NetEase no entrega el audio de esta pista (requiere cuenta) y no hay una versión equivalente en Kuwo.',
      502,
    );
  }
  const calidad = chooseQuality(gemela.minfo, format, bitrate);
  return resolveAudio({
    platform: 'kuwo',
    songid: gemela.id,
    format: calidad.format,
    bitrate: calidad.bitrate,
    time: gemela.time,
    sign: gemela.sign,
  });
}

export async function searchTracks({ platform, keyword, page }) {
  if (platform === 'wyy' && config.neteaseNative) {
    const nativo = await searchNetease({ keyword, page });
    const list = nativo.list.map(normalizeTrack).filter(Boolean);
    list.forEach(rememberTrack);
    return { list, total: nativo.total, page };
  }

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
  if (platform === 'wyy' && config.neteaseNative) {
    return resolveNeteaseAudio({ songid, format, bitrate });
  }

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
  if (platform === 'wyy' && config.neteaseNative) {
    const letra = await neteaseLyrics({ songid });
    if (letra.trim()) return letra.replace(/^\uFEFF/, '').trim();
    throw new UpstreamError('NetEase no tiene la letra de esta pista.', 502);
  }

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
  if (platform === 'wyy' && config.neteaseNative) {
    const nativo = await neteaseAlbum({ id, page, size });
    const list = nativo.list.map(normalizeTrack).filter(Boolean);
    list.forEach(rememberTrack);
    return {
      info: nativo.info,
      list,
      total: nativo.total,
      page,
      size,
      hasMore: page * size < nativo.total,
    };
  }

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
