const FORMAT_LABELS = {
  flac: 'FLAC',
  mp3: 'MP3',
  m4a: 'M4A/AAC',
  ogg: 'OGG',
  unknown: 'formato desconocido',
};

function ascii(bytes, start, end) {
  let value = '';
  for (let index = start; index < end && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function isMpegAudioFrame(byte1, byte2, byte3) {
  if (byte1 !== 0xff || (byte2 & 0xe0) !== 0xe0) return false;
  const layer = (byte2 >> 1) & 0x03;
  if (layer === 0) return false;
  const bitrateIndex = (byte3 >> 4) & 0x0f;
  const sampleRateIndex = (byte3 >> 2) & 0x03;
  return bitrateIndex !== 0 && bitrateIndex !== 15 && sampleRateIndex !== 3;
}

export function sniffAudioFormat(bytes) {
  if (!bytes || bytes.length < 4) return 'unknown';

  if (ascii(bytes, 0, 4) === 'fLaC') return 'flac';
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg';
  if (ascii(bytes, 4, 8) === 'ftyp') return 'm4a';

  if (ascii(bytes, 0, 3) === 'ID3') {
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    const frameOffset = 10 + tagSize;
    if (bytes.length >= frameOffset + 3 && isMpegAudioFrame(bytes[frameOffset], bytes[frameOffset + 1], bytes[frameOffset + 2])) {
      return 'mp3';
    }
    return 'mp3';
  }

  if (bytes.length >= 3 && isMpegAudioFrame(bytes[0], bytes[1], bytes[2])) return 'mp3';
  return 'unknown';
}

export function codecToAudioFormat(probe = {}) {
  const codec = String(probe.codec ?? '').toLowerCase();
  const formatName = String(probe.formatName ?? '').toLowerCase();
  if (codec === 'flac' || formatName.includes('flac')) return 'flac';
  if (codec === 'mp3' || codec.startsWith('mp3') || formatName.includes('mp3')) return 'mp3';
  if (codec === 'aac' || formatName.includes('mp4') || formatName.includes('mov')) return 'm4a';
  if (codec === 'opus' || codec === 'vorbis' || formatName.includes('ogg')) return 'ogg';
  return 'unknown';
}

export function audioFormatLabel(format) {
  return FORMAT_LABELS[format] ?? FORMAT_LABELS.unknown;
}

export function observedBitrateKbps(contentLength, expectedSeconds) {
  if (!contentLength || !expectedSeconds) return 0;
  return contentLength / expectedSeconds / 125;
}

export function estimateBytesForFormat(expectedSeconds, format, bitrate) {
  if (!expectedSeconds) return 0;
  const kbps =
    format === 'flac'
      ? Math.max(700, Number(bitrate) || 900)
      : Math.min(320, Math.max(96, Number(bitrate) || 320));
  return expectedSeconds * kbps * 125;
}
