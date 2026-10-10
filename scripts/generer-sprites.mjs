// Dessine la planche « assets/ile/sprites.png » (cases de 16 px, 16 colonnes × 8 rangées) :
// villageois animés, animaux, chantiers, terrains aménagés, décor. Tout est dans la palette de
// « Tiny Islands » (Majadroid, CC0) ; le décor vient de « Tiny Town » (Kenney, CC0), posé sur l'herbe de Tiny Islands.
//   npm run sprites
// L'emplacement de chaque dessin est repris dans src/core/tuiles.js (constante S).
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { lirePng, ecrirePng } from './png.mjs';

const racine = fileURLToPath(new URL('..', import.meta.url));
const iles = lirePng(join(racine, 'assets/ile/tuiles.png'));
const kenney = lirePng(join(racine, 'design/kenney-tiny-town.png'));

const COLS = 16, RANGS = 8;
const W = COLS * 16, H = RANGS * 16;
const px = Buffer.alloc(W * H * 4);

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function point(c, r, x, y, couleur, alpha = 255) {
  if (x < 0 || y < 0 || x > 15 || y > 15) return;
  const i = ((r * 16 + y) * W + c * 16 + x) * 4;
  const [R, G, B] = typeof couleur === 'string' ? hex(couleur) : couleur;
  const a = alpha / 255, b = px[i + 3] / 255, o = a + b * (1 - a);
  if (o === 0) return;
  px[i] = (R * a + px[i] * b * (1 - a)) / o; px[i + 1] = (G * a + px[i + 1] * b * (1 - a)) / o; px[i + 2] = (B * a + px[i + 2] * b * (1 - a)) / o;
  px[i + 3] = o * 255;
}
/** Copie une case 16 × 16 d'une planche source (avec sa transparence). */
function copier(src, sc, sr, c, r) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = ((sr * 16 + y) * src.w + sc * 16 + x) * 4;
    if (src.px[i + 3]) point(c, r, x, y, [src.px[i], src.px[i + 1], src.px[i + 2]], src.px[i + 3]);
  }
}
const herbe = (c, r) => copier(iles, 1, 1, c, r);
/** Dessine un motif (lignes de caractères) avec une palette { caractère: couleur }. */
function motif(c, r, x0, y0, lignes, palette) {
  lignes.forEach((ligne, dy) => [...ligne].forEach((ch, dx) => { if (palette[ch]) point(c, r, x0 + dx, y0 + dy, palette[ch]); }));
}
function ellipse(c, r, cx, cy, rx, ry, couleur) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) point(c, r, x, y, couleur);
  }
}

// ---------- Villageois (5 variantes × 7 images), d'après le petit habitant de Tiny Islands ----------
const JAMBES = {
  ecartees: ['.PPQ.', '.P.Q.', '.P.Q.', '.F.F.'],
  serrees: ['.PPQ.', '..PQ.', '..PQ.', '..FF.'],
};
const CORPS = {
  normal: ['..HH...', '.HSS...', '.HSS...', 'CCLLO..', 'CMLLO..', 'CMMMO..', 'SPPQK..'],
  outilHaut: ['..HH.A.', '.HSS.AA', '.HSS.T.', 'CCLLLS.', 'CMLLO..', 'CMMMO..', '.PPQ...'],
  outilBas: ['..HH...', '.HSS...', '.HSS...', 'CCLLO..', 'CMLLLS.', 'CMMMOT.', '.PPQ.AA'],
  charge: ['..HHBB.', '.HSSBB.', '.HSSBB.', 'CCLLS..', 'CMLLO..', 'CMMMO..', 'SPPQ...'],
};
const VARIANTES = [
  { C: '#293d20', L: '#ccc285', M: '#827c55', O: '#1b2715', H: '#592a14' }, // forestier (l'habitant d'origine)
  { C: '#8c2a1c', L: '#e8c9a0', M: '#b5452f', O: '#3a110b', H: '#3b2416' }, // bûcheron
  { C: '#9b6f12', L: '#f2e2a8', M: '#c99a2e', O: '#4a3408', H: '#c8952c', long: true }, // paysanne
  { C: '#26407a', L: '#c9d6ee', M: '#4a69b0', O: '#101c38', H: '#8a8a8a' }, // maçon aux cheveux gris
  { C: '#8a2f5a', L: '#f3d0dc', M: '#c25686', O: '#3d1226', H: '#d9d2c8', long: true }, // promeneuse aux cheveux blancs
];
const COMMUN = { S: '#e08a6c', K: '#b46e55', P: '#23290f', Q: '#171b0a', F: '#150800', T: '#714114', A: '#a7adb2', B: '#a65d25' };
const IMAGES = [
  ['normal', 'serrees'], ['normal', 'ecartees'], ['normal', 'serrees'],
  ['outilHaut', 'ecartees'], ['outilBas', 'serrees'], ['charge', 'ecartees'], ['charge', 'serrees'],
];
VARIANTES.forEach((v, rang) => {
  const pal = { ...COMMUN, ...v };
  IMAGES.forEach(([corps, jambes], col) => {
    const haut = col === 2 ? 1 : 0; // petit rebond pendant la marche
    motif(col, rang, 5, 4 + haut, CORPS[corps], pal);
    if (v.long) motif(col, rang, 5, 6 + haut, ['H', 'H'], pal); // cheveux longs dans le dos
    motif(col, rang, 5, 11 + haut, JAMBES[jambes].slice(0, 4 - haut), pal);
  });
});

