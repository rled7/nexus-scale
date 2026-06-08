// Proves the dependency-free ZIP writer produces a REAL, valid archive — verified
// by writing it to disk and running the system `unzip -t` (integrity test) + `-l`.
// Plus a CRC32 check against a known reference value.
// Run: node test/pdfZip.test.mjs
import { crc32, zipStored } from "../pdfZip.js";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)));

// CRC32 of ASCII "123456789" is the well-known 0xCBF43926.
console.log("\n[crc32] known reference vector");
ok(crc32(new TextEncoder().encode("123456789")) === 0xCBF43926,
   `crc32("123456789") === 0xCBF43926 (got 0x${crc32(new TextEncoder().encode("123456789")).toString(16)})`);

console.log("\n[zipStored] structure + real unzip integrity");
const fileA = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5]); // fake "PNG" bytes
const fileB = new TextEncoder().encode("hello nexus-scale page 2");
const zip = zipStored([
  { name: "nexusscale_2x_doc_page1.png", bytes: fileA },
  { name: "nexusscale_2x_doc_page2.png", bytes: fileB },
]);

ok(zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 0x03 && zip[3] === 0x04, "starts with local header signature PK\\x03\\x04");
// End-of-central-directory signature appears in the final 22 bytes.
const tail = zip.slice(zip.length - 22);
ok(tail[0] === 0x50 && tail[1] === 0x4b && tail[2] === 0x05 && tail[3] === 0x06, "ends with EOCD signature PK\\x05\\x06");

const dir = mkdtempSync(join(tmpdir(), "nxzip-"));
const zipPath = join(dir, "out.zip");
writeFileSync(zipPath, zip);

let unzipOk = false, listing = "";
try {
  execSync(`unzip -t ${zipPath}`, { stdio: "pipe" });   // integrity test — throws on corruption
  listing = execSync(`unzip -l ${zipPath}`, { encoding: "utf8" });
  unzipOk = true;
} catch (e) { listing = String(e.stdout || e.message); }

ok(unzipOk, "system `unzip -t` accepts the archive (no corruption)");
ok(/page1\.png/.test(listing) && /page2\.png/.test(listing), "archive lists both page entries");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
