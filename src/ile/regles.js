// Mon île (version 2) : construction paisible façon « Islanders », avec ressources récoltées en temps réel.
// Sans dépendance au navigateur (testé avec Node). Toutes les fonctions reçoivent l'heure `t` (ms) :
// rien ne dépend d'un minuteur, tout se calcule à partir des horodatages (donc aussi appli fermée).
//
// État :
// {
//   version: 2, active, ressources: { bois, pierre, ble },
//   iles: [{ ext: {x0,y0,x1,y1}, terrain: {"x,y": 'herbe'|'foret'|'montagne'|'etang'|'pousse'},
//            cases: {"x,y": { type, niveau, chantier: {debut, fin, vers} | null, depuis }},
//            travaux: {"x,y": { action, debut, fin }} }]
// }
// La terre est le rectangle ext ; la mer qui l'entoure (une case de large) accueille les ports.
import { aleaGraine } from '../core/outils.js';

export const MINUTE = 60 * 1000;
export const RESSOURCES = ['bois', 'pierre', 'ble'];
export const NOMS_RESSOURCES = { bois: 'bois', pierre: 'pierre', ble: 'blé' };

export const ILES = [
  { nom: 'L’Île du Matin', l: 5, h: 4, seuil: 0 },
  { nom: 'L’Île aux Blés', l: 6, h: 4, seuil: 40 },
  { nom: 'L’Île du Port', l: 6, h: 5, seuil: 100 },
  { nom: 'La Grande Île', l: 7, h: 5, seuil: 180 },
];
export const TAILLE_MAX = { l: 10, h: 8 };

/**
 * Bâtiments. cout[n] : prix pour atteindre le niveau n + 1 ({ etoiles, bois, pierre, ble }).
 * prod : ressource produite, minutes par unité au niveau 1, et condition éventuelle (voisin nécessaire).
 */
export const BATIMENTS = {
  hameau: {
    nom: 'Cabane de bûcheron', base: 2, debloque: 0, duree: 0.5, aime: { foret: 1, champ: 1, fleurs: 1 }, habitants: 1,
    prod: { res: 'bois', minutes: 1.5, besoin: 'foret', portee: 2 },
    cout: [{ etoiles: 3 }, { etoiles: 2, bois: 5 }, { etoiles: 3, bois: 10, pierre: 3 }],
    desc: 'Coupe du bois s’il y a une forêt tout près',
  },
  champ: {
    nom: 'Champ de blé', base: 1, debloque: 0, duree: 0.5, aime: { ferme: 2, champ: 1, ruche: 1 }, habitants: 0,
    prod: { res: 'ble', minutes: 2 },
    cout: [{ etoiles: 3 }, { etoiles: 2, bois: 4 }, { etoiles: 3, bois: 6, pierre: 2 }],
    desc: 'Donne du blé',
  },
  carriere: {
    nom: 'Carrière', base: 1, debloque: 5, duree: 0.75, aime: { montagne: 1 }, habitants: 0,
    prod: { res: 'pierre', minutes: 2.5, besoin: 'montagne', portee: 1 },
    cout: [{ etoiles: 3, bois: 5 }, { etoiles: 2, bois: 8 }, { etoiles: 3, bois: 10, pierre: 5 }],
    desc: 'Donne de la pierre, à côté des rochers', surMontagne: false,
  },
  maison: {
    nom: 'Maison', base: 3, debloque: 0, duree: 0.75, aime: { hameau: 1, maison: 1, village: 1, fleurs: 1, puits: 1 }, habitants: 2,
    cout: [{ etoiles: 4, bois: 6 }, { etoiles: 3, bois: 8, pierre: 4 }, { etoiles: 4, bois: 10, pierre: 8 }],
    desc: 'Accueille deux habitants ; aime avoir des voisins',
  },
  ferme: {
    nom: 'Ferme', base: 3, debloque: 10, duree: 1, aime: { champ: 1, foret: 1 }, habitants: 1,
    prod: { res: 'ble', minutes: 2.5 },
    cout: [{ etoiles: 5, bois: 8 }, { etoiles: 3, bois: 10, pierre: 4 }, { etoiles: 4, bois: 12, pierre: 8 }],
    desc: 'Des moutons, du blé ; aime les champs',
  },
  village: {
    nom: 'Village', base: 5, debloque: 20, duree: 2, aime: { maison: 1, hameau: 1, port: 2, puits: 2 }, habitants: 3,
    cout: [
      { etoiles: 6, bois: 12, pierre: 8, ble: 6 }, { etoiles: 5, bois: 15, pierre: 12, ble: 10 },
      { etoiles: 6, bois: 20, pierre: 16, ble: 14 }, { etoiles: 8, bois: 25, pierre: 20, ble: 20 },
    ],
    desc: 'Accueille trois habitants ; aime les maisons et le port',
  },
  port: {
    nom: 'Port', base: 4, debloque: 30, duree: 1.5, aime: { village: 2, maison: 1, ferme: 1 }, habitants: 0, cote: true,
    cout: [{ etoiles: 6, bois: 15 }, { etoiles: 4, bois: 15, pierre: 6 }, { etoiles: 5, bois: 20, pierre: 10 }],
    desc: 'Se construit sur l’eau, au bord de l’île',
  },
  chateau: {
    nom: 'Château', base: 8, debloque: 50, duree: 3, aime: { village: 2, maison: 1, montagne: 1 }, habitants: 2,
    cout: [{ etoiles: 10, bois: 20, pierre: 30 }, { etoiles: 8, bois: 25, pierre: 35, ble: 15 }, { etoiles: 10, bois: 30, pierre: 40, ble: 20 }],
    desc: 'Le joyau de l’île ; aime les villages et la montagne',
  },
};
export const ORDRE_BATIMENTS = ['hameau', 'champ', 'maison', 'carriere', 'ferme', 'village', 'port', 'chateau'];

