export function parseCorsOrigins(raw: string | undefined): string[];

export function corsHeaders(
  origin: string | undefined,
  allowedOrigins?: string[],
): Record<string, string> | null;
