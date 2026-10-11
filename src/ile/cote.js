// Les côtes d'une île de forme libre, dans le style de « Tiny Islands » (Majadroid, CC0).
// Le pack ne fournit que les morceaux d'une île rectangulaire (bords et coins). On en fait des calques
// (l'eau devient transparente), puis chaque case d'eau qui touche la terre est composée à partir des calques
// qui lui correspondent : terre au nord → falaise, terre à l'est → liseré, terre en diagonale → petit coin…
// Les 256 combinaisons possibles sont mises en cache (une petite image de 16 × 16 chacune).
import { T } from '../core/tuiles.js';

/** Bits du masque : quelles voisines sont de la terre. */
export const N = 1, S = 2, E = 4, O = 8, NE = 16, NO = 32, SE = 64, SO = 128;

/** Le masque d'une case d'eau à partir d'une fonction terre(dx, dy). 0 : pleine mer. */
export function masqueCote(terre) {
  let m = 0;
  if (terre(0, -1)) m |= N;
  if (terre(0, 1)) m |= S;
  if (terre(1, 0)) m |= E;
  if (terre(-1, 0)) m |= O;
  if (terre(1, -1)) m |= NE;
  if (terre(-1, -1)) m |= NO;
  if (terre(1, 1)) m |= SE;
  if (terre(-1, 1)) m |= SO;
  return m;
}

/**
 * @param {HTMLImageElement} feuille  assets/ile/tuiles.png, déjà chargée
 * @returns {(masque: number) => HTMLCanvasElement | null}  la case d'eau composée (null pour la pleine mer)
 */
export function creerCotes(feuille) {
  const cache = new Map();
  // un calque par morceau de côte : la couleur exacte de la mer devient transparente
  const calques = {};
  const morceaux = { bordN: T.bordN, bordS: T.bordS, bordO: T.bordO, bordE: T.bordE, coinNO: T.coinNO, coinNE: T.coinNE, coinSO: T.coinSO, coinSE: T.coinSE };
  const tampon = document.createElement('canvas');
  tampon.width = tampon.height = 16;
  const g = tampon.getContext('2d', { willReadFrequently: true });
  g.drawImage(feuille, T.eau[0] * 16, T.eau[1] * 16, 16, 16, 0, 0, 16, 16);
  const [mr, mv, mb] = g.getImageData(8, 8, 1, 1).data;
  for (const [nom, [c, r]] of Object.entries(morceaux)) {
    g.clearRect(0, 0, 16, 16);
    g.drawImage(feuille, c * 16, r * 16, 16, 16, 0, 0, 16, 16);
    const img = g.getImageData(0, 0, 16, 16);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] === mr && img.data[i + 1] === mv && img.data[i + 2] === mb) img.data[i + 3] = 0;
    }
    const calque = document.createElement('canvas');
    calque.width = calque.height = 16;
    calque.getContext('2d').putImageData(img, 0, 0);
    calques[nom] = calque;
  }

  return (m) => {
    if (!m) return null;
    if (cache.has(m)) return cache.get(m);
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const x = c.getContext('2d');
    x.fillStyle = `rgb(${mr}, ${mv}, ${mb})`;
    x.fillRect(0, 0, 16, 16);
    // les coins seuls (terre en diagonale, rien sur les deux côtés voisins)
    if (m & SE && !(m & S) && !(m & E)) x.drawImage(calques.coinNO, 0, 0);
    if (m & SO && !(m & S) && !(m & O)) x.drawImage(calques.coinNE, 0, 0);
    if (m & NE && !(m & N) && !(m & E)) x.drawImage(calques.coinSO, 0, 0);
    if (m & NO && !(m & N) && !(m & O)) x.drawImage(calques.coinSE, 0, 0);
    // les bords : liserés à gauche, à droite et en bas, puis la falaise (terre au nord) par-dessus
    if (m & E) x.drawImage(calques.bordO, 0, 0);
    if (m & O) x.drawImage(calques.bordE, 0, 0);
    if (m & S) x.drawImage(calques.bordN, 0, 0);
    if (m & N) x.drawImage(calques.bordS, 0, 0);
    cache.set(m, c);
    return c;
  };
}
