// Petit système d'événements pour que les modules se parlent sans dépendre les uns des autres
// (un jeu annonce « partie terminée », les étoiles, les missions et la carte des niveaux écoutent).
// Sans dépendance au navigateur : utilisable dans les tests Node.

const abonnes = new Map();

export function ecouter(nom, fonction) {
  if (!abonnes.has(nom)) abonnes.set(nom, new Set());
  abonnes.get(nom).add(fonction);
  return () => abonnes.get(nom).delete(fonction);
}

export function annoncer(nom, donnees) {
  for (const f of abonnes.get(nom) || []) {
    try {
      f(donnees);
    } catch (e) {
      console.error(e); // un abonné en erreur ne doit pas casser la partie
    }
  }
}
