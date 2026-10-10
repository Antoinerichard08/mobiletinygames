// Tuiles « Tiny Islands » (Majadroid, CC0) : coordonnées dans assets/ile/tuiles.png (tuiles de 16 px, 14 × 10)
// et petites fonctions pour les afficher en pixel art net (classe CSS .tuile dans base.css).

export const T = {
  eau: [3, 2],
  vagues: [[4, 2], [5, 2], [6, 2], [7, 2], [8, 2]],
  // côtes : tuiles d'eau qui bordent la terre (ex. coinNO = l'eau au nord-ouest d'une île)
  coinNO: [0, 0], bordN: [1, 0], coinNE: [2, 0],
  bordO: [0, 1], herbe: [1, 1], bordE: [2, 1],
  coinSO: [0, 2], bordS: [1, 2], coinSE: [2, 2],
  lac: { no: [3, 0], ne: [4, 0], so: [3, 1], se: [4, 1] },
  foret: [5, 0], arbres: [5, 1], montagne: [6, 0], rochers: [6, 1],
  bateaux: [[0, 9], [1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9]],
  icones: { bois: [0, 4], pierre: [1, 4], galets: [2, 4], ble: [3, 4], laine: [4, 4], marteau: [5, 4], epee: [6, 4], piece: [7, 4], habitant: [8, 4] },
  // bâtiments : colonne de la version posée sur l'herbe ; rangées 5, 6, 7 (et 8 pour le village) = niveaux 1, 2, 3 (4)
  batiments: { hameau: 1, maison: 3, champ: 5, ferme: 7, chateau: 9, port: 11, village: 13 },
};

/**
 * Planche « assets/ile/sprites.png » (16 × 8 cases), dessinée par scripts/generer-sprites.mjs :
 * villageois animés, animaux, chantiers, terrains aménagés, décor (Tiny Town de Kenney, CC0).
 */
export const S = {
  habitant: (variante, image) => [image, variante], // variante 0..4 ; image 0 debout, 1-2 marche, 3-4 travail, 5-6 porte
  mouton: [[0, 5], [1, 5]], poule: [[2, 5], [3, 5]], mouette: [[4, 5], [5, 5]], bouteille: [6, 5], broussailles: [7, 5],
  chantier: [[0, 6], [1, 6], [2, 6]], souche: [3, 6], gravats: [4, 6], etang: [5, 6], pousse: [7, 6],
  fleurs: [6, 6], fleurs2: [11, 6], carriere: [[8, 6], [9, 6], [10, 6]],
  decor: { automne: [0, 7], sapin: [1, 7], arbre: [2, 7], buisson: [3, 7], champignons: [4, 7], ruche: [5, 7], puits: [6, 7], panneau: [7, 7], fleurs: [6, 6] },
  outils: { hache: [8, 7], pioche: [9, 7], pelle: [10, 7], fourche: [11, 7], buche: [12, 7], seau: [13, 7] },
};

/** Une case de la planche de sprites, de `taille` pixels. */
export function sprite([c, r], taille, classe = '', style = '') {
  return `<span class="sprite ${classe}" style="--tc:${c};--tr:${r};--ts:${taille}px;${style}" aria-hidden="true"></span>`;
}

/** Coordonnées d'un bâtiment à un niveau donné (1 à 3, ou 4 pour le village). */
export const tuileBatiment = (type, niveau = 1) => [T.batiments[type], 4 + Math.min(niveau, type === 'village' ? 4 : 3)];

/** Une tuile en HTML (span), de `taille` pixels. */
export function tuile([c, r], taille, classe = '', style = '') {
  return `<span class="tuile ${classe}" style="--tc:${c};--tr:${r};--ts:${taille}px;${style}" aria-hidden="true"></span>`;
}

/**
 * Un îlot rectangulaire de `l` × `h` cases de terre, entouré de sa côte (donc (l + 2) × (h + 2) tuiles).
 * @param {Array} contenu  tableau de h × l coordonnées de tuiles (ou null pour l'herbe)
 */
export function ilot(l, h, taille, contenu = []) {
  let html = `<span class="ilot" style="--ts:${taille}px;grid-template-columns:repeat(${l + 2}, ${taille}px)" aria-hidden="true">`;
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= l; x++) {
      let t;
      if (y === -1) t = x === -1 ? T.coinNO : x === l ? T.coinNE : T.bordN;
      else if (y === h) t = x === -1 ? T.coinSO : x === l ? T.coinSE : T.bordS;
      else if (x === -1) t = T.bordO;
      else if (x === l) t = T.bordE;
      else t = contenu[y * l + x] || T.herbe;
      html += tuile(t, taille);
    }
  }
  return html + '</span>';
}
