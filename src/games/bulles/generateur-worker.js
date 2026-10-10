// Prépare les niveaux en arrière-plan (génération + vérification par le joueur automatique).
import { genererNiveau, meilleurCoup } from './generateur.js';

self.onmessage = (e) => {
  const { id, genre } = e.data;
  if (genre === 'niveau') self.postMessage({ id, niveau: genererNiveau(e.data.n) });
  else if (genre === 'conseil') {
    const { plateau, courante, suivante, objectif } = e.data;
    self.postMessage({ id, coup: meilleurCoup(plateau, courante, suivante, objectif) });
  }
};
