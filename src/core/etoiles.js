// Les étoiles : la monnaie du Salon. On les gagne en jouant, on les dépense sur l'île.
// Sans dépendance au navigateur (testé avec Node).
import { lire, ecrire } from './stockage.js';
import { annoncer } from './evenements.js';
import { modeDev, ETOILES_DEV } from './config.js';

const CLE = 'etoiles';

function etat() {
  return lire(CLE, { solde: 0, total: 0 });
}

/** Étoiles disponibles. */
export const solde = () => (modeDev() ? ETOILES_DEV : etat().solde);
/** Étoiles gagnées depuis le début (ne baisse jamais). */
export const totalGagne = () => etat().total;

export function ajouterEtoiles(n, raison = '') {
  if (!(n > 0)) return solde();
  const e = etat();
  e.solde += n;
  e.total += n;
  ecrire(CLE, e);
  annoncer('etoiles', { solde: solde(), gain: n, raison });
  return e.solde;
}

/** Dépense si possible ; renvoie true si c'est fait. */
export function depenserEtoiles(n) {
  if (modeDev()) return true; // crédits illimités
  const e = etat();
  if (n > e.solde) return false;
  e.solde -= n;
  ecrire(CLE, e);
  annoncer('etoiles', { solde: e.solde, gain: -n });
  return true;
}

export const ETOILES_PAR_DIFFICULTE = { facile: 1, moyen: 2, difficile: 3 };

/** Étoiles d'une partie libre : 1 à 3 selon la difficulté si gagnée, 1 d'encouragement si perdue jusqu'au bout. */
export function etoilesPartie({ gagne, difficulte }) {
  if (gagne) return ETOILES_PAR_DIFFICULTE[difficulte] || 1;
  return 1;
}
