# PDF Upscaler — Queued Task Spec

> Queued 2026-06-05. THE headline feature ("legitimately the entire point of the
> app" — user). Worker code is intact; this is an INTEGRATION + one UX decision.
> Execute next session: Opus supervises, Sonnet may implement from this spec.

## Goal
Make the PDF branch of the enhance pipeline actually upscale the PDF (render each
page at the chosen scale with pdf.js, sharpen, return PNG(s)) instead of just
repackaging the original blob (`NexusScale.jsx` ~line 407: `resultUrl=fd.url`).

## What already exists (verified 2026-06-05, both files intact)
- `pdfEnhancer.js` — main-thread wrapper `enhancePDF(fd, scale) → Promise<{pages:[url], originalPages}>`.
  Spawns `pdfWorker.js`, maps page blobs to object URLs.
- `pdfWorker.js` — renders each page at `viewport({scale})` onto OffscreenCanvas,
  sharpens via 3×3 convolution, returns PNG blobs. Uses locally-bundled `pdfjs-dist`.
- `pdfjs-dist` installed; pdf.js worker bundled locally (no CDN) — CSP-friendly.

## Bugs to fix (found by reading the salvaged code)
1. **`fd`→bytes mismatch (must fix or nothing works).** `enhancePDF(fd,...)` passes
   the whole `fileData` object; worker does `new Blob([fd])` → `"[object Object]"`,
   not the PDF. fileData for PDFs = `{url(blob), canvas:null, w:null, b64, name,
   size, type, isPdf}`. Fix: pass real bytes. Cleanest = decode `fd.b64` →
   `Uint8Array` and post THAT (transferable), or `await fetch(fd.url).arrayBuffer()`.
2. **Worker module type.** `new Worker(new URL('./pdfWorker.js', import.meta.url))`
   must be `{ type: 'module' }` (worker uses dynamic `import`). Add it in `enhancePDF`.
3. **CSP `worker-src`.** Confirm the security-pass CSP allows `worker-src 'self' blob:`
   (worker + pdf.js sub-worker + page blobs). Adjust `index.html`/headers if it blocks.

## OPEN DECISION (needs user — do NOT guess)
PDFs are multi-page; the app's result model is a single `{url,w,h}` and the
compare/download UI shows one image. Options:
- **(A) Page 1 only** for v1 — smallest change, proves the path, ships fastest.
- **(B) All pages** — preview page 1, download = ZIP of all pages (adds a zip dep
  + gallery/pager UI). Closer to "real" but more work.
- **(C) All pages, multi-download** — loop downloads, no zip dep, clunkier UX.
Recommend (A) for the demo, then (B). CONFIRM before coding.

## Wiring sketch (after the decision)
In the enhance stage PDF branch (`else` after the `if(fd.canvas&&fd.w)` block):
- Replace `resultUrl=fd.url` with: decode bytes → `await enhancePDF(bytes, sc)` →
  set `resultUrl` to page-1 url (option A) or build the gallery/zip (option B).
- Use the multiplier `sc` (PDFs have no `fd.w`, so the 4K/8K image targets don't
  apply — pdf.js scale factor is the knob). Add a log line + handle worker reject.
- Update the result label/pill for PDFs ("PDF ×N · HQ").

## Verification (be honest about the gap)
- `npm run build` green (sandbox: `dangerouslyDisableSandbox:true`).
- Worker logic has no headless test path (needs DOM/pdf.js) → **MANUAL browser
  check is mandatory**: load a real PDF, pick a scale, confirm pages come out
  visibly upscaled + sharper and the UI doesn't freeze. A green build alone does
  NOT prove this works.

## Related / do-not-conflate
- This shares the OffscreenCanvas+Worker pattern with the still-open image
  "No-freeze pipeline" roadmap item — but they are SEPARATE tasks.
- User also asked for a "completely offline version" — audit remaining network
  surface (`agents/AgentOrchestrator.js`, any fetches) separately.
