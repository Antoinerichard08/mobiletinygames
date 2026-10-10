// Moteur du Sudoku : génération de grilles à solution unique, vérification.
// Aucune dépendance au navigateur : testable avec Node (tests/sudoku.test.js).
// Une grille est un tableau de 81 nombres (0 = case vide), lu ligne par ligne.

import { melanger } from '../../core/outils.js';

export const NIVEAUX = { facile: 40, moyen: 33, difficile: 27 }; // nombre de chiffres donnés
export const NOMS_NIVEAUX = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

/** Pour chaque case, les 20 cases de la même ligne, colonne ou bloc. */
export const VOISINS = (() => {
  const tous = [];
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9, s = new Set();
    for (let k = 0; k < 9; k++) {
      s.add(r * 9 + k);
      s.add(k * 9 + c);
    }
    const br = r - (r % 3), bc = c - (c % 3);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s.add((br + a) * 9 + bc + b);
    s.delete(i);
    tous.push([...s]);
  }
  return tous;
})();

const compterBits = (m) => {
  let n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
};

/** Masque des chiffres possibles en case i (bit d = chiffre d). */
export function candidats(g, i) {
  let pris = 0;
  for (const j of VOISINS[i]) pris |= 1 << g[j];
  return ~pris & 0x3fe;
}

/** Case vide qui a le moins de candidats (heuristique pour aller vite). */
function caseLaPlusContrainte(g) {
  let meilleure = -1, masque = 0, nb = 10;
  for (let i = 0; i < 81; i++) {
    if (g[i] !== 0) continue;
    const m = candidats(g, i), n = compterBits(m);
    if (n < nb) {
      meilleure = i; masque = m; nb = n;
      if (n <= 1) break;
    }
  }
  return { i: meilleure, masque, nb };
}

/** Remplit entièrement g (sur place) avec une grille valide au hasard. */
function remplir(g, alea) {
  const { i, masque, nb } = caseLaPlusContrainte(g);
  if (i < 0) return true;
  if (nb === 0) return false;
  const chiffres = [];
  for (let d = 1; d <= 9; d++) if (masque & (1 << d)) chiffres.push(d);
  for (const d of melanger(chiffres, alea)) {
    g[i] = d;
    if (remplir(g, alea)) return true;
  }
  g[i] = 0;
  return false;
}

/** Nombre de solutions de la grille, en s'arrêtant à `limite`. Ne modifie pas g. */
export function compterSolutions(grille, limite = 2) {
  const g = grille.slice();
  let total = 0;
  (function chercher() {
    const { i, masque, nb } = caseLaPlusContrainte(g);
    if (i < 0) { total++; return total >= limite; }
    if (nb === 0) return false;
    for (let d = 1; d <= 9; d++) {
      if (!(masque & (1 << d))) continue;
      g[i] = d;
      const stop = chercher();
      g[i] = 0;
      if (stop) return true;
    }
    return false;
  })();
  return total;
}

/** Une solution de la grille (ou null). */
export function resoudre(grille) {
  const g = grille.slice();
  return remplir(g, () => 0) ? g : null;
}

/**
 * Génère une grille avec exactement `indices` chiffres donnés si possible,
 * et toujours une solution unique (vérifiée par comptage des solutions).
 */
export function genererGrille(indices, alea = Math.random) {
  let meilleure = null;
  for (let essai = 0; essai < 8; essai++) {
    const solution = new Array(81).fill(0);
    remplir(solution, alea);
    const grille = solution.slice();
    let restants = 81;
    for (const i of melanger([...Array(81).keys()], alea)) {
      if (restants <= indices) break;
      const v = grille[i];
      grille[i] = 0;
      if (compterSolutions(grille, 2) === 1) restants--;
      else grille[i] = v; // retirer ce chiffre rendrait la grille ambiguë
    }
    if (!meilleure || restants < meilleure.restants) meilleure = { grille, solution, restants };
    if (restants <= indices) break;
  }
  return { grille: meilleure.grille, solution: meilleure.solution };
}

/** Indices des cases dont le chiffre est en double dans sa ligne, colonne ou bloc. */
export function conflits(g) {
  const out = new Set();
  for (let i = 0; i < 81; i++) {
    if (g[i] && VOISINS[i].some((j) => g[j] === g[i])) out.add(i);
  }
  return out;
}

/** Vrai si g est une grille complète et sans erreur. */
export function estValide(g) {
  return g.length === 81 && g.every((v) => v >= 1 && v <= 9) && conflits(g).size === 0;
}
