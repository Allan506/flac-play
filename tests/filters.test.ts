import { describe, expect, it } from 'vitest';
import { countActiveFilters, defaultFilters, filterAndSortTracks } from '../src/lib/filters';
import type { Quality, Track } from '../src/types';

const flac: Quality = { level: 'ff', bitrate: '2000', format: 'flac', size: '' };
const mp3_320: Quality = { level: 'p', bitrate: '320', format: 'mp3', size: '' };
const mp3_128: Quality = { level: 'h', bitrate: '128', format: 'mp3', size: '' };

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    name: `Pista ${id}`,
    artist: 'Artista',
    artist_id: '',
    album_name: 'Álbum',
    album_id: '1',
    pic_url: '',
    duration: 200,
    minfo: [mp3_128],
    link: '',
    time: 0,
    sign: '',
    hasHQ: false,
    hasSQ: false,
    ...overrides,
  };
}

describe('filterAndSortTracks', () => {
  const tracks = [
    track('1', { name: 'Zeta', artist: 'Rosalía', album_name: 'Motomami', duration: 180, minfo: [flac] }),
    track('2', { name: 'Alfa', artist: 'Daft Punk', album_name: 'Discovery', duration: 240, minfo: [mp3_320] }),
    track('3', { name: 'Beta', artist: '周杰伦', album_name: '叶惠美', duration: 300, minfo: [mp3_128] }),
  ];

  it('returns everything by default in catalog order', () => {
    expect(filterAndSortTracks(tracks, defaultFilters).map((item) => item.id)).toEqual(['1', '2', '3']);
  });

  it('filters by artist and album without accents being significant', () => {
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, artist: 'rosalia' }).map((item) => item.id),
    ).toEqual(['1']);
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, album: 'discovery' }).map((item) => item.id),
    ).toEqual(['2']);
  });

  it('filters by lossless and high fidelity', () => {
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, quality: 'lossless' }).map((item) => item.id),
    ).toEqual(['1']);
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, quality: 'hifi' }).map((item) => item.id),
    ).toEqual(['1', '2']);
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, quality: 'mp3_320' }).map((item) => item.id),
    ).toEqual(['2']);
  });

  it('filters by minimum duration', () => {
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, minDuration: 240 }).map((item) => item.id),
    ).toEqual(['2', '3']);
  });

  it('sorts by title, duration and quality', () => {
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, sort: 'title' }).map((item) => item.name),
    ).toEqual(['Alfa', 'Beta', 'Zeta']);
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, sort: 'duration' }).map((item) => item.id),
    ).toEqual(['3', '2', '1']);
    expect(
      filterAndSortTracks(tracks, { ...defaultFilters, sort: 'quality' }).map((item) => item.id),
    ).toEqual(['1', '2', '3']);
  });
});

describe('countActiveFilters', () => {
  it('counts each non-default filter once', () => {
    expect(countActiveFilters(defaultFilters)).toBe(0);
    expect(
      countActiveFilters({
        artist: 'a',
        album: '',
        quality: 'lossless',
        minDuration: 120,
        sort: 'title',
      }),
    ).toBe(4);
  });
});
