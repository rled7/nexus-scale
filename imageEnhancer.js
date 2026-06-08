// imageEnhancer.js — main-thread wrapper that runs image enhancement in a Web
// Worker (imageWorker.js) so the UI stays responsive on large images. Mirrors the
// pdfEnhancer pattern. The caller provides an inline fallback for environments
// without Worker support (or on worker failure), so enhancement never breaks.
export function enhanceImage(params) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") { reject(new Error("Worker unavailable")); return; }
    // { type: 'module' } — imageWorker.js uses ES import.
    const worker = new Worker(new URL("./imageWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { px, error } = e.data;
      if (error) reject(new Error(error));
      else resolve(px);
      worker.terminate();
    };
    worker.onerror = (e) => { reject(new Error(`Worker error: ${e.message}`)); worker.terminate(); };
    // srcPx is cloned (not transferred) so the caller's pixels stay valid on failure.
    worker.postMessage(params);
  });
}
