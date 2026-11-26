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

describe('catálogos abiertos', () => {
  const base = { format: 'flac', bitrate: '1000' };

  it('acepta los tres catálogos nuevos', () => {
    for (const platform of ['archive', 'jamendo', 'commons']) {
      expect(searchSchema.safeParse({ platform, keyword: 'jazz' }).success).toBe(true);
    }
  });

  it('acepta identificadores de texto solo en los catálogos abiertos', () => {
    expect(
      resolveSchema.safeParse({ ...base, platform: 'archive', songid: 'KL2019-05-04/set 1.flac' })
        .success,
    ).toBe(true);
    expect(
      resolveSchema.safeParse({
        ...base,
        platform: 'commons',
        songid: 'File:Acoustic Jazz Quartet no1.flac',
      }).success,
    ).toBe(true);
    expect(resolveSchema.safeParse({ ...base, platform: 'jamendo', songid: '355482' }).success).toBe(
      true,
    );
  });

  it('sigue exigiendo identificadores numéricos en Kuwo y NetEase', () => {
    expect(
      resolveSchema.safeParse({ ...base, platform: 'kuwo', songid: 'KL2019-05-04/x.flac' }).success,
    ).toBe(false);
    expect(resolveSchema.safeParse({ ...base, platform: 'wyy', songid: '1234' }).success).toBe(true);
  });

  it('rechaza catálogos desconocidos', () => {
    expect(searchSchema.safeParse({ platform: 'spotify', keyword: 'jazz' }).success).toBe(false);
  });

  it('rechaza álbumes vacíos en catálogos abiertos', () => {
    expect(albumSchema.safeParse({ platform: 'archive', id: '' }).success).toBe(false);
    expect(albumSchema.safeParse({ platform: 'archive', id: 'gd1977-12-31' }).success).toBe(true);
  });
});
