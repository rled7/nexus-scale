# cache — a tiny, portable caching suite

Dependency-free LRU cache + async memoization + stable key hashing. Works in the
browser and Node. Copy this `cache/` folder into any app to cut latency by reusing
expensive results. ~3 small files, zero deps.

## Modules

| File | Export | What it does |
|---|---|---|
| `LRUCache.js` | `LRUCache` | LRU cache with optional TTL and byte budgeting + hit/miss stats |
| `memoizeAsync.js` | `memoizeAsync` | Caches async results **and coalesces concurrent identical calls** |
| `hashKey.js` | `cyrb53`, `keyOf` | Fast non-crypto hash; `keyOf(obj)` → stable short key (field-order independent) |

## Quick start

```js
import { LRUCache, memoizeAsync, keyOf } from "./cache/index.js";

// 1) Plain cache
const c = new LRUCache({ maxEntries: 200, ttl: 60_000 }); // 1-min TTL
c.set("user:42", data);
c.get("user:42");      // data (and marks it most-recently-used)
c.stats();             // { hits, misses, evictions, hitRate, size, bytes, ... }

// 2) Byte-budgeted cache (e.g. cache big image buffers, cap at 256 MB)
const imgs = new LRUCache({ maxBytes: 256 * 1024 * 1024, sizeOf: (px) => px.byteLength });

// 3) Memoize an expensive async fn (with request coalescing)
const fetchUser = memoizeAsync(rawFetchUser, {
  cache: new LRUCache({ maxEntries: 500, ttl: 30_000 }),
  keyFn: (id) => `user:${id}`,
});
await fetchUser(42); // computes once
await fetchUser(42); // instant cache hit
// If many callers hit fetchUser(42) simultaneously, the work runs ONCE.
```

## Notes
- **In-flight dedup** (`memoizeAsync`) is the biggest win for latency: simultaneous
  identical requests share one promise instead of doing the work N times.
- **Rejections are not cached** — transient failures can be retried.
- **Eviction is O(1) amortized**; `get()` re-orders via `Map` insertion order.
- `now` is injectable on `LRUCache` for deterministic TTL tests.

## Used in this app
`NexusScale.jsx` caches enhanced image results keyed by a file fingerprint + the
enhancement params (`keyOf({...})`), so re-running the same image with the same
settings returns instantly instead of recomputing the whole pipeline.
