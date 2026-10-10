// Fait réfléchir l'ordinateur en arrière-plan, pour que l'écran ne se fige jamais.
import { choisirCoup } from './ia.js';

self.onmessage = (e) => {
  const { id, plateau, camp, N, niveau } = e.data;
  const coup = choisirCoup(plateau, camp, N, { niveau, tempsMax: 2500 }); // jamais plus de 2,5 s de réflexion
  self.postMessage({ id, coup });
};
