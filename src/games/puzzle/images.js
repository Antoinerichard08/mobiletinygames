// Les tableaux du jeu Puzzle.
// - Le catalogue (data/catalogue-puzzles.json) fait partie de l'appli : il marche hors ligne, avec une minuscule
//   vignette floue pour chaque tableau.
// - L'image nette est demandée à NOTRE site (assets/puzzles/…) seulement quand on en a besoin, convertie en WebP
//   (1000 px au plus) et gardée sur le téléphone (IndexedDB) : ensuite plus besoin du réseau.
// On ne demande que l'image : aucun identifiant, aucune donnée envoyée.

const BASE = 'moms-games';
const MAGASIN = 'tableaux';
const LARGEUR_MAX = 1000;
const racine = new URL('../../../', import.meta.url);

let catalogue = null;
/** Le catalogue (mis en cache par le service worker avec le reste de l'appli). */
export async function chargerCatalogue() {
  if (!catalogue) catalogue = await (await fetch(new URL('data/catalogue-puzzles.json', racine))).json();
  return catalogue;
}

// ---------- IndexedDB ----------

let base = null;
function ouvrir() {
  if (base) return base;
  base = new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') return ko(new Error('IndexedDB indisponible'));
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  base.catch(() => { base = null; });
  return base;
}
async function operation(mode, f) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const tx = db.transaction(MAGASIN, mode);
    const r = f(tx.objectStore(MAGASIN));
    tx.oncomplete = () => ok(r?.result);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error);
  });
}

/** L'image nette déjà gardée sur le téléphone (Blob), ou null. */
export async function imageGardee(id) {
  try { return (await operation('readonly', (m) => m.get(id))) || null; } catch { return null; }
}
async function garder(id, blob) {
  try { await operation('readwrite', (m) => m.put(blob, id)); } catch { /* pas de place : on la retéléchargera */ }
}
/** Les identifiants des tableaux déjà gardés. */
export async function tableauxGardes() {
  try { return new Set(await operation('readonly', (m) => m.getAllKeys())); } catch { return new Set(); }
}

// ---------- Téléchargement ----------

/** Réduit l'image (1000 px de large au plus) et la convertit en WebP quand le téléphone sait le faire. */
async function compresser(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const l = Math.min(LARGEUR_MAX, bitmap.width), h = Math.round((bitmap.height * l) / bitmap.width);
    const toile = document.createElement('canvas');
    toile.width = l;
    toile.height = h;
    toile.getContext('2d').drawImage(bitmap, 0, 0, l, h);
    bitmap.close?.();
    const webp = await new Promise((ok) => toile.toBlob(ok, 'image/webp', 0.85));
    return webp && webp.type === 'image/webp' && webp.size < blob.size ? webp : blob;
  } catch {
    return blob;
  }
}

const enCours = new Map();
/**
 * L'image nette d'un tableau : celle du téléphone, sinon on la télécharge (une seule fois à la fois).
 * Renvoie un Blob, ou null sans réseau (rien n'est perdu : on réessaiera plus tard).
 */
export function obtenirImage(entree) {
  if (enCours.has(entree.id)) return enCours.get(entree.id);
  const promesse = (async () => {
    const gardee = await imageGardee(entree.id);
    if (gardee) return gardee;
    try {
      const r = await fetch(new URL(entree.fichier, racine));
      if (!r.ok) return null;
      const blob = await compresser(await r.blob());
      await garder(entree.id, blob);
      return blob;
    } catch {
      return null; // hors ligne
    }
  })();
  enCours.set(entree.id, promesse);
  promesse.finally(() => enCours.delete(entree.id));
  return promesse;
}
