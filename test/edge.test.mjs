// Edge-case coverage across the app's core modules: dimension math boundaries,
// ZIP corner cases, and enhancement-core invariants.
// Run: node test/edge.test.mjs
import { targetDims, TARGETS, MAX_PIXELS } from "../imageProcessing/canvasResize.js";
import { zipStored, crc32 } from "../pdfZip.js";
import { runEnhancePixels } from "../imageProcessing/enhancePixels.js";
import { nearestNeighbor } from "../imageProcessing/nearestNeighbor.js";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)));

console.log("\n[targetDims] boundary cases");
{
  // Source longest side EXACTLY equals the target → no upscale (scale 1).
  const exact = targetDims(3840, 2160, "4K");
  ok(exact.scale === 1 && exact.dw === 3840, "exact-fit source is not upscaled (scale 1)");
  // 1px source → scales to the full target on the long side.
  const tiny = targetDims(1, 1, "4K");
  ok(tiny.dw === TARGETS["4K"] && tiny.dh === TARGETS["4K"], "1×1 → 4K square");
  // Extreme aspect ratio preserved.
  const wide = targetDims(4000, 100, "8K");
  ok(wide.dw === 7680 && wide.dh === Math.round(100 * (7680 / 4000)), "extreme-wide aspect preserved");
  // Unknown target key → identity (defensive).
  const bad = targetDims(1000, 1000, "16K");
  ok(bad.scale === 1 && bad.dw === 1000, "unknown target key returns source unchanged");
}

console.log("\n[zipStored] corner cases");
{
  const empty = zipStored([]);                 // zero entries → still a valid (empty) EOCD
  ok(empty.length === 22, "empty archive is exactly the 22-byte EOCD record");
  ok(empty[0] === 0x50 && empty[2] === 0x05 && empty[3] === 0x06, "empty archive is just the EOCD signature");

  const one = zipStored([{ name: "a b c.png", bytes: new Uint8Array([1, 2, 3]) }]);
  ok(one[0] === 0x50 && one[1] === 0x4b && one[2] === 0x03, "single-file archive starts with a local header");
  // CRC of empty input is 0x00000000.
  ok(crc32(new Uint8Array([])) === 0, "crc32 of empty buffer is 0");
}

console.log("\n[runEnhancePixels] invariants");
{
  const SW = 3, SH = 3;
  const src = new Uint8ClampedArray(SW * SH * 4).fill(200);
  for (let p = 3; p < src.length; p += 4) src[p] = 255; // opaque

  // nearest + no filters == raw nearestNeighbor (resize-only identity).
  const a = runEnhancePixels({ srcPx: src, sw: SW, sh: SH, dw: 6, dh: 6, algo: "nearest" });
  const ref = nearestNeighbor(src, SW, SH, 6, 6);
  let same = a.length === ref.length;
  for (let i = 0; same && i < a.length; i++) if (a[i] !== ref[i]) same = false;
  ok(same, "nearest + no filters is byte-identical to nearestNeighbor");

  // Same-size (dw==sw) with no filters returns the source content unchanged.
  const id = runEnhancePixels({ srcPx: src, sw: SW, sh: SH, dw: SW, dh: SH, algo: "nearest" });
  let unchanged = id.length === src.length;
  for (let i = 0; unchanged && i < id.length; i++) if (id[i] !== src[i]) unchanged = false;
  ok(unchanged, "identity resize (same dims, no filters) preserves pixels");

  // contrast=1, denoise=0, sharpen=0 explicitly is a no-op filter chain.
  const noop = runEnhancePixels({ srcPx: src, sw: SW, sh: SH, dw: 6, dh: 6, algo: "bilinear", denoise: 0, contrast: 1.0, sharpen: 0 });
  ok(noop.length === 6 * 6 * 4, "no-op filter chain still resizes correctly");
}

console.log("\n[MAX_PIXELS] sanity");
ok(MAX_PIXELS === 8192 * 8192, "ceiling is 8192² (67MP), leaving headroom above 8K");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
