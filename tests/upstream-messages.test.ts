import { describe, expect, it } from 'vitest';
import { upstreamAppErrorMessage } from '../server/upstream.mjs';

describe('upstreamAppErrorMessage', () => {
  it('avisa en español cuando NetEase falla en la búsqueda', () => {
    const mensaje = upstreamAppErrorMessage('/api/search', { platform: 'wyy' });
    expect(mensaje).toContain('NetEase');
    expect(mensaje).toContain('Kuwo');
    expect(mensaje).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('no filtra el mensaje original del catálogo', () => {
    expect(upstreamAppErrorMessage('/api/search', { platform: 'kuwo' })).not.toMatch(
      /接口请求失败/,
    );
  });

  it('da un mensaje propio por tipo de recurso', () => {
    expect(upstreamAppErrorMessage('/api/resolve', {})).toMatch(/audio/);
    expect(upstreamAppErrorMessage('/api/lyrics', {})).toMatch(/letra/);
    expect(upstreamAppErrorMessage('/api/album', {})).toMatch(/álbum/);
  });
});
