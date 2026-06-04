// pdfWorker.js
// SALVAGED 2026-06-04 from the stale `nexusscale-run` copy before it was deleted.
// Runs OFF the main thread (Web Worker): renders each PDF page with pdf.js at a
// scale factor onto an OffscreenCanvas, sharpens via a 3x3 convolution, and
// returns PNG blobs. This is the real PDF-upscaling path the current app lacks
// (its PDF branch only repackages the file). Also the OffscreenCanvas+Worker
// pattern recommended for 8K image upscaling.
// DEPENDENCIES (pending): `pdfjs-dist`; currently fetches the pdf.js worker from
// unpkg (external CDN) — consider bundling locally. See PROJECT_TRACKER.md.

self.onmessage = async (e) => {
  const { fd, scale } = e.data;

  if (!fd) {
    return;
  }

  try {
    const fileBlob = new Blob([fd], { type: 'application/pdf' });
    const pdfData = new Uint8Array(await fileBlob.arrayBuffer());

    // Dynamically import pdfjs-dist
    const pdfjs = await import('pdfjs-dist');

    // Fetch the worker script and create a Blob URL
    const workerSrcResponse = await fetch('https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.js');
    const workerSrcBlob = await workerSrcResponse.blob();
    const workerSrc = URL.createObjectURL(workerSrcBlob);
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

    const pdf = await pdfjs.getDocument(pdfData).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Simple and fast sharpening using a convolution kernel
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const sharpened = applyConvolution(imageData, [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
      ]);
      ctx.putImageData(sharpened, 0, 0);

      const blob = await canvas.convertToBlob({ type: 'image/png' });
      pages.push(blob);
    }

    self.postMessage({ pages, originalPages: pdf.numPages });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

function applyConvolution(imageData, kernel) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const dst = new Uint8ClampedArray(data.length);
  const kernelSize = Math.sqrt(kernel.length);
  const halfKernel = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = 0, g = 0, b = 0;

      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const sy = y + ky - halfKernel;
          const sx = x + kx - halfKernel;

          if (sy >= 0 && sy < height && sx >= 0 && sx < width) {
            const si = (sy * width + sx) * 4;
            const kv = kernel[ky * kernelSize + kx];
            r += src[si] * kv;
            g += src[si + 1] * kv;
            b += src[si + 2] * kv;
          }
        }
      }

      dst[i] = Math.max(0, Math.min(255, r));
      dst[i + 1] = Math.max(0, Math.min(255, g));
      dst[i + 2] = Math.max(0, Math.min(255, b));
      dst[i + 3] = src[i + 3]; // Keep alpha channel
    }
  }

  return new ImageData(dst, width, height);
}
