import { describe, expect, it } from 'vitest';
import { detectFormat, eapiParams, levelChain, mapNeteaseSong } from '../server/netease.mjs';
import { chooseQuality, pickKuwoMatch } from '../server/upstream.mjs';

describe('eapiParams', () => {
  it('firma el payload con AES-ECB y devuelve hex en mayúsculas', () => {
    const firma = eapiParams('/api/cloudsearch/pc', { s: 'adele', type: 1 });
    expect(firma).toMatch(/^[0-9A-F]+$/);
    expect(firma.length % 32).toBe(0);
  });

  it('cambia la firma cuando cambia el payload', () => {
    const uno = eapiParams('/api/cloudsearch/pc', { s: 'adele' });
    const otro = eapiParams('/api/cloudsearch/pc', { s: 'coldplay' });
    expect(uno).not.toBe(otro);
  });
});

describe('mapNeteaseSong', () => {
  const cancion = {
    id: 17177324,
    name: 'Yellow',
    dt: 266773,
    ar: [{ id: 111, name: 'Coldplay' }],
    al: { id: 1582613, name: 'Yellow', picUrl: 'http://p4.music.126.net/x.jpg' },
    privilege: { maxbr: 999000 },
  };

  it('traduce la canción al modelo de la app', () => {
    const pista = mapNeteaseSong(cancion);
    if (!pista) throw new Error('la pista no se pudo mapear');
    expect(pista.id).toBe('17177324');
    expect(pista.artist).toBe('Coldplay');
    expect(pista.album_name).toBe('Yellow');
    expect(pista.duration).toBe(267);
    expect(pista.pic_url.startsWith('https://')).toBe(true);
    expect(pista.minfo.map((c) => c.format)).toEqual(['flac', 'mp3', 'mp3']);
  });

  it('ofrece FLAC aunque no haya sesión, porque el resolvedor busca la gemela en Kuwo', () => {
    const pista = mapNeteaseSong(cancion);
    expect(pista?.minfo.map((c) => c.format)).toEqual(['flac', 'mp3', 'mp3']);
    expect(pista?.hasSQ).toBe(true);
  });

  it('no ofrece FLAC cuando el catálogo solo tiene MP3', () => {
    const pista = mapNeteaseSong({ ...cancion, privilege: { maxbr: 320000 } });
    expect(pista?.minfo.map((c) => c.format)).toEqual(['mp3', 'mp3']);
    expect(pista?.hasSQ).toBe(false);
  });

  it('descarta entradas sin identificador', () => {
    expect(mapNeteaseSong({ name: 'sin id' })).toBeNull();
  });
});

describe('levelChain', () => {
  it('pide Hi-Res y luego lossless para FLAC', () => {
    expect(levelChain('flac', '2000')).toEqual(['hires', 'lossless']);
  });

  it('pide exhigh y cae a standard para MP3 320', () => {
    expect(levelChain('mp3', '320')).toEqual(['exhigh', 'standard']);
    expect(levelChain('mp3', '128')).toEqual(['standard']);
  });
});

describe('detectFormat', () => {
  it('usa el tipo que declara NetEase', () => {
    expect(detectFormat({ type: 'flac', url: 'https://x/y' }, 'mp3')).toBe('flac');
    expect(detectFormat({ type: 'mp3', url: 'https://x/y' }, 'flac')).toBe('mp3');
  });

  it('cae a la extensión de la URL cuando no hay tipo', () => {
    expect(detectFormat({ url: 'https://m8.music.126.net/a.flac' }, 'mp3')).toBe('flac');
    expect(detectFormat({ url: 'https://m8.music.126.net/a.mp3' }, 'flac')).toBe('mp3');
  });

  it('mantiene el formato pedido si no hay ninguna pista', () => {
    expect(detectFormat({}, 'flac')).toBe('flac');
  });
});

describe('pickKuwoMatch', () => {
  const meta = { name: 'Yellow', artist: 'Coldplay', duration: 267 };
  const candidatos = [
    { id: '1', name: 'Yellow (Live)', duration: 400 },
    { id: '2', name: 'Yellow', duration: 320 },
    { id: '3', name: 'Yellow', duration: 268 },
  ];

  it('prefiere el título idéntico con duración parecida', () => {
    expect(pickKuwoMatch(meta, candidatos)?.id).toBe('3');
  });

  it('devuelve null cuando no hay nada razonable', () => {
    expect(pickKuwoMatch(meta, [{ id: '9', name: 'Paradise', duration: 268 }])).toBeNull();
  });

  it('en modo verificado solo acepta gemelas con FLAC', () => {
    const conMinfo = [
      { id: '3', name: 'Yellow', duration: 268, minfo: [{ format: 'mp3', bitrate: '320' }] },
      {
        id: '4',
        name: 'Yellow',
        duration: 268,
        minfo: [{ format: 'flac', bitrate: '2000' }],
      },
    ];
    expect(pickKuwoMatch(meta, conMinfo, { requireLossless: true })?.id).toBe('4');
    expect(pickKuwoMatch(meta, [conMinfo[0]], { requireLossless: true })).toBeNull();
    expect(pickKuwoMatch(meta, [conMinfo[0]], { requireLossless: false })?.id).toBe('3');
  });
});

describe('chooseQuality', () => {
  const minfo = [
    { format: 'mp3', bitrate: '320', level: 'p', size: '' },
    { format: 'mp3', bitrate: '128', level: 'h', size: '' },
  ];

  it('baja a la mejor calidad disponible cuando no hay FLAC', () => {
    expect(chooseQuality(minfo, 'flac', '2000')).toEqual({ format: 'mp3', bitrate: '320' });
  });

  it('respeta la calidad pedida si está disponible', () => {
    expect(chooseQuality(minfo, 'mp3', '128')).toEqual({ format: 'mp3', bitrate: '128' });
  });
});
