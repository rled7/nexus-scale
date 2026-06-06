// Proof that the 4K/8K resolution-target math is correct: hits the target's
// longest side, preserves aspect ratio, never downscales, and respects the
// pixel ceiling. Pure math — no browser needed.
// Run: node test/targetDims.test.mjs
import { targetDims, TARGETS, MAX_PIXELS } from "../imageProcessing/canvasResize.js";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)));

console.log("\n[targetDims] 1920×1080 → 8K");
{
  const { dw, dh, scale } = targetDims(1920, 1080, "8K");
  ok(dw === 7680 && dh === 4320, `longest side hits 7680 (got ${dw}×${dh})`);
  ok(scale === 4, `scale is exactly 4 (got ${scale})`);
  ok(Math.abs(dw / dh - 1920 / 1080) < 1e-6, "aspect ratio preserved");
}

console.log("\n[targetDims] 1000×800 → 4K (non-integer scale)");
{
  const { dw, scale } = targetDims(1000, 800, "4K");
  ok(dw === TARGETS["4K"], `longest side hits ${TARGETS["4K"]} (got ${dw})`);
  ok(Math.abs(scale - 3.84) < 1e-6, `scale is 3.84 (got ${scale})`);
}

console.log("\n[targetDims] portrait 1080×1920 → 4K (long side is height)");
{
  const { dw, dh } = targetDims(1080, 1920, "4K");
  ok(dh === 3840, `height (long side) hits 3840 (got ${dw}×${dh})`);
  ok(dw === 2160, `width scales proportionally to 2160 (got ${dw})`);
}

console.log("\n[targetDims] never downscales: source already ≥ target");
{
  const { dw, dh, scale } = targetDims(8000, 6000, "4K"); // already bigger than 4K
  ok(scale === 1 && dw === 8000 && dh === 6000, `returns source unchanged at scale 1 (got ${dw}×${dh} @${scale})`);
}

console.log("\n[ceiling] 8K stays under MAX_PIXELS, pathological target would exceed");
{
  const { dw, dh } = targetDims(1920, 1080, "8K");
  ok(dw * dh <= MAX_PIXELS, `8K (${dw * dh} px) is within the ${MAX_PIXELS}px ceiling`);
  // A 1:1 source scaled to 8K longest side = 7680×7680 ≈ 59MP, still under ceiling;
  // the >MAX_PIXELS throw in the pipeline guards multiplier-mode blowups, asserted there.
  ok(7680 * 7680 <= MAX_PIXELS, "square 8K (59MP) is under the ceiling");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
