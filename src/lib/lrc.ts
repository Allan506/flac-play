import type { LyricsLine, ParsedLyrics } from '../types';

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[([a-zA-Z]+):(.*)\]$/;

function toSeconds(minutes: string, seconds: string, fraction = '0'): number {
  const millis = fraction.length === 3 ? Number(fraction) : Number(fraction.padEnd(2, '0')) * 10;
  return Number(minutes) * 60 + Number(seconds) + millis / 1000;
}

export function parseLrc(raw: string): ParsedLyrics {
  const meta: Record<string, string> = {};
  const lines: LyricsLine[] = [];
  const text = String(raw ?? '').replace(/\r\n?/g, '\n');
  let offset = 0;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const metaMatch = line.match(META_TAG);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const value = metaMatch[2].trim();
      if (key === 'offset') {
        offset = Number(value) || 0;
      } else if (value) {
        meta[key] = value;
      }
      continue;
    }

    const timestamps: number[] = [];
    TIME_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TIME_TAG.exec(line)) !== null) {
      timestamps.push(toSeconds(match[1], match[2], match[3]));
    }

    if (!timestamps.length) {
      if (line && !line.startsWith('[')) {
        lines.push({ time: -1, text: line });
      }
      continue;
    }

    const content = line.replace(TIME_TAG, '').trim();
    for (const time of timestamps) {
      lines.push({ time, text: content });
    }
  }

  const synced = lines.some((line) => line.time >= 0);
  if (offset) {
    for (const line of lines) {
      if (line.time >= 0) line.time = Math.max(0, line.time - offset / 1000);
    }
  }

  if (synced) {
    lines.sort((a, b) => {
      if (a.time < 0 && b.time < 0) return 0;
      if (a.time < 0) return 1;
      if (b.time < 0) return -1;
      return a.time - b.time;
    });
  }

  return { meta, lines, synced };
}

export function findActiveLine(lines: LyricsLine[], currentTime: number): number {
  if (!lines.length) return -1;
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.time < 0) continue;
    if (line.time <= currentTime + 0.15) active = index;
    else break;
  }
  return active;
}

export function lyricsToPlainText(parsed: ParsedLyrics): string {
  return parsed.lines
    .map((line) => line.text)
    .filter(Boolean)
    .join('\n');
}
