// memoizeAsync — wrap an expensive async function so identical calls return a cached
// result, AND concurrent in-flight calls for the same key share a single promise
// (request coalescing). The in-flight dedup is the big latency win: if 5 components
// ask for the same upscale at once, the work runs once.
//
//   const cache = new LRUCache({ maxEntries: 50 });
//   const upscale = memoizeAsync(rawUpscale, { cache, keyFn: (a) => keyOf(a) });
//   await upscale(params);  // computes
//   await upscale(params);  // cache hit (instant)
//
// A rejected call is NOT cached (so transient failures can be retried).
import { LRUCache } from "./LRUCache.js";

export function memoizeAsync(fn, { cache = new LRUCache(), keyFn = (...a) => JSON.stringify(a), ttl } = {}) {
  const inflight = new Map(); // key -> Promise (dedups concurrent identical calls)

  const wrapped = async (...args) => {
    const key = keyFn(...args);
    if (cache.has(key)) return cache.get(key);
    if (inflight.has(key)) return inflight.get(key);

    const p = (async () => fn(...args))()
      .then((value) => { cache.set(key, value, ttl); return value; })
      .finally(() => { inflight.delete(key); });

    inflight.set(key, p);
    return p;
  };

  wrapped.cache = cache;
  wrapped.inflightCount = () => inflight.size;
  return wrapped;
}
