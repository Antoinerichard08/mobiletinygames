// Solveur de Klondike : sert à ne distribuer que des donnes gagnables.
// Recherche en profondeur avec mémoire des positions déjà vues (table de transposition),
// coups « sûrs » vers les fondations joués d'office, et une limite de nœuds pour rester rapide.
// Inspiré des techniques de Solvitaire (Blake & Gent) et des solveurs Klondike classiques.
// Aucune dépendance au navigateur.
//
// Représentation interne : une carte = entier 0..51 (couleur × 13 + rang - 1).
// La pioche et la défausse forment un seul « talon » : t[0..p-1] = défausse (dessus en p-1), le reste = à piocher.

const rangDe = (c) => (c % 13) + 1;
const couleurDe = (c) => Math.floor(c / 13);
const rouge = (c) => couleurDe(c) === 1 || couleurDe(c) === 2;

/** Cartes du talon accessibles (en jouant la pioche autant qu'il faut), par paquets de k. */
function accessibles(n, p, k) {
  const res = new Set();
  if (p > 0) res.add(p - 1);
  for (let i = p; i < n; ) { i = Math.min(i + k, n); res.add(i - 1); }
  for (let i = 0; i < n; ) { i = Math.min(i + k, n); res.add(i - 1); }
  return [...res];
}

function convertir(etat) {
  const id = (c) => c.s * 13 + c.r - 1;
  return {
    cols: etat.tab.map((col) => ({ cach: col.filter((c) => !c.up).map(id), vis: col.filter((c) => c.up).map(id) })),
    fond: [0, 1, 2, 3].map((s) => {
      // fondations indexées par couleur dans le solveur
      const pile = etat.found.find((p) => p.length && p[0].s === s);
      return pile ? pile.length : 0;
    }),
    talon: [...etat.waste.map(id), ...etat.stock.slice().reverse().map(id)],
    p: etat.waste.length,
  };
}

const cloner = (e) => ({
  cols: e.cols.map((c) => ({ cach: c.cach.slice(), vis: c.vis.slice() })),
  fond: e.fond.slice(),
  talon: e.talon.slice(),
  p: e.p,
});

function cle(e) {
  const cols = e.cols.map((c) => c.cach.length + ':' + c.vis.join(',')).sort().join('|');
  return `${e.fond.join(',')}#${e.talon.join(',')}#${e.p}#${cols}`;
}

const vaFondation = (e, c) => e.fond[couleurDe(c)] === rangDe(c) - 1;
const vaSur = (dessous, c) => rouge(dessous) !== rouge(c) && rangDe(dessous) === rangDe(c) + 1;

// Une carte peut monter « sans risque » si les cartes de couleur opposée d'un rang en dessous sont déjà montées.
function montéeSure(e, c) {
  const r = rangDe(c);
  if (r <= 2) return true;
  const opp = rouge(c) ? [0, 3] : [1, 2];
  return opp.every((s) => e.fond[s] >= r - 1);
}

function retourner(col) {
  if (!col.vis.length && col.cach.length) col.vis.push(col.cach.pop());
}

/** Joue d'office tous les coups sûrs vers les fondations. */
function coupsSurs(e) {
  for (let encore = true; encore; ) {
    encore = false;
    for (const col of e.cols) {
      const c = col.vis[col.vis.length - 1];
      if (c !== undefined && vaFondation(e, c) && montéeSure(e, c)) {
        col.vis.pop(); e.fond[couleurDe(c)]++; retourner(col); encore = true;
      }
    }
    if (e.p > 0) {
      const c = e.talon[e.p - 1];
      if (vaFondation(e, c) && montéeSure(e, c)) {
        e.talon.splice(e.p - 1, 1); e.p--; e.fond[couleurDe(c)]++; encore = true;
      }
    }
  }
}

