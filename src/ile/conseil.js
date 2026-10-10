// Le conseil du guide : la chose la plus utile à faire maintenant sur l'île, et où regarder.
// Sans dépendance au navigateur (testé avec Node).
//
// conseil(e, etoiles, t) → { texte, cible }
//   cible : { genre: 'case', n, cle }       une case de l'île à montrer (flèche dans le monde)
//         | { genre: 'bouton', id }          un bouton de l'écran ('jouer', 'construire')
//   et, quand le conseil est de bâtir : suggestion { type, n, cle } (la meilleure case).
import {
  BATIMENTS, DECORS, ORDRE_BATIMENTS, ORDRE_DECORS, NOMS_RESSOURCES, cle, coord, estDebloque, peutPayer, apercu,
  stock, plafond, produit, batisseursLibres, chantiers, niveauMax, ilesOuvertes, terrainDe,
} from './regles.js';

const duree = (ms) => {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
};
const feminin = (nom) => /^(Cabane|Maison|Ferme|Carrière)/.test(nom);
const article = (nom) => `${feminin(nom) ? 'la' : 'le'} ${nom.toLowerCase()}`;
const pronom = (nom) => (feminin(nom) ? 'la' : 'le');
const aLa = (nom) => `${feminin(nom) ? 'à la' : 'au'} ${nom.toLowerCase()}`;

/** Pour chaque île ouverte, chaque case : appelle f(ile, n, x, y, k, c). */
function parcourir(e, f) {
  const ouvertes = ilesOuvertes(e);
  for (let n = 0; n < ouvertes; n++) {
    const ile = e.iles[n];
    for (const [k, c] of Object.entries(ile.cases)) f(ile, n, ...coord(k), k, c);
  }
}

/** La meilleure case pour poser `type` sur l'île n (beauté gagnée), ou null. */
export function meilleureCase(ile, type) {
  let mieux = null;
  const { x0, y0, x1, y1 } = ile.ext;
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    let gain = apercu(ile, x, y, type);
    if (gain === null) continue;
    // une cabane doit être près de la forêt, une carrière près des rochers : sinon elle ne produit rien
    const prod = BATIMENTS[type]?.prod;
    if (prod?.besoin) {
      ile.cases[cle(x, y)] = { type, niveau: 1 };
      const utile = produit(ile, x, y);
      delete ile.cases[cle(x, y)];
      if (!utile) gain -= 100;
    }
    if (!mieux || gain > mieux.gain) mieux = { cle: cle(x, y), gain };
  }
  return mieux && mieux.gain > -50 ? mieux : null;
}

