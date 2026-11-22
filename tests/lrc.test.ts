import { describe, expect, it } from 'vitest';
import { findActiveLine, lyricsToPlainText, parseLrc } from '../src/lib/lrc';

const LRC = `[ti:Canción de prueba]
[ar:Artista]
[al:Álbum]
[offset:0]
[00:00.00]Primera línea
[00:12.50]Segunda línea
[00:25.00]Tercera línea`;

describe('parseLrc', () => {
  it('extracts metadata and timed lines', () => {
    const parsed = parseLrc(LRC);
    expect(parsed.meta.ti).toBe('Canción de prueba');
    expect(parsed.meta.ar).toBe('Artista');
    expect(parsed.synced).toBe(true);
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[1]).toEqual({ time: 12.5, text: 'Segunda línea' });
  });

  it('supports multiple timestamps on one line', () => {
    const parsed = parseLrc('[00:01.00][00:05.00]Coro');
    expect(parsed.lines).toEqual([
      { time: 1, text: 'Coro' },
      { time: 5, text: 'Coro' },
    ]);
  });

  it('handles offset and unsynced text', () => {
    const parsed = parseLrc('[offset:500]\n[00:10.00]Hola\nTexto sin tiempo');
    expect(parsed.lines[0].time).toBe(9.5);
    expect(parsed.lines[1]).toEqual({ time: -1, text: 'Texto sin tiempo' });
  });

  it('handles empty and malformed input', () => {
    expect(parseLrc('')).toEqual({ meta: {}, lines: [], synced: false });
    expect(parseLrc('solo texto')).toEqual({
      meta: {},
      lines: [{ time: -1, text: 'solo texto' }],
      synced: false,
    });
  });
});

describe('findActiveLine', () => {
  const parsed = parseLrc(LRC);

  it('finds the line that should be highlighted', () => {
    expect(findActiveLine(parsed.lines, 0)).toBe(0);
    expect(findActiveLine(parsed.lines, 12.6)).toBe(1);
    expect(findActiveLine(parsed.lines, 25)).toBe(2);
    expect(findActiveLine(parsed.lines, 99)).toBe(2);
  });

  it('returns -1 before the first line', () => {
    expect(findActiveLine(parseLrc('[00:05.00]Tarde').lines, 1)).toBe(-1);
  });
});

describe('lyricsToPlainText', () => {
  it('drops empty lines', () => {
    const parsed = parseLrc('[00:01.00]Uno\n[00:02.00]\n[00:03.00]Tres');
    expect(lyricsToPlainText(parsed)).toBe('Uno\nTres');
  });
});
