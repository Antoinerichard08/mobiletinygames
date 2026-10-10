// Sauvegarde locale (localStorage). Tout est protégé par try/catch :
// en navigation privée ou si le stockage est plein, le jeu continue sans sauvegarder.

const PREFIXE = 'salon.';

export function lire(cle, defaut = null) {
  try {
    const brut = localStorage.getItem(PREFIXE + cle);
    return brut ? JSON.parse(brut) : defaut;
  } catch {
    return defaut;
  }
}

export function ecrire(cle, valeur) {
  try {
    localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export function victoires(idJeu) {
  return lire('victoires', {})[idJeu] || 0;
}

export function ajouterVictoire(idJeu) {
  const toutes = lire('victoires', {});
  toutes[idJeu] = (toutes[idJeu] || 0) + 1;
  ecrire('victoires', toutes);
}
