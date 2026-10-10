// Mon île : règles du petit jeu de construction (façon « Islanders », en plus doux).
// On achète des bâtiments avec ses étoiles et on les pose sur l'île ; chaque bâtiment donne des points
// de beauté, plus des bonus selon ses voisins (les 4 cases qui le touchent). Jamais de malus, jamais d'échec.
// Sans dépendance au navigateur (testé avec Node).
import { aleaGraine } from '../core/outils.js';

export const ILES = [
  { nom: 'L’Île du Matin', l: 5, h: 4, seuil: 0 },
  { nom: 'L’Île aux Blés', l: 6, h: 4, seuil: 40 },
  { nom: 'L’Île du Port', l: 6, h: 5, seuil: 100 },
  { nom: 'La Grande Île', l: 7, h: 5, seuil: 180 },
];

/**
 * Bâtiments. `aime` : bonus par voisin de ce type ; `cout` : prix de chaque niveau (pose, puis agrandissements).
 * `debloque` : beauté totale nécessaire pour l'acheter ; `cote` : se pose sur l'eau, au bord de l'île.
 */
export const BATIMENTS = {
  hameau: { nom: 'Hameau', base: 2, cout: [3, 4, 6], debloque: 0, aime: { foret: 1, champ: 1 }, desc: 'Aime la forêt et les champs' },
  champ: { nom: 'Champ de blé', base: 1, cout: [3, 3, 5], debloque: 0, aime: { ferme: 2, champ: 1 }, desc: 'Aime les fermes et les autres champs' },
  maison: { nom: 'Maison', base: 3, cout: [4, 5, 7], debloque: 0, aime: { hameau: 1, maison: 1, village: 1 }, desc: 'Aime avoir des voisins' },
  ferme: { nom: 'Ferme', base: 3, cout: [5, 6, 8], debloque: 10, aime: { champ: 1, foret: 1 }, desc: 'Aime les champs et la forêt' },
  village: { nom: 'Village', base: 5, cout: [8, 8, 10, 12], debloque: 20, aime: { maison: 1, hameau: 1, port: 2 }, desc: 'Aime les maisons et le port' },
  port: { nom: 'Port', base: 4, cout: [6, 7, 9], debloque: 30, aime: { village: 2, maison: 1, ferme: 1 }, desc: 'Se pose au bord de l’eau', cote: true },
  chateau: { nom: 'Château', base: 8, cout: [12, 12, 15], debloque: 50, aime: { village: 2, maison: 1, montagne: 1 }, desc: 'Aime les villages et la montagne' },
};
export const ORDRE_BATIMENTS = ['hameau', 'champ', 'maison', 'ferme', 'village', 'port', 'chateau'];

// ---------- Terrain ----------

/** Grille complète d'une île : (l + 2) × (h + 2) cases, la terre au milieu, la côte (eau) autour. */
export function grille(n) {
  const { l, h } = ILES[n];
  const L = l + 2, H = h + 2;
  const alea = aleaGraine(1000 + n * 77);
  const terrain = new Array(L * H).fill('eau');
  for (let y = 1; y <= h; y++) for (let x = 1; x <= l; x++) terrain[y * L + x] = 'herbe';
  // quelques bois et rochers naturels, toujours aux mêmes endroits pour une île donnée
  const terre = terrain.map((t, i) => (t === 'herbe' ? i : -1)).filter((i) => i >= 0);
  const nbForets = Math.round(terre.length * 0.16), nbMontagnes = Math.max(1, Math.round(terre.length * 0.06));
  for (let k = 0; k < nbForets + nbMontagnes; k++) {
    const libres = terre.filter((i) => terrain[i] === 'herbe');
    const i = libres[Math.floor(alea() * libres.length)];
    terrain[i] = k < nbForets ? 'foret' : 'montagne';
  }
  return { L, H, terrain };
}

/** La case est-elle un bord d'eau (côte) où l'on peut construire un port ? (pas dans les coins) */
export function estCote(g, i) {
  const x = i % g.L, y = Math.floor(i / g.L);
  const coin = (x === 0 || x === g.L - 1) && (y === 0 || y === g.H - 1);
  return g.terrain[i] === 'eau' && !coin;
}

export function voisins(g, i) {
  const x = i % g.L, y = Math.floor(i / g.L), out = [];
  if (x > 0) out.push(i - 1);
  if (x < g.L - 1) out.push(i + 1);
  if (y > 0) out.push(i - g.L);
  if (y < g.H - 1) out.push(i + g.L);
  return out;
}

