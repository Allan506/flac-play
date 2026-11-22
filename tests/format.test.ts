import { describe, expect, it } from 'vitest';
import {
  bestQuality,
  formatBitrate,
  formatBytes,
  formatDuration,
  formatQuality,
  hasLossless,
  platformInitial,
  platformName,
  qualityRank,
  safeFilename,
} from '../src/lib/format';
import type { Quality, Track } from '../src/types';

const flac: Quality = { level: 'ff', bitrate: '2000', format: 'flac', size: '35 MB' };
const mp3High: Quality = { level: 'p', bitrate: '320', format: 'mp3', size: '6 MB' };
const mp3Low: Quality = { level: 'h', bitrate: '128', format: 'mp3', size: '2 MB' };

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: '1',
    name: 'Canción',
    artist: 'Artista',
    artist_id: '',
    album_name: 'Álbum',
    album_id: '2',
    pic_url: '',
    duration: 200,
    minfo: [mp3Low, flac, mp3High],
    link: '',
    time: 0,
    sign: '',
    hasHQ: true,
    hasSQ: true,
    ...overrides,
  };
}

describe('formatDuration', () => {
  it('formats seconds as minutes and seconds', () => {
    expect(formatDuration(0)).toBe('—:—');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('handles numeric strings and invalid values', () => {
    expect(formatDuration('171')).toBe('2:51');
    expect(formatDuration('nope')).toBe('—:—');
    expect(formatDuration(-4)).toBe('—:—');
  });
});

describe('quality helpers', () => {
  it('ranks FLAC above high-bitrate MP3', () => {
    expect(qualityRank(flac)).toBeGreaterThan(qualityRank(mp3High));
    expect(qualityRank(mp3High)).toBeGreaterThan(qualityRank(mp3Low));
  });

  it('selects the best quality without mutating the source', () => {
    const source = track();
    const best = bestQuality(source);
    expect(best).toEqual(flac);
    expect(source.minfo[0]).toEqual(mp3Low);
  });

  it('formats lossless and compressed qualities', () => {
    expect(formatBitrate(flac)).toBe('sin pérdida');
    expect(formatQuality(flac)).toBe('FLAC · sin pérdida');
    expect(formatQuality(mp3High)).toBe('MP3 · 320 kb/s');
  });

  it('detects lossless tracks', () => {
    expect(hasLossless(track())).toBe(true);
    expect(hasLossless(track({ minfo: [mp3High] }))).toBe(false);
  });
});

describe('misc formatting', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(34.9 * 1024 * 1024)).toBe('35 MB');
  });

  it('maps platform labels', () => {
    expect(platformName('kuwo')).toBe('Kuwo');
    expect(platformName('wyy')).toBe('NetEase');
    expect(platformInitial('kuwo')).toBe('K');
    expect(platformInitial('wyy')).toBe('W');
  });

  it('sanitizes filenames for every common platform', () => {
    expect(safeFilename('AC/DC: Back in Black?')).toBe('AC DC Back in Black');
    expect(safeFilename('   ')).toBe('flacplay-audio');
    expect(safeFilename('周杰伦 - 晴天')).toBe('周杰伦 - 晴天');
  });
});