// ---------- Animaux (rangée 5) ----------
const MOUTON = { W: '#f4f1e8', w: '#cfc8b8', D: '#3c3633', d: '#5d5450', G: '#2a2420' };
const corpsMouton = ['..wwww...', '.wWWWWwDD', 'wWWWWWWDd', '.wWWWWw..'];
motif(0, 5, 3, 7, [...corpsMouton, '..G..G...', '..G..G...'], MOUTON);
motif(1, 5, 3, 7, [...corpsMouton, '.G..G....', '..G..G...'], MOUTON);
const POULE = { W: '#f7f3ea', w: '#d8cfbe', R: '#d4302a', O: '#e8a23a', Y: '#d79a2b' };
motif(2, 5, 5, 8, ['...R..', '..WWO.', 'wWWW..', '.wWW..', '..Y...', '..YY..'], POULE);
motif(3, 5, 5, 9, ['......', 'wWWW..', '.wWWWR', '..WWO.', '..Y...', '..YY..'], POULE);
const MOUETTE = { W: '#ffffff', w: '#c9d2dc', g: '#7d8794' };
motif(4, 5, 4, 5, ['g......g', '.w....w.', '..wWWw..', '....W...'], MOUETTE);
motif(5, 5, 4, 6, ['........', 'gwwWWwwg', '...WW...'], MOUETTE);

// bouteille à la mer (le trésor qui s'échoue sur la plage), sur fond transparent
const BOUTEILLE = { k: '#a65d25', K: '#714114', g: '#1f5e3a', G: '#3fa36b', h: '#9fe0b4', W: '#f4ead2', w: '#d9c9a0' };
motif(6, 5, 2, 2, [
  '..........Kk',
  '.........Kkk',
  '........gGG.',
  '.......gGhGg',
  '......gGWWGg',
  '.....gGWwWg.',
  '....gGWWwg..',
  '...gGhWWg...',
  '..gGGGGg....',
  '..gGGGg.....',
  '...ggg......',
], BOUTEILLE);

