// Mon île (version 3) : construction paisible façon « Islanders », avec ressources récoltées en temps réel.
// Sans dépendance au navigateur (testé avec Node). Toutes les fonctions reçoivent l'heure `t` (ms) :
// rien ne dépend d'un minuteur, tout se calcule à partir des horodatages (donc aussi appli fermée).
//
// État :
// {
//   version: 3, active, ressources: { bois, pierre, ble },
//   iles: [{ terre: {"x,y": 1}, centre: {x, y}, ext: {x0,y0,x1,y1} (le rectangle qui contient la terre),
//            terrain: {"x,y": 'herbe'|'foret'|'montagne'|'etang'|'buisson'|'caillou'},
//            cases: {"x,y": { type, niveau, chantier: {debut, fin, vers} | null, depuis }},
//            travaux: {"x,y": { action, debut, fin }} }]
// }
// La terre est un ensemble de cases, de forme libre ; elle s'agrandit case par case (on achète une case
// d'eau collée à la terre). La mer qui la touche accueille les ports.
import { aleaGraine, pluriel } from '../core/outils.js';

export const MINUTE = 60 * 1000;
export const RESSOURCES = ['bois', 'pierre', 'ble'];
export const NOMS_RESSOURCES = { bois: 'bois', pierre: 'pierre', ble: 'blé', pieces: 'pièces de puzzle' };
/**
 * Ce qui se récolte sur l'île mais ne se range pas dans e.ressources : les pièces de puzzle (core/pieces.js),
 * créditées par l'écran au moment du ramassage.
 */
export const RECOLTES_EXTERIEURES = ['pieces'];
/** « 3 bois », « 1 pièce de puzzle », « 2 pièces de puzzle » (bois, pierre et blé sont invariables). */
export const quantite = (q, res) => (res === 'pieces' ? pluriel(q, 'pièce de puzzle', 'pièces de puzzle') : `${q} ${NOMS_RESSOURCES[res]}`);

/** l × h : la place dont dispose l'île au départ ; surface : son nombre de cases de terre au départ. */
export const ILES = [
  { nom: 'L’Île du Matin', l: 6, h: 5, surface: 18, seuil: 0 },
  { nom: 'L’Île aux Blés', l: 7, h: 5, surface: 22, seuil: 40 },
  { nom: 'L’Île du Port', l: 7, h: 6, surface: 26, seuil: 100 },
  { nom: 'La Grande Île', l: 8, h: 6, surface: 30, seuil: 180 },
];
/** Jusqu'où l'île peut s'étendre autour de son centre de départ (en cases) : 10 × 8 au plus. */
export const PORTEE_MAX = { x: 5, y: 4 };

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
  atelier: {
    nom: 'Atelier du puzzle', base: 4, debloque: 15, duree: 1.5, unique: true, habitants: 1,
    aime: { maison: 1, village: 2, puits: 1, fleurs: 1 },
    // une pièce toutes les 8 h, 6 h, 4 h 48, puis 4 h ; réserve de 6, 8, 10, 12 pièces
    prod: { res: 'pieces', periodes: [480, 360, 288, 240], plafonds: [6, 8, 10, 12] },
    cout: [
      { etoiles: 6, bois: 10, pierre: 6 },
      { etoiles: 6, bois: 15, pierre: 10, ble: 6 },
      { etoiles: 8, bois: 20, pierre: 15, ble: 10 },
      { etoiles: 10, bois: 30, pierre: 20, ble: 15 },
    ],
    desc: 'Fabrique des pièces de puzzle, même appli fermée ; un seul sur l’archipel',
  },
};
export const ORDRE_BATIMENTS = ['hameau', 'champ', 'maison', 'carriere', 'ferme', 'atelier', 'village', 'port', 'chateau'];
/** Ce qu'on gagne en temps de travail de l'Atelier (minutes) : une partie gagnée selon sa difficulté, une mission. */
export const AVANCE_PARTIE = { facile: 30, moyen: 45, difficile: 60 };
export const AVANCE_PARTIE_DEFAUT = 45;
export const AVANCE_MISSION = 60;

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
  debroussailler: { nom: 'Débroussailler', de: 'buisson', vers: 'herbe', minutes: 0.15, gain: { bois: 2 }, cout: {}, desc: 'Un peu de bois, et la place est libre' },
  cailloux: { nom: 'Ramasser les cailloux', de: 'caillou', vers: 'herbe', minutes: 0.15, gain: { pierre: 2 }, cout: {}, desc: 'Un peu de pierre, et la place est libre' },
};
export const ORDRE_AMENAGEMENTS = ['abattre', 'casser', 'planter', 'creuser', 'combler', 'debroussailler', 'cailloux'];
/** Ce qui repousse tout seul sur l'herbe libre (comme les arbustes des jeux de construction) : vite enlevé, un peu de ressources. */
export const OBSTACLES = ['buisson', 'caillou'];
export const INTERVALLE_POUSSE = 3 * 60 * MINUTE;
export const MAX_OBSTACLES = 3; // par île
/** Beauté apportée par certains terrains. */
const BEAUTE_TERRAIN = { etang: 3 };

