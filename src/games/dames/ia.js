// IA des Dames : négamax avec élagage alpha-bêta, approfondissement progressif, table de transposition
// (hachage de Zobrist), ordre des coups par « historique » et prolongement des prises en fin de recherche.
// Techniques classiques des moteurs de dames (Scan, Kingsrow…), réécrites ici simplement.
// Limite de nœuds et de temps pour rester fluide sur un vieux téléphone.
// Aucune dépendance au navigateur : utilisée par ia-worker.js, et directement par les tests.

import { coupsPermis, jouerCoup } from './moteur.js';
import { melanger } from '../../core/outils.js';

export const NIVEAUX_IA = {
  facile: { profondeur8: 2, profondeur10: 2, hasard: 0.3 },
  moyen: { profondeur8: 4, profondeur10: 3, hasard: 0 },
  difficile: { profondeur8: 10, profondeur10: 7, hasard: 0 },
};
export const NOMS_NIVEAUX = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

const DEFAITE = 100000;

// ---------- Évaluation (du point de vue des blancs) ----------

export function evaluer(b, N) {
  let s = 0, blancs = 0, rouges = 0, damesB = 0, damesR = 0;
  let arriereB = 0, arriereR = 0;
  for (let i = 0; i < N * N; i++) {
    const v = b[i];
    if (!v) continue;
    if (v > 0) { blancs++; if (v === 2) damesB++; } else { rouges++; if (v === -2) damesR++; }
  }
  const total = blancs + rouges;
  const finDePartie = total <= (N === 10 ? 14 : 9);
  const valeurDame = finDePartie ? 380 : 300;
  for (let i = 0; i < N * N; i++) {
    const v = b[i];
    if (!v) continue;
    const r = Math.floor(i / N), c = i % N;
    let val;
    if (v === 2 || v === -2) {
      val = valeurDame;
      // une dame sur la grande diagonale contrôle beaucoup de cases
      if (r === c || r + c === N - 1) val += 12;
    } else {
      const avance = v > 0 ? N - 1 - r : r; // rangées déjà parcourues
      val = 100 + avance * (finDePartie ? 9 : 4);
      if (avance === 0) { val += 8; if (v > 0) arriereB++; else arriereR++; } // garder la dernière rangée
      if (c === 0 || c === N - 1) val -= 4; // un pion au bord est moins actif
      // pion « échappé » : aucun pion adverse ne peut plus lui barrer la route
      if (avance >= N / 2 && echappe(b, r, c, v > 0 ? -1 : 1, N)) val += 30 + avance * 6;
    }
    val += 3 - Math.abs(c - (N - 1) / 2) * 0.6; // le centre vaut un peu mieux
    s += v > 0 ? val : -val;
  }
  // échanger quand on mène est bon : on amplifie l'avantage matériel quand il reste peu de pièces
  const diff = blancs + damesB * 2 - (rouges + damesR * 2);
  s += diff * (40 - total) * 0.8;
  if (!finDePartie) s += (Math.min(arriereB, 3) - Math.min(arriereR, 3)) * 5;
  return s;
}

// Aucune pièce adverse dans le « cône » devant ce pion. `sens` = sens de marche du pion (-1 vers le haut, +1 vers le bas),
// qui est aussi le signe des pièces adverses (les blancs montent face aux rouges négatifs, et inversement).
function echappe(b, r, c, sens, N) {
  for (let k = 1; ; k++) {
    const rr = r + sens * k;
    if (rr < 0 || rr >= N) return true;
    for (let cc = c - k; cc <= c + k; cc++) {
      if (cc < 0 || cc >= N) continue;
      const v = b[rr * N + cc];
      if (v && Math.sign(v) === sens) return false;
    }
  }
}

// ---------- Hachage de Zobrist ----------

const ZOBRIST = (() => {
  // nombres pseudo-aléatoires fixes (deux moitiés : 21 bits et 32 bits → clé exacte sur 53 bits)
  let a = 0x9e3779b9;
  const suivant = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const table = [];
  for (let i = 0; i < 100 * 4; i++) table.push([suivant() & 0x1fffff, suivant()]);
  return { table, trait: [suivant() & 0x1fffff, suivant()] };
})();
const TYPE = { 1: 0, 2: 1, '-1': 2, '-2': 3 };

function hacher(b, camp) {
  let hi = 0, lo = 0;
  for (let i = 0; i < b.length; i++) {
    const v = b[i];
    if (!v) continue;
    const z = ZOBRIST.table[i * 4 + TYPE[v]];
    hi ^= z[0]; lo ^= z[1];
  }
  if (camp < 0) { hi ^= ZOBRIST.trait[0]; lo ^= ZOBRIST.trait[1]; }
  return hi * 4294967296 + (lo >>> 0);
}

// ---------- Recherche ----------