/** Décorations : posées tout de suite, une seule taille. */
export const DECORS = {
  fleurs: { nom: 'Massif de fleurs', beaute: 1, aime: { maison: 1, village: 1 }, cout: { etoiles: 1 }, desc: 'Les maisons voisines les adorent' },
  buisson: { nom: 'Buisson', beaute: 1, aime: {}, cout: { bois: 2 }, desc: 'Un peu de verdure' },
  arbre: { nom: 'Bel arbre', beaute: 2, aime: { maison: 1 }, cout: { bois: 3 }, desc: 'Un arbre bien rond' },
  automne: { nom: 'Arbre d’automne', beaute: 2, aime: { etang: 1 }, cout: { bois: 3, etoiles: 1 }, desc: 'Joli près d’un étang' },
  sapin: { nom: 'Sapin', beaute: 2, aime: { chateau: 1 }, cout: { bois: 3, etoiles: 1 }, desc: 'Fier près du château' },
  champignons: { nom: 'Champignons', beaute: 1, aime: { foret: 1 }, cout: { etoiles: 1 }, desc: 'Ils aiment l’ombre des forêts' },
  ruche: { nom: 'Ruche', beaute: 2, aime: { champ: 1, fleurs: 1 }, cout: { bois: 3, etoiles: 1 }, desc: 'Les abeilles aiment les champs et les fleurs' },
  puits: { nom: 'Puits', beaute: 3, aime: { maison: 1, village: 1 }, cout: { pierre: 4, etoiles: 2 }, desc: 'Le cœur du village', debloque: 15 },
  panneau: { nom: 'Panneau', beaute: 1, aime: { port: 1 }, cout: { bois: 2 }, desc: 'Pour indiquer le chemin' },
};
export const ORDRE_DECORS = ['fleurs', 'buisson', 'arbre', 'automne', 'sapin', 'champignons', 'ruche', 'puits', 'panneau'];

