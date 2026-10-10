import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIVEAUX, genererGrille, compterSolutions, conflits, estValide, resoudre, VOISINS } from '../src/games/sudoku/moteur.js';
import { aleaGraine } from '../src/core/outils.js';

test('chaque case a exactement 20 voisines', () => {
  assert.ok(VOISINS.every((v) => v.length === 20));
});

for (const [niveau, indices] of Object.entries(NIVEAUX)) {
  test(`niveau ${niveau} : grilles valides, ${indices} indices, solution unique`, () => {
    for (let graine = 1; graine <= 15; graine++) {
      const { grille, solution } = genererGrille(indices, aleaGraine(graine * 7919 + indices));
      assert.ok(estValide(solution), 'la solution est une grille complète sans doublon');
      assert.equal(grille.filter(Boolean).length, indices, 'nombre de chiffres donnés');
      grille.forEach((v, i) => {
        if (v) assert.equal(v, solution[i], 'les chiffres donnés viennent de la solution');
      });
      assert.equal(conflits(grille).size, 0, 'pas de doublon dans la grille de départ');
      assert.equal(compterSolutions(grille, 2), 1, 'une seule solution possible');
      assert.deepEqual(resoudre(grille), solution, 'le solveur retrouve la solution');
    }
  });
}

test('compterSolutions détecte une grille à plusieurs solutions', () => {
  const vide = new Array(81).fill(0);
  assert.equal(compterSolutions(vide, 2), 2);
  const { solution } = genererGrille(30, aleaGraine(42));
  // Une grille presque vide (seule la première ligne remplie) a forcément plusieurs solutions.
  const presqueVide = solution.map((v, i) => (i < 9 ? v : 0));
  assert.equal(compterSolutions(presqueVide, 2), 2);
});

test('compterSolutions ne modifie pas la grille', () => {
  const { grille } = genererGrille(33, aleaGraine(3));
  const copie = grille.slice();
  compterSolutions(grille, 2);
  assert.deepEqual(grille, copie);
});

test('conflits repère les doublons de ligne, colonne et bloc', () => {
  const g = new Array(81).fill(0);
  g[0] = 5; g[8] = 5; // même ligne
  g[40] = 3; g[76] = 3; // même colonne (colonne 4)
  g[60] = 7; g[70] = 7; // même bloc (en bas à gauche)
  assert.deepEqual([...conflits(g)].sort((a, b) => a - b), [0, 8, 40, 60, 70, 76]);
});
