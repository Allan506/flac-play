export interface RescueCandidate {
  id: string;
  name: string;
  duration: number;
  minfo?: { format: string; bitrate: string }[];
}

export function twinPlatform(platform: string): string | null;

export function rescueKeyword(meta: {
  name?: string;
  artist?: string;
  duration?: number;
}): string;

export function normalizeRescueTitle(value: unknown): string;

export function rankTwinCandidates(
  meta: { name?: string; duration?: number },
  list: RescueCandidate[],
  options?: { expectedDuration?: number; tolerance?: number; limit?: number; excludeId?: string },
): RescueCandidate[];