function enfants(e, k) {
  const out = [];
  const n = e.talon.length;
  const acc = accessibles(n, e.p, k);
  const prendreTalon = (i) => { const f = cloner(e); const c = f.talon.splice(i, 1)[0]; f.p = i; return { f, c }; };
  // 1) vers les fondations
  e.cols.forEach((col, i) => {
    const c = col.vis[col.vis.length - 1];
    if (c !== undefined && vaFondation(e, c)) {
      const f = cloner(e); f.cols[i].vis.pop(); f.fond[couleurDe(c)]++; retourner(f.cols[i]); out.push(f);
    }
  });
  for (const i of acc) {
    if (vaFondation(e, e.talon[i])) { const { f, c } = prendreTalon(i); f.fond[couleurDe(c)]++; out.push(f); }
  }
  // 2) déplacer toute la partie visible d'une colonne pour découvrir une carte cachée
  const vide = e.cols.findIndex((c) => !c.cach.length && !c.vis.length);
  e.cols.forEach((col, i) => {
    if (!col.vis.length || !col.cach.length) return;
    const base = col.vis[0];
    e.cols.forEach((dest, j) => {
      if (j === i) return;
      const dessus = dest.vis[dest.vis.length - 1];
      const ok = dessus !== undefined ? vaSur(dessus, base) : (j === vide && rangDe(base) === 13);
      if (!ok) return;
      const f = cloner(e);
      f.cols[j].vis.push(...f.cols[i].vis.splice(0));
      retourner(f.cols[i]);
      out.push(f);
    });
  });
  // 3) du talon vers les colonnes
  for (const i of acc) {
    const c = e.talon[i];
    e.cols.forEach((dest, j) => {
      const dessus = dest.vis[dest.vis.length - 1];
      const ok = dessus !== undefined ? vaSur(dessus, c) : (j === vide && rangDe(c) === 13 && !dest.cach.length);
      if (!ok) return;
      const { f } = prendreTalon(i);
      f.cols[j].vis.push(c);
      out.push(f);
    });
  }
  return out;
}

const gagne = (e) => e.fond.every((v) => v === 13) || (!e.talon.length && e.cols.every((c) => !c.cach.length));

// Note d'une position : cartes montées, cartes cachées restantes (moins il y en a, mieux c'est).
function note(e) {
  let n = e.fond.reduce((a, b) => a + b, 0) * 5;
  for (const c of e.cols) n -= c.cach.length * 4;
  return n;
}

// File de priorité (tas binaire) : on explore d'abord les positions les plus avancées.
class Tas {
  constructor() { this.t = []; }
  get length() { return this.t.length; }
  push(v, p) {
    const t = this.t; t.push([p, v]);
    for (let i = t.length - 1; i > 0; ) {
      const j = (i - 1) >> 1;
      if (t[j][0] >= t[i][0]) break;
      [t[i], t[j]] = [t[j], t[i]]; i = j;
    }
  }
  pop() {
    const t = this.t, haut = t[0], fin = t.pop();
    if (t.length) {
      t[0] = fin;
      for (let i = 0; ; ) {
        const g = 2 * i + 1, d = g + 1; let m = i;
        if (g < t.length && t[g][0] > t[m][0]) m = g;
        if (d < t.length && t[d][0] > t[m][0]) m = d;
        if (m === i) break;
        [t[i], t[m]] = [t[m], t[i]]; i = m;
      }
    }
    return haut[1];
  }
}

/**
 * La donne est-elle gagnable ?
 * @returns {true|false|null} null si la limite de recherche est atteinte sans conclure
 */
export function estGagnable(etat, { tirage = 1, limite = 20000 } = {}) {
  const depart = convertir(etat);
  coupsSurs(depart);
  const vus = new Set();
  const file = new Tas();
  file.push(depart, note(depart));
  let noeuds = 0, ordre = 0;
  while (file.length) {
    const e = file.pop();
    if (gagne(e)) return true;
    const k = cle(e);
    if (vus.has(k)) continue;
    vus.add(k);
    if (++noeuds > limite) return null;
    for (const s of enfants(e, tirage)) {
      coupsSurs(s);
      // à note égale, on préfère les positions les plus récentes (comme une recherche en profondeur)
      file.push(s, note(s) + (++ordre) * 1e-7);
    }
  }
  return false;
}
