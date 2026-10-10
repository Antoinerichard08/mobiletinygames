// Génère toutes les icônes de l'appli : un pion ivoire et un pion rouge sur fond vert foncé.
// Aucune dépendance : petit rasteriseur anti-crénelé + encodeur PNG maison (zlib de Node).
//   npm run icones
// Sorties :
//   assets/icons/          icônes de la PWA (192, 512, maskable 512, apple-touch, favicon)
//   assets/android/res/    icônes de l'APK (mipmap legacy, ronde, adaptative) et écran de démarrage
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const racine = fileURLToPath(new URL('..', import.meta.url));

const VERT = '#1D5C48';
const VERT_CLAIR = [0x25, 0x70, 0x59];
const VERT_FONCE = [0x15, 0x46, 0x37];
const IVOIRE = { hi: [0xff, 0xff, 0xff], base: [0xf4, 0xee, 0xdd], bord: [0xb7, 0xab, 0x8c] };
const ROUGE = { hi: [0xe9, 0x77, 0x6a], base: [0xc2, 0x3a, 0x2e], bord: [0x7a, 0x1e, 0x17] };

// ---------- Encodeur PNG (RGBA 8 bits) ----------
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, crc]);
}
function encoderPng(taille, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const lignes = Buffer.alloc(taille * (taille * 4 + 1));
  for (let y = 0; y < taille; y++) {
    lignes[y * (taille * 4 + 1)] = 0; // pas de filtre
    rgba.copy(lignes, y * (taille * 4 + 1) + 1, y * taille * 4, (y + 1) * taille * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(lignes, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Dessin ----------
const melange = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const borne = (x) => Math.max(0, Math.min(1, x));

// Couleur d'un pion au point (x, y) relatif à son centre, rayon r. Renvoie null hors du pion.
function couleurPion(x, y, r, pal) {
  const d = Math.hypot(x, y);
  if (d > r) return null;
  const u = d / r;
  if (u > 0.9) return melange(pal.base, pal.bord, 0.75); // tranche
  // dégradé radial, lumière en haut à gauche
  const dl = Math.hypot(x + 0.32 * r, y + 0.36 * r) / (1.25 * r);
  let c = dl < 0.5 ? melange(pal.hi, pal.base, dl / 0.5) : melange(pal.base, pal.bord, borne((dl - 0.5) / 0.9) * 0.6);
  if (u > 0.56 && u < 0.64) c = melange(c, pal.bord, 0.45); // gorge du pion
  return c;
}

// Une scène : options { fond: 'carre'|'arrondi'|'rond'|'aucun', echelle }
function dessiner(taille, { fond, echelle = 1 }) {
  const ss = 4; // sur-échantillonnage 4 × 4
  const px = Buffer.alloc(taille * taille * 4);
  const off = 0.1 * echelle, r = 0.21 * echelle;
  const pions = [
    { cx: 0.5 - off, cy: 0.5 - off, pal: IVOIRE },
    { cx: 0.5 + off, cy: 0.5 + off, pal: ROUGE },
  ];
  for (let py = 0; py < taille; py++) {
    for (let pxl = 0; pxl < taille; pxl++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (pxl + (sx + 0.5) / ss) / taille, y = (py + (sy + 0.5) / ss) / taille;
          // fond
          let c = null, a = 0;
          const dansFond =
            fond === 'carre' ||
            (fond === 'rond' && Math.hypot(x - 0.5, y - 0.5) <= 0.5) ||
            (fond === 'arrondi' && dansCarreArrondi(x, y, 0.2));
          if (dansFond) {
            c = melange(VERT_CLAIR, VERT_FONCE, borne(Math.hypot(x - 0.42, y - 0.38) / 0.75));
            a = 1;
          }
          for (const p of pions) {
            // ombre portée douce
            const ds = Math.hypot(x - p.cx - 0.025 * echelle, y - p.cy - 0.035 * echelle);
            const ombre = 0.38 * borne((r * 1.06 - ds) / (0.05 * echelle));
            if (ombre > 0) {
              if (a === 0) { c = [0, 0, 0]; a = ombre; }
              else { c = melange(c, [0, 0, 0], ombre); }
            }
            const cp = couleurPion(x - p.cx, y - p.cy, r, p.pal);
            if (cp) { c = cp; a = 1; }
          }
          if (a > 0) { R += c[0] * a; G += c[1] * a; B += c[2] * a; A += a; }
        }
      }
      const n = ss * ss, i = (py * taille + pxl) * 4;
      px[i] = A ? Math.round(R / A) : 0;
      px[i + 1] = A ? Math.round(G / A) : 0;
      px[i + 2] = A ? Math.round(B / A) : 0;
      px[i + 3] = Math.round((A / n) * 255);
    }
  }
  return encoderPng(taille, px);
}
function dansCarreArrondi(x, y, rr) {
  const qx = Math.max(Math.abs(x - 0.5) - (0.5 - rr), 0), qy = Math.max(Math.abs(y - 0.5) - (0.5 - rr), 0);
  return Math.hypot(qx, qy) <= rr;
}

function ecrire(chemin, contenu) {
  const complet = join(racine, chemin);
  mkdirSync(dirname(complet), { recursive: true });
  writeFileSync(complet, contenu);
  console.log('écrit :', chemin);
}

// ---------- PWA ----------
ecrire('assets/icons/icone-192.png', dessiner(192, { fond: 'arrondi' }));
ecrire('assets/icons/icone-512.png', dessiner(512, { fond: 'arrondi' }));
// maskable : fond plein bord à bord, pions dans la zone sûre (cercle de 80 %)
ecrire('assets/icons/icone-maskable-512.png', dessiner(512, { fond: 'carre' }));
ecrire('assets/icons/apple-touch-icon.png', dessiner(180, { fond: 'carre' }));
ecrire('assets/icons/favicon-32.png', dessiner(32, { fond: 'arrondi', echelle: 1.15 }));

// ---------- Android (APK) ----------
const densites = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [nom, k] of Object.entries(densites)) {
  const dossier = `assets/android/res/mipmap-${nom}`;
  ecrire(`${dossier}/ic_launcher.png`, dessiner(Math.round(48 * k), { fond: 'arrondi' }));
  ecrire(`${dossier}/ic_launcher_round.png`, dessiner(Math.round(48 * k), { fond: 'rond' }));
  // icône adaptative : 108 dp, zone sûre de 66 dp au centre
  ecrire(`${dossier}/ic_launcher_foreground.png`, dessiner(Math.round(108 * k), { fond: 'aucun', echelle: 0.8 }));
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
    <color name="ic_launcher_background">${VERT}</color>
</resources>
`);
// écran de démarrage : fond vert et les deux pions au centre
ecrire('assets/android/res/drawable/splash.xml', `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background"/>
    <item android:width="216dp" android:height="216dp" android:gravity="center" android:drawable="@mipmap/ic_launcher_foreground"/>
</layer-list>
`);
