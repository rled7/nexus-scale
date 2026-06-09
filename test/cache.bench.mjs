// Measurable proof the cache helps — times the app's REAL enhancement workload
// (resize + denoise + contrast + sharpen) recomputed cold vs served from cache.
// Run: node test/cache.bench.mjs   (or: npm run bench)
//
// Exits non-zero if the cached path isn't clearly faster, so it doubles as a guard
// against the cache silently regressing to a no-op.
import { runEnhancePixels } from "../imageProcessing/enhancePixels.js";
import { memoizeAsync, LRUCache, keyOf } from "../cache/index.js";

// Build a real source image (a gradient), upscale 4× with the full filter chain.
const SW = 256, SH = 256, DW = 1024, DH = 1024;
const src = new Uint8ClampedArray(SW * SH * 4);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  const i = (y * SW + x) * 4;
  src[i] = (x ^ y) & 255; src[i + 1] = (x * 2) & 255; src[i + 2] = (y * 2) & 255; src[i + 3] = 255;
}
const params = { srcPx: src, sw: SW, sh: SH, dw: DW, dh: DH, algo: "bicubic", denoise: 0.3, contrast: 1.2, sharpen: 0.5 };
const N = 30;

const ms = (f) => { const t = process.hrtime.bigint(); return Promise.resolve(f()).then(() => Number(process.hrtime.bigint() - t) / 1e6); };

const time = async (label, run) => {
  await run(); // warm up JIT / prime cache
  let total = 0;
  for (let i = 0; i < N; i++) total += await ms(run);
  console.log(`  ${label.padEnd(34)} ${total.toFixed(1).padStart(8)} ms total · ${(total / N).toFixed(2).padStart(7)} ms/op`);
  return total;
};

console.log(`\n══ Cache performance — ${SW}×${SH} → ${DW}×${DH}, ${N} runs of the real enhance chain ══`);

// Cold: full recompute every call (what the app does WITHOUT the cache).
const coldRun = () => runEnhancePixels(params);

// Cached: memoized over identical params (what the app does WITH the cache — 1 miss, rest hits).
const cache = new LRUCache({ maxEntries: 8 });
const enhance = memoizeAsync(async (p) => runEnhancePixels(p), {
  cache,
  keyFn: (p) => keyOf({ sw: p.sw, sh: p.sh, dw: p.dw, dh: p.dh, algo: p.algo, denoise: p.denoise, contrast: p.contrast, sharpen: p.sharpen }),
});
const cachedRun = () => enhance(params);

const cold = await time("cold (no cache, recompute)", coldRun);
// reset cache timing baseline so warm-up above isn't double counted is fine — primed already
const warm = await time("cached (LRU hit)", cachedRun);

const speedup = cold / warm;
console.log(`\n  → cache hit-rate ${(cache.stats().hitRate * 100).toFixed(1)}%  ·  speedup ${speedup.toFixed(1)}× on repeated identical enhancement\n`);

// Guard: a cache hit avoids the entire convolution chain, so it must be MUCH faster.
const THRESHOLD = 5;
if (speedup < THRESHOLD) {
  console.log(`  ✗ FAIL — expected ≥${THRESHOLD}× speedup, got ${speedup.toFixed(1)}× (cache not delivering)`);
  process.exit(1);
}
console.log(`  ✓ PASS — cache delivers ${speedup.toFixed(1)}× (≥${THRESHOLD}× required)\n`);
