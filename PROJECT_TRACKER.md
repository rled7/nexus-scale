# NexusScale — Project Tracker

> Forward-looking companion to `README.md` (what it is / how to run) and
> `buildHistory.js` (the in-app, per-build changelog). This file tracks **origin,
> change history, current state, and where the project is headed.**
> Last updated: **2026-06-04**.

---

## 1. What this project is
A browser-based image & PDF **upscaler / enhancer**. Drop in a low-res image (or
PDF), pick a scale, run a multi-stage pipeline (ingest → scan → analysis → recon
→ enhance → report), and get an upscaled output with a before/after slider and an
"intel report." Stack: **React 19 + Vite**, pure-JS image math, no backend.

## 2. Origin & how it was built
- **Created late March 2026.** Initial release `v4.7.1` (build 001) on 2026-03-29.
- Developed iteratively through **40 documented builds** (`v4.7.1` → `v4.12.1`),
  recorded in `buildHistory.js` — each with its bugs and fixes. Highlights:
  - 001–010: core pipeline, download fixes, in-app changelog, **fully local**
    PDF analyzer + web-recon (removed all network dependence), 16MP canvas guard.
  - 011–012: crash fixes (TDZ, infinite re-render from `Math.random()` in JSX).
  - 013–014: Express/Morgan server logging + browser-side ring-buffer logger.
  - 015–038: a 24-iteration **benchmark-hardening pass** (constant hoisting, GC
    pressure, blob-ownership, timeouts, guards).
  - 039: an automated hoist script **corrupted** the neural-analysis block →
  - 040 (`v4.12.1`, "CLEAN REBUILD — ALL GREEN"): authoritative full rewrite,
    current shipping build.
- **2026-06-02:** a Cursor session (~$200 of agent spend) added ~141 lines to the
  image pipeline (`NexusScale.jsx`, `LearningEngine.js`, `imageProcessing/*`,
  `constants/*`). Those changes are committed in the local "first commit".
- **2026-06-03:** `git init` + single local commit `cbe2b35 "first commit"`.

## 3. Change history — 2026-06-04 session (this tracker's creation)
- ✅ **Verified the upscaler actually works.** Added `test/upscale.test.mjs`
  (headless, 14/14 pass): all three algorithms produce correct dimensions,
  preserve alpha + gradient, and bilinear/bicubic do true resampling.
- ✅ **Added `imageProcessing/canvasResize.js`** — GPU-accelerated, stepped
  high-quality resize + `targetDims`/`TARGETS` (4K/8K) + a 67MP `MAX_PIXELS`
  ceiling. (Engine for the planned 8K option; not yet wired into the UI.)
- ✅ **Salvaged `pdfEnhancer.js` + `pdfWorker.js`** from the now-deleted
  `nexusscale-run` copy (see §5).
- ✅ **Consolidated duplicate copies.** Confirmed `~/Downloads/nexusscale` and
  `~/Documents/PROJECTS/nexusscale-run` shared files were **byte-identical** to
  this project; deleted both after salvaging the two unique PDF files above.
- ✅ Wrote this `PROJECT_TRACKER.md`.

## 4. Current state
- Image upscaling: **working** (nearest / bilinear / bicubic, 2×/3×/4×), with
  denoise / contrast / sharpen passes. Hard cap 16MP.
- PDF path: currently **repackages** the file (no real page upscaling) — the
  salvaged worker (§5) is the path to fix that.
- Local repo, single commit, **no remote pushed yet** (GitHub `rled7/nexus-scale`
  exists with its own initial commit; push needs history reconcile + dropping the
  committed `node_modules`).
- "AI (API KEY)" analysis mode does a browser `fetch` to `api.anthropic.com` —
  **cannot work from a browser** (CORS / key exposure). `offlineMode` defaults
  true, so it's not the default path. Flagged for removal.

## 5. Salvaged / pending integration
- `pdfEnhancer.js` + `pdfWorker.js` — real PDF upscaling off the main thread
  (pdf.js render → OffscreenCanvas scale → sharpen → PNG blobs). **Pending:** add
  `pdfjs-dist` to deps; bundle the pdf.js worker locally instead of the unpkg CDN
  fetch; wire `enhancePDF()` into the PDF branch of the enhance stage.