/** Aménagements du terrain : durée (minutes), coût, gain, et terrain obtenu. */
export const AMENAGEMENTS = {
  abattre: { nom: 'Abattre la forêt', de: 'foret', vers: 'herbe', minutes: 0.33, gain: { bois: 4 }, cout: {}, desc: 'Donne du bois, libère la place' },
  casser: { nom: 'Casser les rochers', de: 'montagne', vers: 'herbe', minutes: 0.66, gain: { pierre: 4 }, cout: {}, desc: 'Donne de la pierre, libère la place' },
  planter: { nom: 'Planter des arbres', de: 'herbe', vers: 'foret', minutes: 3, gain: {}, cout: { bois: 1 }, desc: 'Une forêt pousse en quelques minutes' },
  creuser: { nom: 'Creuser un étang', de: 'herbe', vers: 'etang', minutes: 0.5, gain: {}, cout: { etoiles: 2 }, desc: 'Un étang embellit ses voisins' },
  combler: { nom: 'Combler l’étang', de: 'etang', vers: 'herbe', minutes: 0.25, gain: {}, cout: {}, desc: 'Rend la case constructible' },
};
export const ORDRE_AMENAGEMENTS = ['abattre', 'casser', 'planter', 'creuser', 'combler'];
/** Beauté apportée par certains terrains. */
const BEAUTE_TERRAIN = { etang: 3 };

export const PLAFOND_PAR_NIVEAU = 10; // stock maximal d'un bâtiment producteur, par niveau
export const COUT_AGRANDIR_CASE = { pierre: 2 }; // par nouvelle case de terre
export const COUT_AGRANDIR_FIXE = { etoiles: 4 };

// ---------- Outils de cases ----------

export const cle = (x, y) => `${x},${y}`;
export const coord = (k) => k.split(',').map(Number);
const VOISINS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const voisinsDe = (x, y) => VOISINS.map(([dx, dy]) => [x + dx, y + dy]);

export const estTerre = (ile, x, y) => x >= ile.ext.x0 && x <= ile.ext.x1 && y >= ile.ext.y0 && y <= ile.ext.y1;
/** Case d'eau collée à l'île (pas un coin) : on peut y construire un port. */
export function estCote(ile, x, y) {
  const { x0, y0, x1, y1 } = ile.ext;
  if (estTerre(ile, x, y)) return false;
  const dansX = x >= x0 && x <= x1, dansY = y >= y0 && y <= y1;
  return (dansX && (y === y0 - 1 || y === y1 + 1)) || (dansY && (x === x0 - 1 || x === x1 + 1));
}
export const terrainDe = (ile, x, y) => (estTerre(ile, x, y) ? ile.terrain[cle(x, y)] || 'herbe' : 'eau');

/** Ce qu'il y a sur une case pour les voisins : le bâtiment / décor (s'il est fini), sinon le terrain. */
function contenu(ile, x, y) {
  const c = ile.cases[cle(x, y)];
  if (c && c.niveau > 0) return c.type;
  return terrainDe(ile, x, y);
}

const somme = (a, b) => { const r = { ...a }; for (const [k, v] of Object.entries(b || {})) r[k] = (r[k] || 0) + v; return r; };

// ---------- Création, migration ----------

function ileNeuve(n) {
  const { l, h } = ILES[n];
  const alea = aleaGraine(1000 + n * 77);
  const terrain = {};
  const terre = [];
  for (let y = 1; y <= h; y++) for (let x = 1; x <= l; x++) terre.push(cle(x, y));
  const nbForets = Math.round(terre.length * 0.16), nbMontagnes = Math.max(1, Math.round(terre.length * 0.06));
  for (let k = 0; k < nbForets + nbMontagnes; k++) {
    const libres = terre.filter((c) => !terrain[c]);
    terrain[libres[Math.floor(alea() * libres.length)]] = k < nbForets ? 'foret' : 'montagne';
  }
  return { ext: { x0: 1, y0: 1, x1: l, y1: h }, terrain, cases: {}, travaux: {} };
}

export function etatVide() {
  return { version: 2, active: 0, ressources: { bois: 0, pierre: 0, ble: 0 }, iles: ILES.map((_, n) => ileNeuve(n)) };
}

