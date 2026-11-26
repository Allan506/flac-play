import { Agent, fetch } from 'undici';
import { config } from './config.mjs';

// Node's built-in fetch gives up on a slow TCP connect after 10 s, which is too
// short for the Kuwo CDN. undici lets us raise that limit and reuse sockets.
const dispatcher = new Agent({
  connect: { timeout: config.connectTimeoutMs },
  headersTimeout: config.headersTimeoutMs,
  bodyTimeout: 0,
});

export function httpFetch(url, options = {}) {
  return fetch(url, { dispatcher, ...options });
}

const RETRYABLE_STATUS = new Set([429, 503]);

// Wikimedia y algunos CDN limitan por IP y devuelven 429 puntuales; reintentar
// con espera evita fallos intermitentes en la reproducción y la descarga.
export async function fetchWithRetry(url, options = {}, { attempts = 3 } = {}) {
  let response = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, { dispatcher, ...options });
    if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts - 1) return response;
    const retryAfter = Number(response.headers.get('retry-after'));
    await response.body?.cancel().catch(() => {});
    const wait = retryAfter > 0 ? Math.min(10_000, retryAfter * 1000) : 1_500 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return response;
}
