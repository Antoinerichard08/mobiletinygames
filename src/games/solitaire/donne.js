// Fabrication des donnes selon le niveau. Sans dépendance au navigateur.
import { NIVEAUX, nouvellePartie } from './moteur.js';
import { estGagnable } from './solveur.js';

/**
 * Renvoie un état de départ. Pour les niveaux « gagnables », on mélange jusqu'à ce que le solveur
 * trouve une solution (au plus `essais` fois ; au-delà, on garde la dernière donne).
 */
export function preparerDonne(niveau = 'facile', { alea = Math.random, essais = 60, limite = 1500 } = {}) {
  const reglage = NIVEAUX[niveau] || NIVEAUX.facile;
  let etat = nouvellePartie(alea, { tirage: reglage.tirage });
  if (!reglage.gagnable) return etat;
  for (let i = 0; i < essais; i++) {
    if (estGagnable(etat, { tirage: reglage.tirage, limite }) === true) return etat;
    etat = nouvellePartie(alea, { tirage: reglage.tirage });
  }
  return etat;
}
