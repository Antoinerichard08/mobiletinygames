// Les apparences (« skins ») des cartes du Solitaire.
// « Classique » est dessinée par le code (solitaire.css). Les autres sont des planches d'images dans assets/cartes/ :
// 13 colonnes (As → Roi) × 5 rangées (♠ ♥ ♦ ♣, puis le dos dans la 1re case de la 5e rangée), cases de 5 × 7,
// sans marge. Le gabarit à suivre est dans design/cartes/ (npm run cartes le régénère).
// Pour ajouter une apparence : déposer la planche (PNG ou WebP) dans assets/cartes/, ajouter une ligne ici,
// puis « npm run nouvelle-version » pour qu'elle marche hors ligne.

export const APPARENCES = [
  { id: 'classique', nom: 'Classique', planche: null },
  { id: 'creme', nom: 'Crème et rouge', planche: 'assets/cartes/creme.png' },
];

export const COLONNES = 13;
export const RANGEES = 5;

/** La case d'une carte dans la planche : { colonne, rangee } (le dos : 1re case de la 5e rangée). */
export const caseDe = (carte) => (carte.up ? { colonne: carte.r - 1, rangee: carte.s } : { colonne: 0, rangee: 4 });

/** La position CSS (background-position) d'une case, pour une planche affichée à 1300 % × 500 %. */
export function positionCss(carte) {
  const { colonne, rangee } = caseDe(carte);
  return `${(colonne / (COLONNES - 1)) * 100}% ${(rangee / (RANGEES - 1)) * 100}%`;
}

export const apparence = (id) => APPARENCES.find((a) => a.id === id) || APPARENCES[0];
