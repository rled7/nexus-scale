// imageWorker.js — runs the heavy image enhancement (JS resize kernels +
// denoise/contrast/sharpen convolutions) OFF the main thread so large jobs never
// freeze the UI. The actual math lives in the shared pure core (enhancePixels.js);
// this file is just the worker boundary. Created as { type: 'module' }.
import { runEnhancePixels } from "./imageProcessing/enhancePixels.js";

self.onmessage = (e) => {
  const params = e.data;
  try {
    const px = runEnhancePixels(params);
    // Transfer the result buffer back (zero-copy) — it's the big payload.
    self.postMessage({ px }, [px.buffer]);
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
