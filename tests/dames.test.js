import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLANC, ROUGE, plateauInitial, coupsPermis, jouerCoup, memeCoup, compter, estFoncee } from '../src/games/dames/moteur.js';
import { choisirCoup } from '../src/games/dames/ia.js';
import { aleaGraine } from '../src/core/outils.js';

// Petit outil : plateau vide N × N avec des pièces posées en (ligne, colonne)
function plateau(N, pieces) {
  const b = new Array(N * N).fill(0);
  for (const [r, c, v] of pieces) {
    assert.ok((r + c) % 2 === 1, `(${r}, ${c}) n'est pas une case foncée`);
    b[r * N + c] = v;
  }
  return b;
}
const k = (r, c, N = 8) => r * N + c;

test('position de départ : 12 pions par camp en 8 × 8, 20 en 10 × 10, sur cases foncées', () => {
  for (const [N, n] of [[8, 12], [10, 20]]) {
    const b = plateauInitial(N);
    assert.equal(compter(b, BLANC), n);
    assert.equal(compter(b, ROUGE), n);
    b.forEach((v, i) => { if (v) assert.ok(estFoncee(i, N)); });
  }
  assert.equal(coupsPermis(plateauInitial(8), BLANC, 8).length, 7);
  assert.equal(coupsPermis(plateauInitial(10), BLANC, 10).length, 9);
});

test('les pions n’avancent que vers l’avant', () => {
  const b = plateau(8, [[4, 3, BLANC], [3, 4, ROUGE]]);
  const blancs = coupsPermis(b, BLANC, 8).filter((m) => m.from === k(4, 3));
  assert.ok(blancs.every((m) => Math.floor(m.path[0] / 8) < 4), 'le blanc monte');
  const b2 = plateau(8, [[3, 4, ROUGE]]);
  assert.ok(coupsPermis(b2, ROUGE, 8).every((m) => Math.floor(m.path[0] / 8) > 3), 'le rouge descend');
});

test('prise obligatoire : quand une prise existe, les autres coups sont interdits', () => {
  const b = plateau(8, [[5, 2, BLANC], [5, 6, BLANC], [4, 3, ROUGE]]);
  const coups = coupsPermis(b, BLANC, 8);
  assert.equal(coups.length, 1);
  assert.deepEqual(coups[0], { from: k(5, 2), path: [k(3, 4)], caps: [k(4, 3)] });
});

test('les pions prennent en arrière', () => {
  const b = plateau(8, [[3, 2, BLANC], [4, 3, ROUGE]]);
  const coups = coupsPermis(b, BLANC, 8);
  assert.equal(coups.length, 1);
  assert.deepEqual(coups[0].path, [k(5, 4)]);
});

test('prise multiple (rafle) : le pion enchaîne les sauts', () => {
  const b = plateau(8, [[7, 0, BLANC], [6, 1, ROUGE], [4, 3, ROUGE]]);
  const coups = coupsPermis(b, BLANC, 8);
  assert.equal(coups.length, 1);
  assert.deepEqual(coups[0].path, [k(5, 2), k(3, 4)]);
  assert.deepEqual(coups[0].caps, [k(6, 1), k(4, 3)]);
  const apres = jouerCoup(b, coups[0], 8);
  assert.equal(compter(apres, ROUGE), 0);
  assert.equal(apres[k(3, 4)], BLANC);
});

test('prise majoritaire : il faut prendre le plus de pièces possible', () => {
  const b = plateau(8, [
    [5, 6, BLANC], [4, 5, ROUGE], // ce pion-ci ne prend qu'une pièce
    [7, 0, BLANC], [6, 1, ROUGE], [4, 1, ROUGE], // celui-là en prend deux
  ]);
  const coups = coupsPermis(b, BLANC, 8);
  assert.equal(coups.length, 1);
  assert.equal(coups[0].from, k(7, 0));
  assert.equal(coups[0].caps.length, 2);
});

test('dame volante : se déplace de plusieurs cases', () => {
  const b = plateau(8, [[7, 0, 2]]);
  const coups = coupsPermis(b, BLANC, 8);
  assert.equal(coups.length, 7);
});

test('dame volante : prend à distance et choisit sa case d’arrivée', () => {
  const b = plateau(8, [[7, 0, 2], [4, 3, ROUGE]]);
  const coups = coupsPermis(b, BLANC, 8);
  assert.equal(coups.length, 4, 'quatre cases d’arrivée possibles derrière la pièce prise');
  assert.ok(coups.every((m) => m.caps.length === 1 && m.caps[0] === k(4, 3)));
});

test('dame : deux pièces collées ne peuvent pas être sautées', () => {
  const b = plateau(8, [[7, 0, 2], [5, 2, ROUGE], [4, 3, ROUGE]]);
  assert.ok(coupsPermis(b, BLANC, 8).every((m) => m.caps.length === 0));
});