const EXACT = 0, BORNE_BASSE = 1, BORNE_HAUTE = 2;
const cleCoup = (m) => m.from * 1000 + m.path[m.path.length - 1];

function chercher(b, camp, profondeur, alpha, beta, ctx, distance) {
  if (++ctx.noeuds > ctx.limite || ((ctx.noeuds & 1023) === 0 && ctx.finTemps && Date.now() > ctx.finTemps)) {
    ctx.interrompu = true;
    return 0;
  }
  const coups = coupsPermis(b, camp, ctx.N);
  if (!coups.length) return -DEFAITE + distance; // perdre le plus tard possible
  const prise = coups[0].caps.length > 0;
  // au-delà de la profondeur prévue, on continue seulement tant qu'il y a des prises (pas d'arrêt au milieu d'un échange)
  if (profondeur <= 0 && (!prise || profondeur < -8)) return camp * evaluer(b, ctx.N);

  const alphaDepart = alpha;
  const cle = hacher(b, camp);
  const entree = ctx.tt.get(cle);
  if (entree && entree.p >= profondeur) {
    if (entree.f === EXACT) return entree.s;
    if (entree.f === BORNE_BASSE && entree.s >= beta) return entree.s;
    if (entree.f === BORNE_HAUTE && entree.s <= alpha) return entree.s;
  }
  // ordre des coups : meilleur coup mémorisé, puis prises, puis historique
  if (coups.length > 1) {
    const meilleurConnu = entree ? entree.m : -1;
    coups.sort((x, y) => {
      const kx = cleCoup(x), ky = cleCoup(y);
      if (kx === meilleurConnu) return -1;
      if (ky === meilleurConnu) return 1;
      return (ctx.historique.get(ky) || 0) - (ctx.historique.get(kx) || 0);
    });
  }
  let meilleur = -Infinity, meilleurCoup = -1;
  // un seul coup possible : on ne consomme pas de profondeur (coup forcé)
  const suivante = coups.length === 1 ? profondeur : profondeur - 1;
  for (const m of coups) {
    const score = -chercher(jouerCoup(b, m, ctx.N), -camp, suivante, -beta, -alpha, ctx, distance + 1);
    if (ctx.interrompu) return 0;
    if (score > meilleur) { meilleur = score; meilleurCoup = cleCoup(m); }
    if (meilleur > alpha) alpha = meilleur;
    if (alpha >= beta) {
      if (!m.caps.length) ctx.historique.set(cleCoup(m), (ctx.historique.get(cleCoup(m)) || 0) + profondeur * profondeur);
      break;
    }
  }
  if (ctx.tt.size > 200000) ctx.tt.clear();
  ctx.tt.set(cle, {
    p: profondeur, s: meilleur, m: meilleurCoup,
    f: meilleur <= alphaDepart ? BORNE_HAUTE : meilleur >= beta ? BORNE_BASSE : EXACT,
  });
  return meilleur;
}

/**
 * Choisit un coup pour `camp`.
 * @param {object} o { niveau, limiteNoeuds, tempsMax (ms, facultatif), alea }
 */
export function choisirCoup(b, camp, N, { niveau = 'moyen', limiteNoeuds, tempsMax, alea = Math.random } = {}) {
  const coups = coupsPermis(b, camp, N);
  if (coups.length <= 1) return coups[0] || null;
  const reglage = NIVEAUX_IA[niveau] || NIVEAUX_IA.moyen;
  if (reglage.hasard && alea() < reglage.hasard) return coups[Math.floor(alea() * coups.length)];
  const profondeurMax = N === 10 ? reglage.profondeur10 : reglage.profondeur8;
  const ctx = {
    N,
    noeuds: 0,
    limite: limiteNoeuds ?? (N === 10 ? 90000 : 160000),
    finTemps: tempsMax ? Date.now() + tempsMax : 0,
    interrompu: false,
    tt: new Map(),
    historique: new Map(),
  };
  let ordre = melanger(coups.slice(), alea);
  let choix = ordre[0];
  // approfondissement progressif : si la limite est atteinte, on garde le dernier résultat complet
  for (let p = 1; p <= profondeurMax; p++) {
    let meilleurCoup = null, meilleurScore = -Infinity, alpha = -Infinity;
    for (const m of ordre) {
      const score = -chercher(jouerCoup(b, m, N), -camp, p - 1, -Infinity, -alpha, ctx, 1);
      if (ctx.interrompu) break;
      if (score > meilleurScore) { meilleurScore = score; meilleurCoup = m; }
      if (score > alpha) alpha = score;
    }
    if (ctx.interrompu || !meilleurCoup) break;
    choix = meilleurCoup;
    ordre = [meilleurCoup, ...ordre.filter((x) => x !== meilleurCoup)];
    if (meilleurScore > DEFAITE - 100) break; // victoire forcée trouvée
  }
  return choix;
}
