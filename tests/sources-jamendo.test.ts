import { describe, expect, it } from 'vitest';
import { jamendoAudioUrl, jamendoTrackIdFromUrl, mapJamendoTrack } from '../server/sources/jamendo.mjs';

// Respuesta real de Openverse (búsqueda sin clave de API).
const openverseTrack = {
  id: '1a799f3d-527d-47f8-b222-33d4c619f94c',
  title: 'Jingle Jazz',
  creator: 'Quantum Jazz',
  duration: 538000,
  thumbnail: 'https://api.openverse.org/v1/images/1a799f3d/thumb/',
  url: 'https://prod-1.storage.jamendo.com/?trackid=355482&format=mp32',
  foreign_landing_url: 'https://jamendo.com/track/355482',
};

// Respuesta real de la API oficial de Jamendo (con client_id).
const officialTrack = {
  id: '355482',
  name: 'Jingle Jazz',
  artist_name: 'Quantum Jazz',
  artist_id: '365631',
  album_name: 'Jazz Collection',
  album_id: '119785',
  duration: 538,
  image: 'https://usercontent.jamendo.com/?type=album&id=119785&width=300',
  shareurl: 'https://www.jamendo.com/track/355482',
};

describe('jamendoTrackIdFromUrl', () => {
  it('extrae el trackid numérico de la URL de almacenamiento', () => {
    expect(jamendoTrackIdFromUrl('https://prod-1.storage.jamendo.com/?trackid=355482&format=mp32')).toBe('355482');
    expect(jamendoTrackIdFromUrl('https://prod-1.storage.jamendo.com/?format=flac&trackid=9')).toBe('9');
    expect(jamendoTrackIdFromUrl('https://prod-1.storage.jamendo.com/?format=flac')).toBe('');
    expect(jamendoTrackIdFromUrl(null)).toBe('');
  });
});

describe('jamendoAudioUrl', () => {
  it('pide FLAC salvo que se solicite MP3', () => {
    expect(jamendoAudioUrl('355482', 'flac')).toBe(
      'https://prod-1.storage.jamendo.com/?trackid=355482&format=flac',
    );
    expect(jamendoAudioUrl('355482', 'mp3')).toBe(
      'https://prod-1.storage.jamendo.com/?trackid=355482&format=mp32',
    );
  });
});

describe('mapJamendoTrack', () => {
  it('usa el trackid de la URL cuando llega desde Openverse', () => {
    const track = mapJamendoTrack(openverseTrack, { durationInMs: true });
    expect(track).not.toBeNull();
    expect(track!.id).toBe('355482');
    expect(track!.name).toBe('Jingle Jazz');
    expect(track!.artist).toBe('Quantum Jazz');
    expect(track!.duration).toBe(538);
    expect(track!.time).toBe(538);
    expect(track!.album_id).toBe('');
    expect(track!.minfo.map((item) => item.format)).toEqual(['flac', 'mp3']);
    expect(track!.pic_url).toBe(openverseTrack.thumbnail);
  });

  it('lee la duración en segundos desde la API oficial', () => {
    const track = mapJamendoTrack(officialTrack);
    expect(track).not.toBeNull();
    expect(track!.id).toBe('355482');
    expect(track!.duration).toBe(538);
    expect(track!.album_id).toBe('119785');
    expect(track!.album_name).toBe('Jazz Collection');
    expect(track!.link).toBe('https://www.jamendo.com/track/355482');
  });

  it('descarta pistas sin identificador', () => {
    expect(mapJamendoTrack({ title: 'sin id' })).toBeNull();
    expect(mapJamendoTrack(null)).toBeNull();
  });
});
