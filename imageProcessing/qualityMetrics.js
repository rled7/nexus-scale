// ─── Local Image Quality Metrics ─────────────────────────────────────────────
// Used by: LearningEngine (before/after scoring), AgentOrchestrator (agent ranking),
//          offlineAnalysis (quality_score field without Claude API)

// Laplacian variance — proxy for perceived sharpness.
// Samples up to ~8000 pixels via step to stay fast on large canvases.
export function computeSharpness(data, w, h) {
  const step = Math.max(1, Math.floor((w * h) / 8000));
  let sum = 0, cnt = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (((y * w + x) % step) !== 0) continue;
      const lum = (iy, ix) => {
        const idx = (iy * w + ix) * 4;
        return data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;
      };
      const c = lum(y, x);
      const lap = Math.abs(4*c - lum(y-1,x) - lum(y+1,x) - lum(y,x-1) - lum(y,x+1));
      sum += lap * lap;
      cnt++;
    }
  }
  return cnt > 0 ? sum / cnt : 0;
}

// Luminance standard deviation — measures tonal range / contrast.
export function computeContrast(data, w, h) {
  const step = Math.max(1, Math.floor(data.length / 4 / 5000));
  let sum = 0, sumSq = 0, cnt = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const lum = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
    sum += lum; sumSq += lum * lum; cnt++;
  }
  const mean = sum / cnt;
  return cnt > 0 ? Math.sqrt(Math.max(0, sumSq / cnt - mean * mean)) : 0;
}

// Composite score 0–100.
// Sharpness uses log normalization (variance spans orders of magnitude).
// Sharpness 70%, contrast 30%.
export function qualityScore(data, w, h) {
  const sharp = computeSharpness(data, w, h);
  const cont  = computeContrast(data, w, h);
  const sharpNorm = Math.min(100, (Math.log1p(sharp) / Math.log1p(50000)) * 100);
  const contNorm  = Math.min(100, (cont / 80) * 100);
  return Math.round(sharpNorm * 0.7 + contNorm * 0.3);
}
