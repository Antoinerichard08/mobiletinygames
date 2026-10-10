// Génération procédurale des niveaux de bulles, vérifiée par un petit joueur automatique.
// Aucune dépendance au navigateur : testé avec Node, et lancé dans un Web Worker par le jeu.
//
// Pour le niveau n (toujours le même pour un n donné) :
//  1. paramètres selon n : nombre de couleurs, de rangées, taille des grappes, bulles spéciales, objectif ;
//  2. une forme (pyramide, losange, cœur, vagues, arche…) accrochée au plafond ;
//  3. un remplissage en grappes de même couleur (plus grosses = plus facile) ;
//  4. des bulles spéciales qui arrivent peu à peu : poussins, bombes, « +3 », pierres, étoiles, glace,
//     éclairs, bicolores, mystères ;
//  5. un joueur automatique joue le niveau plusieurs fois : s'il échoue, on refait le niveau ;
//     le nombre de bulles données et les paliers de score des 3 étoiles se calent sur ses parties.
import { aleaGraine, melanger } from '../../core/outils.js';
import {
  COLONNES, plateauVide, cloner, voisines, cases, largeurRangee, couleursPresentes, trajectoire,
  resoudre, reussi, debordement, ANGLE_MIN, ANGLE_MAX, aCouleur, charge, SEUIL_BONUS, points, reussite, BONUS_RESTE,
} from './moteur.js';

export const NOMS_FORMES = ['plein', 'pyramide', 'losange', 'vagues', 'arche', 'coeur', 'colonnes', 'sablier', 'damier'];

/** Paramètres d'un niveau (n ≥ 1). */
export function parametres(n) {
  const borne = (x, max) => Math.max(0, Math.min(max, x));
  return {
    couleurs: n <= 3 ? 3 : n <= 10 ? 4 : n <= 25 ? 5 : 6,
    rangees: Math.min(9, 4 + Math.floor((n + 1) / 3)),
    grappe: n <= 5 ? [3, 5] : n <= 15 ? [2, 4] : n <= 30 ? [2, 3] : [1, 3], // grosses grappes = plus facile
    objectif: n >= 3 && n % 3 === 0 ? 'liberer' : 'vider',
    poussins: n >= 3 && n % 3 === 0 ? Math.min(5, 2 + Math.floor(n / 9)) : 0,
    bombes: n >= 4 ? borne(1 + Math.floor((n - 4) / 10), 3) : 0,
    plus: n >= 5 ? borne(1 + Math.floor(n / 15), 3) : 0,
    pierres: n >= 6 ? borne(Math.floor((n - 3) / 4), 6) : 0,
    etoiles: n >= 8 ? (n >= 20 ? 2 : 1) : 0,
    glaces: n >= 10 ? borne(Math.floor((n - 6) / 3), 8) : 0,
    eclairs: n >= 12 ? borne(1 + Math.floor((n - 12) / 12), 3) : 0,
    bicolores: n >= 16 ? borne(Math.floor((n - 12) / 4), 6) : 0,
    mysteres: n >= 22 ? borne(Math.floor((n - 18) / 4), 6) : 0,
    marge: n <= 5 ? 1.7 : n <= 15 ? 1.5 : n <= 30 ? 1.35 : 1.25, // bulles données = celles du joueur automatique × marge
  };
}

/** Masque de forme : la case (r, c) fait-elle partie du dessin ? */
function forme(nom, r, c, R) {
  const w = largeurRangee(r), m = (w - 1) / 2, d = Math.abs(c - m);
  switch (nom) {
    case 'pyramide': return d <= m - r * 0.6 + 0.5;
    case 'losange': { const milieu = (R - 1) / 2; return d <= m * (1 - Math.abs(r - milieu) / (milieu + 1)) + 0.6; }
    case 'vagues': return r <= R - 1 - Math.round(1.5 + 1.5 * Math.sin(c * 0.9));
    case 'arche': return r < 2 || c < 3 || c >= w - 3;
    case 'coeur': {
      const x = (c - m) / (m + 0.5), y = 1 - (r / Math.max(1, R - 1)) * 2.2 + 0.6;
      return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0.15;
    }
    case 'colonnes': return r < 2 || c % 3 !== 2;
    case 'sablier': { const milieu = (R - 1) / 2; return d <= 1.2 + m * (Math.abs(r - milieu) / (milieu + 0.5)); }
    case 'damier': return r < 2 || (Math.floor(c / 2) + Math.floor(r / 2)) % 2 === 0;
    default: return true;
  }
}

