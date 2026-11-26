export interface ArchiveTrack {
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

export interface ArchiveAlbum {
  info: {
    id: string;
    name: string;
    artist: string;
    description: string;
    pic_url: string;
    link: string;
    release_date: string;
  };
  list: ArchiveTrack[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}

export function archiveAudioUrl(identifier: string, file: string): string;

export function archiveCoverUrl(identifier: string): string;

export function archiveTrackId(identifier: string, file: string): string;

export function parseArchiveTrackId(id: string): { identifier: string; file: string } | null;

export function flacFiles(item: unknown): {
  name: string;
  format?: string;
  source?: string;
  size?: string;
  length?: string;
  title?: string;
}[];

export function mapArchiveTrack(input: {
  identifier: string;
  item: unknown;
  file: { name: string; size?: string; length?: string; title?: string };
}): ArchiveTrack;

export function searchArchive(input: {
  keyword: string;
  page: number;
}): Promise<{ list: ArchiveTrack[]; total: number; page: number }>;

export function archiveAlbum(input: {
  id: string;
  page: number;
  size: number;
}): Promise<ArchiveAlbum>;

export function resolveArchive(input: {
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