/** Reprend une sauvegarde de la version 1 (cases numérotées dans une grille fixe). */
export function migrer(ancien, t) {
  if (ancien && ancien.version === 2) return ancien;
  const e = etatVide();
  if (!ancien || !ancien.iles) return e;
  e.active = ancien.active || 0;
  ancien.iles.forEach((ile, n) => {
    if (!ILES[n]) return;
    const L = ILES[n].l + 2;
    for (const [i, b] of Object.entries(ile.cases || {})) {
      const x = Number(i) % L, y = Math.floor(Number(i) / L);
      e.iles[n].cases[cle(x, y)] = { type: b.type, niveau: b.niveau, chantier: null, depuis: t };
      if (e.iles[n].terrain[cle(x, y)] && b.type !== 'port') delete e.iles[n].terrain[cle(x, y)];
    }
  });
  return e;
}

// ---------- Beauté ----------

export function pointsCase(ile, x, y) {
  const c = ile.cases[cle(x, y)];
  if (!c || c.niveau === 0) return BEAUTE_TERRAIN[terrainDe(ile, x, y)] || 0;
  const def = BATIMENTS[c.type] || DECORS[c.type];
  let p = BATIMENTS[c.type] ? def.base * c.niveau : def.beaute;
  for (const [vx, vy] of voisinsDe(x, y)) p += def.aime[contenu(ile, vx, vy)] || 0;
  return p;
}

export function beauteIle(ile) {
  let s = 0;
  const vus = new Set(Object.keys(ile.cases));
  for (const k of vus) s += pointsCase(ile, ...coord(k));
  for (const [k, t] of Object.entries(ile.terrain)) if (!vus.has(k) && BEAUTE_TERRAIN[t]) s += BEAUTE_TERRAIN[t];
  return s;
}
export const beauteTotale = (e) => e.iles.reduce((s, ile) => s + beauteIle(ile), 0);
export const ilesOuvertes = (e) => ILES.filter((ile) => beauteTotale(e) >= ile.seuil).length;
export const estDebloque = (e, type) => beauteTotale(e) >= ((BATIMENTS[type] || DECORS[type]).debloque || 0);

export function prochainPalier(e) {
  const b = beauteTotale(e);
  const paliers = [
    ...ORDRE_BATIMENTS.map((t) => ({ seuil: BATIMENTS[t].debloque, texte: BATIMENTS[t].nom })),
    ...ORDRE_DECORS.filter((t) => DECORS[t].debloque).map((t) => ({ seuil: DECORS[t].debloque, texte: DECORS[t].nom })),
    ...ILES.slice(1).map((ile) => ({ seuil: ile.seuil, texte: ile.nom })),
  ].filter((p) => p.seuil > b).sort((x, y) => x.seuil - y.seuil);
  return paliers[0] || null;
}

/** Points de beauté gagnés si l'on pose `type` en (x, y), voisins compris. */
export function apercu(ile, x, y, type) {
  if (!peutPoser(ile, x, y, type)) return null;
  const avant = beauteIle(ile);
  const k = cle(x, y);
  ile.cases[k] = { type, niveau: 1 };
  const apres = beauteIle(ile);
  delete ile.cases[k];
  return apres - avant;
}

// ---------- Habitants ----------

export function habitants(e) {
  let n = 0;
  for (const ile of e.iles) for (const c of Object.values(ile.cases)) {
    const def = BATIMENTS[c.type];
    if (def && c.niveau > 0) n += def.habitants * c.niveau;
  }
  return n;
}

// ---------- Paiement ----------

/** A-t-on de quoi payer ? `etoiles` : le solde d'étoiles (géré ailleurs). */
export function peutPayer(e, etoiles, cout) {
  if ((cout.etoiles || 0) > etoiles) return false;
  return RESSOURCES.every((r) => (cout[r] || 0) <= (e.ressources[r] || 0));
}
/** Ce qui manque pour payer (objet vide si rien). */
export function manque(e, etoiles, cout) {
  const m = {};
  if ((cout.etoiles || 0) > etoiles) m.etoiles = cout.etoiles - etoiles;
  for (const r of RESSOURCES) if ((cout[r] || 0) > (e.ressources[r] || 0)) m[r] = cout[r] - (e.ressources[r] || 0);
  return m;
}
/** Retire les ressources du coût (les étoiles sont retirées par `payerEtoiles`). */
function payer(e, cout, payerEtoiles) {
  if (cout.etoiles && !payerEtoiles(cout.etoiles)) return false;
  for (const r of RESSOURCES) e.ressources[r] -= cout[r] || 0;
  return true;
}

