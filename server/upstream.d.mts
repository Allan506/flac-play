export function upstreamAppErrorMessage(
  path: string,
  payload?: { platform?: string },
): string;

export function normalizeTrack(raw: unknown): unknown;

export interface KuwoCandidate {
  id: string;
  name: string;
  duration: number;
  minfo?: { format: string; bitrate: string }[];
}

export function rankKuwoMatches(
  meta: { name: string; artist?: string; duration?: number },
  candidates: KuwoCandidate[],
  options?: { requireLossless?: boolean },
): KuwoCandidate[];

export function pickKuwoMatch(
  meta: { name: string; artist?: string; duration?: number },
  candidates: KuwoCandidate[],
  options?: { requireLossless?: boolean },
): KuwoCandidate | null;

export function chooseQuality(
  minfo: { format: string; bitrate: string }[],
  format: string,
  bitrate: string,
): { format: string; bitrate: string };

export function searchTracks(input: {
  platform: string;
  keyword: string;
  page: number;
}): Promise<{ list: unknown[]; total: number; page: number }>;

export function resolveAudio(input: {
  platform: string;
  songid: string;
  format: string;
  bitrate: string;
  time?: number;
  sign?: string;
}): Promise<{ url: string; format: string; bitrate: string; duration: number; songid: string }>;

export function fetchLyrics(input: {
  platform: string;
  songid: string;
  time?: number;
  sign?: string;
}): Promise<unknown>;

export function fetchAlbum(input: {
  platform: string;
  id: string;
  page: number;
  size: number;
}): Promise<unknown>;
