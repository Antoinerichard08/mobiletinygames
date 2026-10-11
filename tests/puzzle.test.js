// Les pièces de puzzle : l'Atelier sur l'île (production, réserve, accélérations), la tirelire de pièces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BATIMENTS, MINUTE, etatVide, cle, terrainDe, construire, actualiser, ameliorer, stock, ramasser, toutRamasser,
  avancerAtelier, atelier, periode, plafond, dejaConstruit, estDebloque, AVANCE_PARTIE, AVANCE_MISSION,
} from '../src/ile/regles.js';
import { soldePieces, ajouterPieces, depenserPieces, totalPieces } from '../src/core/pieces.js';
import { viderMemoire } from '../src/core/stockage.js';

const T0 = 1_800_000_000_000;
const H = 60 * MINUTE;

/** Une île avec un Atelier terminé au niveau voulu (posé à la main sur une herbe libre). */
function avecAtelier(niveau = 1, depuis = T0) {
  const e = etatVide();
  const ile = e.iles[0];
  const k = Object.keys(ile.terre).find((x) => terrainDe(ile, ...x.split(',').map(Number)) === 'herbe');
  ile.cases[k] = { type: 'atelier', niveau, chantier: null, depuis };
  return { e, ile, k, xy: k.split(',').map(Number) };
}

test('Atelier : débloqué à 15 de beauté, un seul sur l’archipel', () => {
  const e = etatVide();
  assert.equal(BATIMENTS.atelier.debloque, 15);
  assert.equal(estDebloque(e, 'atelier'), false);
  const { e: e2, ile } = avecAtelier();
  assert.equal(dejaConstruit(e2, 'atelier'), true);
  const libre = Object.keys(ile.terre).find((x) => terrainDe(ile, ...x.split(',').map(Number)) === 'herbe' && !ile.cases[x]);
  // on ouvre tout (beauté) pour ne tester que l'unicité
  for (const [i, k] of Object.keys(ile.terre).filter((x) => !ile.cases[x] && x !== libre).entries()) if (i < 6) ile.cases[k] = { type: 'maison', niveau: 3, chantier: null };
  e2.ressources = { bois: 99, pierre: 99, ble: 99 };
  const r = construire(e2, 0, ...libre.split(',').map(Number), 'atelier', 99, () => true, T0);
  assert.equal(r.raison, 'unique');
});

test('Atelier : une pièce toutes les 8 h au niveau 1, plus vite à chaque niveau, avec une réserve', () => {
  const attendu = [[8 * H, 6], [6 * H, 8], [4.8 * H, 10], [4 * H, 12]];
  attendu.forEach(([p, cap], i) => {
    const c = { type: 'atelier', niveau: i + 1 };
    assert.equal(periode(c), p, 'niveau ' + (i + 1));
    assert.equal(plafond(c), cap);
  });
  const { e, ile, xy } = avecAtelier(1);
  assert.equal(stock(ile, ...xy, T0 + 7 * H), 0);
  assert.equal(stock(ile, ...xy, T0 + 17 * H), 2);
  assert.equal(stock(ile, ...xy, T0 + 1000 * H), 6, 'jamais plus que la réserve');
  // les pièces ne vont pas dans les ressources de l'île : l'écran les range dans leur tirelire
  const r = ramasser(e, 0, ...xy, T0 + 17 * H);
  assert.deepEqual(r, { res: 'pieces', n: 2 });
  assert.equal(e.ressources.pieces, undefined);
  assert.deepEqual(toutRamasser(e, T0 + 33 * H), { pieces: 2 });
});

test('Atelier : améliorer coûte le niveau suivant et le fait produire plus vite', () => {
  const { e, xy } = avecAtelier(1);
  e.ressources = { bois: 15, pierre: 10, ble: 6 };
  assert.equal(ameliorer(e, 0, ...xy, 10, () => true, T0).ok, true);
  assert.deepEqual(e.ressources, { bois: 0, pierre: 0, ble: 0 });
  actualiser(e, T0 + 10 * H);
  assert.equal(atelier(e).c.niveau, 2);
});

test('accélérer : une partie gagnée ou une mission font avancer le temps de l’Atelier', () => {
  assert.deepEqual(AVANCE_PARTIE, { facile: 30, moyen: 45, difficile: 60 });
  assert.equal(AVANCE_MISSION, 60);
  assert.equal(avancerAtelier(etatVide(), 60, T0), 0, 'sans Atelier, rien ne se passe');
  const { e, ile, xy } = avecAtelier(1, T0);
  // 7 h de travail, puis une heure offerte : la pièce est prête
  assert.equal(stock(ile, ...xy, T0 + 7 * H), 0);
  assert.equal(avancerAtelier(e, 60, T0 + 7 * H), 60);
  assert.equal(stock(ile, ...xy, T0 + 7 * H), 1);
});

test('rien ne se perd : le temps gagné au-delà de la réserve est gardé (une réserve de plus au plus)', () => {
  const { e, ile, xy } = avecAtelier(1, T0);
  const t = T0 + 48 * H; // réserve pleine (6 pièces)
  assert.equal(stock(ile, ...xy, t), 6);
  assert.equal(avancerAtelier(e, 16 * 60, t), 16 * 60, '2 pièces d’avance');
  assert.equal(ramasser(e, 0, ...xy, t).n, 6);
  assert.equal(stock(ile, ...xy, t), 2, 'les 2 pièces gagnées attendent');
  // pas plus de deux réserves de travail d'avance
  assert.ok(avancerAtelier(e, 10_000, t) < 10_000);
  assert.equal(ramasser(e, 0, ...xy, t).n, 6);
  assert.equal(stock(ile, ...xy, t), 6, 'une réserve de plus, pas davantage');
  assert.equal(ramasser(e, 0, ...xy, t).n, 6);
  assert.equal(stock(ile, ...xy, t), 0);
});

test('tirelire de pièces : on ajoute, on dépense ce qu’on a', () => {
  viderMemoire();
  assert.equal(soldePieces(), 0);
  ajouterPieces(5, 'test');
  assert.equal(soldePieces(), 5);
  assert.equal(depenserPieces(8), false, 'pas assez');
  assert.equal(depenserPieces(3), true);
  assert.equal(soldePieces(), 2);
  assert.equal(totalPieces(), 5, 'le total reçu ne baisse jamais');
});
