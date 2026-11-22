import { describe, expect, it } from 'vitest';
import { albumSchema } from '../server/validation.mjs';

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
