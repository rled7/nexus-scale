// Runs every *.test.mjs in this folder, aggregates results, exits non-zero if any
// suite fails. Run: node test/run-all.mjs   (or: npm test)
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith(".test.mjs")).sort();

let suites = 0, failed = 0, totalChecks = 0;
console.log(`\n══ NexusScale test suite — ${files.length} files ══`);
for (const f of files) {
  suites++;
  try {
    const out = execFileSync("node", [join(here, f)], { encoding: "utf8" });
    const m = out.match(/PASS — (\d+) checks/);
    const n = m ? +m[1] : 0; totalChecks += n;
    console.log(`  ✓ ${f.padEnd(28)} ${n} checks`);
  } catch (e) {
    failed++;
    const out = String(e.stdout || "") + String(e.stderr || "");
    const m = out.match(/(\d+) checks passed, (\d+) failed/);
    console.log(`  ✗ ${f.padEnd(28)} FAILED${m ? ` (${m[2]} failing)` : ""}`);
    process.stdout.write(out.split("\n").filter(l => l.includes("✗")).map(l => "      " + l.trim()).join("\n") + "\n");
  }
}
console.log(`\n${failed === 0 ? "ALL GREEN" : "SUITE FAILED"} — ${suites - failed}/${suites} files, ${totalChecks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
