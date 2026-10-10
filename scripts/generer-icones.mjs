// Génère toutes les icônes de l'appli à partir du logo « Mom's games » (design/logo-source.png).
// Aucune dépendance : décodeur et encodeur PNG maison (zlib de Node), réduction par moyenne de zones.
//   npm run icones
// Sorties :
//   assets/icons/          icônes de la PWA (192, 512, maskable 512, apple-touch, favicon)
//   assets/android/res/    icônes de l'APK (mipmap carrée, ronde, adaptative) et écran de démarrage
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const racine = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(racine, 'design/logo-source.png');
// Le carré arrondi du logo dans l'image source, et l'arrondi de ses coins (mesurés une fois pour toutes)
const CADRE = { x: 41, y: 35, cote: 1172, rayon: 0.24 };
const CREME = [253, 247, 222];
const CREME_HEX = '#FDF7DE';

// ---------- PNG ----------
function lirePng(chemin) {
  const b = readFileSync(chemin);
  let o = 8, w, h, type, morceaux = [];
  while (o < b.length) {
    const l = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + l);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; if (d[8] !== 8 || d[12]) throw new Error('PNG 8 bits non entrelacé attendu'); }
    if (t === 'IDAT') morceaux.push(d);
    o += 12 + l;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error('PNG RGB ou RGBA attendu');
  const st = w * bpp, brut = inflateSync(Buffer.concat(morceaux)), px = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = brut[y * (st + 1)];
    for (let x = 0; x < st; x++) {
      const r = brut[y * (st + 1) + 1 + x], a = x >= bpp ? px[y * st + x - bpp] : 0, u = y ? px[(y - 1) * st + x] : 0, c = y && x >= bpp ? px[(y - 1) * st + x - bpp] : 0;
      let v;
      if (f === 0) v = r; else if (f === 1) v = r + a; else if (f === 2) v = r + u; else if (f === 3) v = r + ((a + u) >> 1);
      else { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v = r + (pa <= pb && pa <= pc ? a : pb <= pc ? u : c); }
      px[y * st + x] = v & 255;
    }
  }
  // toujours en RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = px[i * bpp]; rgba[i * 4 + 1] = px[i * bpp + 1]; rgba[i * 4 + 2] = px[i * bpp + 2];
    rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { w, h, px: rgba };
}

const TABLE_CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) c = TABLE_CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloc = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
function encoderPng(taille, rgba) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(taille, 0); ih.writeUInt32BE(taille, 4); ih[8] = 8; ih[9] = 6;
  const lignes = Buffer.alloc(taille * (taille * 4 + 1));
  for (let y = 0; y < taille; y++) rgba.copy(lignes, y * (taille * 4 + 1) + 1, y * taille * 4, (y + 1) * taille * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ih), bloc('IDAT', deflateSync(lignes, { level: 9 })), bloc('IEND', Buffer.alloc(0))]);
}

// ---------- Dessin ----------
const logo = lirePng(SOURCE);

/** Couleur moyenne du logo sur le carré [x0,x1[ × [y0,y1[ (coordonnées de l'image source, fractionnaires). */
function moyenne(x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  const pas = Math.max(1, Math.floor((x1 - x0) / 4));
  for (let y = Math.floor(y0); y < Math.ceil(y1); y += pas) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x += pas) {
      const xx = Math.min(logo.w - 1, Math.max(0, x)), yy = Math.min(logo.h - 1, Math.max(0, y)), i = (yy * logo.w + xx) * 4;
      r += logo.px[i]; g += logo.px[i + 1]; b += logo.px[i + 2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}

/** Couverture (0..1) d'un pixel par la forme : 'arrondi' (carré aux coins ronds), 'rond', 'carre'. */
function couverture(forme, u, v, du) {
  if (forme === 'carre') return 1;
  let dedans = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const x = u + (sx + 0.5) * du / 4, y = v + (sy + 0.5) * du / 4;
    if (forme === 'rond') { if (Math.hypot(x - 0.5, y - 0.5) <= 0.5) dedans++; continue; }
    const r = CADRE.rayon, qx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0), qy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
    if (Math.hypot(qx, qy) <= r) dedans++;
  }
  return dedans / 16;
}

/**
 * Une icône carrée de `taille` px. Le logo (son carré arrondi) occupe `echelle` de la largeur, centré,
 * découpé selon `forme` ; autour : transparent, ou la couleur `fond`.
 */
function icone(taille, { echelle = 1, forme = 'arrondi', fond = null } = {}) {
  const out = Buffer.alloc(taille * taille * 4);
  const cote = taille * echelle, debut = (taille - cote) / 2;
  for (let py = 0; py < taille; py++) {
    for (let px = 0; px < taille; px++) {
      const u = (px - debut) / cote, v = (py - debut) / cote, du = 1 / cote;
      const i = (py * taille + px) * 4;
      let c = [0, 0, 0], a = 0;
      if (u + du > 0 && v + du > 0 && u < 1 && v < 1) {
        a = couverture(forme, u, v, du);
        if (a > 0) {
          const k = CADRE.cote;
          c = moyenne(CADRE.x + u * k, CADRE.y + v * k, CADRE.x + (u + du) * k, CADRE.y + (v + du) * k);
        }
      }
      if (fond) { c = c.map((x, j) => x * a + fond[j] * (1 - a)); a = 1; }
      out[i] = Math.round(c[0]); out[i + 1] = Math.round(c[1]); out[i + 2] = Math.round(c[2]); out[i + 3] = Math.round(a * 255);
    }
  }
  return encoderPng(taille, out);
}

function ecrire(chemin, contenu) {
  const complet = join(racine, chemin);
  mkdirSync(dirname(complet), { recursive: true });
  writeFileSync(complet, contenu);
  console.log('écrit :', chemin);
}

// ---------- PWA ----------
ecrire('assets/icons/icone-192.png', icone(192));
ecrire('assets/icons/icone-512.png', icone(512));
// maskable : Android peut découper l'icône en rond ; on laisse une marge pour que le titre reste entier
ecrire('assets/icons/icone-maskable-512.png', icone(512, { echelle: 0.8, fond: CREME }));
ecrire('assets/icons/apple-touch-icon.png', icone(180, { forme: 'carre' }));
ecrire('assets/icons/favicon-32.png', icone(32));
ecrire('assets/icons/logo-256.png', icone(256));

// ---------- Android (APK) ----------
const densites = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [nom, k] of Object.entries(densites)) {
  const dossier = `assets/android/res/mipmap-${nom}`;
  ecrire(`${dossier}/ic_launcher.png`, icone(Math.round(48 * k)));
  ecrire(`${dossier}/ic_launcher_round.png`, icone(Math.round(48 * k), { forme: 'rond' }));
  // icône adaptative : 108 dp, dont seuls ~66 dp au centre sont toujours visibles
  ecrire(`${dossier}/ic_launcher_foreground.png`, icone(Math.round(108 * k), { echelle: 0.66 }));
}
const adaptative = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
ecrire('assets/android/res/mipmap-anydpi-v26/ic_launcher.xml', adaptative);
ecrire('assets/android/res/mipmap-anydpi-v26/ic_launcher_round.xml', adaptative);
ecrire('assets/android/res/values/ic_launcher_background.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${CREME_HEX}</color>
</resources>
`);
// écran de démarrage : fond crème et le logo au centre
ecrire('assets/android/res/drawable/splash.xml', `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background"/>
    <item android:width="260dp" android:height="260dp" android:gravity="center" android:drawable="@mipmap/ic_launcher_foreground"/>
</layer-list>
`);
