export function applyDenoise(data, w, h, str) {
  const out = new Uint8ClampedArray(data), r = Math.round(str * 2) + 1;
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) { let sum = 0, cnt = 0; for (let ky = -r; ky <= r; ky++) for (let kx = -r; kx <= r; kx++) { sum += data[((y + ky) * w + (x + kx)) * 4 + c]; cnt++; } out[i + c] = Math.round(data[i + c] * 0.6 + (sum / cnt) * 0.4); }
  }
  return out;
}
