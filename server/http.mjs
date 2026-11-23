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
