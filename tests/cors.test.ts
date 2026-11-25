import { describe, expect, it } from 'vitest';
import { corsHeaders, parseCorsOrigins } from '../server/cors.mjs';

describe('parseCorsOrigins', () => {
  it('separa por comas y quita barras finales', () => {
    expect(parseCorsOrigins('https://a.dev/, https://b.dev')).toEqual([
      'https://a.dev',
      'https://b.dev',
    ]);
  });

  it('devuelve una lista vacía cuando no hay configuración', () => {
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins(undefined)).toEqual([]);
  });
});

const headersFor = (origin: string, allowed: string[] = []): Record<string, string> =>
  corsHeaders(origin, allowed) ?? {};

describe('corsHeaders', () => {
  it('permite cualquier origen por defecto', () => {
    expect(headersFor('https://allan506.github.io')['Access-Control-Allow-Origin']).toBe('*');
  });

  it('refleja el origen cuando está en la lista', () => {
    const headers = headersFor('https://allan506.github.io', ['https://allan506.github.io']);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://allan506.github.io');
  });

  it('ignora un origen no autorizado', () => {
    expect(corsHeaders('https://ejemplo.dev', ['https://allan506.github.io'])).toBeNull();
  });

  it('no responde sin cabecera Origin', () => {
    expect(corsHeaders(undefined, [])).toBeNull();
  });

  it('expone las cabeceras de verificación y el nombre del archivo', () => {
    const exposed = headersFor('https://allan506.github.io')['Access-Control-Expose-Headers'];
    expect(exposed).toContain('Content-Disposition');
    expect(exposed).toContain('X-FLACPlay-Lossless-Verdict');
    expect(exposed).toContain('X-FLACPlay-Cover-Resolution');
  });

  it('permite el preflight con content-type', () => {
    const headers = headersFor('https://allan506.github.io');
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
  });
});
