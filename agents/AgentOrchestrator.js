// ─── Agent Orchestrator ───────────────────────────────────────────────────────
// Runs all AGENT_STRATEGIES in sequence on the same source image, scores each
// result with the local quality metric, and returns them sorted best-first.

import { AGENT_STRATEGIES } from "./strategies.js";
import {
  nearestNeighbor, bilinear, bicubic,
  applyUnsharpMask, applyDenoise, enhanceContrast,
} from "../imageProcessing/index.js";
import { qualityScore } from "../imageProcessing/qualityMetrics.js";

/**
 * runAgents(fd, scale, onProgress?)
 *
 * fd         — fileData object (must have canvas, w, h populated)
 * scale      — integer scale factor (2 | 3 | 4)
 * onProgress — optional callback(agentName, index, total)
 *
 * Returns { results: Array<strategy + score + url>, best: results[0] }
 * Results are sorted descending by quality score.
 * Each result.url is a data: URI — safe to set directly on <img src>.
 */
export async function runAgents(fd, scale, onProgress) {
  const { canvas, w, h } = fd;
  const dw = w * scale, dh = h * scale;

  const ctx   = canvas.getContext("2d");
  const srcPx = ctx.getImageData(0, 0, w, h).data;

  const results = [];

  for (let i = 0; i < AGENT_STRATEGIES.length; i++) {
    const strat = AGENT_STRATEGIES[i];
    const { sharpen, denoise, contrast, algo } = strat.params;

    if (onProgress) onProgress(strat.name, i, AGENT_STRATEGIES.length);

    // Yield to the browser event loop between agents so the terminal log
    // and progress indicators actually update between heavy CPU passes.
    await new Promise(r => setTimeout(r, 10));

    // ── Upscale ──────────────────────────────────────────────────────────────
    let px = algo === "nearest"  ? nearestNeighbor(srcPx, w, h, dw, dh)
           : algo === "bilinear" ? bilinear(srcPx, w, h, dw, dh)
           :                       bicubic(srcPx, w, h, dw, dh);

    // ── Enhancement passes (same order as single-pass pipeline) ──────────────
    if (denoise  > 0)    px = applyDenoise(px, dw, dh, denoise);
    if (contrast !== 1.0) px = enhanceContrast(px, dw, dh, contrast);
    if (sharpen  > 0)    px = applyUnsharpMask(px, dw, dh, sharpen);

    // ── Score + render ────────────────────────────────────────────────────────
    const score = qualityScore(px, dw, dh);

    const out = document.createElement("canvas");
    out.width = dw; out.height = dh;
    out.getContext("2d").putImageData(new ImageData(px, dw, dh), 0, 0);
    const url = out.toDataURL("image/png");

    results.push({ ...strat, score, url, w: dw, h: dh });
  }

  results.sort((a, b) => b.score - a.score);
  return { results, best: results[0] };
}
