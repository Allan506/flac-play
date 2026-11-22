import { LRUCache } from 'lru-cache';

const store = new LRUCache({ max: 600, ttlAutopurge: true });
const inFlight = new Map();

export async function cached(key, ttl, producer) {
  const hit = store.get(key);
  if (hit !== undefined) return hit;

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const value = await producer();
      store.set(key, value, { ttl });
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
