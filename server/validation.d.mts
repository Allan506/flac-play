import type { ZodType } from 'zod';

export interface AlbumInput {
  platform: 'kuwo' | 'wyy' | 'archive' | 'jamendo' | 'commons';
  id: string;
  page: number;
  size: number;
}

export const albumSchema: ZodType<AlbumInput>;

export const NATIVE_PLATFORMS: string[];

export interface SearchInput {
  platform: 'kuwo' | 'wyy' | 'archive' | 'jamendo' | 'commons';
  keyword: string;
  page: number;
}

export interface ResolveInput {
  platform: 'kuwo' | 'wyy' | 'archive' | 'jamendo' | 'commons';
  songid: string;
  format: 'mp3' | 'flac';
  bitrate: string;
  time?: number;
  sign?: string;
  requireLossless: boolean;
}

export const searchSchema: ZodType<SearchInput>;
export const resolveSchema: ZodType<ResolveInput>;
export const lyricsSchema: ZodType<Omit<ResolveInput, 'format' | 'bitrate' | 'requireLossless'>>;
