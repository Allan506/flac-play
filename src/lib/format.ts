import type { Platform, Quality, Track } from '../types';

export function formatDuration(seconds: number | string): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '—:—';
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function formatBitrate(quality: Quality): string {
  if (quality.format === 'flac') return 'sin pérdida';
  return `${quality.bitrate} kb/s`;
}

export function formatQuality(quality: Quality): string {
  return `${quality.format.toUpperCase()} · ${formatBitrate(quality)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function qualityRank(quality: Quality): number {
  const bitrate = Number(quality.bitrate) || 0;
  return quality.format === 'flac' ? 100_000 + bitrate : bitrate;
}

export function bestQuality(track: Track): Quality | null {
  if (!track.minfo.length) return null;
  return [...track.minfo].sort((a, b) => qualityRank(b) - qualityRank(a))[0] ?? null;
}

export function hasLossless(track: Track): boolean {
  return track.minfo.some((quality) => quality.format === 'flac');
}

export function isHighFidelity(quality: Quality): boolean {
  return quality.format === 'flac' || (quality.format === 'mp3' && Number(quality.bitrate) >= 320);
}

export function platformName(platform: Platform): string {
  return platform === 'kuwo' ? 'Kuwo' : 'NetEase';
}

export function platformInitial(platform: Platform): string {
  return platform === 'kuwo' ? 'K' : 'W';
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const SOURCE_TRACK_URL: Record<Platform, (track: Track) => string> = {
  kuwo: (track) => `https://www.kuwo.cn/play_detail/${encodeURIComponent(track.id)}`,
  wyy: (track) => `https://music.163.com/#/song?id=${encodeURIComponent(track.id)}`,
};

const SOURCE_ALBUM_URL: Record<Platform, (albumId: string) => string> = {
  kuwo: (albumId) => `https://www.kuwo.cn/album_detail/${encodeURIComponent(albumId)}/`,
  wyy: (albumId) => `https://music.163.com/#/album?id=${encodeURIComponent(albumId)}`,
};

export function sourceTrackUrl(platform: Platform, track: Track): string {
  if (track.link) return track.link;
  return (SOURCE_TRACK_URL[platform] ?? SOURCE_TRACK_URL.kuwo)(track);
}

export function sourceAlbumUrl(platform: Platform, albumId: string): string {
  return (SOURCE_ALBUM_URL[platform] ?? SOURCE_ALBUM_URL.kuwo)(albumId);
}

export function safeFilename(value: string, fallback = 'flacplay-audio'): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}
