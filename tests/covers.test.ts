import { describe, expect, it } from 'vitest';
import { coverCandidates } from '../server/covers.mjs';

describe('coverCandidates', () => {
  it('promotes Kuwo covers to 1200 px with smaller fallbacks', () => {
    const urls = coverCandidates(
      'https://img1.kuwo.cn/star/albumcover/120/s4s23/43/135849307.jpg',
    );
    const sizes = urls.map((url) => new URL(url).pathname.match(/albumcover\/(\d+)\//)?.[1]);

    expect(sizes).toEqual(['1200', '500', '300', '120']);
  });

  it('removes NetEase size params to request the original cover', () => {
    const urls = coverCandidates(
      'https://p1.music.126.net/8D2Pd7EuvGboMyE2xWc47A==/109951172453712025.jpg?param=120y120',
    );

    expect(new URL(urls[0]).search).toBe('');
    expect(urls[0]).toBe(
      'https://p1.music.126.net/8D2Pd7EuvGboMyE2xWc47A==/109951172453712025.jpg',
    );
  });

  it('keeps the original NetEase URL as a fallback', () => {
    const original =
      'https://p1.music.126.net/8D2Pd7EuvGboMyE2xWc47A==/109951172453712025.jpg?param=120y120';

    expect(coverCandidates(original)).toContain(original);
  });

  it('does not duplicate candidates', () => {
    const urls = coverCandidates(
      'https://img1.kuwo.cn/star/albumcover/1200/s4s23/43/135849307.jpg',
    );

    expect(new Set(urls).size).toBe(urls.length);
  });

  it('leaves unknown hosts untouched', () => {
    const url = 'https://example.com/cover.jpg';

    expect(coverCandidates(url)).toEqual([url]);
  });
});