// ---------- Terrains et chantiers sur l'herbe (rangée 6) ----------
const BOIS = { t: '#714114', T: '#a65d25', c: '#c8772c', s: '#593411' };
function terreBattue(c, r) {
  for (let y = 6; y <= 13; y++) for (let x = 2; x <= 13; x++) point(c, r, x, y, (x === 2 || x === 13 || y === 6 || y === 13) ? '#714114' : '#a65d25');
}
// chantier 1 : terrain délimité, quatre piquets
herbe(0, 6); terreBattue(0, 6);
for (const [x, y] of [[2, 5], [13, 5], [2, 12], [13, 12]]) motif(0, 6, x, y - 1, ['c', 'c', 't'], BOIS);
motif(0, 6, 4, 9, ['ccc', 'tTT'], BOIS);
// chantier 2 : échafaudage
herbe(1, 6); terreBattue(1, 6);
for (const x of [3, 12]) for (let y = 2; y <= 13; y++) point(1, 6, x, y, '#8b5a2b');
for (const y of [5, 9]) for (let x = 3; x <= 12; x++) point(1, 6, x, y, '#c8772c');
for (let k = 0; k < 6; k++) point(1, 6, 4 + k, 12 - k, '#c8772c');
// chantier 3 : charpente et début de toit
herbe(2, 6); terreBattue(2, 6);
for (const x of [3, 12]) for (let y = 5; y <= 13; y++) point(2, 6, x, y, '#8b5a2b');
for (let x = 3; x <= 12; x++) point(2, 6, x, 9, '#c8772c');
for (let k = 0; k <= 5; k++) { point(2, 6, 3 + k, 5 - Math.floor(k * 0.8), '#b5452f'); point(2, 6, 12 - k, 5 - Math.floor(k * 0.8), '#b5452f'); }
for (let x = 5; x <= 10; x++) for (let y = 3; y <= 4; y++) if (x % 2) point(2, 6, x, y, '#d0573e');
// souche
herbe(3, 6);
ellipse(3, 6, 8, 10, 3.5, 2.6, '#714114'); ellipse(3, 6, 8, 9.2, 3, 1.8, '#c8a070'); ellipse(3, 6, 8, 9.2, 1.4, 0.8, '#a67c4f');
motif(3, 6, 3, 11, ['t........t'], BOIS);
// gravats
herbe(4, 6);
for (const [x, y, rx] of [[5, 9, 2.2], [10, 10, 2.6], [7, 12, 1.8], [11, 6, 1.6]]) { ellipse(4, 6, x, y, rx, rx * 0.8, '#6f7468'); ellipse(4, 6, x - 0.4, y - 0.5, rx * 0.6, rx * 0.4, '#b7bcae'); }
// étang
herbe(5, 6);
ellipse(5, 6, 8, 8.5, 6.6, 5.4, '#ffffff'); ellipse(5, 6, 8, 8.5, 6, 4.8, '#4f86ea'); ellipse(5, 6, 8, 8, 5.4, 4.1, '#639bff');
motif(5, 6, 6, 7, ['.ww..', '...ww'], { w: '#a9c8ff' });
// fleurs (deux variantes)
function fleurs(c, r, couleurs, positions) {
  herbe(c, r);
  positions.forEach(([x, y], k) => {
    const p = couleurs[k % couleurs.length];
    point(c, r, x, y + 2, '#1f5e10'); point(c, r, x, y + 1, '#1f5e10');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) point(c, r, x + dx, y + dy, p);
    point(c, r, x, y, '#f2c94c');
  });
}
fleurs(6, 6, ['#ffffff', '#f28cb1', '#ffffff'], [[4, 4], [11, 5], [7, 9], [3, 11], [12, 11], [9, 13]]);
fleurs(11, 6, ['#e85d5d', '#f2c94c', '#b98ef2'], [[5, 5], [10, 4], [8, 9], [4, 12], [12, 10]]);
// pousse (Kenney) sur l'herbe
herbe(7, 6); copier(kenney, 5, 1, 7, 6);
// carrière : trois niveaux
for (let n = 0; n < 3; n++) {
  const c = 8 + n;
  herbe(c, 6);
  ellipse(c, 6, 8, 9, 6.5, 5, '#714114'); ellipse(c, 6, 8, 9, 5.6, 4.2, '#a65d25');
  copier(iles, 6, 1, c, 6); // rochers transparents de Tiny Islands
  if (n >= 1) for (const [x, y] of [[3, 12], [5, 12], [4, 11]]) motif(c, 6, x, y, ['ss', 'gg'], { s: '#b7bcae', g: '#6f7468' });
  if (n >= 2) motif(c, 6, 10, 10, ['T...T', 'TTTTT', '.o.o.'], { T: '#8b5a2b', o: '#2a2420' });
}

// ---------- Décor Kenney posé sur l'herbe, et outils (rangée 7) ----------
[[3, 0], [4, 0], [4, 1], [5, 0], [5, 2], [10, 7], [8, 8], [11, 6]].forEach(([kc, kr], col) => { herbe(col, 7); copier(kenney, kc, kr, col, 7); });
[[7, 10], [7, 9], [11, 9], [8, 9], [10, 8], [10, 10]].forEach(([kc, kr], k) => copier(kenney, kc, kr, 8 + k, 7));

ecrirePng(join(racine, 'assets/ile/sprites.png'), W, H, px);
console.log('écrit : assets/ile/sprites.png');