/** Retire les bulles qui ne tiendraient pas au plafond. */
function nettoyer(p) {
  const tenues = new Set(), pile = [];
  for (let c = 0; c < COLONNES; c++) if (p[0][c]) { tenues.add(`0,${c}`); pile.push([0, c]); }
  while (pile.length) {
    const [a, b] = pile.pop();
    for (const [x, y] of voisines(a, b)) if (p[x][y] && !tenues.has(`${x},${y}`)) { tenues.add(`${x},${y}`); pile.push([x, y]); }
  }
  for (const [r, c] of [...cases(p)]) if (!tenues.has(`${r},${c}`)) p[r][c] = null;
}

/** Remplit les cases du masque par grappes de même couleur, en équilibrant les couleurs. */
function colorier(p, masque, k, [tMin, tMax], alea) {
  const comptes = new Array(k).fill(0);
  const dansMasque = new Set(masque.map(([r, c]) => `${r},${c}`));
  for (const [r, c] of melanger(masque.slice(), alea)) {
    if (p[r][c]) continue;
    // couleur la moins présente parmi celles qui ne touchent pas déjà cette case (pour bien séparer les grappes)
    const voisinesK = new Set(voisines(r, c).map(([a, b]) => p[a][b]?.k).filter((x) => x !== undefined));
    const candidates = [...Array(k).keys()].filter((x) => !voisinesK.has(x));
    const pool = candidates.length ? candidates : [...Array(k).keys()];
    pool.sort((a, b) => comptes[a] - comptes[b] + (alea() - 0.5) * 2);
    const kk = pool[0];
    const taille = tMin + Math.floor(alea() * (tMax - tMin + 1));
    const file = [[r, c]];
    let n = 0;
    while (file.length && n < taille) {
      const [a, b] = file.splice(Math.floor(alea() * file.length), 1)[0];
      if (p[a][b] || !dansMasque.has(`${a},${b}`)) continue;
      p[a][b] = { type: 'bulle', k: kk };
      comptes[kk]++;
      n++;
      for (const v of voisines(a, b)) if (!p[v[0]][v[1]]) file.push(v);
    }
  }
}

