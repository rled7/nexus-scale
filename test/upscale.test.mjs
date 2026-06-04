// Headless proof that NexusScale's resize engine ACTUALLY upscales pixels.
// Pure functions over Uint8ClampedArray — no browser needed.
// Run: node test/upscale.test.mjs
import { nearestNeighbor } from "../imageProcessing/nearestNeighbor.js";
import { bilinear } from "../imageProcessing/bilinear.js";
import { bicubic } from "../imageProcessing/bicubic.js";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)));

// Build a 4x4 RGBA test image: horizontal red gradient, opaque.
const SW = 4, SH = 4;
const src = new Uint8ClampedArray(SW * SH * 4);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  const i = (y * SW + x) * 4;
  src[i] = Math.round((x / (SW - 1)) * 255); // R ramps 0..255 across width
  src[i + 1] = 0; src[i + 2] = 0; src[i + 3] = 255; // opaque
}

const SCALE = 2, DW = SW * SCALE, DH = SH * SCALE; // 8x8

for (const [name, fn] of [["nearestNeighbor", nearestNeighbor], ["bilinear", bilinear], ["bicubic", bicubic]]) {
  console.log(`\n[${name}] ${SW}x${SH} -> ${DW}x${DH} (${SCALE}x)`);
  const out = fn(src, SW, SH, DW, DH);

  ok(out.length === DW * DH * 4, `output buffer is ${DW * DH * 4} bytes (real ${DW}x${DH} image)`);
  ok(out instanceof Uint8ClampedArray, "output is a pixel buffer");

  // Alpha must stay opaque everywhere (no transparent garbage).
  let alphaOk = true;
  for (let p = 3; p < out.length; p += 4) if (out[p] !== 255) { alphaOk = false; break; }
  ok(alphaOk, "alpha channel preserved (all opaque)");

  // Left edge must be dark red, right edge bright red (gradient survived the resize).
  const leftR = out[0], rightR = out[(DW - 1) * 4];
  ok(leftR < 60 && rightR > 195, `gradient preserved: left R=${leftR} < right R=${rightR}`);

  // Interpolating methods must create NEW intermediate values not present in the 4-step source.
  if (name !== "nearestNeighbor") {
    const srcVals = new Set([0, 85, 170, 255]); // the only R values in the 4-wide source
    let madeNewValue = false;
    for (let p = 0; p < out.length; p += 4) if (!srcVals.has(out[p])) { madeNewValue = true; break; }
    ok(madeNewValue, "interpolation produced new in-between pixel values (true resampling)");
  }
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
