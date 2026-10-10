// Navigation entre écrans, sans que les jeux aient à connaître app.js.
// revenir('niveaux') : retourne à la carte (en reculant dans l'historique si on en vient, pour que
// le bouton Retour du téléphone reste logique).

let gestionnaire = null;

export function definirNavigation(f) {
  gestionnaire = f;
}

export function revenir(cible = '') {
  if (gestionnaire) gestionnaire(cible);
  else location.hash = cible ? `#/${cible}` : '';
}
