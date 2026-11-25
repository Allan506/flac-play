export function eapiParams(url: string, payload: Record<string, unknown>): string;

export function mapNeteaseSong(
  song: unknown,
  privilege?: { maxbr?: number },
  options?: { lossless?: boolean },
): {
  id: string;
  name: string;
  artist: string;
  artist_id: string;
  album_name: string;
  album_id: string;
  pic_url: string;
  duration: number;
  minfo: { level: string; bitrate: string; format: string; size: string }[];
  link: string;
  time: number;
  sign: string;
  hasHQ: boolean;
  hasSQ: boolean;
} | null;

export function searchNetease(input: {
  keyword: string;
  page: number;
  size?: number;
}): Promise<{ list: unknown[]; total: number; page: number }>;

export function neteaseAlbum(input: {
  id: string;
  page?: number;
  size?: number;
}): Promise<{
  info: {
    id: string;
    name: string;
    artist: string;
    description: string;
    pic_url: string;
    link: string;
    release_date: string;
  };
  list: unknown[];
  total: number;
  page: number;
}>;

export function neteaseLyrics(input: { songid: string }): Promise<string>;

export function neteaseSongDetail(songid: string): Promise<unknown | null>;

export function neteaseAudio(input: {
  songid: string;
  format: string;
  bitrate: string;
}): Promise<{ url: string; format: string; bitrate: string; duration: number; songid: string } | null>;
