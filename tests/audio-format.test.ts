import { describe, expect, it } from 'vitest';
import {
  audioFormatLabel,
  codecToAudioFormat,
  estimateBytesForFormat,
  observedBitrateKbps,
  sniffAudioFormat,
} from '../server/audio-format.mjs';

function bytes(values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

describe('sniffAudioFormat', () => {
  it('detects FLAC from its magic bytes', () => {
    expect(sniffAudioFormat(bytes([...ascii('fLaC'), 0x00, 0x00, 0x00, 0x22]))).toBe('flac');
  });

  it('detects MP3 with an ID3 tag', () => {
    const id3Header = [...ascii('ID3'), 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    expect(sniffAudioFormat(bytes([...id3Header, 0xff, 0xfb, 0x90, 0x64]))).toBe('mp3');
  });

  it('detects a bare MPEG audio frame as MP3', () => {
    expect(sniffAudioFormat(bytes([0xff, 0xfb, 0x90, 0x64]))).toBe('mp3');
  });

  it('detects M4A and OGG containers', () => {
    expect(sniffAudioFormat(bytes([0x00, 0x00, 0x00, 0x20, ...ascii('ftypM4A ')]))).toBe('m4a');
    expect(sniffAudioFormat(bytes([...ascii('OggS'), 0x00, 0x02]))).toBe('ogg');
  });

  it('does not guess when the prefix is not audio', () => {
    expect(sniffAudioFormat(bytes([0x00, 0x01, 0x02, 0x03]))).toBe('unknown');
    expect(sniffAudioFormat(bytes([0x66, 0x4c]))).toBe('unknown');
  });
});

describe('codecToAudioFormat', () => {
  it('maps ffprobe codecs to user-facing formats', () => {
    expect(codecToAudioFormat({ codec: 'flac', formatName: 'flac' })).toBe('flac');
    expect(codecToAudioFormat({ codec: 'mp3', formatName: 'mp3' })).toBe('mp3');
    expect(codecToAudioFormat({ codec: 'aac', formatName: 'mov,mp4,m4a' })).toBe('m4a');
    expect(codecToAudioFormat({ codec: 'opus', formatName: 'ogg' })).toBe('ogg');
    expect(codecToAudioFormat({ codec: 'pcm_s16le', formatName: 'wav' })).toBe('unknown');
  });
});

describe('bitrate estimates', () => {
  it('uses the real format when estimating the expected size', () => {
    expect(estimateBytesForFormat(250, 'flac', 948)).toBe(29_625_000);
    expect(estimateBytesForFormat(250, 'mp3', 948)).toBe(10_000_000);
  });

  it('computes the observed bitrate from a response size', () => {
    expect(observedBitrateKbps(10_000_000, 250)).toBe(320);
    expect(observedBitrateKbps(0, 250)).toBe(0);
  });

  it('labels formats for the UI', () => {
    expect(audioFormatLabel('flac')).toBe('FLAC');
    expect(audioFormatLabel('mp3')).toBe('MP3');
    expect(audioFormatLabel('m4a')).toBe('M4A/AAC');
  });
});
