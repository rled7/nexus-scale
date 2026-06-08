// Thorough tests for the portable caching suite.
// Run: node test/cache.test.mjs
import { LRUCache, memoizeAsync, keyOf, cyrb53 } from "../cache/index.js";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)));

console.log("\n[LRUCache] basic get/set/has/delete");
{
  const c = new LRUCache({ maxEntries: 3 });
  c.set("a", 1); c.set("b", 2);
  ok(c.get("a") === 1 && c.get("b") === 2, "stores and retrieves values");
  ok(c.has("a") && !c.has("zzz"), "has() reflects presence");
  ok(c.get("missing") === undefined, "miss returns undefined");
  c.delete("a");
  ok(!c.has("a"), "delete removes the entry");
}

console.log("\n[LRUCache] LRU eviction order");
{
  const c = new LRUCache({ maxEntries: 2 });
  c.set("a", 1); c.set("b", 2);
  c.get("a");          // 'a' now most-recently-used → 'b' is the LRU
  c.set("c", 3);       // evicts 'b'
  ok(!c.has("b"), "evicts the least-recently-used (b)");
  ok(c.has("a") && c.has("c"), "keeps the recently-used (a) and newest (c)");
  ok(c.stats().evictions === 1, "eviction counted in stats");
}

console.log("\n[LRUCache] TTL expiry (injectable clock)");
{
  let t = 1000;
  const c = new LRUCache({ maxEntries: 5, ttl: 100, now: () => t });
  c.set("k", "v");
  ok(c.get("k") === "v", "fresh entry hits");
  t = 1101;            // advance past TTL
  ok(c.get("k") === undefined, "expired entry is a miss");
  ok(c.stats().expirations === 1, "expiration counted");
}

console.log("\n[LRUCache] byte budgeting refuses oversized + evicts to fit");
{
  const c = new LRUCache({ maxEntries: 100, maxBytes: 10, sizeOf: (s) => s.length });
  ok(c.set("ok", "123") === true && c.bytes === 3, "small item stored, bytes tracked");
  ok(c.set("big", "12345678901") === false, "single item over budget is refused");
  c.set("x", "12345"); c.set("y", "12345"); // 3+5=8, then +5=13 > 10 → evicts oldest
  ok(c.bytes <= 10, `stays within byte budget (bytes=${c.bytes})`);
}

console.log("\n[hashKey] stability + field-order independence");
{
  ok(cyrb53("123456789") === cyrb53("123456789"), "cyrb53 deterministic");
  ok(keyOf({ a: 1, b: 2 }) === keyOf({ b: 2, a: 1 }), "keyOf is field-order independent");
  ok(keyOf({ a: 1 }) !== keyOf({ a: 2 }), "different values → different keys");
}

console.log("\n[memoizeAsync] caches + coalesces concurrent calls");
await (async () => {
  let calls = 0;
  const slow = async (n) => { calls++; await new Promise(r => setTimeout(r, 20)); return n * 2; };
  const m = memoizeAsync(slow, { keyFn: (n) => `n:${n}` });

  const [r1, r2, r3] = await Promise.all([m(5), m(5), m(5)]); // 3 concurrent, same key
  ok(r1 === 10 && r2 === 10 && r3 === 10, "all concurrent callers get the right result");
  ok(calls === 1, "underlying fn ran ONCE for 3 concurrent identical calls (coalesced)");

  await m(5); // now cached
  ok(calls === 1, "subsequent call is a cache hit (no extra run)");

  await m(6); // different key
  ok(calls === 2, "different key triggers a real run");
})();

console.log("\n[memoizeAsync] rejections are not cached");
await (async () => {
  let calls = 0;
  const flaky = async () => { calls++; if (calls === 1) throw new Error("transient"); return "ok"; };
  const m = memoizeAsync(flaky, { keyFn: () => "k" });
  let threw = false;
  try { await m(); } catch { threw = true; }
  const second = await m();
  ok(threw && second === "ok", "first rejects, retry succeeds (failure not cached)");
})();

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
