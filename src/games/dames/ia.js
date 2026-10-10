// IA des Dames : minimax (forme négamax) avec élagage alpha-bêta, approfondissement progressif
// et limite de nœuds pour rester fluide sur un vieux téléphone.
// Aucune dépendance au navigateur : utilisée par ia-worker.js, et directement par les tests.

import { coupsPermis, jouerCoup } from './moteur.js';
import { melanger } from '../../core/outils.js';

export const NIVEAUX_IA = {
  facile: { profondeur8: 2, profondeur10: 2, hasard: 0.35 },
  moyen: { profondeur8: 4, profondeur10: 3, hasard: 0 },
  difficile: { profondeur8: 6, profondeur10: 5, hasard: 0 },
};
export const NOMS_NIVEAUX = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

const VALEUR_PION = 100;
const VALEUR_DAME = 330;
const DEFAITE = 100000;

/** Évaluation du point de vue des blancs (positif = bon pour les blancs). */
export function evaluer(b, N) {
  let s = 0;
  for (let i = 0; i < N * N; i++) {
    const v = b[i];
    if (!v) continue;
    const r = Math.floor(i / N), c = i % N;
    let val;
    if (Math.abs(v) === 2) val = VALEUR_DAME;
    else {
      const avance = v > 0 ? N - 1 - r : r; // rangées parcourues vers la promotion
      val = VALEUR_PION + avance * 4 + (avance === 0 ? 6 : 0); // garder sa dernière rangée protège des dames adverses
    }
    val += 2 - Math.abs(c - (N - 1) / 2) * 0.4; // le centre vaut un peu mieux que les bords
    s += v > 0 ? val : -val;
  }
  return s;
}

function chercher(b, camp, profondeur, alpha, beta, ctx) {
  if (++ctx.noeuds > ctx.limite || ((ctx.noeuds & 1023) === 0 && ctx.finTemps && Date.now() > ctx.finTemps)) {
    ctx.interrompu = true;
    return 0;
  }
  const coups = coupsPermis(b, camp, ctx.N);
  if (!coups.length) return -DEFAITE - profondeur; // plus de coup = perdu (le plus tôt possible est le pire)
  // au-delà de la profondeur, on continue tant qu'il y a des prises (pour ne pas s'arrêter au milieu d'un échange)
  if (profondeur <= 0 && (coups[0].caps.length === 0 || profondeur < -6)) return camp * evaluer(b, ctx.N);
  let meilleur = -Infinity;
  for (const m of coups) {
    const score = -chercher(jouerCoup(b, m, ctx.N), -camp, profondeur - 1, -beta, -alpha, ctx);
    if (ctx.interrompu) return 0;
    if (score > meilleur) meilleur = score;
    if (meilleur > alpha) alpha = meilleur;
    if (alpha >= beta) break;
  }
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
    limite: limiteNoeuds ?? (N === 10 ? 70000 : 150000),
    finTemps: tempsMax ? Date.now() + tempsMax : 0,
    interrompu: false,
  };
  let ordre = melanger(coups.slice(), alea);
  let choix = ordre[0];
  // approfondissement progressif : si la limite de nœuds est atteinte, on garde le dernier résultat complet
  for (let p = 1; p <= profondeurMax; p++) {
    let meilleurCoup = null, meilleurScore = -Infinity, alpha = -Infinity;
    for (const m of ordre) {
      const score = -chercher(jouerCoup(b, m, N), -camp, p - 1, -Infinity, -alpha, ctx);
      if (ctx.interrompu) break;
      if (score > meilleurScore) { meilleurScore = score; meilleurCoup = m; }
      if (score > alpha) alpha = score;
    }
    if (ctx.interrompu || !meilleurCoup) break;
    choix = meilleurCoup;
    ordre = [meilleurCoup, ...ordre.filter((x) => x !== meilleurCoup)]; // le meilleur coup d'abord au tour suivant
  }
  return choix;
}
