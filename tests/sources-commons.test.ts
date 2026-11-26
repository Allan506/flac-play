import { describe, expect, it } from 'vitest';
import { commonsPageUrl, mapCommonsTrack } from '../server/sources/commons.mjs';
import { NATIVE_CATALOGS, isNativeSource, nativeSource } from '../server/sources/index.mjs';

const flacPage = {
  title: 'File:Lysenko Piano Sonata F minor 1.flac',
  imageinfo: [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/85/Lysenko-Piano-Sonata-F-minor-1.flac',
      mime: 'audio/x-flac',
      size: 55387119,
      duration: 549.31,
      extmetadata: {
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Pitman">Paul Pitman</a>' },
        Categories: { value: 'Audio files of classical music|Piano sonatas' },
      },
    },
  ],
};

const oggPage = {
  title: "File:It's a jazz thing.ogg",
  imageinfo: [{ url: 'https://upload.wikimedia.org/x.ogg', mime: 'application/ogg', duration: 30 }],
};

describe('mapCommonsTrack', () => {
  it('acepta solo archivos FLAC y limpia el título', () => {
    const track = mapCommonsTrack(flacPage);
    expect(track).not.toBeNull();
    expect(track!.id).toBe('File:Lysenko Piano Sonata F minor 1.flac');
    expect(track!.name).toBe('Lysenko Piano Sonata F minor 1');
    expect(track!.artist).toBe('Paul Pitman');
    expect(track!.duration).toBe(549);
    expect(track!.time).toBe(549);
    expect(track!.album_id).toBe('');
    expect(track!.minfo).toEqual([{ level: 'lossless', format: 'flac', bitrate: '1000' }]);
    expect(track!.link).toBe(
      'https://commons.wikimedia.org/wiki/File:Lysenko_Piano_Sonata_F_minor_1.flac',
    );
  });

  it('descarta formatos con pérdida', () => {
    expect(mapCommonsTrack(oggPage)).toBeNull();
    expect(mapCommonsTrack({ title: 'File:x.flac' })).toBeNull();
  });

  it('codifica el enlace a la ficha del archivo', () => {
    expect(commonsPageUrl('File:Café del mar.flac')).toBe(
      'https://commons.wikimedia.org/wiki/File:Caf%C3%A9_del_mar.flac',
    );
  });
});

describe('registro de catálogos nativos', () => {
  it('expone los tres catálogos abiertos', () => {
    expect(NATIVE_CATALOGS.map((catalog) => catalog.value)).toEqual([
      'archive',
      'jamendo',
      'commons',
    ]);
    expect(NATIVE_CATALOGS.every((catalog) => catalog.name && catalog.initial)).toBe(true);
  });

  it('distingue catálogos nativos del upstream', () => {
    expect(isNativeSource('archive')).toBe(true);
    expect(isNativeSource('jamendo')).toBe(true);
    expect(isNativeSource('commons')).toBe(true);
    expect(isNativeSource('kuwo')).toBe(false);
    expect(isNativeSource('wyy')).toBe(false);
    expect(isNativeSource('toString')).toBe(false);
    expect(nativeSource('kuwo')).toBeNull();
  });

  it('Commons no publica álbumes ni letras', () => {
    expect(nativeSource('commons')?.album).toBeNull();
    expect(nativeSource('commons')?.lyrics).toBe(false);
    expect(nativeSource('archive')?.lyrics).toBe(false);
  });
});
