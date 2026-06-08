// Proves the shared enhancement core (used by BOTH the Web Worker and the inline
// fallback) resizes to the target dims and runs the filter chain without error.
// This is the logic that moved off the main thread for the no-freeze pipeline.
// Run: node test/enhancePixels.test.mjs
import { runEnhancePixels } from "../imageProcessing/enhancePixels.js";
import { bicubic } from "../imageProcessing/bicubic.js";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)));

// 4x4 red-gradient source, opaque.
const SW = 4, SH = 4;
const src = new Uint8ClampedArray(SW * SH * 4);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  const i = (y * SW + x) * 4;
  src[i] = Math.round((x / (SW - 1)) * 255); src[i + 3] = 255;
}
const DW = 8, DH = 8;

console.log("\n[runEnhancePixels] resize-only (no filters) == raw bicubic");
{
  const out = runEnhancePixels({ srcPx: src, sw: SW, sh: SH, dw: DW, dh: DH, algo: "bicubic", denoise: 0, contrast: 1.0, sharpen: 0 });
  const ref = bicubic(src, SW, SH, DW, DH);
  ok(out.length === DW * DH * 4, `output is ${DW}x${DH} (${out.length} bytes)`);
  let identical = out.length === ref.length;
  for (let i = 0; identical && i < out.length; i++) if (out[i] !== ref[i]) identical = false;
  ok(identical, "with no filters, output is byte-identical to bicubic alone (pure resize)");
}

console.log("\n[runEnhancePixels] full chain runs + stays opaque + changes pixels");
{
  const ref = bicubic(src, SW, SH, DW, DH);
  const out = runEnhancePixels({ srcPx: src, sw: SW, sh: SH, dw: DW, dh: DH, algo: "bicubic", denoise: 0.3, contrast: 1.25, sharpen: 0.6 });
  ok(out.length === DW * DH * 4, "full-chain output has the right dimensions");
  let alphaOk = true;
  for (let p = 3; p < out.length; p += 4) if (out[p] !== 255) { alphaOk = false; break; }
  ok(alphaOk, "alpha preserved through denoise/contrast/sharpen");
  let changed = false;
  for (let i = 0; i < out.length; i += 4) if (out[i] !== ref[i]) { changed = true; break; }
  ok(changed, "filters actually altered pixels vs resize-only");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
