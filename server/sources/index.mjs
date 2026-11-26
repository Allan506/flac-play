import { archiveAlbum, resolveArchive, searchArchive } from './archive.mjs';
import { jamendoAlbum, resolveJamendo, searchJamendo } from './jamendo.mjs';
import { resolveCommons, searchCommons } from './commons.mjs';

// Catálogos que el servidor resuelve por su cuenta, sin pasar por el upstream de Kuwo.
export const NATIVE_SOURCES = {
  archive: {
    name: 'Internet Archive',
    initial: 'A',
    search: searchArchive,
    resolve: resolveArchive,
    album: archiveAlbum,
    lyrics: false,
  },
  jamendo: {
    name: 'Jamendo',
    initial: 'J',
    search: searchJamendo,
    resolve: resolveJamendo,
    album: jamendoAlbum,
    lyrics: false,
  },
  commons: {
    name: 'Commons',
    initial: 'C',
    search: searchCommons,
    resolve: resolveCommons,
    album: null,
    lyrics: false,
  },
};

export const NATIVE_CATALOGS = Object.entries(NATIVE_SOURCES).map(([value, source]) => ({
  value,
  name: source.name,
  initial: source.initial,
  lyrics: source.lyrics,
  albums: Boolean(source.album),
}));

export function nativeSource(platform) {
  return Object.hasOwn(NATIVE_SOURCES, platform) ? NATIVE_SOURCES[platform] : null;
}

export function isNativeSource(platform) {
  return Object.hasOwn(NATIVE_SOURCES, platform);
}
