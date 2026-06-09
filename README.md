# NexusScale

A **100% local, offline** browser tool for upscaling and enhancing images and PDFs.
Drop in a low-quality image or PDF, run the pipeline, and get an upscaled/enhanced
result with an analysis report — all computed in the browser, with **zero network
requests**. React + Vite.

> **Privacy by design:** there is no backend and no external API. Earlier builds sent
> images to a vision API from the browser; that was removed (it exposed the API key
> and required network). All analysis is now local. See [Security & Offline](#security--offline).

---

## Table of Contents
- [What It Does](#what-it-does)
- [Features](#features)
- [Pipeline Stages](#pipeline-stages)
- [Performance](#performance)
- [Security & Offline](#security--offline)
- [Caching Suite (reusable)](#caching-suite-reusable)
- [File Structure](#file-structure)
- [How to Run](#how-to-run)
- [Testing](#testing)

---

## What It Does

NexusScale accepts an image (PNG, JPG, WEBP, GIF) or a PDF and runs it through a
six-stage pipeline: **ingest → deep scan → local analysis → recon → enhancement →
report**. The result is a before/after comparison slider for images, an upscaled
page view (with a pager + ZIP export) for PDFs, plus an intelligence report and a
live terminal log.

---

## Features

### Image upscaling
- **Interpolation modes:** Nearest, Bilinear, Bicubic.
- **Scale factors:** 2× / 3× / 4×, **plus 4K / 8K resolution targets** (`RESOLUTION
  TARGET` row). Target mode computes exact dimensions preserving aspect ratio and
  never downscales.
- **Large-image path:** outputs above 16 MP route through a GPU-backed stepped canvas
  sampler (`canvasResize`) instead of the JS kernels, with the ceiling raised to
  **67 MP (8192²)**.
- **No-freeze pipeline:** the ≤16 MP resize + denoise/contrast/sharpen run in a **Web
  Worker** so the UI never freezes, with an identical inline fallback if Workers are
  unavailable.
- **Result cache:** re-running the same image with the same settings is instant (see
  [Performance](#performance)).

### PDF upscaling (the core purpose)
- Renders **every page** with pdf.js at the chosen scale off the main thread
  (`pdfWorker.js`), sharpens, and returns PNGs.
- Preview **pager** (◀ n/m ▶) to view each upscaled page.
- Download **a single page (PNG)** or **all pages (ZIP)** — the ZIP is built by a
  tiny dependency-free writer (`pdfZip.js`), so no extra dependency and fully offline.

### Analysis & UX
- **Local image analysis** (brightness/channel/quality heuristics) and **local PDF
  classification** (filename token matching → 15 document types) — no network.
- **Comparison slider**, **intelligence report**, **build changelog tab**, and a
  color-coded **terminal log**.
- **Benchmark suite** (`⚙ RUN BENCHMARK SUITE`) timing the pipeline on synthetic files.

---

## Pipeline Stages

| Stage | ID | What happens |
|---|---|---|
| File Ingest | `ingest` | Blob URL + DataURL read; images drawn to an offscreen canvas for raw pixels |
| Deep Scan | `scan` | Samples pixels for luminance/channel balance; flags under/over-exposure + low res |
| Analysis | `neural` | **Local** image heuristics / PDF token classifier (no API) |
| Recon | `recon` | Local category → reference-source + guidance lookup |
| Enhancement | `enhance` | Images: resize (cached, worker/GPU per size) → denoise → contrast → sharpen. **PDFs: real per-page pdf.js upscaling** |
| Report Gen | `report` | Commits result + report, logs the complete banner |

---

## Performance

All numbers are node-measured; kernel outputs are verified **byte-identical** and
locked by a golden-hash test.

- **Cache (repeat ops):** `npm run bench` — re-running identical file+settings is a
  cache hit: **~67,000× faster** (3230 ms → 0.05 ms).
- **Cold path (first-time ops), profiled then optimized:**
  - **bicubic** — precompute per-row/col weights instead of recomputing 16 weights
    per channel per pixel: **6.1×**.
  - **denoise** — box blur O(r²) → O(1) separable running-sum: **2.3–4.2×** (now flat
    regardless of strength).
  - **unsharp** — precompute row bases + inline the 3×3 kernel: **~3.8×**.
  - **Cumulative:** the full 256→1024 enhance chain went **3230 ms → 457 ms (7.1×)**.

---

## Security & Offline

- **No network at runtime.** No backend, no external API, no CDN. Verify in DevTools:
  the Network tab shows zero external requests.
- **Hardened CSP** in `index.html`: `default-src 'self'`, `connect-src 'self'`,
  `worker-src 'self' blob:`, `img-src 'self' data: blob:`, `object-src 'none'`.
- **pdf.js bundled locally** via `pdfjs-dist` (no CDN worker fetch).
- **Display fonts bundled locally** via `@fontsource` (no Google Fonts CDN).

---

## Caching Suite (reusable)

`cache/` is a standalone, dependency-free caching library you can drop into any
browser/Node app (see `cache/README.md`):

- **`LRUCache`** — LRU eviction, optional TTL + byte-budgeting, hit/miss stats.
- **`memoizeAsync`** — caches async results **and coalesces concurrent identical
  calls** (in-flight dedup); rejections are not cached.
- **`keyOf` / `cyrb53`** — fast, stable, field-order-independent cache keys.

NexusScale uses it to cache enhanced image results keyed by a file fingerprint + the
enhancement params.

---

## File Structure

```
nexus-scale/
├── NexusScale.jsx           Main component — state, pipeline, JSX
├── src/{main,App}.jsx       Vite entry → renders NexusScale; imports local fonts
├── index.html               Hardened CSP
├── vite.config.js           worker.format:'es' (code-splitting workers)
├── buildHistory.js, BrowserLogger.js, fileUtils.js, styles.js, offlineAnalysis.js
├── pdfEnhancer.js / pdfWorker.js   Off-thread per-page PDF upscaling (pdf.js)
├── pdfZip.js                Dependency-free STORE-method ZIP writer (+ CRC32)
├── imageEnhancer.js / imageWorker.js   Off-thread image enhancement (no-freeze)
├── cache/                   Reusable caching suite (LRUCache, memoizeAsync, hashKey)
├── constants/               fmt, delay, schemas, docTypes, maps, stages, benchmarks
├── imageProcessing/
│   ├── nearestNeighbor / bilinear / bicubic   Resize kernels (bicubic optimized)
│   ├── canvasResize.js      GPU stepped sampler + targetDims (4K/8K) + MAX_PIXELS
│   ├── enhancePixels.js     Shared pure resize+filter core (worker + fallback)
│   ├── denoise / enhanceContrast / unsharpMask   Filters (denoise/unsharp optimized)
│   └── qualityMetrics.js, clamp.js
└── test/                    7 suites (73 checks) + cache.bench.mjs
```

---

## How to Run

This is a full Vite app.

```bash
npm install
npm run dev      # dev server (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # serve the production build
```

To serve the built output as a static offline site (e.g. Cloudflare Pages):
`npx wrangler pages dev dist`.

---

## Testing

```bash
npm test         # runs all suites via test/run-all.mjs (73 checks, 7 files)
npm run bench    # cache performance benchmark (real enhance workload)
```

Suites: `upscale`, `targetDims`, `enhancePixels`, `pdfZip` (verified against the
system `unzip`), `cache`, `edge`, and `kernels-golden` (locks every kernel's output
to a recorded hash so refactors can't silently change results).

> **Note:** the unit suite verifies the pure logic (math, ZIP bytes, cache behavior).
> Browser-only behavior — pdf.js rendering, the canvas/worker paths, the 8K canvas —
> requires a manual in-browser pass. See `PROJECT_TRACKER.md §7`.
