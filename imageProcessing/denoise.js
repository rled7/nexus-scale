// Denoise = a box-mean blur blended 60/40 with the original (interior pixels only;
// edges within radius r keep their original value). The box mean is separable, so
// instead of summing the full (2r+1)² window per pixel (O(r²)), we run a horizontal
// running-sum pass then a vertical running-sum pass — O(1) per pixel regardless of r.
// Byte-identical to the previous direct implementation.
export function applyDenoise(data, w, h, str) {
  const out = new Uint8ClampedArray(data), r = Math.round(str * 2) + 1;
  if (w <= 2 * r || h <= 2 * r) return out; // window doesn't fit — nothing to blur
  const win = 2 * r + 1, area = win * win;

  // Horizontal pass: hsum[y][x][c] = Σ data[y][x-r..x+r][c], for interior columns.
  const hsum = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const rowBase = y * w;
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < win; k++) s += data[(rowBase + k) * 4 + c];
      hsum[(rowBase + r) * 3 + c] = s;
      for (let x = r + 1; x <= w - 1 - r; x++) {
        s += data[(rowBase + x + r) * 4 + c] - data[(rowBase + x - r - 1) * 4 + c];
        hsum[(rowBase + x) * 3 + c] = s;
      }
    }
  }

  // Vertical pass: Σ hsum[y-r..y+r][x][c] → full window sum; blend into interior.
  for (let x = r; x <= w - 1 - r; x++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < win; k++) s += hsum[(k * w + x) * 3 + c];
      let i = (r * w + x) * 4 + c;
      out[i] = Math.round(data[i] * 0.6 + (s / area) * 0.4);
      for (let y = r + 1; y <= h - 1 - r; y++) {
        s += hsum[((y + r) * w + x) * 3 + c] - hsum[((y - r - 1) * w + x) * 3 + c];
        i = (y * w + x) * 4 + c;
        out[i] = Math.round(data[i] * 0.6 + (s / area) * 0.4);
      }
    }
  }
  return out;
}
