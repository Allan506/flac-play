import type {
  AlbumPage,
  ApiErrorBody,
  AppConfig,
  DownloadOptions,
  Platform,
  ProbeResult,
  Quality,
  QualityCheckResult,
  ResolvedAudio,
  SearchPage,
  Track,
} from './types';

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, options: { code?: string; status?: number; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code ?? 'REQUEST_FAILED';
    this.status = options.status ?? 0;
    this.details = options.details;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('No se pudo conectar con la cabina. Revisa tu conexión.', {
      code: 'NETWORK_ERROR',
    });
  }

  const payload = (await readJson(response)) as ApiErrorBody & { data?: T };

  if (!response.ok) {
    const message =
      payload.error?.message ?? payload.message ?? 'La solicitud no se pudo completar.';
    throw new ApiError(message, {
      code: payload.error?.code ?? `HTTP_${response.status}`,
      status: response.status,
      details: payload.error?.details,
    });
  }

  if (!payload || !('data' in payload)) {
    throw new ApiError('La respuesta de la cabina llegó incompleta.', { code: 'BAD_RESPONSE' });
  }

  return payload.data as T;
}

export function getConfig(signal?: AbortSignal): Promise<AppConfig> {
  return fetch(`${API_BASE}/api/config`, { signal })
    .then(async (response) => {
      const payload = (await readJson(response)) as { data?: AppConfig };
      if (!response.ok || !payload.data) {
        throw new ApiError('No se pudo cargar la configuración de la cabina.');
      }
      return payload.data;
    })
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof ApiError) throw error;
      throw new ApiError('No se pudo cargar la configuración de la cabina.', {
        code: 'NETWORK_ERROR',
      });
    });
}

export function searchTracks(
  input: { platform: Platform; keyword: string; page: number },
  signal?: AbortSignal,
): Promise<SearchPage> {
  return post<SearchPage>('/api/search', input, signal);
}

export function resolveTrack(
  input: {
    platform: Platform;
    songid: string;
    format: Quality['format'];
    bitrate: string;
    time: number;
    sign: string;
    requireLossless?: boolean;
  },
  signal?: AbortSignal,
): Promise<ResolvedAudio> {
  return post<ResolvedAudio>('/api/resolve', input, signal);
}

export function getLyrics(
  input: { platform: Platform; songid: string; time: number; sign: string },
  signal?: AbortSignal,
): Promise<string> {
  return post<string>('/api/lyrics', input, signal);
}

export function getAlbum(
  input: { platform: Platform; id: string; page: number; size?: number },
  signal?: AbortSignal,
): Promise<AlbumPage> {
  return post<AlbumPage>('/api/album', input, signal);
}

export function probeTrack(
  input: {
    platform: Platform;
    songid: string;
    format: Quality['format'];
    bitrate: string;
    time: number;
    sign: string;
    expectedDurationSeconds: number;
  },
  signal?: AbortSignal,
): Promise<ProbeResult> {
  return post<ProbeResult>('/api/probe', input, signal);
}

export function checkQualities(
  input: {
    platform: Platform;
    songid: string;
    time: number;
    sign: string;
    expectedDurationSeconds: number;
    requireLossless?: boolean;
    qualities: Array<{ format: Quality['format']; bitrate: string }>;
  },
  signal?: AbortSignal,
): Promise<QualityCheckResult> {
  return post<QualityCheckResult>('/api/check', input, signal);
}

export function downloadTrack(
  track: Track,
  platform: Platform,
  options: DownloadOptions,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${API_BASE}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      platform,
      songid: track.id,
      format: options.quality.format,
      outputFormat: options.outputFormat ?? options.quality.format,
      bitrate: options.quality.bitrate,
      time: track.time,
      sign: track.sign,
      title: track.name,
      artist: track.artist,
      album: track.album_name,
      coverUrl: track.pic_url,
      expectedDurationSeconds: track.duration,
      embedMetadata: options.embedMetadata,
      embedCover: options.embedCover,
      requireLossless: Boolean(options.requireLossless),
    }),
  });
}

export async function readApiError(response: Response): Promise<ApiError> {
  const payload = (await readJson(response)) as ApiErrorBody;
  return new ApiError(
    payload.error?.message ?? payload.message ?? 'La solicitud no se pudo completar.',
    {
      code: payload.error?.code ?? `HTTP_${response.status}`,
      status: response.status,
      details: payload.error?.details,
    },
  );
}
