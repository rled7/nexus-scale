export function nearestNeighbor(src, sw, sh, dw, dh) {
  const dst = new Uint8ClampedArray(dw * dh * 4), xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = Math.min(Math.floor(x * xr), sw - 1), sy = Math.min(Math.floor(y * yr), sh - 1);
    const si = (sy * sw + sx) * 4, di = (y * dw + x) * 4;
    dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
  }
  return dst;
}
