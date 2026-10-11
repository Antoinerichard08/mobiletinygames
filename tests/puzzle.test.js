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

// ---------- Accélérations et récompense de l'Aventure ----------

test('minutes gagnées : selon la difficulté de la partie gagnée, une heure par mission', async () => {
  const { minutesGagnees, texteDuree } = await import('../src/ile/atelier.js');
  assert.equal(minutesGagnees({ gagne: true, difficulte: 'facile' }), 30);
  assert.equal(minutesGagnees({ gagne: true, difficulte: 'moyen' }), 45);
  assert.equal(minutesGagnees({ gagne: true, difficulte: 'difficile' }), 60);
  assert.equal(minutesGagnees({ gagne: true }), 45, 'sans difficulté (Aventure, Bulles)');
  assert.equal(minutesGagnees({ gagne: false, difficulte: 'facile' }), 0, 'une partie perdue ne compte pas');
  assert.equal(minutesGagnees({ gagne: false }, 2), 120, 'mais ses missions, si');
  assert.equal(texteDuree(45), '45 min');
  assert.equal(texteDuree(60), '1 h');
  assert.equal(texteDuree(105), '1 h 45');
});

test('fin de partie : l’Atelier de la sauvegarde avance, avec une petite ligne douce', async () => {
  viderMemoire();
  const { ecrire, lire } = await import('../src/core/stockage.js');
  const { recompenser } = await import('../src/core/partie.js');
  await import('../src/progression/branchement.js');
  // sans Atelier : rien ne s'affiche
  let r = recompenser({ jeu: 'sudoku', gagne: true, difficulte: 'difficile' });
  assert.equal(r.bonus.some((b) => b.genre === 'atelier'), false);
  // avec un Atelier
  const { e, k } = avecAtelier(1, Date.now());
  ecrire('ile', e);
  r = recompenser({ jeu: 'sudoku', gagne: true, difficulte: 'difficile' });
  const ligne = r.bonus.find((b) => b.genre === 'atelier');
  assert.ok(ligne, 'une ligne pour l’Atelier');
  assert.match(ligne.texte, /avancé de/);
  assert.equal(ligne.etoiles, 0);
  const apres = lire('ile', null).iles[0].cases[k];
  assert.ok(apres.depuis < e.iles[0].cases[k].depuis, 'le temps de travail a avancé');
});

test('Aventure : un lot de 4 pièces tous les 10 niveaux, la première fois seulement', async () => {
  viderMemoire();
  const { niveau, enregistrer, LOT_PIECES } = await import('../src/progression/niveaux.js');
  assert.equal(LOT_PIECES, 4);
  assert.equal(niveau(10).pieces, 4);
  assert.equal(niveau(20).pieces, 4);
  assert.equal(niveau(9).pieces, 0);
  const victoire = { gagne: true, details: { indices: 0, erreurs: 0, annulations: 0, coups: 100, pionsRestants: 12 } };
  const r1 = enregistrer(niveau(10), victoire, '2026-10-11');
  assert.equal(r1.pieces, 4);
  assert.match(r1.texte, /4 pièces de puzzle/);
  assert.equal(soldePieces(), 4);
  const r2 = enregistrer(niveau(10), victoire, '2026-10-11');
  assert.equal(r2.pieces, 0, 'rejouer le niveau ne redonne pas le lot');
  assert.equal(soldePieces(), 4);
});

// ---------- Catalogue des tableaux ----------

test('catalogue : des tableaux CC0 vérifiés, complets, avec leur fichier et leur vignette', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const catalogue = JSON.parse(readFileSync(new URL('../data/catalogue-puzzles.json', import.meta.url), 'utf8'));
  const ids = new Set();
  for (const t of catalogue.images) {
    assert.ok(!ids.has(t.id), `identifiant unique : ${t.id}`);
    ids.add(t.id);
    for (const champ of ['titre', 'artiste', 'date', 'licence', 'source', 'page', 'fichier']) assert.ok(t[champ], `${t.id} : ${champ}`);
    assert.match(t.licence, /^CC0/, `${t.id} : licence CC0`);
    assert.match(t.page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(['petit', 'moyen', 'grand'].includes(t.taille));
    assert.ok(existsSync(new URL(`../${t.fichier}`, import.meta.url)), `${t.fichier} présent`);
    assert.match(t.vignette, /^data:image\/jpeg;base64,/);
    assert.ok(t.vignette.length < 8000, 'vignette minuscule');
    assert.ok(t.largeur > 0 && t.hauteur > 0);
  }
  const parTaille = (x) => catalogue.images.filter((t) => t.taille === x).length;
  assert.ok(parTaille('petit') >= 3 && parTaille('moyen') >= 1 && parTaille('grand') >= 1, 'de quoi remplir les 5 emplacements');
});

test('service worker : le catalogue est gardé hors ligne, les tableaux sont téléchargés au besoin', async () => {
  const { listerFichiersAppli, listerImagesPuzzles } = await import('../scripts/fichiers-appli.mjs');
  const appli = listerFichiersAppli();
  assert.ok(appli.includes('data/catalogue-puzzles.json'));
  assert.ok(!appli.some((f) => f.startsWith('assets/puzzles/')), 'les 8 Mo de tableaux ne sont pas mis en cache d’avance');
  assert.equal(listerImagesPuzzles().length, 27);
});