/** Fabrique le plateau du niveau (sans vérification). */
function fabriquer(n, variante, P) {
  const alea = aleaGraine(n * 7919 + variante * 104729 + 17);
  const nom = n <= 2 ? 'plein' : NOMS_FORMES[Math.floor(alea() * NOMS_FORMES.length)];
  const p = plateauVide();
  const masque = [];
  for (let r = 0; r < P.rangees; r++) for (let c = 0; c < largeurRangee(r); c++) if (forme(nom, r, c, P.rangees)) masque.push([r, c]);
  colorier(p, masque, P.couleurs, P.grappe, alea);
  nettoyer(p);
  // bulles spéciales, posées sur des bulles de couleur ordinaires
  const libres = (bas = false) => melanger([...cases(p)]
    .filter(([r, , b]) => b.type === 'bulle' && !b.poussin && !b.glace && !b.mystere && !b.plus && b.k2 === undefined && (!bas || r > 0))
    .map(([r, c]) => [r, c]), alea);
  // au plus 40 % de bulles spéciales, pour qu'il reste de vraies couleurs à jouer
  let reste = Math.floor([...cases(p)].length * 0.4);
  const prendre = (liste, nb) => { const k = Math.max(0, Math.min(nb, reste)); reste -= k; return liste.slice(0, k); };
  const hautes = libres().sort((a, b) => a[0] - b[0]).slice(0, Math.max(P.poussins * 3, 1)); // poussins plutôt en haut
  prendre(melanger(hautes, alea), P.poussins).forEach(([r, c]) => { p[r][c].poussin = true; });
  prendre(libres(true), P.plus).forEach(([r, c]) => { p[r][c].plus = 3; });
  prendre(libres(true), P.etoiles).forEach(([r, c]) => { p[r][c] = { type: 'etoile' }; });
  prendre(libres(true), P.bombes).forEach(([r, c]) => { p[r][c] = { type: 'bombe' }; });
  prendre(libres(true), P.eclairs).forEach(([r, c]) => { p[r][c] = { type: 'eclair' }; });
  prendre(libres(), P.glaces).forEach(([r, c]) => { p[r][c].glace = true; });
  prendre(libres(), P.bicolores).forEach(([r, c]) => {
    const autres = [...Array(P.couleurs).keys()].filter((x) => x !== p[r][c].k);
    p[r][c].k2 = autres[Math.floor(alea() * autres.length)];
  });
  prendre(libres(), P.mysteres).forEach(([r, c]) => { p[r][c].mystere = true; });
  prendre(libres(true), P.pierres).forEach(([r, c]) => { p[r][c] = { type: 'pierre' }; });
  nettoyer(p);
  return { p, forme: nom };
}

// ---------- Joueur automatique (glouton) ----------

const ANGLES = (() => {
  const out = [];
  for (let a = ANGLE_MIN; a <= ANGLE_MAX; a += (2 * Math.PI) / 180) out.push(a);
  return out;
})();

/** Les cases atteignables et un angle pour chacune. */
export function cibles(p) {
  const res = new Map();
  for (const a of ANGLES) {
    const { cible } = trajectoire(p, a);
    if (!cible) continue;
    const k = `${cible.r},${cible.c}`;
    if (!res.has(k)) res.set(k, { ...cible, angle: a });
  }
  return [...res.values()];
}

/** Note d'un coup : ce qu'il fait éclater et tomber, et ce qu'il prépare. */
function noter(p, cible, tiree, objectif) {
  const q = cloner(p);
  const ev = resoudre(q, cible, tiree);
  let s = ev.eclatees.length * 10 + ev.tombees.length * 16 + ev.poussins * 60 + (ev.glaces.length + ev.reveles.length) * 4 + ev.tirsBonus * 12;
  if (!ev.eclatees.length && tiree.k !== undefined) {
    // pas d'éclatement : on préfère poser à côté de sa couleur, et le plus haut possible
    s += voisines(cible.r, cible.c).filter(([a, b]) => aCouleur(p[a][b], tiree.k)).length * 3;
    s -= cible.r * 0.6;
  }
  if (debordement(q)) s -= 1000;
  if (reussi(q, objectif)) s += 500;
  return s;
}

/** Le meilleur coup pour la bulle courante (et la suivante si l'on peut échanger). */
export function meilleurCoup(p, courante, suivante, objectif, alea = Math.random) {
  let best = null;
  const options = [{ tiree: courante, echange: false }];
  if (suivante && (suivante.k !== courante.k || suivante.tir !== courante.tir)) options.push({ tiree: suivante, echange: true });
  for (const cible of cibles(p)) {
    for (const o of options) {
      if (o.tiree.tir === 'feu') continue;
      const s = noter(p, cible, o.tiree, objectif) + alea() * 0.5;
      if (!best || s > best.s) best = { s, cible, angle: cible.angle, echange: o.echange };
    }
  }
  return best;
}

/** Tire la couleur de la prochaine bulle parmi les couleurs encore présentes. */
export function tirerCouleur(p, alea) {
  const cs = couleursPresentes(p);
  return cs.length ? { k: cs[Math.floor(alea() * cs.length)] } : { k: 0 };
}

