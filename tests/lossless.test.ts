import { describe, expect, it } from 'vitest';
import {
  isLosslessVerified,
  judgeSpectrum,
  spectrumCutoff,
  verdictLabel,
} from '../server/lossless.mjs';

const SAMPLE_RATE = 44100;

function tones(freqs: number[], seconds = 2): Float32Array {
  const total = SAMPLE_RATE * seconds;
  const muestras = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    let valor = 0;
    for (const freq of freqs) valor += Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) / freqs.length;
    muestras[i] = valor;
  }
  return muestras;
}

describe('spectrumCutoff', () => {
  it('detecta el techo real de una señal de banda completa', () => {
    expect(spectrumCutoff(tones([1000, 21000]), SAMPLE_RATE)).toBeGreaterThan(20_500);
  });

  it('detecta un corte tipo MP3 128', () => {
    const corte = spectrumCutoff(tones([1000, 16000]), SAMPLE_RATE);
    expect(corte).toBeGreaterThan(15_500);
    expect(corte).toBeLessThan(16_500);
  });

  it('devuelve 0 sin muestras suficientes', () => {
    expect(spectrumCutoff(new Float32Array(100), SAMPLE_RATE)).toBe(0);
  });
});

describe('judgeSpectrum', () => {
  it('marca pérdida cuando el corte no llega al límite', () => {
    expect(judgeSpectrum({ codec: 'flac', sampleRate: 44100, cutoffHz: 16000 }).verdict).toBe('transcoded');
  });

  it('marca duda con un corte alto', () => {
    expect(judgeSpectrum({ codec: 'flac', sampleRate: 44100, cutoffHz: 20000 }).verdict).toBe('high-cut');
  });

  it('marca verificado con espectro completo', () => {
    expect(judgeSpectrum({ codec: 'flac', sampleRate: 44100, cutoffHz: 22000 }).verdict).toBe('lossless');
  });

  it('rechaza lo que no es FLAC', () => {
    expect(judgeSpectrum({ codec: 'mp3', sampleRate: 44100, cutoffHz: 20000 }).verdict).toBe('not-flac');
  });
});

describe('isLosslessVerified', () => {
  it('solo acepta veredicto verificado e integridad correcta', () => {
    expect(isLosslessVerified({ verdict: 'lossless', integrityOk: true } as never)).toBe(true);
    expect(isLosslessVerified({ verdict: 'lossless', integrityOk: false } as never)).toBe(false);
    expect(isLosslessVerified({ verdict: 'high-cut', integrityOk: true } as never)).toBe(false);
    expect(isLosslessVerified(null)).toBe(false);
  });
});

describe('verdictLabel', () => {
  it('explica el veredicto en español', () => {
    expect(verdictLabel('transcoded')).toContain('pérdida');
    expect(verdictLabel('lossless')).toContain('espectro completo');
  });
});
