import { describe, expect, it } from 'vitest';
import { albumSchema, resolveSchema, searchSchema } from '../server/validation.mjs';

describe('albumSchema', () => {
  it('rejects zero-only album IDs', () => {
    expect(albumSchema.safeParse({ platform: 'kuwo', id: '0' }).success).toBe(false);
    expect(albumSchema.safeParse({ platform: 'kuwo', id: '000' }).success).toBe(false);
  });

  it('accepts numeric album IDs', () => {
    expect(albumSchema.safeParse({ platform: 'kuwo', id: '442387' }).success).toBe(true);
    expect(albumSchema.safeParse({ platform: 'wyy', id: '19323190' }).success).toBe(true);
  });
});

describe('sólo quedan Kuwo y NetEase', () => {
  const base = { format: 'flac', bitrate: '2000' };

  it('rechaza los catálogos que se retiraron', () => {
    for (const platform of ['archive', 'jamendo', 'commons']) {
      expect(searchSchema.safeParse({ platform, keyword: 'jazz' }).success).toBe(false);
      expect(resolveSchema.safeParse({ ...base, platform, songid: '123' }).success).toBe(false);
    }
  });

  it('rechaza catálogos desconocidos', () => {
    expect(searchSchema.safeParse({ platform: 'spotify', keyword: 'jazz' }).success).toBe(false);
  });

  it('exige identificadores numéricos en las dos plataformas', () => {
    expect(
      resolveSchema.safeParse({ ...base, platform: 'kuwo', songid: 'KL2019-05-04/x.flac' }).success,
    ).toBe(false);
    expect(
      resolveSchema.safeParse({ ...base, platform: 'wyy', songid: 'File:x.flac' }).success,
    ).toBe(false);
    expect(resolveSchema.safeParse({ ...base, platform: 'wyy', songid: '1234' }).success).toBe(true);
  });

  it('rechaza álbumes vacíos', () => {
    expect(albumSchema.safeParse({ platform: 'kuwo', id: '' }).success).toBe(false);
    expect(albumSchema.safeParse({ platform: 'kuwo', id: '442387' }).success).toBe(true);
  });
});
