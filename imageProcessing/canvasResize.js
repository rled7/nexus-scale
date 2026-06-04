// GPU-accelerated, high-quality resize for LARGE targets (4K / 8K) where the
// pure-JS bicubic loops would freeze the main thread or run out of memory.
//
// Uses the browser's native high-quality sampler (drawImage + imageSmoothing
// quality "high"), applied in steps of at most 2x. Stepwise scaling gives far
// cleaner results than one giant jump, and the native sampler is GPU-backed so
// even 8K (33MP) stays responsive. Falls back to a plain <canvas> when
// OffscreenCanvas is unavailable.

function makeCanvas(w, h) {
  const c =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

// Resize a source canvas/bitmap to dw x dh. Returns a canvas at the target size.
export function canvasResize(srcCanvas, dw, dh) {
  let cur = srcCanvas, cw = srcCanvas.width, ch = srcCanvas.height;
  // Step toward the target: at most double (or halve) each pass for best quality.
  while (cw !== dw || ch !== dh) {
    const nw = dw > cw ? Math.min(dw, cw * 2) : Math.max(dw, Math.ceil(cw / 2));
    const nh = dh > ch ? Math.min(dh, ch * 2) : Math.max(dh, Math.ceil(ch / 2));
    const { c, ctx } = makeCanvas(nw, nh);
    ctx.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
    cur = c; cw = nw; ch = nh;
  }
  return cur;
}

// Convenience: take RGBA pixels in -> RGBA pixels out at dw x dh (so it drops
// straight into the existing pipeline, keeping denoise/contrast/sharpen after).
export function resizePixels(srcPx, sw, sh, dw, dh) {
  const src = makeCanvas(sw, sh);
  src.ctx.putImageData(new ImageData(new Uint8ClampedArray(srcPx), sw, sh), 0, 0);
  const big = canvasResize(src.c, dw, dh);
  return big.getContext("2d").getImageData(0, 0, dw, dh).data;
}

// Standard target resolutions (longest side, px). "up to 8K".
export const TARGETS = { "4K": 3840, "8K": 7680 };

// Given a source w/h and a target key, return the destination w/h that hits the
// target's longest side while preserving aspect ratio. Never downscales.
export function targetDims(sw, sh, targetKey) {
  const long = Math.max(sw, sh);
  const want = TARGETS[targetKey];
  if (!want || want <= long) return { dw: sw, dh: sh, scale: 1 };
  const scale = want / long;
  return { dw: Math.round(sw * scale), dh: Math.round(sh * scale), scale };
}

// Safety: 8K (33MP) is fine on desktop, heavy on mobile. ~67MP ceiling leaves
// room for 8K but still guards against pathological sizes / canvas-area limits.
export const MAX_PIXELS = 67_108_864; // 8192 * 8192
