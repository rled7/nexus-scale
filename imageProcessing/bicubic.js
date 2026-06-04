import { clamp } from "./clamp.js";

export function bicubicW(t) { const a = -0.5, at = Math.abs(t); if (at < 1) return (a + 2) * at * at * at - (a + 3) * at * at + 1; if (at < 2) return a * at * at * at - 5 * a * at * at + 8 * a * at - 4 * a; return 0; }

export function bicubic(src, sw, sh, dw, dh) {
  const dst = new Uint8ClampedArray(dw * dh * 4), xr = sw / dw, yr = sh / dh;
  const px = (x, y, c) => src[(clamp(y, 0, sh - 1) * sw + clamp(x, 0, sw - 1)) * 4 + c];
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const gx = x * xr, gy = y * yr, x0 = Math.floor(gx), y0 = Math.floor(gy), di = (y * dw + x) * 4;
    for (let c = 0; c < 4; c++) { let v = 0; for (let m = -1; m <= 2; m++) for (let n = -1; n <= 2; n++) v += px(x0 + n, y0 + m, c) * bicubicW(gx - x0 - n) * bicubicW(gy - y0 - m); dst[di + c] = clamp(Math.round(v), 0, 255); }
  }
  return dst;
}