export const PLAFOND_PAR_NIVEAU = 10; // stock maximal d'un bâtiment producteur, par niveau
export const BATISSEURS_DEPART = 2; // chantiers menés en même temps (les aménagements n'en demandent pas)
export const PRIX_BATISSEURS = [15, 30]; // en étoiles : le 3e, puis le 4e bâtisseur
export const INTERVALLE_TRESOR = 40 * MINUTE; // une bouteille s'échoue sur la plage de temps en temps

// ---------- Outils de cases ----------

export const cle = (x, y) => `${x},${y}`;
export const coord = (k) => k.split(',').map(Number);
const VOISINS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const voisinsDe = (x, y) => VOISINS.map(([dx, dy]) => [x + dx, y + dy]);

export const estTerre = (ile, x, y) => Boolean(ile.terre?.[cle(x, y)]);
/** Case d'eau collée à l'île par un côté (pas seulement par un coin) : on peut y construire un port. */
export const estCote = (ile, x, y) => !estTerre(ile, x, y) && voisinsDe(x, y).some(([vx, vy]) => estTerre(ile, vx, vy));
export const nbTerres = (ile) => Object.keys(ile.terre).length;
/** Recalcule le rectangle qui contient la terre (utile pour parcourir l'île). */
export function majExt(ile) {
  const pts = Object.keys(ile.terre).map(coord);
  ile.ext = {
    x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
  };
  return ile;
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

/** Place forêts, rochers, buissons et cailloux sur la terre d'une île neuve. */
function semer(terre, alea) {
  const terrain = {};
  const nbForets = Math.round(terre.length * 0.16), nbMontagnes = Math.max(1, Math.round(terre.length * 0.06));
  const types = [...Array(nbForets).fill('foret'), ...Array(nbMontagnes).fill('montagne'), 'buisson', 'buisson', 'caillou'];
  for (const type of types) {
    const libres = terre.filter((c) => !terrain[c]);
    terrain[libres[Math.floor(alea() * libres.length)]] = type;
  }
  return terrain;
}

/**
 * Une forme d'île naturelle : on part du centre et l'on ajoute des cases au bord, en préférant celles qui ont
 * déjà plusieurs voisines de terre (la forme reste ronde et pleine), avec un peu de hasard pour les caps et les anses.
 */
export function formeOrganique(l, h, surface, alea) {
  const terre = new Set([cle(Math.ceil(l / 2), Math.ceil(h / 2))]);
  const dedans = (x, y) => x >= 1 && x <= l && y >= 1 && y <= h;
  while (terre.size < surface) {
    const candidats = new Map();
    for (const k of terre) {
      for (const [x, y] of voisinsDe(...coord(k))) {
        if (!dedans(x, y) || terre.has(cle(x, y))) continue;
        const voisines = voisinsDe(x, y).filter(([a, b]) => terre.has(cle(a, b))).length;
        candidats.set(cle(x, y), voisines ** 3 + alea() * 1.6);
      }
    }
    if (!candidats.size) break;
    // tirage au sort pondéré par le poids de chaque case
    const total = [...candidats.values()].reduce((s, v) => s + v, 0);
    let r = alea() * total;
    for (const [k, poids] of candidats) { r -= poids; if (r <= 0) { terre.add(k); break; } }
  }
  // pas de lac fermé au milieu : l'eau entourée de terre devient de la terre
  const dehors = new Set(), file = [];
  for (let y = 0; y <= h + 1; y++) for (let x = 0; x <= l + 1; x++) if (!dedans(x, y)) { dehors.add(cle(x, y)); file.push([x, y]); }
  while (file.length) {
    const [x, y] = file.shift();
    for (const [a, b] of voisinsDe(x, y)) {
      const k = cle(a, b);
      if (a < 0 || b < 0 || a > l + 1 || b > h + 1 || dehors.has(k) || terre.has(k)) continue;
      dehors.add(k);
      file.push([a, b]);
    }
  }
  for (let y = 1; y <= h; y++) for (let x = 1; x <= l; x++) if (!dehors.has(cle(x, y))) terre.add(cle(x, y));
  return [...terre];
}

function ileNeuve(n) {
  const { l, h, surface } = ILES[n];
  const alea = aleaGraine(1000 + n * 77);
  const terre = formeOrganique(l, h, surface, alea);
  const ile = { terre: Object.fromEntries(terre.map((k) => [k, 1])), terrain: semer(terre, alea), cases: {}, travaux: {} };
  majExt(ile);
  ile.centre = { x: (l + 1) / 2, y: (h + 1) / 2 };
  return ile;
}

/** Une île rectangulaire (les anciennes sauvegardes) : la terre couvre tout le rectangle. */
function ileRectangle(ext) {
  const terre = {};
  for (let y = ext.y0; y <= ext.y1; y++) for (let x = ext.x0; x <= ext.x1; x++) terre[cle(x, y)] = 1;
  return { terre, ext: { ...ext }, centre: { x: (ext.x0 + ext.x1) / 2, y: (ext.y0 + ext.y1) / 2 } };
}

export function etatVide() {
  return { version: 3, active: 0, ressources: { bois: 0, pierre: 0, ble: 0 }, iles: ILES.map((_, n) => ileNeuve(n)) };
}

/** Anciennes dimensions des îles rectangulaires (versions 1 et 2). */
const ANCIENNES = [{ l: 5, h: 4 }, { l: 6, h: 4 }, { l: 6, h: 5 }, { l: 7, h: 5 }];

/**
 * Reprend une ancienne sauvegarde.
 * - version 1 : cases numérotées dans une grille fixe, autour d'une île rectangulaire ;
 * - version 2 : îles rectangulaires. Une île où rien n'a encore été fait prend la nouvelle forme naturelle ;
 *   les autres gardent leur terre telle quelle (rien n'est perdu) et s'agrandiront case par case.
 */
export function migrer(ancien, t) {
  if (ancien && ancien.version === 3) return ancien;
  if (ancien && ancien.version === 2) {
    const neuf = etatVide();
    ancien.iles.forEach((ile, n) => {
      if (!neuf.iles[n]) return;
      const vierge = !Object.keys(ile.cases || {}).length && !Object.keys(ile.travaux || {}).length;
      if (vierge) ancien.iles[n] = neuf.iles[n];
      else Object.assign(ile, ileRectangle(ile.ext));
    });
    ancien.version = 3;
    return ancien;
  }
  const e = etatVide();
  if (!ancien || !ancien.iles) return e;
  e.active = ancien.active || 0;
  ancien.iles.forEach((ile, n) => {
    if (!ILES[n] || !Object.keys(ile.cases || {}).length) return;
    const { l, h } = ANCIENNES[n], L = l + 2;
    Object.assign(e.iles[n], ileRectangle({ x0: 1, y0: 1, x1: l, y1: h }));
    for (const k of Object.keys(e.iles[n].terrain)) if (!e.iles[n].terre[k]) delete e.iles[n].terrain[k];
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
// Mode développeur : tout est débloqué (réglé par l'écran de l'île).
let toutOuvert = false;
export const ouvrirTout = (oui) => { toutOuvert = Boolean(oui); };
export const ilesOuvertes = (e) => (toutOuvert ? ILES.length : ILES.filter((ile) => beauteTotale(e) >= ile.seuil).length);
export const estDebloque = (e, type) => toutOuvert || beauteTotale(e) >= ((BATIMENTS[type] || DECORS[type]).debloque || 0);

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

// ---------- Bâtisseurs ----------

export const batisseurs = (e) => e.batisseurs || BATISSEURS_DEPART;
/** Les chantiers en cours sur toutes les îles : { n, cle, fin }, le plus proche de la fin d'abord. */
export function chantiers(e) {
  const out = [];
  e.iles.forEach((ile, n) => {
    for (const [k, c] of Object.entries(ile.cases)) if (c.chantier) out.push({ n, cle: k, fin: c.chantier.fin });
  });
  return out.sort((a, b) => a.fin - b.fin);
}
export const batisseursLibres = (e) => Math.max(0, batisseurs(e) - chantiers(e).length);
/** Prix (en étoiles) du prochain bâtisseur, ou null s'il y en a déjà le plus possible. */
export const prixBatisseur = (e) => PRIX_BATISSEURS[batisseurs(e) - BATISSEURS_DEPART] ?? null;
export function engagerBatisseur(e, payerEtoiles) {
  const prix = prixBatisseur(e);
  if (prix === null) return { ok: false, raison: 'max' };
  if (!payerEtoiles(prix)) return { ok: false, raison: 'cout', manque: { etoiles: prix } };
  e.batisseurs = batisseurs(e) + 1;
  return { ok: true };
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
/** Un bâtiment de ce type existe-t-il déjà (même en chantier) sur l'archipel ? */
export const dejaConstruit = (e, type) => e.iles.some((ile) => Object.values(ile.cases).some((c) => c.type === type));

export function construire(e, n, x, y, type, etoiles, payerEtoiles, t) {
  const ile = e.iles[n], def = BATIMENTS[type];
  if (!estDebloque(e, type)) return { ok: false, raison: 'pas-debloque' };
  if (!peutPoser(ile, x, y, type)) return { ok: false, raison: 'case' };
  if (def.unique && dejaConstruit(e, type)) return { ok: false, raison: 'unique' };
  if (!batisseursLibres(e)) return { ok: false, raison: 'batisseurs' };
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
  if (!batisseursLibres(e)) return { ok: false, raison: 'batisseurs' };
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

/** Prix pour finir tout de suite ce qui se passe sur une case (chantier ou aménagement), ou null. */
export function prixFinir(ile, x, y, t) {
  const c = ile.cases[cle(x, y)], w = ile.travaux[cle(x, y)];
  if (c?.chantier) return prixAcceleration(c, t);
  if (w) return Math.max(1, Math.ceil((w.fin - t) / MINUTE));
  return null;
}
/** Finit tout de suite un chantier ou un aménagement (le résultat arrive au prochain `actualiser`). */
export function finir(e, n, x, y, payerEtoiles, t) {
  const ile = e.iles[n], prix = prixFinir(ile, x, y, t);
  if (prix === null) return { ok: false };
  if (!payerEtoiles(prix)) return { ok: false, raison: 'cout', manque: { etoiles: prix } };
  const travail = ile.cases[cle(x, y)]?.chantier || ile.travaux[cle(x, y)];
  travail.fin = t;
  return { ok: true };
}

// ---------- Déplacer ----------

/** Peut-on déplacer ce qui est en `de` vers (x, y) ? (sa propre case compte comme libre) */
export function peutDeplacer(ile, de, x, y) {
  const c = ile.cases[de];
  if (!c) return false;
  if (cle(x, y) === de) return true;
  delete ile.cases[de];
  const ok = peutPoser(ile, x, y, c.type);
  ile.cases[de] = c;
  return ok;
}
/** Beauté gagnée (ou perdue) si l'on déplace ce qui est en `de` vers (x, y) ; null si impossible. */
export function apercuDeplacement(ile, de, x, y) {
  if (!peutDeplacer(ile, de, x, y)) return null;
  if (cle(x, y) === de) return 0;
  const avant = beauteIle(ile), c = ile.cases[de];
  delete ile.cases[de];
  ile.cases[cle(x, y)] = c;
  const apres = beauteIle(ile);
  delete ile.cases[cle(x, y)];
  ile.cases[de] = c;
  return apres - avant;
}
/** Déplace un bâtiment ou un décor, avec son niveau, son chantier et sa récolte en cours. Gratuit. */
export function deplacer(e, n, de, x, y) {
  const ile = e.iles[n];
  if (!peutDeplacer(ile, de, x, y)) return { ok: false, raison: 'case' };
  const gain = apercuDeplacement(ile, de, x, y);
  if (cle(x, y) !== de) {
    ile.cases[cle(x, y)] = ile.cases[de];
    delete ile.cases[de];
  }
  return { ok: true, gain };
}

// ---------- Ce qui repousse ----------

/** De temps en temps, un buisson ou des cailloux apparaissent sur une herbe libre (trois au plus par île). */
function actualiserPousses(e, t) {
  const out = [];
  if (e.prochainePousse === undefined) { e.prochainePousse = t + INTERVALLE_POUSSE; return out; }
  for (let tour = 0; tour < 3 && t >= e.prochainePousse; tour++) {
    const alea = aleaGraine(Math.floor(e.prochainePousse / 1000) % 2147483647);
    e.prochainePousse += INTERVALLE_POUSSE;
    const n = Math.floor(alea() * ilesOuvertes(e)), ile = e.iles[n];
    if (Object.values(ile.terrain).filter((x) => OBSTACLES.includes(x)).length >= MAX_OBSTACLES) continue;
    const libres = [];
    for (let y = ile.ext.y0; y <= ile.ext.y1; y++) for (let x = ile.ext.x0; x <= ile.ext.x1; x++) {
      const k = cle(x, y);
      if (terrainDe(ile, x, y) === 'herbe' && !ile.cases[k] && !ile.travaux[k]) libres.push(k);
    }
    if (libres.length < 4) continue; // on laisse de la place pour construire
    const k = libres[Math.floor(alea() * libres.length)];
    ile.terrain[k] = OBSTACLES[Math.floor(alea() * OBSTACLES.length)];
    out.push({ genre: 'pousse', n, cle: k, terrain: ile.terrain[k] });
  }
  if (t >= e.prochainePousse) e.prochainePousse = t + INTERVALLE_POUSSE; // longue absence : on ne rattrape pas tout
  return out;
}

// ---------- Trésor : une bouteille à la mer ----------

/** Cases d'eau du bord où une bouteille peut s'échouer. */
function plages(ile) {
  const { x0, y0, x1, y1 } = ile.ext, out = [];
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    if (estCote(ile, x, y) && !ile.cases[cle(x, y)]) out.push(cle(x, y));
  }
  return out;
}
/** Ce que contient la bouteille : un peu de chaque chose, parfois une étoile. */
function contenuTresor(alea) {
  const entre = (a, b) => a + Math.floor(alea() * (b - a + 1));
  const tirage = alea();
  if (tirage < 0.2) return { etoiles: 1, bois: entre(1, 3) };
  if (tirage < 0.45) return { bois: entre(4, 7) };
  if (tirage < 0.65) return { pierre: entre(3, 5) };
  if (tirage < 0.85) return { ble: entre(4, 7) };
  return { bois: 2, pierre: 2, ble: 2 };
}
function actualiserTresor(e, t) {
  const alea = aleaGraine(Math.floor(t / 1000) % 2147483647);
  if (e.tresor) {
    // la plage a changé (île agrandie, port construit) : la bouteille dérive vers une autre case du bord
    const ile = e.iles[e.tresor.n], [x, y] = coord(e.tresor.cle);
    if (estCote(ile, x, y) && !ile.cases[e.tresor.cle]) return null;
    const places = plages(ile);
    if (!places.length) { e.tresor = null; return null; }
    e.tresor.cle = places[Math.floor(alea() * places.length)];
    return { genre: 'tresor', n: e.tresor.n, cle: e.tresor.cle };
  }
  if (e.prochainTresor === undefined) { e.prochainTresor = t + 2 * MINUTE; return null; } // la toute première arrive vite
  if (t < e.prochainTresor) return null;
  const n = Math.floor(alea() * ilesOuvertes(e));
  const places = plages(e.iles[n]);
  if (!places.length) { e.prochainTresor = t + INTERVALLE_TRESOR; return null; }
  e.tresor = { n, cle: places[Math.floor(alea() * places.length)], gain: contenuTresor(alea), depuis: t };
  return { genre: 'tresor', n, cle: e.tresor.cle };
}
/** Ramasse la bouteille : les ressources sont ajoutées ; les étoiles éventuelles (gain.etoiles) sont à donner par l'appelant. */
export function ramasserTresor(e, t) {
  if (!e.tresor) return null;
  const { gain } = e.tresor;
  for (const r of RESSOURCES) e.ressources[r] += gain[r] || 0;
  e.tresor = null;
  e.prochainTresor = t + INTERVALLE_TRESOR;
  return gain;
}

// ---------- Niveau de l'île (les paliers de beauté) ----------

/** Tout ce que la beauté débloque, dans l'ordre : { seuil, genre: 'batiment' | 'decor' | 'ile', type, nom }. */
export function paliers() {
  return [
    ...ORDRE_BATIMENTS.filter((t) => BATIMENTS[t].debloque).map((t) => ({ seuil: BATIMENTS[t].debloque, genre: 'batiment', type: t, nom: BATIMENTS[t].nom })),
    ...ORDRE_DECORS.filter((t) => DECORS[t].debloque).map((t) => ({ seuil: DECORS[t].debloque, genre: 'decor', type: t, nom: DECORS[t].nom })),
    ...ILES.slice(1).map((ile, i) => ({ seuil: ile.seuil, genre: 'ile', type: i + 1, nom: ile.nom })),
  ].sort((a, b) => a.seuil - b.seuil);
}
/** Le niveau de l'île : 1 au départ, +1 à chaque seuil de beauté franchi. */
export function niveauIle(e) {
  const b = beauteTotale(e);
  return 1 + [...new Set(paliers().map((p) => p.seuil))].filter((s) => s <= b).length;
}
/** Où en est-on entre deux seuils : { niveau, beaute, de, vers (null au maximum) }. */
export function progressionIle(e) {
  const b = beauteTotale(e);
  const seuils = [0, ...new Set(paliers().map((p) => p.seuil))];
  const vers = seuils.find((s) => s > b) ?? null;
  const de = [...seuils].reverse().find((s) => s <= b) ?? 0;
  return { niveau: niveauIle(e), beaute: b, de, vers };
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

/** Temps pour produire une unité (ms) ; l'Atelier a sa propre table, les autres vont plus vite à chaque niveau. */
export function periode(c) {
  const p = BATIMENTS[c.type].prod;
  return p.periodes ? p.periodes[Math.min(p.periodes.length, c.niveau) - 1] * MINUTE : (p.minutes * MINUTE) / c.niveau;
}
export function plafond(c) {
  const p = BATIMENTS[c.type].prod;
  return p.plafonds ? p.plafonds[Math.min(p.plafonds.length, c.niveau) - 1] : PLAFOND_PAR_NIVEAU * c.niveau;
}

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
  if (!RECOLTES_EXTERIEURES.includes(res)) e.ressources[res] += q;
  if (c.type === 'atelier') {
    // l'Atelier garde le temps gagné au-delà de sa réserve (jusqu'à une réserve de plus) : rien ne se perd
    c.depuis = Math.max(c.depuis + q * periode(c), t - plafond(c) * periode(c));
    return { res, n: q };
  }
  // on garde l'avancement de l'unité en cours (sauf si le stock était plein)
  const plein = q >= plafond(c);
  c.depuis = plein ? t : c.depuis + q * periode(c);
  return { res, n: q };
}

/** L'Atelier du puzzle de l'archipel (terminé), ou null. */
export function atelier(e) {
  for (const ile of e.iles) for (const [k, c] of Object.entries(ile.cases)) if (c.type === 'atelier' && c.niveau > 0) return { ile, cle: k, c };
  return null;
}
/**
 * Fait avancer le temps de l'Atelier (une partie gagnée, une mission…). Le temps au-delà de la réserve
 * pleine est gardé, jusqu'à une réserve de plus. Renvoie les minutes vraiment gagnées (0 sans Atelier).
 */
export function avancerAtelier(e, minutes, t) {
  const a = atelier(e);
  if (!a || !(minutes > 0)) return 0;
  const { c } = a, p = periode(c);
  const limite = t - 2 * plafond(c) * p; // au plus deux réserves de travail d'avance
  const avant = c.depuis;
  const apres = Math.max(limite, c.depuis - minutes * MINUTE);
  if (apres >= avant) return 0; // déjà deux réserves d'avance : rien à gagner (et surtout rien à reprendre)
  c.depuis = apres;
  return Math.round((avant - c.depuis) / MINUTE);
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

// ---------- Agrandir l'île, case par case ----------

/** Prix d'une nouvelle case de terre : il monte doucement avec la taille de l'île. */
export const coutCase = (ile) => {
  const n = nbTerres(ile);
  return { etoiles: 1 + Math.floor(n / 12), pierre: 2 + Math.floor(n / 8) };
};

/** Peut-on acheter cette case d'eau ? Il faut qu'elle touche la terre, qu'elle soit libre et pas trop loin. */
export function peutAcheter(ile, x, y) {
  if (!estCote(ile, x, y) || ile.cases[cle(x, y)]) return false;
  const c = ile.centre || { x: (ile.ext.x0 + ile.ext.x1) / 2, y: (ile.ext.y0 + ile.ext.y1) / 2 };
  return Math.abs(x - c.x) <= PORTEE_MAX.x && Math.abs(y - c.y) <= PORTEE_MAX.y;
}

/** Toutes les cases qu'on peut acheter autour d'une île. */
export function casesAchetables(ile) {
  const out = [];
  const { x0, y0, x1, y1 } = ile.ext;
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (peutAcheter(ile, x, y)) out.push(cle(x, y));
  return out;
}

/** Achète une case : elle sort de l'eau, en herbe. */
export function acheterCase(e, n, x, y, etoiles, payerEtoiles) {
  const ile = e.iles[n];
  if (!peutAcheter(ile, x, y)) return { ok: false, raison: 'case' };
  const cout = coutCase(ile);
  if (!peutPayer(e, etoiles, cout)) return { ok: false, raison: 'cout', manque: manque(e, etoiles, cout) };
  if (!payer(e, cout, payerEtoiles)) return { ok: false, raison: 'cout' };
  ile.terre[cle(x, y)] = 1;
  delete ile.terrain[cle(x, y)];
  majExt(ile);
  return { ok: true };
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
        if (!etaitNeuf && BATIMENTS[c.type]?.prod && c.depuis !== undefined) {
          // ce qui a déjà été produit garde sa valeur : le nouveau rythme ne compte qu'à partir de la fin des travaux
          const fin = c.chantier.fin, maxi = plafond(c) * (c.type === 'atelier' ? 2 : 1);
          const unites = Math.min(maxi, Math.max(0, (fin - c.depuis) / periode(c)));
          c.niveau = c.chantier.vers;
          c.depuis = fin - unites * periode(c);
        }
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
  evenements.push(...actualiserPousses(e, t));
  const tresor = actualiserTresor(e, t);
  if (tresor) evenements.push(tresor);
  return evenements;
}
