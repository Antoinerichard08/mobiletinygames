// Prépare une donne en arrière-plan : on mélange jusqu'à trouver une donne que le solveur sait gagner.
import { preparerDonne } from './donne.js';

self.onmessage = (e) => {
  const { id, niveau } = e.data;
  self.postMessage({ id, etat: preparerDonne(niveau) });
};