// ---------- Construire ----------

export function peutPoser(ile, x, y, type) {
  if (ile.cases[cle(x, y)] || ile.travaux[cle(x, y)]) return false;
  if (BATIMENTS[type]?.cote) return estCote(ile, x, y);
  if (!estTerre(ile, x, y) || terrainDe(ile, x, y) !== 'herbe') return false;
  return true;
}

export const dureeChantier = (type, versNiveau) => BATIMENTS[type].duree * (1 + (versNiveau - 1) * 0.5) * MINUTE;

/** Pose un bâtiment : un chantier démarre. */
export function construire(e, n, x, y, type, etoiles, payerEtoiles, t) {
  const ile = e.iles[n], def = BATIMENTS[type];
  if (!estDebloque(e, type)) return { ok: false, raison: 'pas-debloque' };
  if (!peutPoser(ile, x, y, type)) return { ok: false, raison: 'case' };
  if (!peutPayer(e, etoiles, def.cout[0])) return { ok: false, raison: 'cout', manque: manque(e, etoiles, def.cout[0]) };
  if (!payer(e, def.cout[0], payerEtoiles)) return { ok: false, raison: 'cout' };
  ile.cases[cle(x, y)] = { type, niveau: 0, chantier: { debut: t, fin: t + dureeChantier(type, 1), vers: 1 }, depuis: t };
  return { ok: true };
}

export const niveauMax = (type) => BATIMENTS[type].cout.length;

/** Agrandit un bâtiment : un chantier démarre (le bâtiment continue de produire pendant ce temps). */
export function ameliorer(e, n, x, y, etoiles, payerEtoiles, t) {
  const c = e.iles[n].cases[cle(x, y)];
  if (!c || !BATIMENTS[c.type]) return { ok: false, raison: 'vide' };
  if (c.chantier) return { ok: false, raison: 'en-cours' };
  if (c.niveau >= niveauMax(c.type)) return { ok: false, raison: 'max' };
  const cout = BATIMENTS[c.type].cout[c.niveau];
  if (!peutPayer(e, etoiles, cout)) return { ok: false, raison: 'cout', manque: manque(e, etoiles, cout) };
  if (!payer(e, cout, payerEtoiles)) return { ok: false, raison: 'cout' };
  c.chantier = { debut: t, fin: t + dureeChantier(c.type, c.niveau + 1), vers: c.niveau + 1 };
  return { ok: true };
}

/** Finir tout de suite un chantier : 1 étoile par minute restante (au moins 1). */
export const prixAcceleration = (c, t) => Math.max(1, Math.ceil((c.chantier.fin - t) / MINUTE));
export function accelerer(e, n, x, y, payerEtoiles, t) {
  const c = e.iles[n].cases[cle(x, y)];
  if (!c?.chantier) return { ok: false };
  if (!payerEtoiles(prixAcceleration(c, t))) return { ok: false, raison: 'cout' };
  c.chantier.fin = t;
  return { ok: true };
}

/** Pose une décoration (tout de suite). */
export function decorer(e, n, x, y, type, etoiles, payerEtoiles) {
  const ile = e.iles[n], def = DECORS[type];
  if (!estDebloque(e, type)) return { ok: false, raison: 'pas-debloque' };
  if (!peutPoser(ile, x, y, type)) return { ok: false, raison: 'case' };
  if (!peutPayer(e, etoiles, def.cout)) return { ok: false, raison: 'cout', manque: manque(e, etoiles, def.cout) };
  const avant = beauteIle(ile);
  if (!payer(e, def.cout, payerEtoiles)) return { ok: false, raison: 'cout' };
  ile.cases[cle(x, y)] = { type, niveau: 1, chantier: null };
  return { ok: true, gain: beauteIle(ile) - avant };
}

