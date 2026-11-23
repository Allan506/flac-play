import { describe, expect, it } from 'vitest';
import { resolveExecutable } from '../server/tools.mjs';

const files = new Set([
  '/custom/ffmpeg',
  '/app/node_modules/ffmpeg-static/ffmpeg',
  '/usr/local/bin/ffmpeg',
]);

const fileExists = (candidate: string) => files.has(candidate);

describe('resolveExecutable', () => {
  it('prefers the path configured in the environment', () => {
    expect(
      resolveExecutable({
        envPath: '/custom/ffmpeg',
        packagePath: '/app/node_modules/ffmpeg-static/ffmpeg',
        name: 'ffmpeg',
        fileExists,
      }),
    ).toBe('/custom/ffmpeg');
  });

  it('falls back to the packaged binary when the env path is missing', () => {
    expect(
      resolveExecutable({
        envPath: '/missing/ffmpeg',
        packagePath: '/app/node_modules/ffmpeg-static/ffmpeg',
        name: 'ffmpeg',
        fileExists,
      }),
    ).toBe('/app/node_modules/ffmpeg-static/ffmpeg');
  });

  it('falls back to the PATH entries', () => {
    expect(
      resolveExecutable({
        name: 'ffmpeg',
        extraDirs: [],
        pathEnv: '/opt/bin:/usr/local/bin:/usr/bin',
        fileExists,
      }),
    ).toBe('/usr/local/bin/ffmpeg');
  });

  it('returns an empty string when no candidate exists', () => {
    expect(
      resolveExecutable({
        envPath: '/missing/ffmpeg',
        packagePath: '/missing/package/ffmpeg',
        name: 'ffmpeg',
        extraDirs: [],
        pathEnv: '/nowhere',
        fileExists,
      }),
    ).toBe('');
  });
});
