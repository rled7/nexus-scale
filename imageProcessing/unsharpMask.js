// Unsharp mask via the fixed 3×3 kernel [-1 -1 -1; -1 9 -1; -1 -1 -1], i.e. the
// convolution sum is (9·center − Σ8 neighbors). Not separable, but we can drop the
// per-tap kernel lookup and index multiplications by precomputing the three row
// bases and the center index. Byte-identical to the previous implementation.
export function applyUnsharpMask(data, w, h, amt) {
  const out = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    const r0 = (y - 1) * w, r1 = y * w, r2 = (y + 1) * w;
    for (let x = 1; x < w - 1; x++) {
      const i0 = (r0 + x) * 4, i1 = (r1 + x) * 4, i2 = (r2 + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = data[i1 + c];
        const n = data[i0 - 4 + c] + data[i0 + c] + data[i0 + 4 + c]
                + data[i1 - 4 + c]                  + data[i1 + 4 + c]
                + data[i2 - 4 + c] + data[i2 + c] + data[i2 + 4 + c];
        const s = 9 * center - n; // == Σ data·kernel
        out[i1 + c] = Math.round(center + amt * (s - center));
      }
    }
  }
  return out;
}
