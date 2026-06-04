// ─── Agent Enhancement Strategies ────────────────────────────────────────────
// Five named presets covering the useful parameter space.
// algo values match the existing UI: "nearest" | "bilinear" | "bicubic"

export const AGENT_STRATEGIES = [
  {
    name: "CLARITY",
    desc: "Max sharpness, minimal smooth — text, edges, technical detail",
    params: { sharpen: 0.9, denoise: 0.05, contrast: 1.15, algo: "bicubic" },
  },
  {
    name: "SMOOTHING",
    desc: "Aggressive denoise, soft sharpen — noisy or grainy sources",
    params: { sharpen: 0.2, denoise: 0.7,  contrast: 1.0,  algo: "bilinear" },
  },
  {
    name: "BALANCED",
    desc: "Even blend of all passes — reliable general-purpose output",
    params: { sharpen: 0.4, denoise: 0.2,  contrast: 1.1,  algo: "bicubic" },
  },
  {
    name: "VIVID",
    desc: "High contrast push, moderate sharpen — landscapes, portraits, artwork",
    params: { sharpen: 0.6, denoise: 0.1,  contrast: 1.4,  algo: "bicubic" },
  },
  {
    name: "PRESERVE",
    desc: "Minimal processing, maximum fidelity — archival, medical, forensic",
    params: { sharpen: 0.1, denoise: 0.0,  contrast: 1.0,  algo: "nearest" },
  },
];