test('rafle : une pièce n’est jamais prise deux fois et reste en place jusqu’à la fin', () => {
  // La dame zigzague entre quatre pièces ; elle ne doit jamais repasser sur la même.
  const N = 10;
  const b = plateau(N, [[9, 0, 2], [7, 2, ROUGE], [5, 6, ROUGE], [5, 8, ROUGE], [1, 6, ROUGE]]);
  const coups = coupsPermis(b, BLANC, N);
  assert.ok(coups.length > 0);
  for (const m of coups) assert.equal(new Set(m.caps).size, m.caps.length);
  assert.equal(coups.length, 1);
  assert.equal(coups[0].caps.length, 4, 'les quatre pièces sont prises en une seule rafle');
  assert.deepEqual(coups[0].path, [k(4, 5, N), k(6, 7, N), k(4, 9, N), k(0, 5, N)]);
});

test('promotion : le pion qui finit sur la dernière rangée devient dame', () => {
  const b = plateau(8, [[1, 2, BLANC], [6, 3, ROUGE]]);
  const m = coupsPermis(b, BLANC, 8).find((x) => x.path[0] === k(0, 1));
  assert.equal(jouerCoup(b, m, 8)[k(0, 1)], 2);
  const r = coupsPermis(b, ROUGE, 8)[0];
  assert.equal(jouerCoup(b, r, 8)[r.path[0]], -2);
});

test('promotion : pas de dame si le pion ne fait que passer sur la dernière rangée', () => {
  const b = plateau(8, [[2, 1, BLANC], [1, 2, ROUGE], [1, 4, ROUGE]]);
  const coups = coupsPermis(b, BLANC, 8);
  assert.equal(coups.length, 1);
  assert.deepEqual(coups[0].path, [k(0, 3), k(2, 5)]);
  assert.equal(jouerCoup(b, coups[0], 8)[k(2, 5)], BLANC);
});

test('l’IA évite de se faire prendre bêtement', () => {
  // Le pion rouge peut aller en (3,2) en sécurité, ou en (3,4) où le blanc le prend.
  const b = plateau(8, [[2, 3, ROUGE], [4, 5, BLANC], [7, 0, BLANC]]);
  for (let graine = 1; graine <= 5; graine++) {
    const m = choisirCoup(b, ROUGE, 8, { niveau: 'moyen', alea: aleaGraine(graine) });
    assert.equal(m.path[0], k(3, 2));
  }
});

// Partie complète IA contre IA, en vérifiant chaque coup indépendamment du moteur.
function partie(N, niveauBlanc, niveauRouge, graine) {
  const alea = aleaGraine(graine);
  let b = plateauInitial(N), camp = BLANC, calme = 0;
  for (let demiCoup = 0; demiCoup < 300; demiCoup++) {
    const permis = coupsPermis(b, camp, N);
    if (!permis.length) return { gagnant: -camp, demiCoup };
    const niveau = camp === BLANC ? niveauBlanc : niveauRouge;
    const m = choisirCoup(b, camp, N, { niveau, limiteNoeuds: 4000, alea });
    assert.ok(permis.some((x) => memeCoup(x, m)), 'le coup choisi fait partie des coups permis');
    // vérifications indépendantes
    assert.equal(Math.sign(b[m.from]), camp, 'on joue une de ses pièces');
    const arrivee = m.path[m.path.length - 1];
    assert.ok(b[arrivee] === 0 || arrivee === m.from, 'case d’arrivée libre');
    assert.ok(estFoncee(arrivee, N), 'arrivée sur une case foncée');
    for (const c of m.caps) assert.equal(Math.sign(b[c]), -camp, 'on ne prend que des pièces adverses');
    assert.equal(new Set(m.caps).size, m.caps.length, 'pas deux fois la même pièce');
    const avant = compter(b, -camp), piece = b[m.from];
    b = jouerCoup(b, m, N);
    assert.equal(compter(b, -camp), avant - m.caps.length, 'les pièces prises disparaissent');
    b.forEach((v, i) => { if (v) assert.ok(estFoncee(i, N), 'aucune pièce sur une case claire'); });
    calme = m.caps.length || Math.abs(piece) === 1 ? 0 : calme + 1;
    if (calme >= 50) return { gagnant: 0, demiCoup };
    camp = -camp;
  }
  return { gagnant: 0, demiCoup: 300 };
}

test('parties simulées IA contre IA en 8 × 8 : aucun coup illégal', () => {
  const niveaux = ['facile', 'moyen', 'difficile'];
  for (let g = 1; g <= 9; g++) partie(8, niveaux[g % 3], niveaux[(g + 1) % 3], g);
});

test('parties simulées IA contre IA en 10 × 10 : aucun coup illégal', () => {
  for (let g = 1; g <= 4; g++) partie(10, g % 2 ? 'facile' : 'moyen', 'facile', 100 + g);
});

test('le niveau difficile bat le niveau facile le plus souvent', () => {
  let victoires = 0;
  for (let g = 1; g <= 6; g++) {
    const blanc = g % 2 === 0;
    const r = blanc ? partie(8, 'difficile', 'facile', 500 + g) : partie(8, 'facile', 'difficile', 500 + g);
    if (r.gagnant === (blanc ? BLANC : ROUGE)) victoires++;
  }
  assert.ok(victoires >= 4, `${victoires} victoires sur 6`);
});
