# NexusScale

A browser-based image and PDF enhancement tool powered by Claude's vision API. Drop in a low-quality image or PDF, run the pipeline, and receive an upscaled/enhanced output alongside an AI-generated intelligence report covering quality analysis, content identification, and enhancement guidance.

---

## Table of Contents

- [What It Does](#what-it-does)
- [MVP](#mvp)
- [Additions Beyond MVP](#additions-beyond-mvp)
- [Pipeline Stages](#pipeline-stages)
- [File Structure](#file-structure)
- [Module Breakdown](#module-breakdown)
- [How to Run](#how-to-run)
- [API Key Setup](#api-key-setup)
- [Build History](#build-history)

---

## What It Does

NexusScale accepts an image (PNG, JPG, WEBP, GIF) or a PDF file and runs it through a six-stage processing pipeline:

1. **Ingest** — reads and parses the file, extracts metadata
2. **Deep Scan** — samples pixel data to measure brightness, channel balance, and resolution quality
3. **Neural Analysis** — sends the image to Claude for vision-based forensic analysis, or runs a local keyword-based analyzer for PDFs
4. **Web Recon** — matches the file category against a local database index to surface relevant reference sources and enhancement guidance
5. **Enhancement** — upscales images using the chosen interpolation algorithm, then applies denoise, contrast, and sharpening passes
6. **Report Gen** — assembles and displays a structured intelligence report

The result is a side-by-side before/after comparison slider for images, or a download prompt for PDFs, along with a full Intel Report, source database matches, a system terminal log, and a build changelog.

---

## MVP

The minimum viable product delivers the following:

- **File input** — drag-and-drop or click-to-browse for images and PDFs (PDF max 18 MB)
- **Image upscaling** — three interpolation modes: Nearest Neighbor, Bilinear, Bicubic; scale factors 2×, 3×, 4×
- **Image enhancement** — configurable sharpen (unsharp mask), denoise (box blur blend), and contrast (linear stretch) applied after upscaling
- **Claude vision analysis** — base64 image sent to `claude-sonnet-4-20250514` for JSON-structured forensic output covering quality score, artifacts, blur, noise, color analysis, and enhancement priority
- **Local PDF analysis** — zero-network PDF intelligence using filename token matching against 15 document type categories with estimated page count and DPI
- **Web recon (local)** — category-aware database matching from a curated map of 11 image/document categories, each mapped to 3–5 authoritative reference sources
- **Intelligence report** — structured display of all analysis fields: subject, category, quality score, compression/blur/noise levels, color analysis, enhancement priority, quality issues, content gaps, observations, reconstruction notes, enhancement guidance
- **Download** — exports the enhanced image as PNG or the original PDF blob; returns a boolean success/failure
- **System terminal** — real-time timestamped log of all pipeline events, color-coded by type (ok / warn / error / data / sys / info)
- **Error handling** — pipeline errors surface in a dedicated error box; `BrowserLogger` persists error/warn entries to sessionStorage

---

## Additions Beyond MVP

### Benchmark Suite
A built-in end-to-end test runner (`⚙ RUN BENCHMARK SUITE`) that executes 4 automated tests against synthetic files:
- Small PNG through Nearest Neighbor 2× — verifies image pipeline
- Small PNG through Bicubic 2× — verifies bicubic interpolation path
- Standard PDF (400 KB) — verifies local PDF analyzer and download
- Oversized PDF (20 MB) — verifies that the 18 MB guard correctly rejects the file

Each test measures wall-clock time, verifies the download URL without triggering a file-save popup, and reports pass/fail with notes. Results update incrementally during the run. A `try/finally` block guarantees `setIsBenchmarking(false)` even on unexpected throws.

### BrowserLogger
A sessionStorage-backed ring buffer (`max 50 entries`) that persists only `error` and `warn` level events across page navigations. Includes an `⬇ EXPORT ERROR LOGS` button that downloads the buffer as a formatted JSON file for debugging.

### Build Changelog Tab
A full audit trail of all 40 builds rendered in the UI under the `▣ CHANGELOG` tab, showing each build's version, label, known bugs at time of release, and fixes applied. The current build is highlighted. Entries are shown newest-first.

### Comparison Slider
For image results, a drag-to-compare slider overlays the original on top of the enhanced output. The divider position is controlled by mouse or touch, and the handle snaps cleanly to 0–100% of the container width.

### Pipeline Cancellation Safety
All async pipeline stages check `pipelineActive.current` before continuing. The lock is set only after all early-return guards pass, preventing orphaned locks on null file data. A `useEffect` cleanup sets `pipelineActive.current = false` on component unmount.

### API Timeout
`callClaude` wraps the fetch in an `AbortController` with a 30-second timeout. `loadFileAsync` (used by the benchmark) wraps `FileReader` in a `Promise.race` with a 5-second timeout to prevent hangs on stalled reads.

### PDF Blob Ownership Contract
The benchmark only revokes `fd.url` when `r.url !== fd.url`. For PDFs, `result.url` is set to `fd.url` directly (no new blob is created), so the benchmark will not revoke the URL that the user's download button still points to.

---

## Pipeline Stages

| Stage | ID | What happens |
|---|---|---|
| File Ingest | `ingest` | Creates a blob URL, reads file as DataURL via FileReader, draws images to an offscreen canvas to capture raw pixel data |
| Deep Scan | `scan` | Samples up to 5,000 pixels, computes average luminance and RGB channel averages, flags underexposure (<60), overexposure (>200), and low resolution (<500K px) |
| Neural Analysis | `neural` | Images → Claude vision API with a strict JSON schema prompt. PDFs → local token-based document classifier. Unknown types → Claude text prompt with file metadata |
| Web Recon | `recon` | Looks up `DB_MAP` and `GUIDANCE_MAP` by the category returned from neural analysis, generates 5 simulated recon findings with Google Scholar query links |
| Enhancement | `enhance` | Runs the chosen interpolation algorithm on raw canvas pixel data, then applies denoise → contrast → sharpen in sequence. PDFs skip pixel processing and pass through their blob URL |
| Report Gen | `report` | Commits `result` and `aiReport` to state, logs the pipeline complete banner |

---

## File Structure

```
nexusscale/
├── NexusScale.jsx              Main React component — all state, hooks, pipeline logic, and JSX
├── buildHistory.js             BUILD_HISTORY array (40 entries) and CURRENT_BUILD pointer
├── BrowserLogger.js            SessionStorage ring-buffer error logger with export
├── fileUtils.js                dataURLtoBlob — converts a data: URI to a Blob for download
├── styles.js                   CSS string (injected via <style>) and S inline-styles object
├── constants/
│   ├── index.js                Re-exports all constants for single-import convenience
│   ├── fmt.js                  fmt(bytes) — human-readable file size formatter
│   ├── delay.js                delay(ms) — Promise-based setTimeout wrapper
│   ├── jsonSchema.js           JSON_SCHEMA (Claude prompt schema) and FALLBACK_ANALYSIS
│   ├── docTypes.js             DOC_TYPES — 15 document type keyword/category definitions
│   ├── dbMap.js                DB_MAP — category → reference database name array
│   ├── guidanceMap.js          GUIDANCE_MAP — category → enhancement tip array
│   ├── stages.js               STAGES — pipeline stage id/icon/label/desc config
│   └── benchmarkTests.js       BENCHMARK_TESTS definitions and EMPTY_DOT_OPACITIES
└── imageProcessing/
    ├── index.js                Re-exports all image processing functions
    ├── clamp.js                clamp(v, min, max)
    ├── nearestNeighbor.js      Nearest-neighbor upscaling — fastest, pixelated output
    ├── bilinear.js             Bilinear interpolation — smooth, moderate quality
    ├── bicubic.js              Bicubic interpolation (bicubicW kernel + bicubic) — highest quality
    ├── unsharpMask.js          Unsharp mask sharpening with 3×3 convolution kernel
    ├── denoise.js              Box-blur denoise blended 60/40 with original
    └── enhanceContrast.js      Linear contrast stretch around mid-point 128
```

---

## Module Breakdown

### `NexusScale.jsx`
The single exported React component. Owns all state: `fileData`, enhancement params (`scale`, `algo`, `sharpen`, `denoise`, `contrast`), pipeline state (`stage`, `done`, `log`, `result`, `aiReport`), UI state (`dragging`, `sliderX`, `activeTab`, `err`), and benchmark state (`isBenchmarking`, `bmResults`).

Key callbacks:
- `loadFile(f)` — synchronous file loader for user drop/click. Revokes any previous blob URL before creating a new one.
- `loadFileAsync(f)` — Promise-based version with 5s timeout, used by the benchmark loop.
- `runPipelineWith(fdOverride, cfgOverride)` — the full 6-stage pipeline. Accepts optional file data and config overrides so the benchmark can run it without touching component state.
- `runPipeline()` — thin wrapper calling `runPipelineWith()` with no overrides.
- `download(resultOverride, scaleHint, nameHint)` — handles both blob: and data: URL formats, appends a temporary anchor to the body, returns true/false.
- `verifyDownload(r, scaleHint, nameHint)` — used by benchmark; tests URL validity without triggering a browser save dialog.
- `runBenchmarks()` — iterates `BENCHMARK_TESTS`, builds synthetic `File` objects, calls `loadFileAsync` + `runPipelineWith` + `verifyDownload` for each.

### `buildHistory.js`
A static data file. `BUILD_HISTORY` is an array of 40 objects each with `build`, `version`, `date`, `label`, `status`, `bugs[]`, and `fixes[]`. `CURRENT_BUILD` always points to the last entry.

### `BrowserLogger.js`
Static class. `log(msg, type)` silently drops anything that isn't `error` or `warn`. `exportLogs()` serializes the buffer to JSON and downloads it. Buffer is capped at 50 entries; oldest entries are dropped when the cap is exceeded.

### `fileUtils.js`
`dataURLtoBlob(dataURL)` — splits on the comma, base64-decodes via `atob`, writes into a `Uint8Array`, and wraps in a `Blob`. Returns `null` on any failure.

### `constants/jsonSchema.js`
`JSON_SCHEMA` is the exact JSON template string injected into the Claude prompt. Claude is instructed to return only a valid JSON object matching this shape. `FALLBACK_ANALYSIS` is used when the API call fails or returns unusable data.

### `constants/docTypes.js`
`DOC_TYPES` is an array of 15 document type descriptors. Each entry has a `keys` array of trigger words, a `type` display name, a `cat` category key (maps into `DB_MAP`/`GUIDANCE_MAP`), and pre-written `issues` and `gaps` arrays used as quality findings.

### `imageProcessing/bicubic.js`
`bicubicW(t)` is the cubic convolution kernel (α = −0.5). `bicubic` samples a 4×4 neighborhood around each output pixel, weights each sample by the kernel, clamps the result to [0, 255]. Imports `clamp` from its sibling rather than via the index to avoid any circular dependency.

---

## How to Run

NexusScale is a React component. It requires a React project with JSX support. The quickest setup uses Vite:

**1. Create a new Vite + React project**
```bash
npm create vite@latest my-nexusscale -- --template react
cd my-nexusscale
npm install
```

**2. Copy the nexusscale directory into `src/`**
```
src/
└── nexusscale/
    ├── NexusScale.jsx
    ├── buildHistory.js
    └── ...
```

**3. Replace `src/App.jsx` with**
```jsx
import NexusScale from "./nexusscale/NexusScale.jsx";

export default function App() {
  return <NexusScale />;
}
```

**4. Start the dev server**
```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## API Key Setup

NexusScale calls the Anthropic API directly from the browser for image analysis. This requires a valid API key passed via the `x-api-key` header.

> **Important:** Exposing an API key in client-side code is only appropriate for local development or controlled internal environments. Do not deploy to a public URL with a hardcoded key.

For local use, open `NexusScale.jsx` and locate the `callClaude` function inside `runPipelineWith`. Add your key to the headers:

```js
headers: {
  "Content-Type": "application/json",
  "x-api-key": "sk-ant-...",
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
},
```

Without a key, Claude API calls will return a 401 and the pipeline will fall back to `FALLBACK_ANALYSIS`. All other pipeline stages (scan, recon, enhancement) function without an API key.

Get an API key at: https://console.anthropic.com

---

## Build History

NexusScale reached its current state through 40 incremental builds. Key milestones:

| Builds | What changed |
|---|---|
| 001–006 | PDF header, API error handling, safe JSON extraction, download via blob URL, proxy response fixes |
| 007–008 | PDF analysis moved fully local (no network); web recon rewritten to avoid proxy-blocked fetches |
| 009–010 | Full local pipeline; `pipelineActive` ref guard; canvas dimension guard; benchmark skeleton merged |
| 011 | TDZ crash fix; stable module-level dot opacities replacing `Math.random()` in JSX |
| 012 | Benchmark result clearing, `verifyDownload` replacing `a.click()` in async loop |
| 013–014 | Server infrastructure (Express, Morgan, rotating logs) and BrowserLogger module |
| 015–025 | Benchmark iteration series: constant hoisting, dead variable removal, pipeline lock ordering, comp() guard, stage reset, incremental results, try/finally |
| 026–033 | `loadFileAsync` timeout, blob revoke ownership, `download()` return bool, `callClaude` AbortController timeout, passive event options, FileReader race fix |
| 034–038 | Module-level JSX removed, verifyDownload type detection, report spacing, Array.isArray guards, PDF revoke timing |
| 039 | Hoist corruption revert — automated script deleted `callClaude` and all PDF analyzer vars; full authoritative rewrite |
| 040 | Clean rebuild — all 40 build history entries accurate, all guards and contracts confirmed correct |

Current version: **v4.12.1 · BUILD 040**
