const KUWO_COVER_SIZES = [1200, 500, 300];

export function coverCandidates(rawUrl) {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();
  const candidates = [];

  if (host.endsWith('.kuwo.cn') || host.endsWith('.kuwo.com')) {
    const match = parsed.pathname.match(/^(.*\/albumcover\/)(\d+)(\/.*)$/);
    if (match) {
      for (const size of KUWO_COVER_SIZES) {
        const candidate = new URL(parsed);
        candidate.pathname = `${match[1]}${size}${match[3]}`;
        candidates.push(candidate.toString());
      }
    }
  } else if (host.endsWith('.126.net') || host.endsWith('.126.com')) {
    const candidate = new URL(parsed);
    candidate.searchParams.delete('param');
    candidates.push(candidate.toString());
  }

  candidates.push(parsed.toString());
  return [...new Set(candidates)];
}
