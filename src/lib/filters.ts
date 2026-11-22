import type { FilterState, Quality, Track } from '../types';
import { normalizeText, qualityRank } from './format';

export const defaultFilters: FilterState = {
  artist: '',
  album: '',
  quality: 'any',
  minDuration: 0,
  sort: 'catalog',
};

export function matchesQuality(qualities: Quality[], filter: FilterState['quality']): boolean {
  if (filter === 'any') return true;
  if (filter === 'lossless') return qualities.some((quality) => quality.format === 'flac');
  if (filter === 'hifi') {
    return qualities.some(
      (quality) => quality.format === 'flac' || (quality.format === 'mp3' && Number(quality.bitrate) >= 320),
    );
  }
  return qualities.some((quality) => quality.format === 'mp3' && Number(quality.bitrate) >= 320);
}

export function filterAndSortTracks(tracks: Track[], filters: FilterState): Track[] {
  const artist = normalizeText(filters.artist);
  const album = normalizeText(filters.album);

  const filtered = tracks.filter((track) => {
    if (artist && !normalizeText(track.artist).includes(artist)) return false;
    if (album && !normalizeText(track.album_name).includes(album)) return false;
    if (!matchesQuality(track.minfo, filters.quality)) return false;
    if (filters.minDuration > 0 && track.duration < filters.minDuration) return false;
    return true;
  });

  if (filters.sort === 'catalog') return filtered;

  return [...filtered].sort((a, b) => {
    if (filters.sort === 'title') {
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    }
    if (filters.sort === 'duration') {
      return b.duration - a.duration;
    }
    const bestA = a.minfo.reduce((max, quality) => Math.max(max, qualityRank(quality)), 0);
    const bestB = b.minfo.reduce((max, quality) => Math.max(max, qualityRank(quality)), 0);
    return bestB - bestA;
  });
}

export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.artist.trim()) count += 1;
  if (filters.album.trim()) count += 1;
  if (filters.quality !== 'any') count += 1;
  if (filters.minDuration > 0) count += 1;
  if (filters.sort !== 'catalog') count += 1;
  return count;
}
