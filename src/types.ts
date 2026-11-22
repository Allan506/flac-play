export type Platform = 'kuwo' | 'wyy';

export type AudioFormat = 'mp3' | 'flac';

export interface Quality {
  level: string;
  bitrate: string;
  format: AudioFormat;
  size: string;
}

export interface Track {
  id: string;
  name: string;
  artist: string;
  artist_id: string;
  album_name: string;
  album_id: string;
  pic_url: string;
  duration: number;
  minfo: Quality[];
  link: string;
  time: number;
  sign: string;
  hasHQ: boolean;
  hasSQ: boolean;
}

export interface SearchPage {
  list: Track[];
  total: number;
  page: number;
}

export interface AlbumInfo {
  id: string;
  name: string;
  artist: string;
  description: string;
  pic_url: string;
  link: string;
  release_date: string;
}

export interface AlbumPage {
  info: AlbumInfo;
  list: Track[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}

export interface ResolvedAudio {
  url: string;
  format: AudioFormat;
  bitrate: string;
  duration: number;
  songid: string;
}

export interface ProbeResult {
  available: boolean;
  sourceFormat: AudioFormat;
  contentType: string;
  contentLength: number;
  expectedDurationSeconds: number;
  likelyPreview: boolean;
}

export interface QualityCheck extends Quality {
  available: boolean;
  sourceFormat: AudioFormat;
  contentType: string;
  contentLength: number;
  expectedDurationSeconds: number;
  likelyPreview: boolean;
  error: string;
}

export interface QualityCheckResult {
  qualities: QualityCheck[];
  recommended: { format: AudioFormat; bitrate: string } | null;
  allPreview: boolean;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  message?: string;
}

export interface Catalog {
  value: Platform;
  name: string;
  initial: string;
}

export interface AppConfig {
  version: string;
  catalogs: Catalog[];
  pageSize: number;
  maxKeywordLength: number;
  maxDownloadBytes: number;
}

export interface FilterState {
  artist: string;
  album: string;
  quality: 'any' | 'lossless' | 'hifi' | 'mp3_320';
  minDuration: number;
  sort: 'catalog' | 'quality' | 'title' | 'duration';
}

export interface LyricsLine {
  time: number;
  text: string;
}

export interface ParsedLyrics {
  meta: Record<string, string>;
  lines: LyricsLine[];
  synced: boolean;
}

export interface DownloadOptions {
  quality: Quality;
  embedMetadata: boolean;
  highResolutionCover: boolean;
}

export interface PlayerTrack {
  track: Track;
  platform: Platform;
  quality: Quality;
  url: string;
}