/** Retire un bâtiment ou un décor : on récupère ce qu'il a coûté. */
export function retirer(e, n, x, y) {
  const ile = e.iles[n], k = cle(x, y), c = ile.cases[k];
  if (!c) return null;
  let rendu = {};
  if (DECORS[c.type]) rendu = { ...DECORS[c.type].cout };
  else {
    const niveauxPayes = c.chantier ? c.chantier.vers : c.niveau;
    for (let i = 0; i < niveauxPayes; i++) rendu = somme(rendu, BATIMENTS[c.type].cout[i]);
  }
  for (const r of RESSOURCES) e.ressources[r] += rendu[r] || 0;
  delete ile.cases[k];
  return rendu; // les étoiles éventuelles (rendu.etoiles) sont à rendre par l'appelant
}

// ---------- Production ----------

/** Le bâtiment produit-il ? (une cabane a besoin d'une forêt proche, une carrière de rochers à côté) */
export function produit(ile, x, y) {
  const c = ile.cases[cle(x, y)];
  const def = c && BATIMENTS[c.type];
  if (!def?.prod || c.niveau === 0) return false;
  const { besoin, portee } = def.prod;
  if (!besoin) return true;
  for (let dy = -portee; dy <= portee; dy++) for (let dx = -portee; dx <= portee; dx++) {
    if (Math.abs(dx) + Math.abs(dy) > portee || (!dx && !dy)) continue;
    if (terrainDe(ile, x + dx, y + dy) === besoin && !ile.cases[cle(x + dx, y + dy)]) return true;
  }
  return false;
}

export const periode = (c) => (BATIMENTS[c.type].prod.minutes * MINUTE) / c.niveau;
export const plafond = (c) => PLAFOND_PAR_NIVEAU * c.niveau;

/** Stock prêt à ramasser. */
export function stock(ile, x, y, t) {
  const c = ile.cases[cle(x, y)];
  if (!produit(ile, x, y)) return 0;
  return Math.min(plafond(c), Math.floor((t - c.depuis) / periode(c)));
}

/** Ramasse la récolte d'un bâtiment. Renvoie { res, n }. */
export function ramasser(e, n, x, y, t) {
  const ile = e.iles[n], c = ile.cases[cle(x, y)];
  const q = stock(ile, x, y, t);
  if (!q) return { res: null, n: 0 };
  const res = BATIMENTS[c.type].prod.res;
  e.ressources[res] += q;
  // on garde l'avancement de l'unité en cours (sauf si le stock était plein)
  const plein = q >= plafond(c);
  c.depuis = plein ? t : c.depuis + q * periode(c);
  return { res, n: q };
}

/** Tout ramasser sur toutes les îles. Renvoie les totaux par ressource. */
export function toutRamasser(e, t) {
  const total = {};
  e.iles.forEach((ile, n) => {
    for (const k of Object.keys(ile.cases)) {
      const { res, n: q } = ramasser(e, n, ...coord(k), t);
      if (q) total[res] = (total[res] || 0) + q;
    }
  });
  return total;
}

// ---------- Aménager le terrain ----------

export function peutAmenager(ile, x, y, action) {
  const a = AMENAGEMENTS[action];
  if (!estTerre(ile, x, y) || ile.cases[cle(x, y)] || ile.travaux[cle(x, y)]) return false;
  return terrainDe(ile, x, y) === a.de;
}

export function amenager(e, n, x, y, action, etoiles, payerEtoiles, t) {
  const ile = e.iles[n], a = AMENAGEMENTS[action];
  if (!peutAmenager(ile, x, y, action)) return { ok: false, raison: 'case' };
  if (!peutPayer(e, etoiles, a.cout)) return { ok: false, raison: 'cout', manque: manque(e, etoiles, a.cout) };
  if (!payer(e, a.cout, payerEtoiles)) return { ok: false, raison: 'cout' };
  ile.travaux[cle(x, y)] = { action, debut: t, fin: t + a.minutes * MINUTE };
  return { ok: true };
}

// ---------- Agrandir l'île ----------

