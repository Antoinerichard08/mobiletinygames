// La vie sur l'archipel : villageois qui vont travailler (bâtisseurs sur les chantiers, bûcherons, paysannes),
// animaux, fumée des cheminées, bateaux et mouettes. Purement décoratif : la production se calcule dans
// regles.js, avec l'heure. Simulation sans DOM : `maj(dt)` avance tout, le rendu (monde.js) dessine `entites`.
import { BATIMENTS, cle, coord, estTerre, terrainDe, ilesOuvertes } from './regles.js';
import { COULOIRS, origine } from './plan.js';

const MAX_HABITANTS = 10;
const VITESSE = 1.5; // cases par seconde
const hasard = (a, b) => a + Math.random() * (b - a);
const choisir = (liste) => liste[Math.floor(Math.random() * liste.length)];
/** Un nombre stable entre 0 et 1 pour une chaîne (les poules ne changent pas de maison à chaque dessin). */
const empreinte = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };

const MAISONS = new Set(['maison', 'village', 'hameau', 'chateau', 'ferme', 'atelier']);
const PASSAGE = new Set(['champ', 'fleurs', 'champignons', 'buisson']);

/** Les lieux utiles d'une île. */
function lieux(ile) {
  const out = { terre: [], forets: [], chantiers: [], champs: [], maisons: [], cabanes: [] };
  for (let y = ile.ext.y0; y <= ile.ext.y1; y++) for (let x = ile.ext.x0; x <= ile.ext.x1; x++) {
    if (!estTerre(ile, x, y)) continue; // une île de forme libre : son rectangle contient aussi de la mer
    const k = cle(x, y), c = ile.cases[k], t = terrainDe(ile, x, y);
    out.terre.push([x, y]);
    if (t === 'foret' && !c) out.forets.push([x, y]);
    if (c?.chantier || ile.travaux[k]) out.chantiers.push([x, y]);
    if (c && c.niveau > 0) {
      if (c.type === 'champ' || c.type === 'ferme') out.champs.push([x, y]);
      if (MAISONS.has(c.type)) out.maisons.push([x, y]);
      if (c.type === 'hameau') out.cabanes.push([x, y]);
    }
  }
  return out;
}

const marchable = (ile, x, y) => {
  if (!estTerre(ile, x, y) || ile.travaux[cle(x, y)]) return false;
  const c = ile.cases[cle(x, y)];
  if (c && !PASSAGE.has(c.type)) return false;
  return ['herbe', 'foret', 'buisson', 'caillou'].includes(terrainDe(ile, x, y));
};

/** Chemin de case en case (largeur d'abord) ; la dernière case peut être un bâtiment. Sinon : en ligne brisée. */
function chemin(ile, de, vers) {
  const [dx, dy] = de, [vx, vy] = vers;
  if (dx === vx && dy === vy) return [];
  const precedent = new Map([[cle(dx, dy), null]]);
  const file = [[dx, dy]];
  while (file.length) {
    const [x, y] = file.shift();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = cle(nx, ny);
      if (precedent.has(k)) continue;
      const arrivee = nx === vx && ny === vy;
      if (!arrivee && !marchable(ile, nx, ny)) continue;
      precedent.set(k, [x, y]);
      if (arrivee) {
        const out = [];
        for (let p = [nx, ny]; p && !(p[0] === dx && p[1] === dy); p = precedent.get(cle(...p))) out.unshift(p);
        return out;
      }
      file.push([nx, ny]);
    }
  }
  const out = [];
  let x = dx, y = dy;
  while (x !== vx) { x += Math.sign(vx - x); out.push([x, y]); }
  while (y !== vy) { y += Math.sign(vy - y); out.push([x, y]); }
  return out;
}

