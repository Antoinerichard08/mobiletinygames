// Sauvegarde locale (localStorage). Tout est protégé par try/catch :
// en navigation privée ou si le stockage est plein, le jeu continue avec une mémoire temporaire.
// Hors navigateur (tests Node), la mémoire temporaire est utilisée.

const PREFIXE = 'salon.';
const memoire = new Map();

function disque() {
  try {
    return typeof localStorage !== 'undefined' && localStorage ? localStorage : null;
  } catch {
    return null;
  }
}

export function lire(cle, defaut = null) {
  try {
    const d = disque();
    const brut = d ? d.getItem(PREFIXE + cle) : memoire.get(cle);
    return brut ? JSON.parse(brut) : defaut;
  } catch {
    return memoire.has(cle) ? JSON.parse(memoire.get(cle)) : defaut;
  }
}

export function ecrire(cle, valeur) {
  const brut = JSON.stringify(valeur);
  memoire.set(cle, brut);
  try {
    const d = disque();
    if (d) d.setItem(PREFIXE + cle, brut);
  } catch {
    /* stockage indisponible : la mémoire temporaire suffit */
  }
}

export function effacer(cle) {
  memoire.delete(cle);
  try {
    const d = disque();
    if (d) d.removeItem(PREFIXE + cle);
  } catch {
    /* rien */
  }
}

/** Pour les tests : repart d'une mémoire vide. */
export function viderMemoire() {
  memoire.clear();
}

export function victoires(idJeu) {
  return lire('victoires', {})[idJeu] || 0;
}

export function ajouterVictoire(idJeu) {
  const toutes = lire('victoires', {});
  toutes[idJeu] = (toutes[idJeu] || 0) + 1;
  ecrire('victoires', toutes);
}
