// Golden-output regression lock for the image kernels. Each kernel's output on a
// fixed seeded image is hashed and compared to a recorded constant. If a future
// refactor (optimization, "cleanup") silently changes any kernel's output, this
// fails — protecting the byte-identical guarantees established when bicubic/denoise/
// unsharp were optimized. To intentionally change a kernel, re-generate the hash.
// Run: node test/kernels-golden.test.mjs
import { nearestNeighbor } from "../imageProcessing/nearestNeighbor.js";
import { bilinear } from "../imageProcessing/bilinear.js";
import { bicubic } from "../imageProcessing/bicubic.js";
import { applyDenoise } from "../imageProcessing/denoise.js";
import { enhanceContrast } from "../imageProcessing/enhanceContrast.js";
import { applyUnsharpMask } from "../imageProcessing/unsharpMask.js";
import { cyrb53 } from "../cache/hashKey.js";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)));

const SW = 64, SH = 48, DW = 192, DH = 144;
const src = new Uint8ClampedArray(SW * SH * 4);
for (let i = 0; i < src.length; i++) src[i] = (i * 101 + (i >> 2) * 7) & 255;
const hash = (px) => { let s = ""; for (let i = 0; i < px.length; i += 4) s += String.fromCharCode(px[i], px[i + 1], px[i + 2], px[i + 3]); return cyrb53(s); };
const big = bicubic(src, SW, SH, DW, DH);

// Recorded golden hashes (regenerate deliberately if a kernel's behavior must change).
const GOLDEN = {
  nearest: 5413913162451964,
  bilinear: 3634731731537646,
  bicubic: 972243609773669,
  denoise: 1187675901947381,
  contrast: 1418342386403839,
  unsharp: 4452469414373514,
};

console.log("\n[kernels] output locked to golden hashes");
ok(hash(nearestNeighbor(src, SW, SH, DW, DH)) === GOLDEN.nearest, "nearestNeighbor output unchanged");
ok(hash(bilinear(src, SW, SH, DW, DH)) === GOLDEN.bilinear, "bilinear output unchanged");
ok(hash(big) === GOLDEN.bicubic, "bicubic output unchanged (optimized impl matches golden)");
ok(hash(applyDenoise(big, DW, DH, 0.5)) === GOLDEN.denoise, "applyDenoise output unchanged (separable impl matches golden)");
ok(hash(enhanceContrast(big, DW, DH, 1.2)) === GOLDEN.contrast, "enhanceContrast output unchanged");
ok(hash(applyUnsharpMask(big, DW, DH, 0.5)) === GOLDEN.unsharp, "applyUnsharpMask output unchanged (leaner impl matches golden)");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
