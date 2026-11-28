const EXPOSED_HEADERS = [
  'Content-Disposition',
  'X-Request-Id',
  'X-FLACPlay-Requested-Format',
  'X-FLACPlay-Output-Format',
  'X-FLACPlay-Source-Format',
  'X-FLACPlay-Source-Codec',
  'X-FLACPlay-Actual-Bitrate',
  'X-FLACPlay-Verified',
  'X-FLACPlay-Cover',
  'X-FLACPlay-Cover-Resolution',
  'X-FLACPlay-Lossless-Verdict',
  'X-FLACPlay-Lossless-Label',
  'X-FLACPlay-Lossless-Cutoff-Hz',
  'X-FLACPlay-Lossless-Limit-Hz',
  'X-FLACPlay-Lossless-Integrity',
  'X-FLACPlay-Lossless-Bits',
  'X-FLACPlay-Lossless-Sample-Rate',
  'X-FLACPlay-Lossless-Bitexact',
].join(', ');

export function parseCorsOrigins(raw) {
  return String(raw ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function corsHeaders(origin, allowedOrigins = []) {
  if (!origin) return null;
  const allowAll = allowedOrigins.length === 0;
  if (!allowAll && !allowedOrigins.includes(origin.replace(/\/+$/, ''))) return null;
  return {
    'Access-Control-Allow-Origin': allowAll ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    'Access-Control-Max-Age': '600',
  };
}
