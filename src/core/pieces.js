// Les pièces de puzzle : produites par l'Atelier du puzzle (sur l'île), offertes par l'Aventure,
// et investies dans le jeu Puzzle. Rangées à part, comme les étoiles : le jeu Puzzle n'a pas besoin de l'île.
// Sans dépendance au navigateur (testé avec Node).
import { lire, ecrire } from './stockage.js';
import { annoncer } from './evenements.js';
import { modeDev } from './config.js';

const CLE = 'pieces';
/** Mode développeur : de quoi tout tester. */
export const PIECES_DEV = 9999;

const etat = () => lire(CLE, { solde: 0, total: 0 });

/** Pièces disponibles. */
export const soldePieces = () => (modeDev() ? PIECES_DEV : etat().solde);
/** Pièces reçues depuis le début (ne baisse jamais). */
export const totalPieces = () => etat().total;

export function ajouterPieces(n, raison = '') {
  if (!(n > 0)) return soldePieces();
  const e = etat();
  e.solde += n;
  e.total += n;
  ecrire(CLE, e);
  annoncer('pieces', { solde: soldePieces(), gain: n, raison });
  return e.solde;
}

/** Dépense si possible ; renvoie true si c'est fait. */
export function depenserPieces(n) {
  if (!(n > 0)) return true;
  if (modeDev()) return true; // pièces illimitées pour tester
  const e = etat();
  if (n > e.solde) return false;
  e.solde -= n;
  ecrire(CLE, e);
  annoncer('pieces', { solde: e.solde, gain: -n });
  return true;
}
