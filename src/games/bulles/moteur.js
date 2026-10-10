// Moteur du jeu de bulles (« bubble shooter »). Aucune dépendance au navigateur : testé avec Node.
//
// Grille hexagonale à rangées décalées : les rangées paires ont 11 bulles, les impaires 10, décalées d'une demi-bulle.
// Unités : une bulle a un rayon de 1 ; le plateau fait 22 unités de large.
// Centre de la case (r, c) : x = 1 + 2c (+ 1 si r impaire), y = 1 + r × √3.
//
// Une bulle du plateau :
//   { type: 'bulle', k: couleur 0..5, k2?: seconde couleur (bicolore), glace?, mystere?, poussin?, plus?: tirs offerts }
//   { type: 'pierre' }  ne s'éclate pas, tombe seulement si elle n'est plus accrochée
//   { type: 'bombe' }   explose quand une voisine éclate
//   { type: 'eclair' }  quand elle saute, toute sa rangée disparaît
//   { type: 'etoile' }  touchée par une bulle de couleur, elle fait disparaître toutes les bulles de cette couleur
// Bulles tirées : { k } (couleur), { tir: 'bombe' }, { tir: 'arc' } (prend la couleur du plus grand groupe touché),
//                 { tir: 'feu' } (traverse tout jusqu'au plafond).

export const COLONNES = 11;
export const LARGEUR = 22;
export const SQ = Math.sqrt(3);
export const RANGEES_MAX = 13; // si une bulle s'accroche sur la dernière rangée, la partie est perdue
export const COULEURS = 6;
export const BONUS_RESTE = 150; // points par bulle non utilisée en fin de niveau

export const largeurRangee = (r) => (r % 2 ? COLONNES - 1 : COLONNES);
export const centre = (r, c) => ({ x: 1 + 2 * c + (r % 2 ? 1 : 0), y: 1 + r * SQ });
export const valide = (r, c) => r >= 0 && r < RANGEES_MAX && c >= 0 && c < largeurRangee(r);

export const plateauVide = () => Array.from({ length: RANGEES_MAX }, (_, r) => new Array(largeurRangee(r)).fill(null));
export const cloner = (p) => p.map((rg) => rg.map((b) => (b ? { ...b } : null)));
export const lire = (p, r, c) => (valide(r, c) ? p[r][c] : null);

/** Les 6 voisines d'une case. */
export function voisines(r, c) {
  const d = r % 2
    ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
    : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return d.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => valide(a, b));
}

export function* cases(p) {
  for (let r = 0; r < p.length; r++) for (let c = 0; c < p[r].length; c++) if (p[r][c]) yield [r, c, p[r][c]];
}

export const estCouleur = (b) => b && b.type === 'bulle';
/** Peut faire partie d'un groupe à éclater (pas gelée, pas encore mystérieuse). */
export const jouable = (b) => estCouleur(b) && !b.glace && !b.mystere;
/** La bulle compte-t-elle pour la couleur k ? (une bicolore compte pour ses deux couleurs) */
export const aCouleur = (b, k) => jouable(b) && (b.k === k || b.k2 === k);

/** Couleurs encore présentes (pour tirer les prochaines bulles). */
export function couleursPresentes(p) {
  const s = new Set();
  for (const [, , b] of cases(p)) {
    if (!estCouleur(b)) continue;
    s.add(b.k);
    if (b.k2 !== undefined) s.add(b.k2);
  }
  return [...s].sort((a, b) => a - b);
}

// ---------- Trajectoire ----------

/** Position de départ des bulles tirées (en bas, au milieu). */
export const DEPART = { x: LARGEUR / 2, y: 1 + (RANGEES_MAX - 1) * SQ + 4.2 };
export const ANGLE_MIN = (8 * Math.PI) / 180;
export const ANGLE_MAX = Math.PI - ANGLE_MIN;

/** La case vide la plus proche d'un point, accrochée au plafond ou à une bulle. */
function accrocher(p, x, y) {
  const r0 = Math.round((y - 1) / SQ);
  let meilleure = null, dMin = Infinity;
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    if (r < 0 || r >= RANGEES_MAX) continue;
    for (let c = 0; c < largeurRangee(r); c++) {
      if (p[r][c]) continue;
      const tenue = r === 0 || voisines(r, c).some(([a, b]) => p[a][b]);
      if (!tenue) continue;
      const q = centre(r, c), d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < dMin) { dMin = d; meilleure = { r, c }; }
    }
  }
  return meilleure;
}

