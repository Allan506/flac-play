import fs from 'node:fs';
import path from 'node:path';

const COMMON_BIN_DIRS = ['/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin', '/snap/bin'];

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function resolveExecutable({
  envPath = '',
  packagePath = '',
  name,
  extraDirs = COMMON_BIN_DIRS,
  pathEnv = process.env.PATH ?? '',
  fileExists = isFile,
} = {}) {
  const candidates = [envPath, packagePath];
  for (const dir of [...extraDirs, ...pathEnv.split(path.delimiter)]) {
    if (dir) candidates.push(path.join(dir, name));
  }

  for (const candidate of candidates) {
    if (candidate && fileExists(candidate)) return candidate;
  }
  return '';
}
