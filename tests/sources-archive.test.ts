import { describe, expect, it } from 'vitest';
import {
  archiveAudioUrl,
  archiveCoverUrl,
  archiveTrackId,
  flacFiles,
  mapArchiveTrack,
  parseArchiveTrackId,
} from '../server/sources/archive.mjs';

const item = {
  metadata: {
    title: 'The Kavalactones Live at Sovereign Kava',
    creator: 'The Kavalactones',
    date: '2019-05-04',
    description: 'Grabación en vivo',
  },
  files: [
    { name: 'set1_track1.flac', format: 'Flac', source: 'original', size: '217006729', length: '1832.42', title: 'Track One' },
    { name: 'set1_track1.afpk', format: 'Apple Lossless Audio', source: 'derivative', size: '5000' },
    { name: 'set1_track2.flac', format: 'Flac', source: 'original', size: '89927511', length: '7:05' },
    { name: 'notas.txt', format: 'Text', source: 'original', size: '120' },
    { name: 'privado.flac', format: 'Flac', source: 'original', private: true, size: '100' },
  ],
};

describe('archive identifiers', () => {
  it('compone y separa el identificador de una pista', () => {
    const id = archiveTrackId('KL2019-05-04', 'set1_track1.flac');
    expect(id).toBe('KL2019-05-04/set1_track1.flac');
    expect(parseArchiveTrackId(id)).toEqual({
      identifier: 'KL2019-05-04',
      file: 'set1_track1.flac',
    });
  });

  it('rechaza identificadores sin elemento o sin archivo', () => {
    expect(parseArchiveTrackId('sin-barra')).toBeNull();
    expect(parseArchiveTrackId('/archivo.flac')).toBeNull();
    expect(parseArchiveTrackId('item/')).toBeNull();
  });

  it('codifica la ruta de descarga y la portada', () => {
    expect(archiveAudioUrl('gd1977-12-31', 'disco 1/pista 1.flac')).toBe(
      'https://archive.org/download/gd1977-12-31/disco%201/pista%201.flac',
    );
    expect(archiveCoverUrl('gd1977-12-31')).toBe(
      'https://archive.org/services/img/gd1977-12-31',
    );
  });
});

describe('flacFiles', () => {
  it('solo deja los FLAC originales publicados', () => {
    expect(flacFiles(item).map((file) => file.name)).toEqual([
      'set1_track1.flac',
      'set1_track2.flac',
    ]);
  });

  it('tolera elementos sin lista de archivos', () => {
    expect(flacFiles(null)).toEqual([]);
    expect(flacFiles({})).toEqual([]);
  });
});

describe('mapArchiveTrack', () => {
  const [first, second] = flacFiles(item);

  it('describe la pista con los campos que espera la interfaz', () => {
    const track = mapArchiveTrack({ identifier: 'KL2019-05-04', item, file: first });
    expect(track.id).toBe('KL2019-05-04/set1_track1.flac');
    expect(track.name).toBe('Track One');
    expect(track.artist).toBe('The Kavalactones');
    expect(track.album_id).toBe('KL2019-05-04');
    expect(track.duration).toBe(1832);
    expect(track.time).toBe(1832);
    expect(track.minfo).toEqual([{ level: 'lossless', format: 'flac', bitrate: '948' }]);
    expect(track.link).toBe('https://archive.org/details/KL2019-05-04');
    expect(track.hasSQ).toBe(true);
  });

  it('acepta duraciones en formato minutos:segundos', () => {
    const track = mapArchiveTrack({ identifier: 'KL2019-05-04', item, file: second });
    expect(track.duration).toBe(425);
    expect(track.name).toBe('set1 track2');
  });

  it('usa valores por defecto cuando faltan metadatos', () => {
    const track = mapArchiveTrack({
      identifier: 'solo-flac',
      item: { metadata: {} },
      file: { name: 'audio.flac', size: '0' },
    });
    expect(track.artist).toBe('Internet Archive');
    expect(track.album_name).toBe('solo-flac');
    expect(track.duration).toBe(0);
    expect(track.minfo[0].bitrate).toBe('1000');
  });
});
