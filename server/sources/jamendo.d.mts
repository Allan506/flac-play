export interface JamendoTrack {
  id: string;
  name: string;
  artist: string;
  artist_id: string;
  album_name: string;
  album_id: string;
  pic_url: string;
  duration: number;
  minfo: { level: string; bitrate: string; format: string; size?: string }[];
  link: string;
  time: number;
  sign: string;
  hasHQ: boolean;
  hasSQ: boolean;
}

export interface JamendoAlbum {
  info: {
    id: string;
    name: string;
    artist: string;
    description: string;
    pic_url: string;
    link: string;
    release_date: string;
  };
  list: JamendoTrack[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}

export function jamendoAudioUrl(trackId: string, format?: string): string;

export function jamendoTrackIdFromUrl(url: string | null | undefined): string;

export function mapJamendoTrack(
  raw: unknown,
  options?: { durationInMs?: boolean },
): JamendoTrack | null;

export function searchJamendo(input: {
  keyword: string;
  page: number;
}): Promise<{ list: JamendoTrack[]; total: number; page: number }>;

export function jamendoAlbum(input: {
  id: string;
  page: number;
  size: number;
}): Promise<JamendoAlbum>;

export function resolveJamendo(input: {
  songid: string;
  format: string;
  time?: number | string;
}): Promise<{
  url: string;
  format: string;
  bitrate: string;
  duration: number;
  songid: string;
  sourcePlatform: string;
}>;
