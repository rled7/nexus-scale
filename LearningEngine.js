// ─── Learning Engine ──────────────────────────────────────────────────────────
// Persists enhancement run outcomes to localStorage and suggests optimal params
// for a given image category based on weighted history of past improvements.

const STORAGE_KEY = "nexusscale_learning_v1";
const MAX_RECORDS = 200;

export class LearningEngine {
  static _load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  }

  static _save(records) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
    catch { /* localStorage quota exceeded — silently skip */ }
  }

  // Record a completed pipeline run.
  // entry: { category, params: { sharpen, denoise, contrast, algo, scale }, scoreBefore, scoreAfter }
  static record(entry) {
    const records = LearningEngine._load();
    const delta = entry.scoreAfter - entry.scoreBefore;
    records.push({ ...entry, delta, ts: Date.now() });
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
    LearningEngine._save(records);
  }

  // Returns { params, basedOn } for the given category, or null if insufficient data.
  // Only runs with positive delta (actual improvement) influence the suggestion.
  // Weighted average: higher improvement = stronger pull on the recommendation.
  static suggest(category) {
    const records = LearningEngine._load()
      .filter(r => r.category === category && r.delta > 0);
    if (records.length < 2) return null;

    const totalWeight = records.reduce((s, r) => s + r.delta, 0);
    if (totalWeight === 0) return null;

    const wavg = (field) =>
      records.reduce((s, r) => s + (r.params[field] ?? 0) * r.delta, 0) / totalWeight;

    // Algo: most common by accumulated delta weight
    const algoWeights = {};
    records.forEach(r => {
      algoWeights[r.params.algo] = (algoWeights[r.params.algo] || 0) + r.delta;
    });
    const bestAlgo = Object.entries(algoWeights).sort((a, b) => b[1] - a[1])[0][0];

    return {
      params: {
        sharpen:  +wavg("sharpen").toFixed(2),
        denoise:  +wavg("denoise").toFixed(2),
        contrast: +wavg("contrast").toFixed(2),
        algo:     bestAlgo,
        scale:    Math.round(wavg("scale")),
      },
      basedOn: records.length,
    };
  }

  // Returns { totalRuns, categories: { [cat]: count } }
  static getStats() {
    const records = LearningEngine._load();
    const categories = {};
    records.forEach(r => {
      categories[r.category] = (categories[r.category] || 0) + 1;
    });
    return { totalRuns: records.length, categories };
  }

  static clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
}