/** Une case marchable à côté de (x, y), pour se tenir près d'un arbre ou d'un chantier. */
function aCote(ile, x, y) {
  const options = [[x - 1, y], [x + 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => marchable(ile, a, b));
  return options.length ? choisir(options) : [x, y];
}
const plusProche = (liste, x, y) => liste.reduce((m, p) => (!m || Math.abs(p[0] - x) + Math.abs(p[1] - y) < Math.abs(m[0] - x) + Math.abs(m[1] - y) ? p : m), null);

const VARIANTE = { bucheron: 1, paysanne: 2, macon: 3, promeneur: 0, promeneuse: 4 };

export function creerVie() {
  /** Tous les êtres : { genre, n, x, y (coordonnées de l'île, centre des pieds), ... } ; bateaux et mouettes en coordonnées du monde. */
  let entites = [];
  let fumees = [];
  let signature = '';
  let horloge = 0;
  let E = null;

  function nouvelEtre(genre, n, x, y, extra = {}) {
    return { genre, n, x: x + 0.5, y: y + 0.62, chemin: [], etat: 'attend', attente: hasard(0.2, 2.5), gauche: false, phase: Math.random(), ...extra };
  }

  /** (Re)place les habitants et les animaux selon ce qui est construit, en gardant ceux qui sont déjà là. */
  function peupler(etat) {
    E = etat;
    const ouvertes = ilesOuvertes(E);
    const sig = E.iles.slice(0, ouvertes).map((ile) => `${JSON.stringify(ile.ext)}|${Object.entries(ile.cases).map(([k, c]) => `${k}:${c.type}:${c.niveau}:${c.chantier ? 1 : 0}`).join(';')}|${Object.keys(ile.travaux).join(';')}|${JSON.stringify(ile.terrain)}`).join('#');
    if (sig === signature) return;
    signature = sig;
    const anciens = entites;
    const garder = (genre, n, rang) => anciens.find((a) => a.genre === genre && a.n === n && a.rang === rang && !a.pris);
    const suivants = [];
    for (let n = 0; n < ouvertes; n++) {
      const ile = E.iles[n], L = lieux(ile);
      let nb = 0;
      for (const c of Object.values(ile.cases)) if (BATIMENTS[c.type] && c.niveau > 0) nb += BATIMENTS[c.type].habitants * c.niveau;
      nb = Math.min(MAX_HABITANTS, Math.max(n === 0 || Object.keys(ile.cases).length ? 1 : 0, nb, L.chantiers.length));
      const metiers = ['macon'];
      if (L.cabanes.length) metiers.push('bucheron');
      if (L.champs.length) metiers.push('paysanne');
      metiers.push('promeneur', 'promeneuse');
      for (let rang = 0; rang < nb; rang++) {
        const metier = metiers[rang % metiers.length];
        let h = garder('habitant', n, rang);
        if (h) { h.pris = true; h.metier = metier; h.variante = VARIANTE[metier]; h.chemin = []; h.etat = 'attend'; h.attente = hasard(0.1, 1); }
        else {
          const [x, y] = L.maisons.length ? choisir(L.maisons) : choisir(L.terre);
          h = nouvelEtre('habitant', n, x, y, { rang, metier, variante: VARIANTE[metier] });
        }
        // quelqu'un resté sur une case devenue un bâtiment ressort à côté
        const [cx, cy] = [Math.floor(h.x), Math.floor(h.y)];
        if (!estTerre(ile, cx, cy)) { const [x, y] = choisir(L.terre); h.x = x + 0.5; h.y = y + 0.62; }
        suivants.push(h);
      }
      // animaux : moutons à la ferme, poules près de certaines maisons
      let rangAnimal = 0;
      for (const [k, c] of Object.entries(ile.cases)) {
        if (c.niveau === 0) continue;
        const [x, y] = coord(k);
        const ajouter = (genre) => {
          let a = garder(genre, n, `${k}-${rangAnimal}`);
          if (a) a.pris = true; else a = nouvelEtre(genre, n, x, y, { rang: `${k}-${rangAnimal}`, maison: [x, y] });
          a.maison = [x, y];
          rangAnimal++;
          suivants.push(a);
        };
        if (c.type === 'ferme') for (let i = 0; i < Math.min(3, c.niveau + 1); i++) ajouter('mouton');
        if ((c.type === 'maison' || c.type === 'hameau') && empreinte(k) < 0.6) ajouter('poule');
      }
    }
    // les bateaux et les mouettes restent
    for (const a of anciens) if (a.genre === 'bateau' || a.genre === 'mouette') suivants.push(a);
    if (!suivants.some((a) => a.genre === 'bateau')) {
      COULOIRS.forEach((c, i) => suivants.push({ genre: 'bateau', modele: i === 0 ? 0 : 4, p: Math.random(), sens: 1, vitesse: hasard(0.35, 0.5), couloir: c, x: 0, y: 0 }));
    }
    for (const a of suivants) delete a.pris;
    entites = suivants;
  }

  // ---------- Ce que fait chaque villageois ----------

  function decider(h) {
    const ile = E.iles[h.n], L = lieux(ile);
    const x = Math.floor(h.x), y = Math.floor(h.y);
    const aller = (cible, ensuite, duree) => { h.chemin = chemin(ile, [x, y], cible); h.ensuite = ensuite; h.duree = duree; h.etat = 'marche'; };
    if (L.chantiers.length && (h.metier === 'macon' || Math.random() < 0.2)) {
      const c = plusProche(L.chantiers, x, y);
      h.regarde = c;
      return aller(aCote(ile, ...c), 'travaille', hasard(3, 6));
    }
    if (h.metier === 'bucheron' && L.forets.length && !h.charge) {
      const arbre = plusProche(L.forets, x, y);
      h.regarde = arbre;
      return aller(aCote(ile, ...arbre), 'coupe', hasard(2.5, 4));
    }
    if (h.metier === 'bucheron' && h.charge) {
      const maison = plusProche(L.cabanes.length ? L.cabanes : L.maisons, x, y) || [x, y];
      return aller(maison, 'depose', 0.6);
    }
    if (h.metier === 'paysanne' && L.champs.length) return aller(choisir(L.champs), 'travaille', hasard(2.5, 5));
    const but = Math.random() < 0.35 && L.maisons.length ? choisir(L.maisons) : choisir(L.terre);
    return aller(but, 'attend', hasard(1, 3));
  }

  function majHabitant(h, dt) {
    if (h.etat === 'marche') {
      const suivant = h.chemin[0];
      if (!suivant) { h.etat = h.ensuite; h.attente = h.duree; if (h.regarde) h.gauche = h.regarde[0] + 0.5 < h.x; return; }
      const tx = suivant[0] + 0.5, ty = suivant[1] + 0.62;
      const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy), pas = (h.genre === 'habitant' ? VITESSE : VITESSE * 0.5) * dt;
      if (Math.abs(dx) > 0.01) h.gauche = dx < 0;
      if (d <= pas) { h.x = tx; h.y = ty; h.chemin.shift(); } else { h.x += (dx / d) * pas; h.y += (dy / d) * pas; }
      return;
    }
    h.attente -= dt;
    if (h.attente > 0) return;
    if (h.etat === 'coupe') h.charge = true;
    if (h.etat === 'depose') h.charge = false;
    h.regarde = null;
    if (h.genre === 'habitant') return decider(h);
    // animaux : de petits tours autour de la maison
    const ile = E.iles[h.n];
    const [x, y] = aCote(ile, ...h.maison);
    h.chemin = chemin(ile, [Math.floor(h.x), Math.floor(h.y)], [x, y]).slice(0, 2);
    h.ensuite = 'broute';
    h.duree = hasard(1.5, 4);
    h.etat = 'marche';
  }

  function majBateau(b, dt) {
    const { de, vers } = b.couloir;
    const longueur = Math.hypot(vers[0] - de[0], vers[1] - de[1]);
    b.p += (b.sens * b.vitesse * dt) / longueur;
    if (b.p > 1) { b.p = 1; b.sens = -1; }
    if (b.p < 0) { b.p = 0; b.sens = 1; }
    b.x = de[0] + (vers[0] - de[0]) * b.p;
    b.y = de[1] + (vers[1] - de[1]) * b.p;
    b.gauche = (vers[0] - de[0]) * b.sens < 0 || (vers[0] === de[0] && b.sens < 0);
  }

  /** Avance la vie de `dt` secondes. `vue` : le rectangle du monde à l'écran (pour les mouettes). */
  function maj(dt, vue) {
    if (!E) return;
    horloge += dt;
    for (const a of entites) {
      if (a.genre === 'bateau') majBateau(a, dt);
      else if (a.genre === 'mouette') { a.x += a.vx * dt; a.y += a.vy * dt; a.vie -= dt; }
      else majHabitant(a, dt);
    }
    entites = entites.filter((a) => a.genre !== 'mouette' || a.vie > 0);
    // une mouette traverse la vue de temps en temps
    if (vue && Math.random() < dt / 9 && entites.filter((a) => a.genre === 'mouette').length < 2) {
      const versDroite = Math.random() < 0.5, largeur = vue.x1 - vue.x0;
      entites.push({ genre: 'mouette', x: versDroite ? vue.x0 - 1 : vue.x1 + 1, y: hasard(vue.y0, vue.y0 + (vue.y1 - vue.y0) * 0.6), vx: (versDroite ? 1 : -1) * largeur / hasard(8, 12), vy: hasard(-0.15, 0.15), vie: 14, gauche: !versDroite, phase: Math.random() });
    }
    // fumée des cheminées
    const ouvertes = ilesOuvertes(E);
    for (let n = 0; n < ouvertes; n++) {
      const ile = E.iles[n], { ox, oy } = origine(ile, n);
      for (const [k, c] of Object.entries(ile.cases)) {
        if (c.niveau === 0 || !MAISONS.has(c.type) || c.type === 'ferme') continue;
        if (Math.random() < dt / 2.8) {
          const [x, y] = coord(k);
          fumees.push({ x: ox + x + 0.66 + hasard(-0.05, 0.05), y: oy + y + 0.12, age: 0, derive: hasard(-0.2, 0.2) });
        }
      }
    }
    for (const f of fumees) f.age += dt;
    fumees = fumees.filter((f) => f.age < 2.6);
  }

  return {
    peupler,
    maj,
    get entites() { return entites; },
    get fumees() { return fumees; },
    get horloge() { return horloge; },
    oublier() { signature = ''; },
  };
}
