// Le plan de l'archipel : où se trouve chaque île dans le monde (en cases), et ce qu'il y a sous le doigt.
// Les îles gardent leurs propres coordonnées (regles.js) ; ici on les place les unes par rapport aux autres.
// Sans dépendance au navigateur (testé avec Node).
import { cle, estTerre, estCote } from './regles.js';

/** Centre de chaque île dans le monde : un petit archipel, avec de la mer entre les îles. */
export const EMPLACEMENTS = [[0, 0], [19, -2], [3, 15], [22, 13]];
/** Couloirs de mer où naviguent les bateaux (entre les îles, quelle que soit leur taille). */
export const COULOIRS = [
  { de: [-14, 7.2], vers: [38, 7.2] },
  { de: [11.2, -12], vers: [11.2, 28] },
];

/**
 * Décalage à ajouter aux coordonnées d'une île pour obtenir celles du monde. Il dépend du centre de départ de
 * l'île (qui ne bouge jamais) : quand on achète une case, le reste de l'île reste à sa place.
 */
export function origine(ile, n) {
  const [cx, cy] = EMPLACEMENTS[n];
  const c = ile.centre || { x: (ile.ext.x0 + ile.ext.x1) / 2, y: (ile.ext.y0 + ile.ext.y1) / 2 };
  return { ox: Math.round(cx - c.x - 0.5), oy: Math.round(cy - c.y - 0.5) };
}

/** Rectangle d'une île dans le monde, côte comprise : { x0, y0, x1, y1 } (x1, y1 exclus). */
export function rectIle(ile, n) {
  const { ox, oy } = origine(ile, n);
  return { x0: ox + ile.ext.x0 - 1, y0: oy + ile.ext.y0 - 1, x1: ox + ile.ext.x1 + 2, y1: oy + ile.ext.y1 + 2 };
}

/** Le rectangle de tout l'archipel, avec une marge de mer. */
export function rectMonde(e, marge = 3) {
  const r = e.iles.map((ile, n) => rectIle(ile, n));
  return {
    x0: Math.min(...r.map((a) => a.x0)) - marge, y0: Math.min(...r.map((a) => a.y0)) - marge,
    x1: Math.max(...r.map((a) => a.x1)) + marge, y1: Math.max(...r.map((a) => a.y1)) + marge,
  };
}

/**
 * La case sous un point du monde : { n, x, y, cle, terre, cote } ou null (pleine mer).
 * Seules les îles ouvertes répondent (les autres sont dans les nuages).
 */
export function caseSous(e, ouvertes, wx, wy) {
  for (let n = 0; n < ouvertes; n++) {
    const ile = e.iles[n], { ox, oy } = origine(ile, n);
    const x = Math.floor(wx - ox), y = Math.floor(wy - oy);
    if (x < ile.ext.x0 - 1 || x > ile.ext.x1 + 1 || y < ile.ext.y0 - 1 || y > ile.ext.y1 + 1) continue;
    return { n, x, y, cle: cle(x, y), terre: estTerre(ile, x, y), cote: estCote(ile, x, y) };
  }
  return null;
}

/** L'île la plus proche d'un point du monde (pour savoir laquelle on regarde). */
export function ileProche(e, ouvertes, wx, wy) {
  let mieux = 0, d = Infinity;
  for (let n = 0; n < ouvertes; n++) {
    const r = rectIle(e.iles[n], n);
    const dx = Math.max(r.x0 - wx, 0, wx - r.x1), dy = Math.max(r.y0 - wy, 0, wy - r.y1);
    const dist = Math.hypot(dx, dy) + Math.hypot((r.x0 + r.x1) / 2 - wx, (r.y0 + r.y1) / 2 - wy) * 0.01;
    if (dist < d) { d = dist; mieux = n; }
  }
  return mieux;
}

/** Centre d'une case d'une île, dans le monde. */
export function centreCase(ile, n, x, y) {
  const { ox, oy } = origine(ile, n);
  return { x: ox + x + 0.5, y: oy + y + 0.5 };
}
