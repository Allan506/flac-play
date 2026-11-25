import crypto from 'node:crypto';
import { config } from './config.mjs';
import { UpstreamError } from './errors.mjs';
import { httpFetch } from './http.mjs';
import { decodeEntities, toHttps, toSeconds } from './utils.mjs';

const EAPI_HOST = 'https://interface3.music.163.com';
const EAPI_SECRET = Buffer.from('e82ckenh8dichen8');
const BASE_COOKIE =
  'os=pc; appver=8.9.70; channel=netease; osver=Microsoft-Windows-10; deviceId=flacplay';

export function eapiParams(url, payload) {
  const text = JSON.stringify(payload);
  const digest = crypto
    .createHash('md5')
    .update(`nobody${url}use${text}md5forencrypt`)
    .digest('hex');
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const cipher = crypto.createCipheriv('aes-128-ecb', EAPI_SECRET, null);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('hex').toUpperCase();
}

async function eapi(url, payload) {
  const cookie = config.neteaseCookie ? `${BASE_COOKIE}; ${config.neteaseCookie}` : BASE_COOKIE;
  let response;
  try {
    response = await httpFetch(`${EAPI_HOST}/eapi${url}`, {
      method: 'POST',
      headers: {
        'User-Agent': config.userAgent,
        Referer: 'https://music.163.com',
        Origin: 'https://music.163.com',
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: new URLSearchParams({ params: eapiParams(url, payload) }).toString(),
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
  } catch {
    throw new UpstreamError('No se pudo conectar con NetEase.', 502);
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new UpstreamError('NetEase devolvió una respuesta ilegible.', 502);
  }

  if (body?.code && body.code !== 200) {
    throw new UpstreamError(`NetEase respondió con el código ${body.code}.`, 502);
  }
  return body;
}

function qualityList(privilege, lossless) {
  const maxbr = Number(privilege?.maxbr ?? 0);
  const list = [];
  if (lossless && maxbr >= 900_000) {
    list.push({ level: 'lossless', bitrate: '2000', format: 'flac', size: '' });
  }
  if (maxbr >= 320_000) {
    list.push({ level: 'exhigh', bitrate: '320', format: 'mp3', size: '' });
  }
  list.push({ level: 'standard', bitrate: '128', format: 'mp3', size: '' });
  return list;
}

export function mapNeteaseSong(song, privilege, options = {}) {
  if (!song?.id) return null;
  const album = song.al ?? song.album ?? {};
  const artists = song.ar ?? song.artists ?? [];
  return {
    id: String(song.id),
    name: decodeEntities(song.name) || 'Pista sin título',
    artist: decodeEntities(artists.map((item) => item?.name).filter(Boolean).join(' / ')) || 'Artista no indicado',
    artist_id: String(artists[0]?.id ?? ''),
    album_name: decodeEntities(album.name) || '',
    album_id: album.id ? String(album.id) : '',
    pic_url: toHttps(album.picUrl ?? ''),
    duration: toSeconds(song.dt ? song.dt / 1000 : 0),
    minfo: qualityList(privilege ?? song.privilege, options.lossless ?? Boolean(config.neteaseCookie)),
    link: `https://music.163.com/song?id=${song.id}`,
    time: 0,
    sign: '',
    hasHQ: Number(privilege?.maxbr ?? 0) >= 320_000,
    hasSQ: Boolean(options.lossless ?? config.neteaseCookie) && Number(privilege?.maxbr ?? 0) >= 900_000,
  };
}

export async function searchNetease({ keyword, page, size = 20 }) {
  const body = await eapi('/api/cloudsearch/pc', {
    s: keyword,
    type: 1,
    limit: size,
    offset: (page - 1) * size,
    total: true,
    csrf_token: '',
  });
  const songs = body?.result?.songs ?? [];
  const list = songs.map((song) => mapNeteaseSong(song)).filter(Boolean);
  return {
    list,
    total: Number(body?.result?.songCount ?? list.length) || list.length,
    page,
  };
}

export async function neteaseAlbum({ id, page = 1, size = 20 }) {
  const body = await eapi(`/api/v1/album/${id}`, { csrf_token: '' });
  const songs = Array.isArray(body?.songs) ? body.songs : [];
  const list = songs.map((song) => mapNeteaseSong(song)).filter(Boolean);
  const inicio = (page - 1) * size;
  const album = body?.album ?? {};
  return {
    info: {
      id: String(id),
      name: decodeEntities(album.name) || 'Álbum sin título',
      artist: decodeEntities((album.artists ?? []).map((item) => item?.name).filter(Boolean).join(' / ')),
      description: decodeEntities(album.description ?? ''),
      pic_url: toHttps(album.picUrl ?? ''),
      link: `https://music.163.com/album?id=${id}`,
      release_date: album.publishTime ? String(new Date(album.publishTime).toISOString().slice(0, 10)) : '',
    },
    list: list.slice(inicio, inicio + size),
    total: list.length,
    page,
  };
}

export async function neteaseLyrics({ songid }) {
  const body = await eapi('/api/song/lyric/v1', {
    id: Number(songid),
    cp: false,
    tv: 0,
    lv: 0,
    rv: 0,
    kv: 0,
  });
  return String(body?.lrc?.lyric ?? body?.klyric?.lyric ?? '');
}

export async function neteaseSongDetail(songid) {
  const body = await eapi('/api/v3/song/detail', { c: JSON.stringify([{ id: Number(songid) }]) });
  const song = body?.songs?.[0];
  if (!song) return null;
  return mapNeteaseSong(song, body?.privileges?.[0]);
}

const LEVELS = { '2000': 'lossless', flac: 'lossless', '320': 'exhigh', '128': 'standard' };

export async function neteaseAudio({ songid, format, bitrate }) {
  const level = LEVELS[String(bitrate)] ?? LEVELS[String(format)] ?? 'exhigh';
  const body = await eapi('/api/song/enhance/player/url/v1', {
    ids: `[${Number(songid)}]`,
    level,
    encodeType: format === 'flac' ? 'flac' : 'mp3',
    csrf_token: '',
  });
  const item = body?.data?.[0];
  if (!item?.url) return null;
  return {
    url: toHttps(item.url),
    format: String(item.type ?? format ?? 'mp3').toLowerCase().includes('flac') ? 'flac' : 'mp3',
    bitrate: String(Math.round(Number(item.br ?? 0) / 1000) || bitrate || ''),
    duration: toSeconds(item.time ? item.time / 1000 : 0),
    songid: String(songid),
  };
}
