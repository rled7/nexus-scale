// Note: isImg/isPdf removed — type field is source of truth (t.type.startsWith)
export const BENCHMARK_TESTS = [
  {name:"test_small_nearest.png", type:"image/png",       scaleOverride:2, algoOverride:"nearest", expectFail:false, desc:"Small PNG · Nearest 2x"},
  {name:"test_small_bicubic.png", type:"image/png",       scaleOverride:2, algoOverride:"bicubic", expectFail:false, desc:"Small PNG · Bicubic 2x"},
  {name:"test_pdf_standard.pdf",  type:"application/pdf", scaleOverride:2, algoOverride:"bicubic", expectFail:false, desc:"Standard PDF · metadata engine"},
  {name:"test_pdf_oversized.pdf", type:"application/pdf", scaleOverride:2, algoOverride:"bicubic", expectFail:true,  desc:"Oversized PDF · expect rejection"},
];

// Stable opacity data for empty-state dots — no module-level JSX (breaks SSR/Node)
export const EMPTY_DOT_OPACITIES = [0.02, 0.05, 0.08, 0.03, 0.06, 0.04, 0.07, 0.02, 0.09, 0.03];
