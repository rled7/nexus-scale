// LRUCache — a dependency-free, portable LRU cache with optional TTL and byte
// budgeting. Works in the browser and Node (no imports). Drop this folder into any
// app to reduce latency by reusing expensive results.
//
// Eviction: least-recently-used first (a get() marks an entry most-recent).
// Bounds: by entry count (maxEntries) and/or total size (maxBytes + sizeOf).
// Expiry: per-entry or default TTL (ms); expired entries are treated as misses.
//
//   const c = new LRUCache({ maxEntries: 100, ttl: 60000 });
//   c.set("k", value); c.get("k"); c.has("k");
//   c.stats();  // { hits, misses, evictions, expirations, size, bytes }

export class LRUCache {
  constructor({ maxEntries = 256, maxBytes = Infinity, ttl = Infinity, sizeOf = null, now = Date.now } = {}) {
    if (maxEntries <= 0) throw new Error("maxEntries must be > 0");
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.ttl = ttl;
    this.sizeOf = sizeOf;            // (value) => bytes; required if maxBytes is finite
    this._now = now;                // injectable clock (testability)
    this._map = new Map();          // key -> { value, expires, bytes }
    this._bytes = 0;
    this._hits = 0; this._misses = 0; this._evictions = 0; this._expirations = 0;
  }

  _expired(e) { return e.expires !== Infinity && this._now() >= e.expires; }

  has(key) {
    const e = this._map.get(key);
    if (!e) return false;
    if (this._expired(e)) { this._drop(key, e, "expire"); return false; }
    return true;
  }

  get(key) {
    const e = this._map.get(key);
    if (!e) { this._misses++; return undefined; }
    if (this._expired(e)) { this._drop(key, e, "expire"); this._misses++; return undefined; }
    // Mark most-recently-used: delete + re-insert moves it to the end of the Map.
    this._map.delete(key);
    this._map.set(key, e);
    this._hits++;
    return e.value;
  }

  set(key, value, ttl = this.ttl) {
    let bytes = 0;
    if (this.maxBytes !== Infinity) {
      if (!this.sizeOf) throw new Error("maxBytes set but no sizeOf(value) provided");
      bytes = this.sizeOf(value);
      if (bytes > this.maxBytes) return false; // single item can't fit — refuse, don't thrash
    }
    const existing = this._map.get(key);
    if (existing) { this._bytes -= existing.bytes; this._map.delete(key); }
    const expires = ttl === Infinity ? Infinity : this._now() + ttl;
    this._map.set(key, { value, expires, bytes });
    this._bytes += bytes;
    this._evict();
    return true;
  }

  delete(key) {
    const e = this._map.get(key);
    if (!e) return false;
    this._drop(key, e, null);
    return true;
  }

  clear() { this._map.clear(); this._bytes = 0; }

  _drop(key, e, reason) {
    this._map.delete(key);
    this._bytes -= e.bytes;
    if (reason === "expire") this._expirations++;
    else if (reason === "evict") this._evictions++;
  }

  // Evict LRU entries until within both bounds. Map iteration order = insertion =
  // LRU-first (because get() re-inserts to the back).
  _evict() {
    while (this._map.size > this.maxEntries || this._bytes > this.maxBytes) {
      const oldestKey = this._map.keys().next().value;
      if (oldestKey === undefined) break;
      this._drop(oldestKey, this._map.get(oldestKey), "evict");
    }
  }

  get size() { return this._map.size; }
  get bytes() { return this._bytes; }
  stats() {
    const total = this._hits + this._misses;
    return {
      hits: this._hits, misses: this._misses, evictions: this._evictions,
      expirations: this._expirations, size: this._map.size, bytes: this._bytes,
      hitRate: total ? this._hits / total : 0,
    };
  }
}
