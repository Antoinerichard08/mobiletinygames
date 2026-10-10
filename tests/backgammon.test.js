import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLANC, NOIR, positionInitiale, coupsAvecDe, coupsAutorises, jouerSimple, desAJouer, toursPossibles,
  gagnant, pointsVictoire, pips, course, compterPions, retirerDe,
} from '../src/games/backgammon/moteur.js';
import { choisirTour, evaluer } from '../src/games/backgammon/ia.js';
import { aleaGraine } from '../src/core/outils.js';

const vide = () => ({ p: new Array(24).fill(0), barre: { 1: 0, '-1': 0 }, sortis: { 1: 0, '-1': 0 } });

test('position de départ : 15 pions chacun, 167 pips chacun', () => {
  const pos = positionInitiale();
  assert.equal(compterPions(pos, BLANC), 15);
  assert.equal(compterPions(pos, NOIR), 15);
  assert.equal(pips(pos, BLANC), 167);
  assert.equal(pips(pos, NOIR), 167);
});

test('une flèche tenue par deux pions adverses est fermée', () => {
  const pos = vide();
  pos.p[10] = 1; pos.p[7] = -2; pos.sortis[1] = 14; pos.sortis[-1] = 13;
  assert.equal(coupsAvecDe(pos, BLANC, 3).length, 0);
  assert.equal(coupsAvecDe(pos, BLANC, 2).length, 1);
});

test('frapper un pion seul l’envoie sur la barre', () => {
  const pos = vide();
  pos.p[10] = 1; pos.p[7] = -1; pos.sortis[1] = 14; pos.sortis[-1] = 14;
  const m = coupsAvecDe(pos, BLANC, 3)[0];
  assert.equal(m.frappe, true);
  const apres = jouerSimple(pos, BLANC, m);
  assert.equal(apres.p[7], 1);
  assert.equal(apres.barre[NOIR], 1);
});

test('un pion sur la barre doit entrer avant tout autre coup', () => {
  const pos = vide();
  pos.barre[1] = 1; pos.p[5] = 14;
  pos.p[20] = -2; // flèche 21 fermée pour l'entrée avec un 4
  pos.sortis[-1] = 13;
  assert.deepEqual(coupsAvecDe(pos, BLANC, 4), [], 'entrée bloquée');
  const coups = coupsAvecDe(pos, BLANC, 3);
  assert.equal(coups.length, 1);
  assert.equal(coups[0].from, 'barre');
  assert.equal(coups[0].to, 21);
});

test('il faut jouer les deux dés si c’est possible', () => {
  // Pions blancs aux indices 20 et 16, flèches noires fermées en 12, 14 et 15, lancer 3-2.
  // Jouer 20 → 17 avec le 3 rendrait le 2 injouable : ce coup est donc interdit.
  const pos = vide();
  pos.p[20] = 1; pos.p[16] = 1; pos.sortis[1] = 13;
  pos.p[12] = -2; pos.p[14] = -2; pos.p[15] = -2; pos.sortis[-1] = 9;
  const coups = coupsAutorises(pos, BLANC, [3, 2]);
  assert.ok(coupsAvecDe(pos, BLANC, 3).some((m) => m.from === 20 && m.to === 17), 'possible en soi…');
  assert.ok(!coups.some((m) => m.from === 20 && m.to === 17), '… mais interdit');
  assert.deepEqual(coups.map((m) => `${m.from}>${m.to}`).sort(), ['16>13', '20>18']);
});

test('si un seul dé peut être joué, c’est le plus fort', () => {
  const pos = vide();
  pos.p[12] = 1; pos.sortis[1] = 14;
  pos.p[2] = -2; // après 4 puis 6 (ou 6 puis 4) on arriverait en 2 : fermé
  pos.sortis[-1] = 13;
  const coups = coupsAutorises(pos, BLANC, [6, 4]);
  assert.ok(coups.length > 0);
  assert.ok(coups.every((m) => m.de === 6));
});

test('un double se joue quatre fois', () => {
  const pos = positionInitiale();
  const tours = toursPossibles(pos, BLANC, desAJouer(3, 3));
  assert.ok(tours.length > 1);
  for (const t of tours) assert.equal(t.coups.length, 4);
});