export function conseil(e, etoiles, t, n = 0) {
  // 1. une bouteille sur la plage
  if (e.tresor) return { texte: 'Une bouteille est arrivée sur la plage ! Touchez-la pour voir ce qu’elle contient.', cible: { genre: 'case', n: e.tresor.n, cle: e.tresor.cle } };

  // 2. une récolte à ramasser (la plus pleine)
  let recolte = null;
  parcourir(e, (ile, m, x, y, k, c) => {
    const q = BATIMENTS[c.type]?.prod ? stock(ile, x, y, t) : 0;
    if (q && (!recolte || q / plafond(c) > recolte.part)) recolte = { n: m, cle: k, c, q, part: q / plafond(c) };
  });
  if (recolte && recolte.part >= 0.3) {
    const def = BATIMENTS[recolte.c.type];
    return { texte: `${recolte.q} ${NOMS_RESSOURCES[def.prod.res]} vous attend ${aLa(def.nom)}. Touchez-${pronom(def.nom)} pour le ramasser.`, cible: { genre: 'case', n: recolte.n, cle: recolte.cle } };
  }

  // 3. un bâtiment qui ne produit rien faute de voisin
  let inutile = null;
  parcourir(e, (ile, m, x, y, k, c) => {
    if (!inutile && BATIMENTS[c.type]?.prod?.besoin && c.niveau > 0 && !produit(ile, x, y)) inutile = { n: m, cle: k, c };
  });
  if (inutile) {
    const def = BATIMENTS[inutile.c.type];
    return { texte: `${def.nom} ne produit rien : il lui faut ${def.prod.besoin === 'foret' ? 'une forêt tout près' : 'des rochers juste à côté'}. Touchez-la puis « Déplacer ».`, cible: { genre: 'case', n: inutile.n, cle: inutile.cle } };
  }

  const libres = batisseursLibres(e);
  const ile = e.iles[n];
  const possede = (type) => Object.values(ile.cases).some((c) => c.type === type);

  // 4. un bâtiment à construire (d'abord ceux qui produisent et qu'on n'a pas encore)
  if (libres) {
    let mieux = null;
    for (const type of ORDRE_BATIMENTS) {
      const def = BATIMENTS[type];
      if (!estDebloque(e, type) || !peutPayer(e, etoiles, def.cout[0])) continue;
      const place = meilleureCase(ile, type);
      if (!place) continue;
      const score = place.gain + (def.prod && !possede(type) ? 6 : 0);
      if (!mieux || score > mieux.score) mieux = { type, place, score };
    }
    if (mieux) {
      return {
        texte: `Construisez « ${BATIMENTS[mieux.type].nom} » : +${mieux.place.gain} de beauté. Touchez « Construire ».`,
        cible: { genre: 'bouton', id: 'construire' },
        suggestion: { type: mieux.type, n, cle: mieux.place.cle },
      };
    }
    // 5. un bâtiment à améliorer
    let amelioration = null;
    parcourir(e, (il, m, x, y, k, c) => {
      const def = BATIMENTS[c.type];
      if (!def || c.chantier || c.niveau === 0 || c.niveau >= niveauMax(c.type)) return;
      if (peutPayer(e, etoiles, def.cout[c.niveau]) && (!amelioration || def.base > amelioration.base)) amelioration = { n: m, cle: k, nom: def.nom, base: def.base };
    });
    if (amelioration) return { texte: `Vous pouvez améliorer ${article(amelioration.nom)} : touchez-${pronom(amelioration.nom)}, puis « Améliorer ».`, cible: { genre: 'case', n: amelioration.n, cle: amelioration.cle } };
  }

  // 6. une décoration qui embellit
  for (const type of ORDRE_DECORS) {
    if (!estDebloque(e, type) || !peutPayer(e, etoiles, DECORS[type].cout)) continue;
    const place = meilleureCase(ile, type);
    if (place && place.gain >= 2) {
      return { texte: `Une décoration ferait plaisir : « ${DECORS[type].nom} » (+${place.gain} de beauté). Touchez « Construire ».`, cible: { genre: 'bouton', id: 'construire' }, suggestion: { type, n, cle: place.cle } };
    }
  }

  // 7. tous les bâtisseurs sont pris
  if (!libres) {
    const prochain = chantiers(e)[0];
    return { texte: `Vos bâtisseurs travaillent (encore ${duree(prochain.fin - t)}). C’est le moment de jouer une partie !`, cible: { genre: 'bouton', id: 'jouer' } };
  }

  // 8. il manque du bois ou de la pierre : ce qui se ramasse vite sur l'île
  const chercher = (terrain) => {
    const { x0, y0, x1, y1 } = ile.ext;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (terrainDe(ile, x, y) === terrain && !ile.cases[cle(x, y)] && !ile.travaux[cle(x, y)]) return cle(x, y);
    }
    return null;
  };
  const occupe = Object.keys(ile.travaux).length > 0;
  if (!occupe && (e.ressources.bois || 0) < 6) {
    const buisson = chercher('buisson');
    if (buisson) return { texte: 'Un buisson a poussé : touchez-le puis « Débroussailler », c’est du bois en plus.', cible: { genre: 'case', n, cle: buisson } };
    const foret = chercher('foret');
    if (foret) return { texte: 'Il faut du bois : touchez une forêt puis « Abattre ». Une cabane de bûcheron en donne aussi.', cible: { genre: 'case', n, cle: foret } };
  }
  if (!occupe && (e.ressources.pierre || 0) < 4) {
    const caillou = chercher('caillou');
    if (caillou) return { texte: 'Des cailloux traînent : touchez-les puis « Ramasser », c’est de la pierre en plus.', cible: { genre: 'case', n, cle: caillou } };
  }

  // 9. sinon : jouer pour gagner des étoiles
  return { texte: 'Jouez une partie pour gagner des étoiles : elles servent à construire.', cible: { genre: 'bouton', id: 'jouer' } };
}
