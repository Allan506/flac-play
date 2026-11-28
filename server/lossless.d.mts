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
  bitexact?: boolean | null;
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
  options?: { deep?: boolean; headerBytes?: Uint8Array | null; prefixRatio?: number | null },
): Promise<LosslessAnalysis>;

export function analyzeRemote(
  url: string,
  options?: { maxBytes?: number },
): Promise<LosslessAnalysis | null>;

export function audioDigest(file: string): Promise<string | null>;

export function verifyFlacIntegrity(file: string): Promise<boolean>;

export function isLosslessVerified(analysis: LosslessAnalysis | null | undefined): boolean;

export interface FlacDeliveryDecision {
  deliverable: boolean;
  code:
    | 'LOSSLESS_NOT_VERIFIED'
    | 'LOSSLESS_INTEGRITY_FAILED'
    | 'LOSSLESS_AUDIO_CHANGED'
    | null;
  message: string;
  details: {
    verdict: LosslessAnalysis['verdict'];
    label: string;
    cutoffHz?: number;
    limitHz?: number;
    ratio?: number;
    sampleRate?: number;
    bits?: number;
    integrityOk?: boolean | null;
    bitexact?: boolean | null;
  };
}

export function evaluateFlacDelivery(
  analysis: LosslessAnalysis | null | undefined,
  options?: { bitexact?: boolean | null },
): FlacDeliveryDecision;