test('sortie : seulement quand tous les pions sont dans la maison', () => {
  const pos = vide();
  pos.p[2] = 14; pos.p[8] = 1; pos.sortis[-1] = 15 - 2; pos.p[23] = -2;
  assert.ok(coupsAvecDe(pos, BLANC, 3).every((m) => m.to !== 'sortie'), 'un pion est encore dehors');
  pos.p[8] = 0; pos.p[2] = 15;
  assert.ok(coupsAvecDe(pos, BLANC, 3).some((m) => m.to === 'sortie'));
});

test('sortie avec un dé trop fort : seulement depuis le pion le plus éloigné', () => {
  const pos = vide();
  pos.p[1] = 2; pos.p[3] = 1; pos.sortis[1] = 12; pos.p[23] = -15;
  const avec6 = coupsAvecDe(pos, BLANC, 6).filter((m) => m.to === 'sortie');
  assert.deepEqual(avec6.map((m) => m.from), [3], 'le 6 sort le pion de la flèche 4');
});

test('victoire, gammon et backgammon', () => {
  const pos = vide();
  pos.sortis[1] = 15; pos.sortis[-1] = 3; pos.p[23] = -12;
  assert.equal(gagnant(pos), BLANC);
  assert.equal(pointsVictoire(pos, BLANC), 1);
  pos.sortis[-1] = 0; pos.p[23] = 0; pos.p[12] = -15;
  assert.equal(pointsVictoire(pos, BLANC), 2, 'gammon');
  pos.p[12] = -14; pos.p[2] = -1;
  assert.equal(pointsVictoire(pos, BLANC), 3, 'backgammon : un pion encore dans la maison du gagnant');
});

test('course : détectée quand les pions ne peuvent plus se croiser', () => {
  assert.equal(course(positionInitiale()), false);
  const pos = vide();
  pos.p[3] = 15; pos.p[20] = -15;
  assert.equal(course(pos), true);
});

// Partie complète ordinateur contre ordinateur, avec vérifications indépendantes.
function partie(niveauBlanc, niveauNoir, graine) {
  const alea = aleaGraine(graine);
  const de = () => 1 + Math.floor(alea() * 6);
  let pos = positionInitiale(), camp = alea() < 0.5 ? BLANC : NOIR;
  for (let tour = 0; tour < 600; tour++) {
    const g = gagnant(pos);
    if (g) return { gagnant: g, points: pointsVictoire(pos, g) };
    const a = de(), b = de();
    const coups = choisirTour(pos, camp, a, b, { niveau: camp === BLANC ? niveauBlanc : niveauNoir, alea });
    let restants = desAJouer(a, b);
    for (const m of coups) {
      const permis = coupsAutorises(pos, camp, restants);
      assert.ok(permis.some((x) => x.from === m.from && x.to === m.to && x.de === m.de), 'coup légal');
      pos = jouerSimple(pos, camp, m);
      restants = retirerDe(restants, m.de);
      assert.equal(compterPions(pos, BLANC), 15);
      assert.equal(compterPions(pos, NOIR), 15);
    }
    assert.equal(coupsAutorises(pos, camp, restants).length, 0, 'tous les dés jouables ont été joués');
    camp = -camp;
  }
  throw new Error('partie trop longue');
}

test('parties ordinateur contre ordinateur : aucun coup illégal', () => {
  for (let g = 1; g <= 12; g++) partie(['facile', 'moyen', 'difficile'][g % 3], ['moyen', 'facile', 'moyen'][g % 3], g);
});

test('le niveau Difficile bat le niveau Facile le plus souvent', (t) => {
  let victoires = 0;
  const n = 10;
  for (let g = 1; g <= n; g++) {
    const difficileBlanc = g % 2 === 0;
    const r = difficileBlanc ? partie('difficile', 'facile', 300 + g) : partie('facile', 'difficile', 300 + g);
    if (r.gagnant === (difficileBlanc ? BLANC : NOIR)) victoires++;
  }
  t.diagnostic(`${victoires} victoires sur ${n}`);
  assert.ok(victoires >= 7, `${victoires} victoires sur ${n}`);
});

test('évaluation : frapper un pion seul vaut mieux que de rester exposé', () => {
  const pos = positionInitiale();
  const tours = toursPossibles(pos, BLANC, desAJouer(6, 5));
  const notes = tours.map((t) => evaluer(t.pos, BLANC));
  assert.ok(Math.max(...notes) > Math.min(...notes));
});
