// Caméra du monde de l'île : où l'on regarde (x, y en cases) et à quel zoom (z = pixels par case).
// Fonctions pures (testées avec Node) ; l'écran les appelle à chaque image.

/** Une caméra : centre (x, y) en cases, zoom z, taille de la vue (l, h) en pixels CSS. */
export const camera = (x = 0, y = 0, z = 48, l = 800, h = 400) => ({ x, y, z, l, h });

export const versEcran = (c, wx, wy) => ({ x: (wx - c.x) * c.z + c.l / 2, y: (wy - c.y) * c.z + c.h / 2 });
export const versMonde = (c, sx, sy) => ({ x: (sx - c.l / 2) / c.z + c.x, y: (sy - c.h / 2) / c.z + c.y });

/**
 * Garde la vue au-dessus du monde : le centre ne peut pas s'éloigner au point de ne montrer que la mer.
 * @param {{x0, y0, x1, y1}} b  le rectangle (en cases) qu'on doit pouvoir parcourir
 */
export function borner(c, b) {
  const demiL = c.l / 2 / c.z, demiH = c.h / 2 / c.z;
  const limiter = (v, a, z, demi) => (z - a <= demi * 2 ? (a + z) / 2 : Math.min(z - demi, Math.max(a + demi, v)));
  return { ...c, x: limiter(c.x, b.x0, b.x1, demiL), y: limiter(c.y, b.y0, b.y1, demiH) };
}

/** Zoome d'un facteur en gardant immobile le point du monde qui est sous (sx, sy). */
export function zoomAutour(c, sx, sy, facteur, zMin, zMax) {
  const avant = versMonde(c, sx, sy);
  const z = Math.min(zMax, Math.max(zMin, c.z * facteur));
  const apres = versMonde({ ...c, z }, sx, sy);
  return { ...c, z, x: c.x + avant.x - apres.x, y: c.y + avant.y - apres.y };
}

/** Le zoom qui fait tenir un rectangle (en cases) dans la vue, avec des marges en pixels. */
export function zoomPourVoir(c, b, marges = { haut: 0, bas: 0, gauche: 0, droite: 0 }) {
  const l = Math.max(80, c.l - marges.gauche - marges.droite), h = Math.max(80, c.h - marges.haut - marges.bas);
  return Math.min(l / (b.x1 - b.x0), h / (b.y1 - b.y0));
}

/** Centre de caméra qui place le milieu d'un rectangle au milieu de la zone libre (entre les marges). */
export function centrePourVoir(c, b, z, marges = { haut: 0, bas: 0, gauche: 0, droite: 0 }) {
  return {
    x: (b.x0 + b.x1) / 2 - (marges.gauche - marges.droite) / 2 / z,
    y: (b.y0 + b.y1) / 2 - (marges.haut - marges.bas) / 2 / z,
  };
}

/** Courbe d'animation douce (départ vif, arrivée en douceur). */
export const adoucir = (p) => 1 - (1 - p) ** 3;

/** Position intermédiaire entre deux caméras, p entre 0 et 1 (le zoom varie de façon géométrique). */
export function entre(a, b, p) {
  const q = adoucir(Math.min(1, Math.max(0, p)));
  return { ...b, x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q, z: a.z * (b.z / a.z) ** q };
}
