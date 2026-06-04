export const GUIDANCE_MAP = {
  portrait:  ["Face-aware sharpening to recover fine detail","Luminance denoising preserves skin tones","Bicubic interpolation best for portraits"],
  landscape: ["Edge-preserving upscaling retains horizon detail","CLAHE contrast recovers sky gradient","Denoise shadows before upscaling"],
  document:  ["High-contrast sharpening restores text edge clarity","Adaptive thresholding improves OCR readability","Deskew before upscaling for cleanest result"],
  artwork:   ["Detail-preserving upscale avoids color bleeding","Gentle denoise preserves brush strokes","Bicubic sharpen recovers fine line work"],
  technical: ["Edge-only sharpening preserves line precision","Lossless PNG output required","Threshold filter recovers faded dimension lines"],
  medical:   ["Contrast-limited adaptive histogram for imaging","Lossless upscaling mandatory","Denoise with structure preservation"],
  satellite: ["Pan-sharpening merges resolution channels","Bicubic 4x recommended","Color normalization before upscale"],
  other:     ["Bicubic interpolation for general upscaling","Unsharp mask recovers edge clarity","Denoise before upscale"],
};