/** Joue un niveau jusqu'au bout. Renvoie { gagne, tirs, score }. */
export function simuler(niveau, graine, maxTirs = 150) {
  const alea = aleaGraine(graine);
  const p = cloner(niveau.plateau);
  let courante = tirerCouleur(p, alea), suivante = tirerCouleur(p, alea), jauge = 0, bonus = 0, score = 0, serie = 0, offerts = 0;
  for (let tir = 1; tir <= maxTirs; tir++) {
    const coup = meilleurCoup(p, courante, suivante, niveau.objectif, alea);
    if (!coup) return { gagne: false, tirs: tir, score };
    if (coup.echange) [courante, suivante] = [suivante, courante];
    const ev = resoudre(p, coup.cible, courante);
    serie = reussite(ev) ? serie + 1 : 0;
    score += points(ev, serie);
    offerts += ev.tirsBonus;
    if (reussi(p, niveau.objectif)) return { gagne: true, tirs: Math.max(1, tir - offerts), score };
    if (debordement(p)) return { gagne: false, tirs: tir, score };
    jauge += charge(ev);
    courante = suivante;
    if (jauge >= SEUIL_BONUS) { jauge = 0; courante = { tir: bonus++ % 2 ? 'arc' : 'bombe' }; }
    suivante = tirerCouleur(p, alea);
    if (courante.k !== undefined && !couleursPresentes(p).includes(courante.k)) courante = tirerCouleur(p, alea);
  }
  return { gagne: false, tirs: maxTirs, score };
}

const mediane = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Le niveau n, prêt à jouer : plateau, objectif, nombre de bulles, et paliers de score pour 2 et 3 étoiles.
 * @param {number} n  numéro de niveau (≥ 1)
 */
export function genererNiveau(n, { essais = 6, parties = 2 } = {}) {
  const P = parametres(n);
  let dernier = null;
  for (let v = 0; v < essais; v++) {
    const { p, forme: nom } = fabriquer(n, v, P);
    const niveau = { n, plateau: p, objectif: P.objectif, couleurs: P.couleurs, forme: nom };
    if (P.objectif === 'liberer' && ![...cases(p)].some(([, , b]) => b.poussin)) continue;
    const resultats = [];
    for (let s = 0; s < parties; s++) resultats.push(simuler(niveau, n * 31 + v * 7 + s));
    dernier = { niveau, resultats };
    if (resultats.every((r) => r.gagne)) return calibrer(niveau, resultats, P.marge, v);
  }
  // très rare : on garde le dernier essai, avec beaucoup de bulles
  return calibrer(dernier.niveau, dernier.resultats, 2, -1);
}

/** Nombre de bulles données et paliers de score, d'après les parties du joueur automatique. */
function calibrer(niveau, resultats, marge, variante) {
  const tirs = mediane(resultats.map((r) => r.tirs));
  niveau.tirs = Math.max(10, Math.ceil(tirs * marge) + 3);
  niveau.parfait = tirs;
  niveau.bien = Math.ceil(tirs * 1.3);
  // score de référence : celui du joueur automatique, plus le bonus des bulles qu'il n'aurait pas utilisées
  const reference = mediane(resultats.map((r) => r.score)) + (niveau.tirs - tirs) * BONUS_RESTE;
  niveau.paliers = [0, Math.round((reference * 0.6) / 10) * 10, Math.round((reference * 0.85) / 10) * 10];
  niveau.variante = variante;
  return niveau;
}

/** Étoiles (1 à 3) selon le score final ; une seule si des bulles ont été offertes. */
export function etoilesNiveau(niveau, score, aideSupplementaire = false) {
  if (aideSupplementaire) return 1;
  if (score >= niveau.paliers[2]) return 3;
  if (score >= niveau.paliers[1]) return 2;
  return 1;
}

/** Correspondance avec les difficultés de l'Aventure : un niveau typique pour chacune. */
export function niveauPourDefi(difficulte, graine) {
  const base = { facile: 4, moyen: 14, difficile: 32 }[difficulte] || 4;
  return base + (graine % 6);
}
