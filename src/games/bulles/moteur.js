// Moteur du jeu de bulles (« bubble shooter »). Aucune dépendance au navigateur : testé avec Node.
//
// Grille hexagonale à rangées décalées : les rangées paires ont 11 bulles, les impaires 10, décalées d'une demi-bulle.
// Unités : une bulle a un rayon de 1 ; le plateau fait 22 unités de large.
// Centre de la case (r, c) : x = 1 + 2c (+ 1 si r impaire), y = 1 + r × √3.
//
// Une bulle : { k: couleur 0..5 (absente pour pierre et bombe), type: 'bulle' | 'pierre' | 'bombe', glace?: true, poussin?: true }
//   - pierre : ne s'éclate pas, tombe seulement si elle n'est plus accrochée ;
//   - glace : une bulle de couleur prise dans la glace, qui ne compte pas tant qu'un éclatement voisin ne l'a pas libérée ;
//   - bombe (sur le plateau) : explose si une bulle voisine éclate ;
//   - poussin : une bulle de couleur normale qui contient un poussin à libérer.
// Bulles tirées spéciales : { tir: 'bombe' } explose à l'arrivée ; { tir: 'arc' } prend la couleur du plus grand groupe touché.

export const COLONNES = 11;
export const LARGEUR = 22;
export const SQ = Math.sqrt(3);
export const RANGEES_MAX = 13; // si une bulle s'accroche sur la dernière rangée, la partie est perdue
export const COULEURS = 6;

export const largeurRangee = (r) => (r % 2 ? COLONNES - 1 : COLONNES);
export const centre = (r, c) => ({ x: 1 + 2 * c + (r % 2 ? 1 : 0), y: 1 + r * SQ });
export const valide = (r, c) => r >= 0 && r < RANGEES_MAX && c >= 0 && c < largeurRangee(r);

/** Plateau vide : un tableau de rangées. */
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
export const jouable = (b) => estCouleur(b) && !b.glace; // peut faire partie d'un groupe à éclater

/** Couleurs encore présentes (pour tirer les prochaines bulles). */
export function couleursPresentes(p) {
  const s = new Set();
  for (const [, , b] of cases(p)) if (estCouleur(b)) s.add(b.k);
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

/**
 * Trajet d'une bulle tirée avec l'angle donné (radians, 0 = vers la droite, π/2 = tout droit vers le haut).
 * @returns {{ points: {x,y}[], cible: {r,c} | null }} points : départ, rebonds, arrivée
 */
export function trajectoire(p, angle) {
  const a = Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, angle));
  let dx = Math.cos(a), dy = -Math.sin(a);
  let x = DEPART.x, y = DEPART.y;
  const points = [{ x, y }];
  const pas = 0.3, contact = 1.8 ** 2;
  for (let i = 0; i < 4000; i++) {
    x += dx * pas; y += dy * pas;
    if (x < 1) { x = 2 - x; dx = -dx; points.push({ x, y }); }
    else if (x > LARGEUR - 1) { x = 2 * (LARGEUR - 1) - x; dx = -dx; points.push({ x, y }); }
    let touche = y <= 1;
    if (!touche) {
      const r0 = Math.round((y - 1) / SQ);
      for (let r = r0 - 1; r <= r0 + 1 && !touche; r++) {
        if (r < 0 || r >= RANGEES_MAX) continue;
        const c0 = Math.round((x - 1 - (r % 2 ? 1 : 0)) / 2);
        for (let c = c0 - 1; c <= c0 + 1; c++) {
          if (!valide(r, c) || !p[r][c]) continue;
          const q = centre(r, c);
          if ((q.x - x) ** 2 + (q.y - y) ** 2 < contact) { touche = true; break; }
        }
      }
    }
    if (touche) {
      const cible = accrocher(p, x, Math.max(1, y));
      points.push(cible ? centre(cible.r, cible.c) : { x, y });
      return { points, cible };
    }
  }
  return { points, cible: null };
}

// ---------- Résolution d'un tir ----------

function groupe(p, r, c) {
  const k = p[r][c].k, vus = new Set([`${r},${c}`]), pile = [[r, c]], out = [];
  while (pile.length) {
    const [a, b] = pile.pop();
    out.push([a, b]);
    for (const [x, y] of voisines(a, b)) {
      const v = p[x][y];
      if (!vus.has(`${x},${y}`) && jouable(v) && v.k === k) { vus.add(`${x},${y}`); pile.push([x, y]); }
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
 * Pose la bulle tirée en (r, c) et résout tout : éclatements, glace, bombes, chutes.
 * Modifie le plateau. Renvoie ce qui s'est passé, pour l'affichage et le score.
 * @param {object} tiree { k } (couleur) ou { tir: 'bombe' } ou { tir: 'arc' }
 */
export function resoudre(p, { r, c }, tiree) {
  const ev = { pose: { r, c }, eclatees: [], tombees: [], explosions: [], glaces: [], poussins: 0, couleur: tiree.k ?? null };
  const retirer = (a, b, liste) => {
    const v = p[a][b];
    if (!v) return;
    liste.push({ r: a, c: b, b: v });
    if (v.poussin) ev.poussins++;
    p[a][b] = null;
  };
  const exploser = (a, b) => {
    ev.explosions.push({ r: a, c: b });
    retirer(a, b, ev.eclatees);
    for (const [x, y] of voisines(a, b)) {
      const v = p[x][y];
      if (!v) continue;
      if (v.type === 'bombe') exploser(x, y); // réaction en chaîne
      else retirer(x, y, ev.eclatees);
    }
  };

  if (tiree.tir === 'bombe') {
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
        const n = groupe(p, x, y).length;
        if (n > meilleur) { meilleur = n; k = v.k; }
      }
      if (k === undefined) k = 0;
      ev.couleur = k;
    }
    p[r][c] = { type: 'bulle', k };
    const g = groupe(p, r, c);
    if (g.length >= 3 || (tiree.tir === 'arc' && g.length >= 2)) {
      const voisinesTouchees = new Set();
      for (const [a, b] of g) for (const [x, y] of voisines(a, b)) voisinesTouchees.add(`${x},${y}`);
      for (const [a, b] of g) retirer(a, b, ev.eclatees);
      for (const s of voisinesTouchees) {
        const [x, y] = s.split(',').map(Number), v = p[x][y];
        if (!v) continue;
        if (v.glace) { v.glace = false; ev.glaces.push({ r: x, c: y }); }
        else if (v.type === 'bombe') exploser(x, y);
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

export function points(ev, combo = 0) {
  let s = ev.eclatees.length * 10 + ev.tombees.length * 20 + ev.poussins * 100;
  if (ev.tombees.length >= 5) s += ev.tombees.length * 10; // belle chute
  return Math.round(s * (1 + combo * 0.25));
}

/** Charge de la jauge de bonus : une bulle spéciale arrive quand elle est pleine. */
export const SEUIL_BONUS = 14;
export const charge = (ev) => ev.eclatees.length + ev.tombees.length * 2;
