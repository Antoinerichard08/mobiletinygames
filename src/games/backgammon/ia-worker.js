// Fait réfléchir l'ordinateur en arrière-plan, pour que l'écran ne se fige jamais.
import { choisirAvecDes } from './ia.js';

self.onmessage = (e) => {
  const { id, pos, camp, des, niveau } = e.data;
  self.postMessage({ id, coups: choisirAvecDes(pos, camp, des, { niveau }) });
};
