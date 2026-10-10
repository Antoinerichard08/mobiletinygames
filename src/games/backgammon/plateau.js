// Géométrie du plateau de Backgammon, en pixels, pour deux dispositions :
//  - « verticale » (téléphone en portrait) : le plateau est tourné d'un quart de tour, les flèches sont des rangées ;
//  - « horizontale » (paysage, tablette) : le plateau classique.
// Dans les deux cas, la maison du joueur (flèches 1 à 6) est en bas à droite et il sort ses pions en bas.
// Aucune dépendance au navigateur (calcul pur).

/**
 * @returns {{ d, pointes: {x,y,dx,dy,triangle,zone}[], barre, sortie, zones }}
 *   d : diamètre d'un pion ; pour chaque flèche (indice 0..23) : position du 1er pion, pas vers l'empilement,
 *   triangle (points SVG) et zone tactile {x,y,w,h}.
 */
export function geometrie(W, H, verticale) {
  return verticale ? geometrieVerticale(W, H) : geometrieHorizontale(W, H);
}

function geometrieVerticale(W, H) {
  const unites = 12 + 1 + 1.1; // 12 rangées de flèches, la barre, le plateau de sortie
  const h = H / unites;
  const d = Math.min(h * 0.92, (W / 2) / 5.4);
  const marge = W * 0.015, gouttiere = W * 0.025;
  const longueur = W / 2 - gouttiere - marge;
  const yRangee = (r) => (r < 6 ? r * h : 7 * h + (r - 6) * h) + h / 2;
  const pointes = new Array(24);
  for (let r = 0; r < 12; r++) {
    const y = yRangee(r);
    // colonne de gauche : flèches 13 → 24 de haut en bas
    const g = 12 + r;
    pointes[g] = {
      x: marge + d / 2, y, dx: d, dy: 0, max: Math.floor(longueur / d),
      triangle: `${marge},${y - h * 0.46} ${marge + longueur},${y} ${marge},${y + h * 0.46}`,
      zone: { x: 0, y: y - h / 2, w: W / 2, h },
    };
    // colonne de droite : flèches 12 → 1 de haut en bas
    const dr = 11 - r;
    pointes[dr] = {
      x: W - marge - d / 2, y, dx: -d, dy: 0, max: Math.floor(longueur / d),
      triangle: `${W - marge},${y - h * 0.46} ${W - marge - longueur},${y} ${W - marge},${y + h * 0.46}`,
      zone: { x: W / 2, y: y - h / 2, w: W / 2, h },
    };
  }
  const yBarre = 6 * h + h / 2;
  const ySortie = 13 * h + (1.1 * h) / 2;
  return {
    d, verticale: true,
    pointes,
    // les blancs entrent par les flèches 19-24 (en bas à gauche) : leurs pions sur la barre sont à gauche
    barre: {
      1: { x: W / 2 - d * 0.65, y: yBarre, dx: -d * 0.9, dy: 0 },
      '-1': { x: W / 2 + d * 0.65, y: yBarre, dx: d * 0.9, dy: 0 },
    },
    // pions sortis : de fines plaquettes alignées dans le plateau du bas (blancs à droite, noirs à gauche)
    sortie: {
      1: { x: W - marge - d * 0.15, y: ySortie, dx: -d * 0.3, dy: 0, plaquette: 'verticale' },
      '-1': { x: marge + d * 0.15, y: ySortie, dx: d * 0.3, dy: 0, plaquette: 'verticale' },
    },
    zones: {
      barre: { x: 0, y: 6 * h, w: W, h },
      sortie: { x: W / 2, y: 13 * h, w: W / 2, h: 1.1 * h },
    },
    decor: { barre: { x: 0, y: 6 * h, w: W, h }, sortie: { x: 0, y: 13 * h, w: W, h: 1.1 * h }, milieu: { x: W / 2 - gouttiere / 2, y: 0, w: gouttiere, h: 13 * h } },
  };
}

function geometrieHorizontale(W, H) {
  const unites = 12 + 1 + 1.1;
  const u = W / unites;
  const d = Math.min(u * 0.92, H / 11);
  const marge = H * 0.02;
  const longueur = H * 0.42;
  const xColonne = (c) => (c < 6 ? c * u : (c + 1) * u) + u / 2; // colonnes 0..11 (la barre entre 5 et 6)
  const pointes = new Array(24);
  for (let c = 0; c < 12; c++) {
    const x = xColonne(c);
    // rangée du haut : flèches 13 → 24 de gauche à droite
    const haut = 12 + c;
    pointes[haut] = {
      x, y: marge + d / 2, dx: 0, dy: d, max: Math.floor(longueur / d),
      triangle: `${x - u * 0.46},${marge} ${x},${marge + longueur} ${x + u * 0.46},${marge}`,
      zone: { x: x - u / 2, y: 0, w: u, h: H / 2 },
    };
    // rangée du bas : flèches 12 → 1 de gauche à droite
    const bas = 11 - c;
    pointes[bas] = {
      x, y: H - marge - d / 2, dx: 0, dy: -d, max: Math.floor(longueur / d),
      triangle: `${x - u * 0.46},${H - marge} ${x},${H - marge - longueur} ${x + u * 0.46},${H - marge}`,
      zone: { x: x - u / 2, y: H / 2, w: u, h: H / 2 },
    };
  }
  const xBarre = 6 * u + u / 2;
  const xSortie = 13 * u + (1.1 * u) / 2;
  return {
    d, verticale: false,
    pointes,
    // les blancs entrent par les flèches 19-24 (en haut à droite) : leurs pions sur la barre sont en haut
    barre: {
      1: { x: xBarre, y: H / 2 - d * 0.65, dx: 0, dy: -d * 0.9 },
      '-1': { x: xBarre, y: H / 2 + d * 0.65, dx: 0, dy: d * 0.9 },
    },
    sortie: {
      1: { x: xSortie, y: H - marge - d * 0.15, dx: 0, dy: -d * 0.3, plaquette: 'horizontale' },
      '-1': { x: xSortie, y: marge + d * 0.15, dx: 0, dy: d * 0.3, plaquette: 'horizontale' },
    },
    zones: {
      barre: { x: 6 * u, y: 0, w: u, h: H },
      sortie: { x: 13 * u, y: H / 2, w: 1.1 * u, h: H / 2 },
    },
    decor: { barre: { x: 6 * u, y: 0, w: u, h: H }, sortie: { x: 13 * u, y: 0, w: 1.1 * u, h: H }, milieu: null },
  };
}

/** Position du k-ième pion d'une pile de n pions (on resserre la pile si elle dépasse la place disponible). */
export function positionDansPile(base, k, n) {
  let pas = 1;
  if (base.max && n > base.max) pas = (base.max - 1) / (n - 1);
  return { x: base.x + base.dx * k * pas, y: base.y + base.dy * k * pas };
}