const DIRECTIONS = { nord: [0, -1], sud: [0, 1], ouest: [-1, 0], est: [1, 0] };
export const NOMS_DIRECTIONS = { nord: 'vers le haut', sud: 'vers le bas', ouest: 'vers la gauche', est: 'vers la droite' };

/** Les cases d'eau qui deviendraient de la terre si l'on agrandit vers `dir`. */
function nouvellesCases(ile, dir) {
  const { x0, y0, x1, y1 } = ile.ext, out = [];
  if (dir === 'nord' || dir === 'sud') { const y = dir === 'nord' ? y0 - 1 : y1 + 1; for (let x = x0; x <= x1; x++) out.push([x, y]); }
  else { const x = dir === 'ouest' ? x0 - 1 : x1 + 1; for (let y = y0; y <= y1; y++) out.push([x, y]); }
  return out;
}

export function coutAgrandir(ile, dir) {
  const n = nouvellesCases(ile, dir).length;
  return somme(COUT_AGRANDIR_FIXE, Object.fromEntries(Object.entries(COUT_AGRANDIR_CASE).map(([k, v]) => [k, v * n])));
}

/** Peut-on agrandir dans cette direction ? Renvoie null si oui, sinon la raison. */
export function obstacleAgrandir(ile, dir) {
  const { x0, y0, x1, y1 } = ile.ext;
  const l = x1 - x0 + 1, h = y1 - y0 + 1;
  if ((dir === 'nord' || dir === 'sud') && h >= TAILLE_MAX.h) return 'max';
  if ((dir === 'ouest' || dir === 'est') && l >= TAILLE_MAX.l) return 'max';
  if (nouvellesCases(ile, dir).some(([x, y]) => ile.cases[cle(x, y)])) return 'port';
  return null;
}

export function agrandir(e, n, dir, etoiles, payerEtoiles) {
  const ile = e.iles[n];
  if (!DIRECTIONS[dir]) return { ok: false, raison: 'direction' };
  const obstacle = obstacleAgrandir(ile, dir);
  if (obstacle) return { ok: false, raison: obstacle };
  const cout = coutAgrandir(ile, dir);
  if (!peutPayer(e, etoiles, cout)) return { ok: false, raison: 'cout', manque: manque(e, etoiles, cout) };
  if (!payer(e, cout, payerEtoiles)) return { ok: false, raison: 'cout' };
  const cases = nouvellesCases(ile, dir);
  if (dir === 'nord') ile.ext.y0--; else if (dir === 'sud') ile.ext.y1++; else if (dir === 'ouest') ile.ext.x0--; else ile.ext.x1++;
  // les ports qui étaient au bord de ce côté restent sur l'eau : on ne bouge rien d'autre
  return { ok: true, cases };
}

// ---------- Le temps passe ----------

/**
 * Termine ce qui doit l'être (chantiers, travaux, arbres qui poussent).
 * Renvoie la liste des événements pour l'affichage : { genre, n, x, y, ... }.
 */
export function actualiser(e, t) {
  const evenements = [];
  e.iles.forEach((ile, n) => {
    for (const [k, c] of Object.entries(ile.cases)) {
      if (c.chantier && t >= c.chantier.fin) {
        const etaitNeuf = c.niveau === 0;
        const avant = beauteIle(ile);
        c.niveau = c.chantier.vers;
        if (etaitNeuf) c.depuis = c.chantier.fin;
        c.chantier = null;
        evenements.push({ genre: etaitNeuf ? 'construit' : 'agrandi', n, cle: k, type: c.type, niveau: c.niveau, gain: beauteIle(ile) - avant });
      }
    }
    for (const [k, w] of Object.entries(ile.travaux)) {
      if (t < w.fin) continue;
      const a = AMENAGEMENTS[w.action];
      if (a.vers === 'herbe') delete ile.terrain[k]; else ile.terrain[k] = a.vers;
      for (const [r, q] of Object.entries(a.gain)) e.ressources[r] += q;
      delete ile.travaux[k];
      evenements.push({ genre: 'amenage', n, cle: k, action: w.action, gain: a.gain });
    }
  });
  return evenements;
}
