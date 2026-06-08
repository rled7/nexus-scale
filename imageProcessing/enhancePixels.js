// Shared, pure enhancement core: resize (chosen kernel) → denoise → contrast →
// sharpen, in that order. Operates on a Uint8ClampedArray and returns a new one.
// Extracted so the SAME logic runs either off the main thread (imageWorker.js)
// or inline as a fallback — guaranteeing identical output. Pure → node-testable.
import { nearestNeighbor } from "./nearestNeighbor.js";
import { bilinear } from "./bilinear.js";
import { bicubic } from "./bicubic.js";
import { applyDenoise } from "./denoise.js";
import { enhanceContrast } from "./enhanceContrast.js";
import { applyUnsharpMask } from "./unsharpMask.js";

// params: { srcPx, sw, sh, dw, dh, algo, denoise, contrast, sharpen }
export function runEnhancePixels({ srcPx, sw, sh, dw, dh, algo, denoise = 0, contrast = 1.0, sharpen = 0 }) {
  let px = algo === "nearest" ? nearestNeighbor(srcPx, sw, sh, dw, dh)
         : algo === "bilinear" ? bilinear(srcPx, sw, sh, dw, dh)
         : bicubic(srcPx, sw, sh, dw, dh);
  if (denoise > 0)     px = applyDenoise(px, dw, dh, denoise);
  if (contrast !== 1.0) px = enhanceContrast(px, dw, dh, contrast);
  if (sharpen > 0)     px = applyUnsharpMask(px, dw, dh, sharpen);
  return px;
}
