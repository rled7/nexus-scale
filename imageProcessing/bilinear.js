export function bilinear(src, sw, sh, dw, dh) {
  const dst = new Uint8ClampedArray(dw * dh * 4), xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const gx = x * xr, gy = y * yr, x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1), fx = gx - x0, fy = gy - y0, di = (y * dw + x) * 4;
    for (let c = 0; c < 4; c++) {
      const tl = src[(y0 * sw + x0) * 4 + c], tr = src[(y0 * sw + x1) * 4 + c];
      const bl = src[(y1 * sw + x0) * 4 + c], br = src[(y1 * sw + x1) * 4 + c];
      dst[di + c] = Math.round(tl * (1 - fx) * (1 - fy) + tr * fx * (1 - fy) + bl * (1 - fx) * fy + br * fx * fy);
    }
  }
  return dst;
}
