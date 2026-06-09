// E2E browser smoke test — the part of the "manual browser pass" that can be settled
// MECHANICALLY (not visual quality). Drives the real built app in the system Chrome via
// puppeteer-core (no browser download — uses the installed Chrome), and asserts:
//   1. the app loads with no uncaught page errors,
//   2. ZERO external network requests  → the "100% offline" claim,
//   3. an 8K upscale produces EXACTLY the target dimensions (160×90 → 7680×4320).
// Visual-quality checks ("renders visibly upscaled", PDF page fidelity) still need a
// human glance — this closes the objective subset, not those.
//
// Not part of `npm test` (keeps the node suite zero-dep + fast). Run: npm run test:e2e
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 51847;
const ORIGIN = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)));

// ---- minimal dependency-free PNG encoder (RGBA, 8-bit) --------------------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePNG(w, h) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    let p = y * (1 + w * 4); raw[p++] = 0; // filter: none
    for (let x = 0; x < w; x++) { // gradient + checker so it isn't a flat color
      const c = (x ^ y) & 8 ? 40 : 0;
      raw[p++] = (x * 255 / w) | 0; raw[p++] = (y * 255 / h) | 0; raw[p++] = (128 + c) & 255; raw[p++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---- helpers --------------------------------------------------------------
const waitPort = async (url, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { await fetch(url); return true; } catch { await new Promise(r => setTimeout(r, 200)); } }
  throw new Error("preview server never came up");
};
const clickByText = (page, text) => page.evaluate((t) => {
  const el = [...document.querySelectorAll("button")].find(b => b.textContent.trim().includes(t));
  if (!el) throw new Error("no button: " + t); el.click();
}, text);

// ---- run ------------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "nexus-e2e-"));
const imgPath = join(dir, "test-160x90.png");
writeFileSync(imgPath, makePNG(160, 90));

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"],
  { cwd: process.cwd(), stdio: "ignore" });

let browser;
try {
  await waitPort(ORIGIN);
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-background-networking",
      "--disable-component-update", "--disable-sync", "--enable-unsafe-swiftshader",
      `--user-data-dir=${join(dir, "chrome-profile")}`],
  });
  const page = await browser.newPage();

  const external = [], pageErrors = [];
  page.on("request", (r) => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.startsWith(ORIGIN) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) external.push(u); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(ORIGIN, { waitUntil: "networkidle0", timeout: 30000 });
  console.log("\n[e2e] app loads");
  ok(pageErrors.length === 0, `no uncaught page errors on load${pageErrors.length ? " → " + pageErrors[0] : ""}`);
  ok(await page.$("input[type=file]") !== null, "file input is present (app rendered)");

  console.log("\n[e2e] 8K upscale: 160×90 → expected 7680×4320");
  const input = await page.$("input[type=file]");
  await input.uploadFile(imgPath);
  await page.waitForFunction(() => !document.querySelector('button[disabled]')?.textContent?.includes("INITIATE") , { timeout: 15000 })
    .catch(() => {}); // run button enables once the image decodes
  await new Promise(r => setTimeout(r, 500));
  await clickByText(page, "8K");
  await clickByText(page, "INITIATE PIPELINE");

  const dims = await page.waitForFunction(() => {
    const m = document.body.innerText.match(/(\d{3,5})×(\d{3,5})\s+ENHANCED/);
    return m ? { w: +m[1], h: +m[2] } : null;
  }, { timeout: 120000, polling: 500 }).then(h => h.jsonValue());

  ok(dims.w === 7680 && dims.h === 4320, `output is exactly 7680×4320 (got ${dims.w}×${dims.h})`);
  ok(pageErrors.length === 0, `no page errors during the 8K run${pageErrors.length ? " → " + pageErrors[0] : ""}`);

  console.log("\n[e2e] offline claim");
  ok(external.length === 0, `zero external network requests${external.length ? " → " + external.slice(0, 3).join(", ") : ""}`);
} catch (e) {
  fail++; console.log("  ✗ smoke run threw → " + (e?.message || e));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