## 6. Where it's headed (roadmap)
- [x] **8K / 4K upscaling** (2026-06-05) — added a RESOLUTION TARGET row (4K/8K)
      beside the 2×/3×/4× multipliers; target mode computes dims via
      `targetDims`, routes >16MP through the GPU stepped sampler (`resizePixels`),
      raised the cap from 16MP to `MAX_PIXELS` (67MP), auto-skips JS denoise/sharpen
      above 16MP (no-freeze guard), benchmark-safe `target` precedence. Tests:
      `test/targetDims.test.mjs` 10/10 + regression 14/14, build green. ⚠️ Needs a
      MANUAL browser check (8K actually emerges, UI stays responsive).
- [x] **No-freeze image pipeline** (2026-06-08, commit `416a0c4`) — the ≤16MP image
      path now runs resize + denoise/contrast/sharpen in a Web Worker (`imageWorker.js`)
      so the main thread never freezes. Shared PURE core `enhancePixels.js` used by
      both the worker AND an inline fallback (identical output; never breaks if Worker
      is unavailable). `test/enhancePixels.test.mjs` proves no-filter output is
      byte-identical to bicubic alone (behavior-preserving). ⚠️ off-thread behavior
      only confirms in-browser.
- [x] **Real PDF upscaling — page-1 v1** (2026-06-05, commit `fa68a75`) — wired the
      worker into the enhance branch: decode `fd.b64`→Uint8Array (fixed the
      `new Blob([fd])` object bug), `{type:'module'}` worker, `vite worker.format:'es'`
      so the code-splitting worker bundles. ⚠️ UNVERIFIED in-browser (pdf.js renders
      in-browser only).
- [x] **Multi-page PDF export — option B** (2026-06-08, commit `c17e60b`) — keeps all
      upscaled pages; preview pager (◀ n/m ▶), per-page PNG download, and ALL-PAGES
      ZIP via dependency-free `pdfZip.js` (STORE + CRC32). `test/pdfZip.test.mjs`
      builds a real archive that the SYSTEM `unzip -t` accepts. ⚠️ in-browser pass pending.
- [x] **Completely offline** (2026-06-05, commit `6776432`) — dropped the Google
      Fonts CDN `@import` (the only live network dependency; CSP already blocked it).
      Zero network surface now; renders on local font fallbacks, no visual change.
- [x] **Removed the "AI (API KEY)" browser-fetch mode** (2026-06-04) — analysis
      is now 100% local; eliminated the client-side API-key exposure risk.
- [x] **Bundled pdf.js locally** (2026-06-04) — added `pdfjs-dist`, dropped the
      unpkg CDN fetch in `pdfWorker.js` (supply-chain risk removed).
- [x] **Ship to GitHub** (2026-06-04) — `.gitignore` node_modules/dist, `git rm
      -r --cached node_modules`, added remote, reconciled + pushed to
      `rled7/nexus-scale` (clean single-history, up to commit `eb96358`).
- [x] **Display fonts bundled offline** (2026-06-08, commit `4008f62`) — Share Tech
      Mono + Orbitron (400/700/900) via `@fontsource` packages imported in `main.jsx`;
      Vite emits the woff2 as local assets. Exact look restored, zero runtime network.
- [ ] (stretch) **WebAssembly hot path** — port the bicubic/convolution kernels
      to C/Rust → Wasm for a big speedup on large images (see notes).

## 7. Status (2026-06-08): feature-complete pending browser verification
All requested + roadmap features (8K/4K, PDF upscaler + multi-page ZIP, fully-offline,
no-freeze worker, local fonts) are wired, built green, and unit-tested. The ONLY gate
to "done" is a manual browser pass — image/PDF rendering only truly exercises in a
browser. **Browser-check list (ordered by risk):**
1. **PDF render (highest risk — salvaged pdf.js v6 worker):** load a multi-page PDF →
   run → confirm pages render visibly upscaled. If this works, the PDF feature is live.
2. **Multi-page controls:** the **pager** (◀ n/m ▶) cycles pages; **THIS PAGE (PNG)**
   and **ALL PAGES (ZIP)** both download — open the ZIP to confirm it's valid.
3. **8K image:** big image → **8K** → emerges at size, file named `nexusscale_8K_*`.
4. **Offline:** DevTools Network shows zero external requests.

Note: "no-freeze" moved the convolutions off-thread, but `getImageData`/`toDataURL`
on up-to-16MP still run on main — a brief hitch while PNG-encoding a big result is the
ENCODE, not a worker failure. Remaining after the pass = WASM stretch only.
