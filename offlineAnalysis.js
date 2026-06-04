// ─── Offline Local Image Analysis ────────────────────────────────────────────
// Replaces the Claude API call in Stage 3 when offlineMode is active.
// Produces a full analysis object matching JSON_SCHEMA shape using only pixel
// data, file metadata, and filename heuristics — zero network calls.

import { clamp } from "./imageProcessing/clamp.js";
import { computeSharpness, computeContrast, qualityScore } from "./imageProcessing/qualityMetrics.js";

export function analyzeLocally(fd) {
  // ── Filename category hints ───────────────────────────────────────────────
  const name = (fd.name || "").toLowerCase();
  let image_category = "other";
  if      (/portrait|face|headshot|person|people|selfie/.test(name))      image_category = "portrait";
  else if (/landscape|mountain|sky|nature|outdoor|forest|beach/.test(name)) image_category = "landscape";
  else if (/scan|doc|invoice|form|letter|receipt|contract/.test(name))    image_category = "document";
  else if (/art|paint|draw|sketch|illustration|cartoon/.test(name))       image_category = "artwork";
  else if (/screen|ui|screenshot|desktop|capture/.test(name))             image_category = "screenshot";
  else if (/medical|xray|mri|ct|dicom|histology/.test(name))              image_category = "medical";
  else if (/satellite|aerial|map|terrain/.test(name))                     image_category = "satellite";
  else if (/micro|microscope|cell|tissue/.test(name))                     image_category = "microscopy";

  // ── Pixel metrics ─────────────────────────────────────────────────────────
  let avgBright = 128, lumStd = 30, avgSat = 60;
  let sharp = 500, cont = 30;
  let blur_level = "slight", noise_level = "low";
  let compression_artifacts = "mild";
  let score = 60;

  if (fd.canvas && fd.w && fd.h) {
    const ctx  = fd.canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, fd.w, fd.h).data;

    // Channel and saturation averages (sampled)
    const step = Math.max(1, Math.floor(data.length / 4 / 5000));
    let sumL = 0, sumL2 = 0, sumS = 0, cnt = 0;
    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const mx  = Math.max(r, g, b), mn = Math.min(r, g, b);
      sumL  += lum;
      sumL2 += lum * lum;
      sumS  += mx === 0 ? 0 : ((mx - mn) / mx) * 255;
      cnt++;
    }
    avgBright = sumL  / cnt;
    lumStd    = Math.sqrt(Math.max(0, sumL2 / cnt - avgBright * avgBright));
    avgSat    = sumS  / cnt;

    // Aspect ratio — helps distinguish portrait vs landscape when name gives no hint
    const aspect = fd.w / fd.h;
    if (image_category === "other") {
      if (avgSat < 30)    image_category = "document";   // mostly gray → document
      else if (aspect > 1.6) image_category = "landscape";
      else if (aspect < 0.8) image_category = "portrait";
    }

    // Sharpness + contrast scores
    sharp = computeSharpness(data, fd.w, fd.h);
    cont  = computeContrast(data, fd.w, fd.h);
    score = qualityScore(data, fd.w, fd.h);

    blur_level           = sharp < 50   ? "severe"   : sharp < 200  ? "moderate" : sharp < 800  ? "slight" : "none";
    noise_level          = lumStd > 60  ? "high"     : lumStd > 35  ? "medium"   : lumStd > 15  ? "low"    : "none";
    compression_artifacts = (fd.size / (fd.w * fd.h)) < 0.15 ? "moderate" : "mild";
  }

  // ── Quality issues list ───────────────────────────────────────────────────
  const quality_issues = [];
  if (avgBright < 60)                              quality_issues.push("Underexposed — image is too dark");
  if (avgBright > 210)                             quality_issues.push("Overexposed — washed out highlights");
  if (blur_level === "severe" || blur_level === "moderate") quality_issues.push(`Blur level: ${blur_level}`);
  if (noise_level === "high")                      quality_issues.push("High noise — may need denoising pass");
  if (compression_artifacts === "moderate")        quality_issues.push("Possible compression artifacts");
  if (fd.w && fd.h && fd.w * fd.h < 500000)       quality_issues.push(`Low source resolution: ${fd.w}×${fd.h}px`);

  const mp                   = (fd.w || 0) * (fd.h || 0);
  const estimated_original_dpi = mp > 4000000 ? 300 : mp > 1000000 ? 150 : 96;

  // ── Enhancement recommendations derived from pixel data ───────────────────
  const recommended_sharpen  = blur_level  === "severe"   ? 0.8 : blur_level  === "moderate" ? 0.6 : 0.4;
  const recommended_denoise  = noise_level === "high"     ? 0.6 : noise_level === "medium"   ? 0.3 : 0.1;
  const recommended_contrast = lumStd < 20 ? 1.25 : lumStd < 35 ? 1.1 : 1.0;
  const recommended_scale    = mp < 500000 ? 4 : 2;

  return {
    subject: `${image_category.charAt(0).toUpperCase()}${image_category.slice(1)} image: "${fd.name}" (${fd.w||"?"}×${fd.h||"?"}px) — local analysis`,
    image_category,
    quality_score:            clamp(score, 5, 95),
    estimated_original_dpi,
    quality_issues,
    content_gaps:             ["Local analysis — semantic content extraction not available in offline mode"],
    color_analysis:           `Avg brightness: ${Math.round(avgBright)}/255 · Contrast σ: ${Math.round(lumStd)} · Avg saturation: ${Math.round(avgSat)}/255`,
    compression_artifacts,
    noise_level,
    blur_level,
    enhancement_priority:     quality_issues.length > 0 ? quality_issues[0] : `Standard ${image_category} upscaling`,
    search_queries: [
      `${image_category} image enhancement high resolution`,
      `${image_category} upscaling reconstruction techniques`,
      `${image_category} noise reduction restoration`,
      `digital ${image_category} quality improvement`,
      `${image_category} super resolution algorithms`,
    ],
    recommended_scale,
    recommended_sharpen,
    recommended_denoise,
    recommended_contrast,
    interesting_details: [
      `Resolution: ${fd.w||"?"}×${fd.h||"?"}px (${(mp/1000000).toFixed(2)}MP)`,
      `Avg luminance: ${Math.round(avgBright)}/255`,
      `Contrast (σ): ${Math.round(lumStd)}`,
      `Avg saturation: ${Math.round(avgSat)}/255`,
    ],
  };
}
