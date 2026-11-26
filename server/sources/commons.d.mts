export interface CommonsTrack {
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

export function commonsPageUrl(title: string): string;

export function mapCommonsTrack(page: unknown): CommonsTrack | null;

export function searchCommons(input: {
  keyword: string;
  page: number;
}): Promise<{ list: CommonsTrack[]; total: number; page: number }>;

export function resolveCommons(input: {
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
