// pdfZip.js — minimal, dependency-free ZIP writer (STORE method, no compression).
// PNGs are already compressed, so storing them uncompressed is the right call and
// avoids pulling in a zip library (keeps the app fully offline). Produces a real
// PKZIP archive: local file headers + central directory + end-of-central-directory.
// Pure over Uint8Array → node-testable; the browser wraps the result in a Blob.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name: string, bytes: Uint8Array }] → Uint8Array (a valid .zip)
export function zipStored(files) {
  const enc = new TextEncoder();
  const locals = [];   // local header + data, in order
  const central = [];  // central directory records
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const size = f.bytes.length;

    // ── Local file header (30 bytes + name) ──
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature PK\x03\x04
    lv.setUint16(4, 20, true);         // version needed
    lv.setUint16(6, 0, true);          // flags
    lv.setUint16(8, 0, true);          // method 0 = store
    lv.setUint16(10, 0, true);         // mod time
    lv.setUint16(12, 0, true);         // mod date
    lv.setUint32(14, crc, true);       // crc-32
    lv.setUint32(18, size, true);      // compressed size (== uncompressed for store)
    lv.setUint32(22, size, true);      // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // extra len
    lh.set(nameBytes, 30);

    locals.push(lh, f.bytes);

    // ── Central directory record (46 bytes + name) ──
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature PK\x01\x02
    cv.setUint16(4, 20, true);         // version made by
    cv.setUint16(6, 20, true);         // version needed
    cv.setUint16(8, 0, true);          // flags
    cv.setUint16(10, 0, true);         // method
    cv.setUint16(12, 0, true);         // mod time
    cv.setUint16(14, 0, true);         // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);         // extra len
    cv.setUint16(32, 0, true);         // comment len
    cv.setUint16(34, 0, true);         // disk number
    cv.setUint16(36, 0, true);         // internal attrs
    cv.setUint32(38, 0, true);         // external attrs
    cv.setUint32(42, offset, true);    // offset of local header
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += lh.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const centralOffset = offset;

  // ── End of central directory record (22 bytes) ──
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);   // signature PK\x05\x06
  ev.setUint16(8, files.length, true); // entries on this disk
  ev.setUint16(10, files.length, true);// total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  // Concatenate everything.
  const parts = [...locals, ...central, eocd];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}