/** Bulles proches d'un point (moins de `rayon` unités). */
function proches(p, x, y, rayon2) {
  const out = [];
  const r0 = Math.round((y - 1) / SQ);
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    if (r < 0 || r >= RANGEES_MAX) continue;
    const c0 = Math.round((x - 1 - (r % 2 ? 1 : 0)) / 2);
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (!valide(r, c) || !p[r][c]) continue;
      const q = centre(r, c);
      if ((q.x - x) ** 2 + (q.y - y) ** 2 < rayon2) out.push([r, c]);
    }
  }
  return out;
}

/**
 * Trajet d'une bulle tirée avec l'angle donné (radians, 0 = vers la droite, π/2 = tout droit vers le haut).
 * Avec `traverse` (boule de feu), la bulle ne s'arrête qu'au plafond et note tout ce qu'elle touche.
 * @returns {{ points: {x,y}[], cible: {r,c} | null, touchees: [r,c][] }}
 */
export function trajectoire(p, angle, traverse = false) {
  const a = Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, angle));
  let dx = Math.cos(a), dy = -Math.sin(a);
  let x = DEPART.x, y = DEPART.y;
  const points = [{ x, y }];
  const touchees = new Map();
  const pas = 0.3, contact = 1.8 ** 2;
  for (let i = 0; i < 4000; i++) {
    x += dx * pas; y += dy * pas;
    if (x < 1) { x = 2 - x; dx = -dx; points.push({ x, y }); }
    else if (x > LARGEUR - 1) { x = 2 * (LARGEUR - 1) - x; dx = -dx; points.push({ x, y }); }
    const contre = y <= 1 ? [] : proches(p, x, y, contact);
    if (traverse) {
      for (const [r, c] of contre) touchees.set(`${r},${c}`, [r, c]);
      if (y <= 1) { points.push({ x, y: 1 }); return { points, cible: null, touchees: [...touchees.values()] }; }
      continue;
    }
    if (y <= 1 || contre.length) {
      const cible = accrocher(p, x, Math.max(1, y));
      points.push(cible ? centre(cible.r, cible.c) : { x, y });
      return { points, cible, touchees: [] };
    }
  }
  return { points, cible: null, touchees: [...touchees.values()] };
}

// ---------- Résolution d'un tir ----------

function groupe(p, r, c, k) {
  const vus = new Set([`${r},${c}`]), pile = [[r, c]], out = [];
  while (pile.length) {
    const [a, b] = pile.pop();
    out.push([a, b]);
    for (const [x, y] of voisines(a, b)) {
      if (!vus.has(`${x},${y}`) && aCouleur(p[x][y], k)) { vus.add(`${x},${y}`); pile.push([x, y]); }
    }
  }
  return out;
}

/** Les bulles qui ne tiennent plus au plafond. */
function decrochees(p) {
  const tenues = new Set(), pile = [];
  for (let c = 0; c < largeurRangee(0); c++) if (p[0][c]) { tenues.add(`0,${c}`); pile.push([0, c]); }
  while (pile.length) {
    const [a, b] = pile.pop();
    for (const [x, y] of voisines(a, b)) if (p[x][y] && !tenues.has(`${x},${y}`)) { tenues.add(`${x},${y}`); pile.push([x, y]); }
  }
  return [...cases(p)].filter(([r, c]) => !tenues.has(`${r},${c}`)).map(([r, c]) => [r, c]);
}

/**
 * Pose la bulle tirée en (r, c) — ou, pour une boule de feu, emporte les bulles touchées — puis résout tout :
 * éclatements, glace, mystères, bombes, éclairs, étoiles, chutes. Modifie le plateau.
 * @param {object} tiree { k } ou { tir: 'bombe' | 'arc' | 'feu' }
 * @param {Array} touchees pour une boule de feu : les cases traversées
 */
