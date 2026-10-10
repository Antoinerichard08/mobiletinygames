import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nouvellePartie, deplacer, estPermis, piocher, destinationAuto, monterCartes, estGagne, indice, cloner,
} from '../src/games/solitaire/moteur.js';
import { aleaGraine } from '../src/core/outils.js';

// Raccourcis pour fabriquer des cartes : c(rang, couleur, visible) ; couleurs 0 ♠, 1 ♥, 2 ♦, 3 ♣
const c = (r, s, up = true) => ({ r, s, up });
const vide = () => ({ stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []], moves: 0 });

test('la donne : 28 cartes en colonnes, 24 dans la pioche, 52 cartes différentes', () => {
  const e = nouvellePartie(aleaGraine(1));
  assert.deepEqual(e.tab.map((col) => col.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(e.stock.length, 24);
  for (const col of e.tab) {
    col.forEach((carte, k) => assert.equal(carte.up, k === col.length - 1, 'seule la dernière carte est visible'));
  }
  const toutes = [...e.stock, ...e.tab.flat()].map((x) => `${x.r}-${x.s}`);
  assert.equal(new Set(toutes).size, 52);
});

test('colonnes : rang inférieur de couleur opposée seulement', () => {
  const e = vide();
  e.tab[0] = [c(8, 0)]; // 8 ♠
  e.waste = [c(7, 0)]; // 7 ♠ : même couleur → refusé
  assert.equal(deplacer(e, { loc: 'waste' }, { loc: 'tab', i: 0 }), false);
  e.waste = [c(6, 1)]; // 6 ♥ : mauvais rang → refusé
  assert.equal(deplacer(e, { loc: 'waste' }, { loc: 'tab', i: 0 }), false);
  e.waste = [c(7, 1)]; // 7 ♥ → accepté
  assert.equal(deplacer(e, { loc: 'waste' }, { loc: 'tab', i: 0 }), true);
  assert.equal(e.tab[0].length, 2);
  assert.equal(e.moves, 1);
});

test('colonne vide : seulement un Roi', () => {
  const e = vide();
  e.waste = [c(12, 1)];
  assert.equal(estPermis(e, { loc: 'waste' }, { loc: 'tab', i: 3 }), false);
  e.waste = [c(13, 1)];
  assert.equal(deplacer(e, { loc: 'waste' }, { loc: 'tab', i: 3 }), true);
});

test('déplacer une suite découvre la carte cachée dessous', () => {
  const e = vide();
  e.tab[0] = [c(2, 3, false), c(9, 2), c(8, 0), c(7, 1)];
  e.tab[1] = [c(10, 0)];
  assert.equal(deplacer(e, { loc: 'tab', i: 0, k: 1 }, { loc: 'tab', i: 1 }), true);
  assert.equal(e.tab[1].length, 4);
  assert.equal(e.tab[0].length, 1);
  assert.equal(e.tab[0][0].up, true, 'la carte cachée est retournée');
});

test('on ne peut pas prendre une carte face cachée', () => {
  const e = vide();
  e.tab[0] = [c(12, 1, false), c(5, 0)];
  e.tab[1] = [c(13, 0)];
  assert.equal(estPermis(e, { loc: 'tab', i: 0, k: 0 }, { loc: 'tab', i: 1 }), false);
});

test('fondations : As d’abord, puis même couleur dans l’ordre, une carte à la fois', () => {
  const e = vide();
  e.waste = [c(2, 1)];
  assert.equal(deplacer(e, { loc: 'waste' }, { loc: 'found', i: 0 }), false, 'pas de 2 sur une fondation vide');
  e.waste = [c(1, 1)];
  assert.equal(deplacer(e, { loc: 'waste' }, { loc: 'found', i: 0 }), true);
  e.waste = [c(2, 2)];
  assert.equal(deplacer(e, { loc: 'waste' }, { loc: 'found', i: 0 }), false, 'pas de 2 ♦ sur l’As ♥');
  e.waste = [c(2, 1)];
  assert.equal(deplacer(e, { loc: 'waste' }, { loc: 'found', i: 0 }), true);
  e.tab[0] = [c(4, 1), c(3, 0)];
  assert.equal(estPermis(e, { loc: 'tab', i: 0, k: 0 }, { loc: 'found', i: 0 }), false, 'pas de suite de cartes sur une fondation');
});

test('pioche : une carte à la fois, puis retour illimité', () => {
  const e = vide();
  e.stock = [c(1, 0, false), c(2, 0, false), c(3, 0, false)];
  assert.equal(piocher(e), 'carte');
  assert.equal(e.waste[0].r, 3);
  assert.equal(e.waste[0].up, true);
  piocher(e);
  piocher(e);
  assert.equal(e.stock.length, 0);
  for (let tour = 0; tour < 5; tour++) {
    assert.equal(piocher(e), 'retour');
    assert.equal(e.stock.length, 3);
    assert.ok(e.stock.every((x) => !x.up));
    assert.equal(e.stock[e.stock.length - 1].r, 3, 'même ordre qu’au premier tour');
    piocher(e); piocher(e); piocher(e);
  }
  const rien = vide();
  assert.equal(piocher(rien), 'vide');
});

test('double-touche : la carte va d’abord sur une fondation, sinon sur une colonne', () => {
  const e = vide();
  e.found[2] = [c(1, 0)];
  e.tab[0] = [c(2, 0)];
  e.tab[1] = [c(3, 1)];
  assert.deepEqual(destinationAuto(e, { loc: 'tab', i: 0, k: 0 }), { loc: 'found', i: 2 });
  e.found[2] = [];
  assert.deepEqual(destinationAuto(e, { loc: 'tab', i: 0, k: 0 }), { loc: 'tab', i: 1 });
  e.tab[4] = [c(13, 0)];
  assert.equal(destinationAuto(e, { loc: 'tab', i: 4, k: 0 }), null, 'un Roi seul ne change pas de colonne vide');
});

test('« Monter les cartes » range tout ce qui peut l’être', () => {
  const e = vide();
  e.tab[0] = [c(3, 1), c(2, 1)];
  e.tab[1] = [c(1, 1)];
  e.waste = [c(1, 0)];
  assert.equal(monterCartes(e), 4);
  assert.equal(e.found.flat().length, 4);
  assert.equal(monterCartes(e), 0);
});

test('victoire quand les 52 cartes sont sur les fondations', () => {
  const e = vide();
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 12; r++) e.found[s].push(c(r, s));
  for (let s = 0; s < 4; s++) e.tab[s] = [c(13, s)];
  assert.equal(estGagne(e), false);
  monterCartes(e);
  assert.equal(estGagne(e), true);
});

test('l’indice propose un coup permis', () => {
  for (let graine = 1; graine <= 50; graine++) {
    const e = nouvellePartie(aleaGraine(graine));
    const h = indice(e);
    assert.ok(h, 'au début, il y a toujours au moins la pioche');
    if (!h.pioche) assert.ok(estPermis(e, h.o, h.dest));
  }
});

test('parties automatiques en suivant les indices : jamais de coup interdit, cartes conservées', (t) => {
  let gagnees = 0;
  for (let graine = 1; graine <= 40; graine++) {
    const e = nouvellePartie(aleaGraine(graine));
    let piochesDeSuite = 0;
    for (let tour = 0; tour < 1500 && !estGagne(e); tour++) {
      const h = indice(e);
      if (!h) break;
      if (h.pioche) {
        if (++piochesDeSuite > e.stock.length + e.waste.length + 1) break; // tour de pioche sans rien trouver
        piocher(e);
      } else {
        piochesDeSuite = 0;
        const avant = cloner(e);
        assert.ok(deplacer(e, h.o, h.dest), 'le coup proposé est accepté');
        assert.notDeepEqual(e, avant);
      }
      const n = e.stock.length + e.waste.length + e.found.flat().length + e.tab.flat().length;
      assert.equal(n, 52);
    }
    if (estGagne(e)) gagnees++;
  }
  t.diagnostic(`${gagnees} parties gagnées sur 40 en suivant seulement les indices`);
});
