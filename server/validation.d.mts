import type { ZodType } from 'zod';

export interface AlbumInput {
  platform: 'kuwo' | 'wyy';
  id: string;
  page: number;
  size: number;
}

export const albumSchema: ZodType<AlbumInput>;
