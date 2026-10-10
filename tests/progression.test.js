import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { viderMemoire } from '../src/core/stockage.js';
import { solde } from '../src/core/etoiles.js';
import { recompenser } from '../src/core/partie.js';
import {
  niveau, etoilesObtenues, etat, niveauCourant, statut, enregistrer, PAR_CHAPITRE, JETONS_PREMIER_JOUR, JETONS_PAR_JOUR, JETONS_MAX,
} from '../src/progression/niveaux.js';
import { missionsDuJour, signaler, liste, BONUS_COFFRE } from '../src/progression/missions.js';
import '../src/progression/branchement.js';

beforeEach(() => viderMemoire());

const victoire = (details = {}) => ({ gagne: true, details: { indices: 0, erreurs: 0, annulations: 0, coups: 100, pionsRestants: 12, ...details } });

test('les niveaux alternent les 4 jeux et deviennent plus difficiles', () => {
  const jeux = new Set();
  for (let n = 1; n <= 8; n++) jeux.add(niveau(n).jeu);
  assert.equal(jeux.size, 4);
  assert.ok([1, 2, 3, 4, 5].every((n) => niveau(n).niveau === 'facile'), 'le début est facile');
  assert.equal(niveau(PAR_CHAPITRE).grandDefi, true);
  assert.equal(niveau(PAR_CHAPITRE).cadeau, 'coffre');
  assert.ok(niveau(60).niveau !== 'facile');
  assert.ok(niveau(500).objectif.length > 0, 'la carte continue sans fin');
});

test('étoiles d’un niveau : 1 pour la victoire, +1 par objectif bonus', () => {
  const def = niveau(1);
  assert.equal(etoilesObtenues(def, { gagne: false }), 0);
  assert.equal(etoilesObtenues(def, victoire()), 3);
  assert.equal(etoilesObtenues(def, victoire({ indices: 2, erreurs: 3, coups: 999, pionsRestants: 1, annulations: 4 })), 1);
});

test('rythme : quelques nouveaux niveaux par jour, rejouer reste libre', () => {
  let e = etat('2026-10-10');
  assert.equal(e.jetons, JETONS_PREMIER_JOUR);
  for (let n = 1; n <= JETONS_PREMIER_JOUR; n++) {
    assert.equal(statut(n, etat('2026-10-10')), 'ouvert');
    enregistrer(niveau(n), victoire(), '2026-10-10');
  }
  e = etat('2026-10-10');
  assert.equal(niveauCourant(e), JETONS_PREMIER_JOUR + 1);
  assert.equal(statut(JETONS_PREMIER_JOUR + 1, e), 'demain', 'plus de nouveau niveau aujourd’hui');
  assert.equal(statut(JETONS_PREMIER_JOUR + 2, e), 'verrouille');
  assert.equal(statut(1, e), 'gagne', 'un niveau gagné se rejoue');
  e = etat('2026-10-11');
  assert.equal(e.jetons, JETONS_PAR_JOUR);
  assert.equal(statut(JETONS_PREMIER_JOUR + 1, e), 'ouvert');
});

test('les jetons s’accumulent un peu si l’on ne joue pas, sans dépasser le maximum', () => {
  etat('2026-10-01');
  const e = etat('2026-10-20');
  assert.equal(e.jetons, Math.min(JETONS_MAX, JETONS_PREMIER_JOUR + JETONS_PAR_JOUR));
});

test('rejouer un niveau pour améliorer son score ne donne que la différence', () => {
  const def = niveau(1);
  const r1 = enregistrer(def, victoire({ indices: 3, erreurs: 2 }), '2026-10-10');
  assert.equal(r1.etoilesNiveau, 1);
  assert.equal(r1.etoilesGagnees, 1);
  const r2 = enregistrer(def, victoire(), '2026-10-10');
  assert.equal(r2.etoilesGagnees, 2);
  const r3 = enregistrer(def, victoire(), '2026-10-10');
  assert.equal(r3.etoilesGagnees, 0);
  assert.equal(etat('2026-10-10').jetons, JETONS_PREMIER_JOUR - 1, 'rejouer ne consomme pas de jeton');
});

test('cadeaux sur la carte : un cadeau au milieu du chapitre, un coffre à la fin', () => {
  const e = etat('2026-10-10');
  e.jetons = 99;
  const r6 = enregistrer(niveau(6), victoire(), '2026-10-10');
  assert.equal(r6.cadeau, 3);
  const r12 = enregistrer(niveau(PAR_CHAPITRE), victoire(), '2026-10-10');
  assert.equal(r12.cadeau, 10);
});

test('missions du jour : toujours les mêmes pour une date, 3 différentes', () => {
  const a = missionsDuJour('2026-10-10').map((m) => m.id);
  assert.deepEqual(a, missionsDuJour('2026-10-10').map((m) => m.id));
  assert.equal(new Set(a).size, 3);
  assert.notDeepEqual(a, missionsDuJour('2026-10-11').map((m) => m.id));
});

test('missions : progression, récompense et coffre quand les trois sont faites', () => {
  const jour = '2026-10-10';
  let recompenses = [];
  // on joue jusqu'à tout accomplir (victoires variées en niveau difficile, en défi, sans indice)
  for (let i = 0; i < 12; i++) {
    for (const jeu of ['sudoku', 'solitaire', 'dames', 'backgammon', 'bulles']) {
      recompenses = recompenses.concat(signaler({ jeu, gagne: true, difficulte: 'difficile', defi: { numero: 1 }, details: { indices: 0 }, etoiles: 3 }, jour));
    }
  }
  assert.ok(liste(jour).every((m) => m.faite));
  assert.equal(recompenses.filter((r) => r.texte.includes('coffre')).length, 1);
  assert.equal(recompenses.find((r) => r.texte.includes('coffre')).etoiles, BONUS_COFFRE);
  assert.equal(recompenses.length, 4, '3 missions + le coffre, chacun une seule fois');
});

test('fin de partie en défi : la tirelire reçoit les étoiles du niveau et des missions', () => {
  const avant = solde();
  const def = niveau(1);
  const { etoiles, niveau: res } = recompenser({ jeu: def.jeu, gagne: true, difficulte: def.niveau, defi: { numero: 1, id: 'n1' }, details: victoire().details });
  assert.equal(res.etoilesNiveau, 3);
  assert.equal(etoiles, 3);
  assert.ok(solde() >= avant + 3);
});

test('fin de partie libre : 1 à 3 étoiles selon la difficulté, 1 d’encouragement en cas de défaite', () => {
  assert.equal(recompenser({ jeu: 'dames', gagne: true, difficulte: 'facile' }).etoiles, 1);
  assert.equal(recompenser({ jeu: 'dames', gagne: true, difficulte: 'difficile' }).etoiles, 3);
  assert.equal(recompenser({ jeu: 'dames', gagne: false, difficulte: 'difficile' }).etoiles, 1);
});
