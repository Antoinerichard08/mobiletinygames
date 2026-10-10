import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ILES, BATIMENTS, ORDRE_BATIMENTS, grille, estCote, voisins, peutPoser, pointsCase, beaute, apercu,
  etatVide, beauteTotale, ilesOuvertes, estDebloque, prochainPalier, poser, agrandir, retirer, niveauMax,
} from '../src/ile/regles.js';

const bourse = (n) => {
  let etoiles = n;
  const payer = (prix) => (prix <= etoiles ? ((etoiles -= prix), true) : false);
  payer.reste = () => etoiles;
  return payer;
};
const premiereCase = (g, cases, type) => g.terrain.findIndex((_, i) => peutPoser(g, cases, i, type));

test('chaque île a de la terre, de l’eau autour, quelques bois et rochers, toujours au même endroit', () => {
  ILES.forEach((ile, n) => {
    const g = grille(n);
    assert.equal(g.terrain.length, (ile.l + 2) * (ile.h + 2));
    assert.ok(g.terrain.includes('foret') && g.terrain.includes('montagne'));
    assert.deepEqual(grille(n).terrain, g.terrain);
    for (let x = 0; x < g.L; x++) assert.equal(g.terrain[x], 'eau', 'la première rangée est de l’eau');
  });
});

test('côte : les bords d’eau sauf les coins', () => {
  const g = grille(0);
  assert.equal(estCote(g, 0), false, 'coin');
  assert.equal(estCote(g, 1), true);
  assert.equal(estCote(g, g.L + 1), false, 'terre');
});

test('voisins : 4 cases au plus, jamais en dehors de la grille', () => {
  const g = grille(0);
  assert.equal(voisins(g, 0).length, 2);
  assert.equal(voisins(g, g.L + 1).length, 4);
});

test('on construit sur l’herbe, les ports sur l’eau du bord', () => {
  const g = grille(0), cases = {};
  const herbe = g.terrain.indexOf('herbe'), foret = g.terrain.indexOf('foret');
  assert.equal(peutPoser(g, cases, herbe, 'maison'), true);
  assert.equal(peutPoser(g, cases, foret, 'maison'), false);
  assert.equal(peutPoser(g, cases, 1, 'maison'), false);
  assert.equal(peutPoser(g, cases, 1, 'port'), true);
  assert.equal(peutPoser(g, cases, herbe, 'port'), false);
});

test('points : base × niveau, plus les voisins aimés, jamais de malus', () => {
  const g = grille(0);
  const i = g.terrain.findIndex((t, k) => t === 'herbe' && voisins(g, k).some((v) => g.terrain[v] === 'foret'));
  const cases = { [i]: { type: 'hameau', niveau: 1 } };
  const forets = voisins(g, i).filter((v) => g.terrain[v] === 'foret').length;
  assert.equal(pointsCase(g, cases, i), 2 + forets);
  cases[i].niveau = 2;
  assert.equal(pointsCase(g, cases, i), 4 + forets);
  for (const type of ORDRE_BATIMENTS) for (const v of Object.values(BATIMENTS[type].aime)) assert.ok(v > 0);
});

test('l’aperçu compte aussi le bonus donné aux voisins', () => {
  const g = grille(0);
  const champ = g.terrain.findIndex((t, k) => t === 'herbe' && voisins(g, k).some((v) => g.terrain[v] === 'herbe'));
  const cases = { [champ]: { type: 'champ', niveau: 1 } };
  const voisin = voisins(g, champ).find((v) => peutPoser(g, cases, v, 'ferme'));
  const gain = apercu(g, cases, voisin, 'ferme');
  const apres = beaute(g, { ...cases, [voisin]: { type: 'ferme', niveau: 1 } });
  assert.equal(gain, apres - beaute(g, cases));
  assert.ok(gain >= BATIMENTS.ferme.base + 1 + 2, 'la ferme aime le champ, et le champ aime la ferme');
});

test('poser, agrandir, retirer : les étoiles sont payées puis remboursées', () => {
  const e = etatVide();
  const g = grille(0);
  const payer = bourse(20);
  const i = premiereCase(g, e.iles[0].cases, 'maison');
  assert.equal(poser(e, 0, i, 'maison', payer).ok, true);
  assert.equal(payer.reste(), 20 - 4);
  assert.equal(poser(e, 0, i, 'hameau', payer).ok, false, 'case occupée');
  assert.equal(agrandir(e, 0, i, payer).ok, true);
  assert.equal(e.iles[0].cases[i].niveau, 2);
  assert.equal(retirer(e, 0, i), 4 + 5);
  assert.equal(e.iles[0].cases[i], undefined);
});

test('sans assez d’étoiles, rien ne se passe', () => {
  const e = etatVide();
  const g = grille(0);
  const payer = bourse(2);
  assert.deepEqual(poser(e, 0, premiereCase(g, {}, 'maison'), 'maison', payer), { ok: false, raison: 'etoiles' });
  assert.equal(payer.reste(), 2);
});

test('agrandir jusqu’au niveau maximal seulement', () => {
  const e = etatVide();
  const payer = bourse(999);
  const i = premiereCase(grille(0), {}, 'hameau');
  poser(e, 0, i, 'hameau', payer);
  for (let k = 1; k < niveauMax('hameau'); k++) assert.equal(agrandir(e, 0, i, payer).ok, true);
  assert.deepEqual(agrandir(e, 0, i, payer), { ok: false, raison: 'max' });
});

test('déblocages : nouveaux bâtiments puis nouvelles îles avec la beauté', () => {
  const e = etatVide();
  assert.equal(estDebloque(e, 'hameau'), true);
  assert.equal(estDebloque(e, 'chateau'), false);
  assert.equal(ilesOuvertes(e), 1);
  assert.equal(prochainPalier(e).seuil, BATIMENTS.ferme.debloque);
  // on remplit l'île en agrandissant tout au maximum
  const payer = bourse(100000);
  let n = 0;
  while (beauteTotale(e) < ILES[1].seuil) {
    const g = grille(n);
    const type = ['hameau', 'champ', 'maison'][Object.keys(e.iles[n].cases).length % 3];
    const i = premiereCase(g, e.iles[n].cases, type);
    if (i < 0) { n++; continue; }
    poser(e, n, i, type, payer);
    while (agrandir(e, n, i, payer).ok);
  }
  assert.ok(ilesOuvertes(e) >= 2);
  assert.equal(estDebloque(e, 'village'), true);
});
