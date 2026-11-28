import { describe, expect, it } from 'vitest';
import {
  normalizeRescueTitle,
  rankTwinCandidates,
  rescueKeyword,
  twinPlatform,
} from '../server/rescue.mjs';

const pista = (extra: Record<string, unknown> = {}) => ({
  id: '1',
  name: 'Hello',
  artist: 'Adele',
  duration: 295,
  minfo: [{ format: 'flac', bitrate: '2000' }],
  ...extra,
});

describe('catálogo gemelo', () => {
  it('empareja Kuwo con NetEase y viceversa', () => {
    expect(twinPlatform('kuwo')).toBe('wyy');
    expect(twinPlatform('wyy')).toBe('kuwo');
    expect(twinPlatform('otro')).toBeNull();
  });

  it('construye una búsqueda con artista y título', () => {
    expect(rescueKeyword({ artist: 'Adele', name: 'Hello' })).toBe('Adele Hello');
    expect(rescueKeyword({ artist: '', name: 'Hello' })).toBe('Hello');
    expect(rescueKeyword({ artist: 'Adele', name: '  ' })).toBe('Adele');
  });

  it('normaliza títulos sin perder caracteres chinos', () => {
    expect(normalizeRescueTitle('Hello (Live)')).toBe('hello');
    expect(normalizeRescueTitle('黃昏 [Remastered]')).toBe('黃昏');
  });
});

describe('rankTwinCandidates', () => {
  it('descarta copias sin FLAC, con otro título o con otra duración', () => {
    const lista = [
      pista({ id: 'ok', duration: 296 }),
      pista({ id: 'sin-flac', minfo: [{ format: 'mp3', bitrate: '320' }] }),
      pista({ id: 'otro-titulo', name: 'Someone Like You' }),
      pista({ id: 'otra-duracion', duration: 420 }),
    ];
    expect(rankTwinCandidates({ name: 'Hello' }, lista, { expectedDuration: 295 }).map((t) => t.id)).toEqual([
      'ok',
    ]);
  });

  it('ordena por cercanía de duración y limita los intentos', () => {
    const lista = [
      pista({ id: 'lejos', duration: 300 }),
      pista({ id: 'exacta', duration: 295 }),
      pista({ id: 'cerca', duration: 296 }),
    ];
    const orden = rankTwinCandidates({ name: 'Hello' }, lista, { expectedDuration: 295, limit: 2 });
    expect(orden.map((t) => t.id)).toEqual(['exacta', 'cerca']);
  });

  it('acepta variantes con el título contenido (remaster, live)', () => {
    const lista = [pista({ id: 'variante', name: 'Hello - Remastered 2015' })];
    expect(rankTwinCandidates({ name: 'Hello' }, lista, { expectedDuration: 295 })).toHaveLength(1);
  });

  it('descarta karaokes y homenajes aunque el título coincida', () => {
    const lista = [
      pista({ id: 'karaoke', name: 'Hello(Karaoke tribute version originally performed by Adele)' }),
      pista({ id: 'real', duration: 295 }),
    ];
    expect(rankTwinCandidates({ name: 'Hello' }, lista, { expectedDuration: 295 }).map((t) => t.id)).toEqual([
      'real',
    ]);
  });

  it('prefiere la coincidencia exacta de título antes que una variante', () => {
    const lista = [
      pista({ id: 'variante', name: 'Hello - Remastered 2015', duration: 295 }),
      pista({ id: 'exacta', name: 'Hello', duration: 295 }),
    ];
    expect(rankTwinCandidates({ name: 'Hello' }, lista, { expectedDuration: 295 }).map((t) => t.id)).toEqual([
      'exacta',
      'variante',
    ]);
  });

  it('no propone la misma pista que se está comprobando', () => {
    const lista = [pista({ id: '7' }), pista({ id: '8', duration: 294 })];
    expect(
      rankTwinCandidates({ name: 'Hello' }, lista, { expectedDuration: 295, excludeId: '7' }).map((t) => t.id),
    ).toEqual(['8']);
  });

  it('no devuelve nada sin título de referencia o sin lista', () => {
    expect(rankTwinCandidates({ name: '' }, [pista()], { expectedDuration: 295 })).toEqual([]);
    expect(rankTwinCandidates({ name: 'Hello' }, undefined as never)).toEqual([]);
  });
});
