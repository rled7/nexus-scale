import { clamp } from "./clamp.js";

export function applyUnsharpMask(data, w, h, amt) {
  const out = new Uint8ClampedArray(data), k = [-1, -1, -1, -1, 9, -1, -1, -1, -1];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) { let s = 0; for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) s += data[((y + ky) * w + (x + kx)) * 4 + c] * k[(ky + 1) * 3 + (kx + 1)]; out[i + c] = clamp(Math.round(data[i + c] + amt * (s - data[i + c])), 0, 255); }
  }
  return out;
}
