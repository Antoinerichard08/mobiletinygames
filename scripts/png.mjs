// Petit décodeur/encodeur PNG sans dépendance : RGBA, RGB, palette (8 bits ou moins), non entrelacé.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
export function lirePng(f) {
  const b = readFileSync(f); let o = 8, w, h, prof, type, idat = [], plte = null, trns = null;
  while (o < b.length) { const len = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (t === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); prof = data[8]; type = data[9]; }
    if (t === 'PLTE') plte = data; if (t === 'tRNS') trns = data; if (t === 'IDAT') idat.push(data); o += 12 + len; }
  const canaux = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bitsPx = canaux * prof, stride = Math.ceil(w * bitsPx / 8), bpp = Math.max(1, bitsPx >> 3);
  const raw = inflateSync(Buffer.concat(idat)); const lig = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)]; for (let x = 0; x < stride; x++) {
    const r = raw[y * (stride + 1) + 1 + x], a = x >= bpp ? lig[y * stride + x - bpp] : 0, up = y ? lig[(y - 1) * stride + x] : 0, c = y && x >= bpp ? lig[(y - 1) * stride + x - bpp] : 0;
    let v; if (f === 0) v = r; else if (f === 1) v = r + a; else if (f === 2) v = r + up; else if (f === 3) v = r + ((a + up) >> 1); else { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v = r + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
    lig[y * stride + x] = v & 255; } }
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o2 = (y * w + x) * 4;
    if (type === 3) {
      const bit = x * prof, octet = lig[y * stride + (bit >> 3)], idx = (octet >> (8 - prof - (bit & 7))) & ((1 << prof) - 1);
      px[o2] = plte[idx * 3]; px[o2 + 1] = plte[idx * 3 + 1]; px[o2 + 2] = plte[idx * 3 + 2]; px[o2 + 3] = trns && idx < trns.length ? trns[idx] : 255;
    } else if (type === 6) { lig.copy(px, o2, y * stride + x * 4, y * stride + x * 4 + 4); }
    else if (type === 2) { px[o2] = lig[y * stride + x * 3]; px[o2 + 1] = lig[y * stride + x * 3 + 1]; px[o2 + 2] = lig[y * stride + x * 3 + 2]; px[o2 + 3] = 255; }
    else throw new Error('type PNG non géré ' + type);
  }
  return { w, h, px };
}
const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
export function ecrirePng(f, w, h, px) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1)); for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  writeFileSync(f, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
