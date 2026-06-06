// pdfEnhancer.js
// SALVAGED 2026-06-04 from the stale `nexusscale-run` copy before it was deleted.
// Main-thread wrapper that offloads PDF page rendering + upscaling to a Web
// Worker (see pdfWorker.js) so the UI never freezes during heavy PDF work.
// NOTE: pdfWorker.js uses `pdfjs-dist` (installed) with the worker bundled
// locally (no CDN). Wire-up into the app's PDF branch is still pending; when
// wired, create the worker as { type: 'module' }. See PROJECT_TRACKER.md.

export function enhancePDF(fd, scale = 2) {
  return new Promise((resolve, reject) => {
    // { type: 'module' } is required — pdfWorker.js uses dynamic import().
    const worker = new Worker(new URL('./pdfWorker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      const { pages, originalPages, error } = e.data;
      if (error) {
        reject(new Error(error));
      } else {
        const pageUrls = pages.map(blob => URL.createObjectURL(blob));
        resolve({ pages: pageUrls, originalPages });
      }
      worker.terminate();
    };

    worker.onerror = (e) => {
      reject(new Error(`Worker error: ${e.message}`));
      worker.terminate();
    };

    worker.postMessage({ fd, scale });
  });
}
