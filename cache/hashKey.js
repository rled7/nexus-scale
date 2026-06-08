// hashKey — fast, stable, dependency-free string hashing for building cache keys.
// cyrb53 is a well-regarded non-cryptographic 53-bit hash (good distribution, very
// fast). Use it to turn parameter objects / fingerprints into compact, stable keys.
// NOT for security — only for cache addressing.

export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0));
}

// Build a stable key from any JSON-able value (object keys are sorted so field order
// never changes the key). Returns a short base-36 string.
export function keyOf(value, prefix = "") {
  const canon = stableStringify(value);
  return prefix + cyrb53(canon).toString(36);
}

function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}
