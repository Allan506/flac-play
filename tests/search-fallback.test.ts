import { describe, expect, it } from 'vitest';
import { fallbackKeywords } from '../server/upstream.mjs';

describe('fallbackKeywords', () => {
  it('propone las palabras de una consulta de artista y canción, de la más larga a la más corta', () => {
    expect(fallbackKeywords('jay chou')).toEqual(['chou', 'jay']);
    expect(fallbackKeywords('周杰伦 晴天')).toEqual(['周杰伦', '晴天']);
  });

  it('descarta palabras de una letra y duplicados', () => {
    expect(fallbackKeywords('Daft Punk a')).toEqual(['Daft', 'Punk']);
    expect(fallbackKeywords('lucky lucky')).toEqual(['lucky']);
  });

  it('no propone nada si la consulta ya es una sola palabra', () => {
    expect(fallbackKeywords('晴天')).toEqual([]);
    expect(fallbackKeywords('  ')).toEqual([]);
  });
});
