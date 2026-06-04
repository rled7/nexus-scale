import { clamp } from "./clamp.js";

export function enhanceContrast(data, w, h, factor) {
  const out = new Uint8ClampedArray(data), mid = 128;
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) out[i + c] = clamp(Math.round((data[i + c] - mid) * factor + mid), 0, 255);
  return out;
}
