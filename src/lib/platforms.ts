import type { Platform } from '../types';

export const KNOWN_PLATFORMS: Platform[] = ['kuwo', 'wyy'];

export const PLATFORM_NAMES: Record<Platform, string> = {
  kuwo: 'Kuwo',
  wyy: 'NetEase',
};

export const PLATFORM_OVERLINES: Record<Platform, string> = {
  kuwo: 'KUWO',
  wyy: 'NETEASE',
};

export const PLATFORM_HAS_LYRICS: Record<Platform, boolean> = {
  kuwo: true,
  wyy: true,
};

export const PLATFORM_HAS_ALBUMS: Record<Platform, boolean> = {
  kuwo: true,
  wyy: true,
};

export function platformName(platform: Platform): string {
  return PLATFORM_NAMES[platform] ?? 'Catálogo';
}

export function platformOverline(platform: Platform): string {
  return PLATFORM_OVERLINES[platform] ?? platformName(platform).toUpperCase();
}

export function platformHasLyrics(platform: Platform): boolean {
  return PLATFORM_HAS_LYRICS[platform] ?? true;
}

export function platformHasAlbums(platform: Platform): boolean {
  return PLATFORM_HAS_ALBUMS[platform] ?? true;
}

export function isPlatform(value: string | null | undefined): value is Platform {
  return Boolean(value) && KNOWN_PLATFORMS.includes(value as Platform);
}
