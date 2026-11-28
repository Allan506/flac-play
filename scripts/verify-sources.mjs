#!/usr/bin/env node
// Verificación en tiempo real de los catálogos: busca, resuelve, comprueba el
// formato real con ffprobe (a través de /api/probe) y confirma que la descarga
// FLAC llega con cabecera fLaC. Uso: node scripts/verify-sources.mjs [base] [keyword]
const base = (process.argv[2] ?? process.env.API_BASE ?? 'http://localhost:12001').replace(/\/+$/, '');
const keyword = process.argv[3] ?? 'adele';
const PLATFORMS = (process.env.VERIFY_PLATFORMS ?? 'kuwo,wyy').split(',');

try {
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) });
  if (!health.ok) throw new Error(`HTTP ${health.status}`);
} catch (error) {
  console.error(`✘ No hay API en ${base} (${error.message}).`);
  console.error('  Arranca el servidor con "npm start" (12000) o "npm run dev" (12001) y repite.');
  process.exit(1);
}

async function post(path, payload, timeoutMs = 300_000) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: { message: text.slice(0, 200) } };
  }
  return { ok: response.ok, status: response.status, body, headers: response.headers };
}

const results = [];

function report(platform, step, ok, detail) {
  results.push({ platform, step, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${platform.padEnd(8)} ${step.padEnd(9)} ${detail}`);
}

for (const platform of PLATFORMS) {
  const search = await post('/api/search', { platform, keyword, page: 1 });
  if (!search.ok) {
    report(platform, 'search', false, search.body?.error?.message ?? `HTTP ${search.status}`);
    continue;
  }
  const tracks = search.body.data.list ?? [];
  report(platform, 'search', tracks.length > 0, `${tracks.length} pistas · total ${search.body.data.total}`);
  if (!tracks.length) continue;

  const track = tracks[0];
  const quality = track.minfo?.[0] ?? { format: 'flac', bitrate: '1000' };
  const payload = {
    platform,
    songid: track.id,
    format: quality.format,
    bitrate: quality.bitrate,
    time: track.time,
    sign: track.sign,
  };

  const resolve = await post('/api/resolve', payload);
  if (!resolve.ok) {
    report(platform, 'resolve', false, resolve.body?.error?.message ?? `HTTP ${resolve.status}`);
    continue;
  }
  report(platform, 'resolve', true, resolve.body.data.url.slice(0, 78));

  const probe = await post('/api/probe', { ...payload, expectedDurationSeconds: track.duration });
  if (!probe.ok) {
    report(platform, 'probe', false, probe.body?.error?.message ?? `HTTP ${probe.status}`);
    continue;
  }
  const data = probe.body.data;
  const spectrum = data.spectrum ?? {};
  const okFormat = data.actualFormat === 'flac';
  report(
    platform,
    'probe',
    okFormat,
    `${data.actualFormat} · ${data.actualBitrate} kb/s · veredicto ${spectrum.verdict ?? 'n/d'} · corte ${spectrum.cutoffHz ?? '?'} Hz de ${spectrum.limitHz ?? '?'} Hz`,
  );

  const download = await fetch(`${base}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      outputFormat: quality.format,
      title: track.name,
      artist: track.artist,
      album: track.album_name,
      coverUrl: track.pic_url,
      expectedDurationSeconds: track.duration,
      embedMetadata: true,
      embedCover: true,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!download.ok) {
    const text = await download.text();
    // Rechazar un FLAC sin espectro completo es el comportamiento correcto:
    // cuenta como comprobación superada, no como fallo del catálogo.
    let code = '';
    let message = text.slice(0, 120);
    try {
      const body = JSON.parse(text);
      code = body?.error?.code ?? '';
      message = body?.error?.message ?? message;
    } catch {
      /* la respuesta no era JSON */
    }
    const rechazoCorrecto =
      code === 'LOSSLESS_NOT_VERIFIED' || code === 'LOSSLESS_INTEGRITY_FAILED';
    report(platform, 'download', rechazoCorrecto, rechazoCorrecto ? `rechazado · ${message}` : message);
    continue;
  }

  const reader = download.body.getReader();
  const { value } = await reader.read();
  await reader.cancel().catch(() => {});
  const magic = Buffer.from(value ?? []).subarray(0, 4).toString('latin1');
  const verified = download.headers.get('x-flacplay-verified');
  const verdict = download.headers.get('x-flacplay-lossless-verdict');
  const bytes = download.headers.get('content-length');
  report(
    platform,
    'download',
    magic === 'fLaC' && verified === '1',
    `${magic} · ${bytes} bytes · verificado=${verified} · ${verdict ?? 'sin veredicto'}`,
  );
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas en ${base}`);
process.exit(failed.length ? 1 : 0);
