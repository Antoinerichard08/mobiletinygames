// Le jeu Puzzle : règles, sans dépendance au navigateur (testé avec Node).
// Cinq puzzles proposés en même temps (3 petits, 1 moyen, 1 grand). On y INVESTIT ses pièces de puzzle ;
// quand un puzzle a toutes ses pièces, on l'assemble, le tableau se révèle et rejoint la bibliothèque,
// puis un nouveau puzzle de même taille prend sa place.

/** Nombre de pièces par taille (facile à changer). */
export const TAILLES = { petit: 12, moyen: 24, grand: 48 };
export const NOMS_TAILLES = { petit: 'Petit puzzle', moyen: 'Puzzle moyen', grand: 'Grand puzzle' };
/** Les cinq emplacements, dans l'ordre d'affichage. */
export const EMPLACEMENTS = ['petit', 'petit', 'petit', 'moyen', 'grand'];
/** Aimantation : à moins de cette part d'une case de sa place, la pièce s'y pose toute seule. */
export const TOLERANCE = 0.45;

export const totalPieces = (emplacement) => TAILLES[emplacement.taille];
export const pret = (emplacement) => emplacement.investies >= totalPieces(emplacement);
export const manquantes = (emplacement) => Math.max(0, totalPieces(emplacement) - emplacement.investies);

/**
 * Un tableau pour une taille donnée : d'abord un tableau prévu pour cette taille et jamais vu, puis n'importe
 * quel tableau jamais vu ; quand tout a été fait, on reprend le plus ancien terminé (jamais deux fois à l'écran).
 */
export function choisirTableau(catalogue, etat, taille, alea = Math.random) {
  const aLEcran = new Set(etat.emplacements.filter(Boolean).map((e) => e.id));
  const vus = new Set([...aLEcran, ...etat.termines.map((t) => t.id)]);
  let candidats = catalogue.images.filter((t) => t.taille === taille && !vus.has(t.id));
  if (!candidats.length) candidats = catalogue.images.filter((t) => !vus.has(t.id));
  if (candidats.length) return candidats[Math.floor(alea() * candidats.length)].id;
  const ancien = etat.termines.find((t) => !aLEcran.has(t.id));
  return ancien ? ancien.id : catalogue.images[0].id;
}

/** Un état neuf : les cinq emplacements remplis. */
export function etatNeuf(catalogue, alea = Math.random) {
  const etat = { emplacements: [], termines: [], assemblages: {} };
  for (const taille of EMPLACEMENTS) etat.emplacements.push({ id: choisirTableau(catalogue, etat, taille, alea), taille, investies: 0 });
  return etat;
}

/** Place jusqu'à `n` pièces sur l'emplacement i. Renvoie le nombre vraiment placé (jamais plus que nécessaire). */
export function investir(etat, i, n) {
  const e = etat.emplacements[i];
  const combien = Math.max(0, Math.min(Math.floor(n), manquantes(e)));
  e.investies += combien;
  return combien;
}

/** Le puzzle i est assemblé : il rejoint la bibliothèque, un nouveau puzzle de même taille prend sa place. */
export function terminer(etat, i, catalogue, date = Date.now(), alea = Math.random) {
  const e = etat.emplacements[i];
  const fini = { id: e.id, taille: e.taille, date };
  etat.termines.push(fini);
  delete etat.assemblages[e.id];
  etat.emplacements[i] = null;
  etat.emplacements[i] = { id: choisirTableau(catalogue, etat, e.taille, alea), taille: e.taille, investies: 0 };
  return fini;
}

/**
 * Colonnes × lignes pour n pièces, au plus près des proportions de l'image (pièces presque carrées).
 * @param {number} ratio largeur / hauteur de l'image
 */
export function grille(n, ratio) {
  let mieux = null;
  for (let colonnes = 1; colonnes <= n; colonnes++) {
    if (n % colonnes) continue;
    const lignes = n / colonnes;
    const ecart = Math.abs(Math.log(colonnes / lignes / ratio));
    if (!mieux || ecart < mieux.ecart) mieux = { colonnes, lignes, ecart };
  }
  return { colonnes: mieux.colonnes, lignes: mieux.lignes };
}

/** Un petit générateur pseudo-aléatoire, toujours le même pour une graine donnée. */
export function graineDe(texte) {
  let h = 2166136261;
  for (const ch of texte) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = h >>> 0 || 1;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917); s >>>= 0; return s / 4294967296; };
}

/**
 * Les ergots et encoches : pour chaque bord intérieur, +1 (l'ergot sort vers le bas / la droite) ou -1.
 * h[l][c] : entre la ligne l et l + 1, colonne c ; v[l][c] : entre la colonne c et c + 1, ligne l.
 */
export function formes(colonnes, lignes, graine) {
  const alea = graineDe(graine);
  const h = Array.from({ length: lignes - 1 }, () => Array.from({ length: colonnes }, () => (alea() < 0.5 ? 1 : -1)));
  const v = Array.from({ length: lignes }, () => Array.from({ length: colonnes - 1 }, () => (alea() < 0.5 ? 1 : -1)));
  return { h, v };
}

/** Les quatre bords d'une pièce (haut, droite, bas, gauche) : 1 ergot, -1 encoche, 0 bord droit du cadre. */
export function bordsPiece(f, colonnes, lignes, c, l) {
  return {
    haut: l === 0 ? 0 : -f.h[l - 1][c],
    droite: c === colonnes - 1 ? 0 : f.v[l][c],
    bas: l === lignes - 1 ? 0 : f.h[l][c],
    gauche: c === 0 ? 0 : -f.v[l][c - 1],
  };
}

/** La pièce est-elle assez près de sa place pour s'y aimanter ? (positions en cases) */
export const aimantee = (x, y, cx, cy, tolerance = TOLERANCE) => Math.hypot(x - cx, y - cy) <= tolerance;

/** Un ordre mélangé des pièces (toujours le même pour un tableau donné). */
export function melangees(n, graine) {
  const alea = graineDe(`${graine}/ordre`);
  const ordre = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [ordre[i], ordre[j]] = [ordre[j], ordre[i]]; }
  return ordre;
}