export function resoudre(p, cible, tiree, touchees = []) {
  const { r, c } = cible || { r: -1, c: -1 };
  const ev = {
    pose: cible, eclatees: [], tombees: [], explosions: [], eclairs: [], etoiles: [], glaces: [], reveles: [],
    poussins: 0, tirsBonus: 0, couleur: tiree.k ?? null,
  };
  const retirer = (a, b, liste) => {
    const v = p[a][b];
    if (!v) return null;
    liste.push({ r: a, c: b, b: v });
    if (v.poussin) ev.poussins++;
    if (v.plus) ev.tirsBonus += v.plus;
    p[a][b] = null;
    return v;
  };
  // ce qui arrive à une bulle emportée par une explosion, un éclair ou le feu
  const emporter = (a, b) => {
    const v = p[a][b];
    if (!v) return;
    if (v.type === 'bombe') exploser(a, b);
    else if (v.type === 'eclair') foudroyer(a, b);
    else retirer(a, b, ev.eclatees);
  };
  function exploser(a, b) {
    ev.explosions.push({ r: a, c: b });
    retirer(a, b, ev.eclatees);
    for (const [x, y] of voisines(a, b)) emporter(x, y);
  }
  function foudroyer(a, b) {
    ev.eclairs.push({ r: a, c: b });
    retirer(a, b, ev.eclatees);
    for (let y = 0; y < largeurRangee(a); y++) emporter(a, y);
  }
  // un groupe éclate : ses voisines réagissent (glace, mystère, bombes, éclairs)
  const reveiller = (cellules) => {
    const autour = new Set();
    for (const [a, b] of cellules) for (const [x, y] of voisines(a, b)) autour.add(`${x},${y}`);
    for (const s of autour) {
      const [x, y] = s.split(',').map(Number), v = p[x][y];
      if (!v) continue;
      if (v.glace) { v.glace = false; ev.glaces.push({ r: x, c: y }); }
      else if (v.mystere) { v.mystere = false; ev.reveles.push({ r: x, c: y }); }
      else if (v.type === 'bombe') exploser(x, y);
      else if (v.type === 'eclair') foudroyer(x, y);
    }
  };

  if (tiree.tir === 'feu') {
    for (const [a, b] of touchees) emporter(a, b);
  } else if (tiree.tir === 'bombe') {
    p[r][c] = { type: 'bulle', k: 0 }; // place provisoire, emportée par l'explosion
    exploser(r, c);
    ev.eclatees.shift(); // la bombe elle-même n'est pas une bulle éclatée
  } else {
    let k = tiree.k;
    if (tiree.tir === 'arc') {
      // l'arc-en-ciel prend la couleur du plus grand groupe voisin
      let meilleur = -1;
      for (const [x, y] of voisines(r, c)) {
        const v = p[x][y];
        if (!jouable(v)) continue;
        for (const kk of [v.k, v.k2]) {
          if (kk === undefined) continue;
          const n = groupe(p, x, y, kk).length;
          if (n > meilleur) { meilleur = n; k = kk; }
        }
      }
      if (k === undefined) k = 0;
      ev.couleur = k;
    }
    p[r][c] = { type: 'bulle', k };
    // une étoile touchée fait disparaître toute la couleur
    const etoiles = voisines(r, c).filter(([x, y]) => p[x][y]?.type === 'etoile');
    if (etoiles.length) {
      for (const [x, y] of etoiles) { ev.etoiles.push({ r: x, c: y }); retirer(x, y, ev.eclatees); }
      const meme = [...cases(p)].filter(([, , v]) => estCouleur(v) && (v.k === k || v.k2 === k)).map(([a, b]) => [a, b]);
      for (const [a, b] of meme) retirer(a, b, ev.eclatees);
      reveiller(meme);
    } else {
      const g = groupe(p, r, c, k);
      if (g.length >= 3 || (tiree.tir === 'arc' && g.length >= 2)) {
        for (const [a, b] of g) retirer(a, b, ev.eclatees);
        reveiller(g);
      }
    }
  }
  for (const [a, b] of decrochees(p)) retirer(a, b, ev.tombees);
  return ev;
}

// ---------- Fin de partie ----------

export const nbPoussins = (p) => [...cases(p)].filter(([, , b]) => b.poussin).length;

/** Le niveau est-il réussi ? objectif 'vider' : plus aucune bulle de couleur ; 'liberer' : plus aucun poussin. */
export function reussi(p, objectif) {
  if (objectif === 'liberer') return nbPoussins(p) === 0;
  return couleursPresentes(p).length === 0;
}

/** Une bulle est-elle descendue jusqu'à la dernière rangée ? */
export const debordement = (p) => p[RANGEES_MAX - 1].some(Boolean);

// ---------- Points ----------

/** Multiplicateur de série : chaque tir réussi d'affilée rapporte un peu plus (jusqu'à × 3). */
export const multiplicateur = (serie) => Math.min(3, 1 + Math.max(0, serie - 1) * 0.5);

export function points(ev, serie = 0) {
  let s = ev.eclatees.length * 10 + ev.tombees.length * 20 + ev.poussins * 100;
  if (ev.tombees.length >= 5) s += ev.tombees.length * 10; // belle chute
  return Math.round(s * multiplicateur(serie));
}

/** Le tir a-t-il fait éclater ou tomber quelque chose ? */
export const reussite = (ev) => ev.eclatees.length + ev.tombees.length > 0;

/** Charge de la jauge de bonus : une bulle spéciale arrive quand elle est pleine. */
export const SEUIL_BONUS = 14;
export const charge = (ev) => ev.eclatees.length + ev.tombees.length * 2;