/** Ce qu'il y a sur une case : le bâtiment s'il y en a un, sinon le terrain (foret, montagne, herbe, eau). */
const contenu = (g, cases, i) => (cases[i] ? cases[i].type : g.terrain[i]);

/** Peut-on poser ce bâtiment sur cette case ? */
export function peutPoser(g, cases, i, type) {
  if (cases[i]) return false;
  if (BATIMENTS[type].cote) return estCote(g, i);
  return g.terrain[i] === 'herbe';
}

// ---------- Points ----------

/** Points d'un bâtiment posé : base × niveau + bonus de voisinage. */
export function pointsCase(g, cases, i) {
  const b = cases[i];
  if (!b) return 0;
  const def = BATIMENTS[b.type];
  let p = def.base * b.niveau;
  for (const v of voisins(g, i)) p += def.aime[contenu(g, cases, v)] || 0;
  return p;
}

export function beaute(g, cases) {
  let s = 0;
  for (const i of Object.keys(cases)) s += pointsCase(g, cases, Number(i));
  return s;
}

/** Points de beauté gagnés si l'on pose `type` en `i` (en comptant le bonus donné aux voisins). */
export function apercu(g, cases, i, type) {
  if (!peutPoser(g, cases, i, type)) return null;
  const avant = beaute(g, cases);
  return beaute(g, { ...cases, [i]: { type, niveau: 1 } }) - avant;
}

// ---------- Partie sauvegardée (état pur, sans stockage ici) ----------

export function etatVide() {
  return { iles: ILES.map(() => ({ cases: {} })), active: 0 };
}

export const beauteTotale = (e) => e.iles.reduce((s, ile, n) => s + beaute(grille(n), ile.cases), 0);

/** Îles accessibles (selon la beauté totale atteinte). */
export const ilesOuvertes = (e) => ILES.filter((ile) => beauteTotale(e) >= ile.seuil).length;

export const estDebloque = (e, type) => beauteTotale(e) >= BATIMENTS[type].debloque;

/** Prochain objectif à atteindre (bâtiment ou île), pour la barre de progression. */
export function prochainPalier(e) {
  const b = beauteTotale(e);
  const paliers = [
    ...ORDRE_BATIMENTS.map((t) => ({ seuil: BATIMENTS[t].debloque, texte: `${BATIMENTS[t].nom}` })),
    ...ILES.slice(1).map((ile) => ({ seuil: ile.seuil, texte: ile.nom })),
  ].filter((p) => p.seuil > b).sort((x, y) => x.seuil - y.seuil);
  return paliers[0] || null;
}

/**
 * Pose un bâtiment (si possible et si on a assez d'étoiles).
 * @param {(n:number)=>boolean} payer  fonction qui retire les étoiles (renvoie false si pas assez)
 * @returns {{ ok: boolean, raison?: string, gain?: number }}
 */
export function poser(e, n, i, type, payer) {
  const g = grille(n), ile = e.iles[n];
  if (!estDebloque(e, type)) return { ok: false, raison: 'pas-debloque' };
  if (!peutPoser(g, ile.cases, i, type)) return { ok: false, raison: 'case' };
  const gain = apercu(g, ile.cases, i, type);
  if (!payer(BATIMENTS[type].cout[0])) return { ok: false, raison: 'etoiles' };
  ile.cases[i] = { type, niveau: 1 };
  return { ok: true, gain };
}

export const niveauMax = (type) => BATIMENTS[type].cout.length;

/** Agrandit un bâtiment d'un niveau. */
export function agrandir(e, n, i, payer) {
  const g = grille(n), ile = e.iles[n], b = ile.cases[i];
  if (!b) return { ok: false, raison: 'vide' };
  if (b.niveau >= niveauMax(b.type)) return { ok: false, raison: 'max' };
  const avant = beaute(g, ile.cases);
  if (!payer(BATIMENTS[b.type].cout[b.niveau])) return { ok: false, raison: 'etoiles' };
  b.niveau++;
  return { ok: true, gain: beaute(g, ile.cases) - avant };
}

/** Retire un bâtiment ; renvoie le total des étoiles dépensées dessus (remboursées). */
export function retirer(e, n, i) {
  const ile = e.iles[n], b = ile.cases[i];
  if (!b) return 0;
  const rendu = BATIMENTS[b.type].cout.slice(0, b.niveau).reduce((a, c) => a + c, 0);
  delete ile.cases[i];
  return rendu;
}
