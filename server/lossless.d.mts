export interface LosslessAnalysis {
  codec: string;
  sampleRate: number;
  channels: number;
  bits: number;
  duration: number;
  bitRate: number;
  container: string | null;
  cutoffHz: number;
  limitHz: number;
  ratio: number;
  verdict: 'lossless' | 'high-cut' | 'transcoded' | 'not-flac' | 'unknown';
  label: string;
  integrityOk: boolean | null;
  error?: string;
}

export function spectrumCutoff(samples: Float32Array, sampleRate: number): number;

export function judgeSpectrum(input: {
  codec: string;
  sampleRate: number;
  cutoffHz: number;
}): { verdict: LosslessAnalysis['verdict']; ratio: number; limitHz: number };

export function verdictLabel(verdict: string): string;

export const VERDICT_LABELS: Record<string, string>;

export function analyzeFile(
  file: string,
  options?: { deep?: boolean; headerBytes?: Uint8Array | null },
): Promise<LosslessAnalysis>;

export function analyzeRemote(
  url: string,
  options?: { maxBytes?: number },
): Promise<LosslessAnalysis | null>;

export function isLosslessVerified(analysis: LosslessAnalysis | null | undefined): boolean;
