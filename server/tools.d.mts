export function resolveExecutable(options?: {
  envPath?: string;
  packagePath?: string;
  name: string;
  extraDirs?: string[];
  pathEnv?: string;
  fileExists?: (candidate: string) => boolean;
}): string;
