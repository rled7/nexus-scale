import { clamp } from "./clamp.js";

export function bicubicW(t) { const a = -0.5, at = Math.abs(t); if (at < 1) return (a + 2) * at * at * at - (a + 3) * at * at + 1; if (at < 2) return a * at * at * at - 5 * a * at * at + 8 * a * at - 4 * a; return 0; }

// Optimized bicubic: the 4 cubic weights per axis depend only on the output
// column (x) / row (y), so we precompute the source indices + weights once per
// column and once per row, then the hot loop is pure multiply-accumulate with each
// tap weight (wx*wy) computed once and reused across all 4 channels. This replaces
// the previous version that recomputed all 16 weights per channel per pixel.
export function bicubic(src, sw, sh, dw, dh) {
  const dst = new Uint8ClampedArray(dw * dh * 4), xr = sw / dw, yr = sh / dh;

  // Per output column: 4 clamped source x-indices + 4 weights.
  const xIdx = new Int32Array(dw * 4), xW = new Float64Array(dw * 4);
  for (let x = 0; x < dw; x++) {
    const gx = x * xr, x0 = Math.floor(gx), fx = gx - x0, b = x * 4;
    for (let n = -1; n <= 2; n++) { xIdx[b + n + 1] = clamp(x0 + n, 0, sw - 1); xW[b + n + 1] = bicubicW(fx - n); }
  }
  // Per output row: 4 clamped source y-indices + 4 weights.
  const yIdx = new Int32Array(dh * 4), yW = new Float64Array(dh * 4);
  for (let y = 0; y < dh; y++) {
    const gy = y * yr, y0 = Math.floor(gy), fy = gy - y0, b = y * 4;
    for (let m = -1; m <= 2; m++) { yIdx[b + m + 1] = clamp(y0 + m, 0, sh - 1); yW[b + m + 1] = bicubicW(fy - m); }
  }

  for (let y = 0; y < dh; y++) {
    const yb = y * 4, di0 = y * dw * 4;
    for (let x = 0; x < dw; x++) {
      const xb = x * 4, di = di0 + x * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (let m = 0; m < 4; m++) {
        const row = yIdx[yb + m] * sw, wy = yW[yb + m];
        for (let n = 0; n < 4; n++) {
          const w = wy * xW[xb + n], si = (row + xIdx[xb + n]) * 4;
          r += src[si] * w; g += src[si + 1] * w; b += src[si + 2] * w; a += src[si + 3] * w;
        }
      }
      // Uint8ClampedArray clamps to 0..255; Math.round keeps round-half-up parity
      // with the previous clamp(Math.round(v)) behavior.
      dst[di] = Math.round(r); dst[di + 1] = Math.round(g); dst[di + 2] = Math.round(b); dst[di + 3] = Math.round(a);
    }
  }
  return dst;
}
