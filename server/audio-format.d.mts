export type DetectedAudioFormat = 'flac' | 'mp3' | 'm4a' | 'ogg' | 'unknown';

export function sniffAudioFormat(bytes: Uint8Array): DetectedAudioFormat;

export function codecToAudioFormat(probe?: {
  codec?: string;
  formatName?: string;
}): DetectedAudioFormat;

export function audioFormatLabel(format: string): string;

export function observedBitrateKbps(contentLength: number, expectedSeconds: number): number;

export function estimateBytesForFormat(
  expectedSeconds: number,
  format: string,
  bitrate?: string | number,
): number;
