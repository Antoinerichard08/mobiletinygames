import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plateauVide, voisines, centre, valide, largeurRangee, trajectoire, resoudre, reussi, debordement, couleursPresentes,
  cases, cloner, RANGEES_MAX, LARGEUR, nbPoussins, points,
} from '../src/games/bulles/moteur.js';
import { genererNiveau, simuler, parametres, etoilesNiveau, meilleurCoup, cibles, niveauPourDefi } from '../src/games/bulles/generateur.js';

const b = (k, extra = {}) => ({ type: 'bulle', k, ...extra });

test('grille hexagonale : rangées de 11 et 10 bulles, 6 voisines au plus', () => {
  assert.equal(largeurRangee(0), 11);
  assert.equal(largeurRangee(1), 10);
  assert.equal(voisines(5, 5).length, 6);
  assert.equal(voisines(0, 0).length, 2);
  for (const [r, c] of voisines(4, 3)) {
    const a = centre(4, 3), q = centre(r, c);
    assert.ok(Math.abs(Math.hypot(a.x - q.x, a.y - q.y) - 2) < 1e-9, 'les voisines sont à une bulle de distance');
  }
  assert.equal(valide(1, 10), false);
});

test('trajectoire : tout droit vers le haut, on s’accroche au plafond', () => {
  const p = plateauVide();
  const { cible, points: pts } = trajectoire(p, Math.PI / 2);
  assert.deepEqual(cible, { r: 0, c: 5 });
  assert.equal(pts.length, 2, 'aucun rebond');
});

test('trajectoire : les bords renvoient la bulle', () => {
  const p = plateauVide();
  const { points: pts, cible } = trajectoire(p, (20 * Math.PI) / 180);
  assert.ok(pts.length >= 3, 'au moins un rebond');
  assert.ok(cible);
  for (const q of pts) assert.ok(q.x >= 1 - 1e-9 && q.x <= LARGEUR - 1 + 1e-9);
});

test('trajectoire : on s’arrête contre la première bulle rencontrée', () => {
  const p = plateauVide();
  p[0][5] = b(0);
  p[1][4] = b(0);
  const { cible } = trajectoire(p, Math.PI / 2);
  assert.equal(cible.r, 2, 'accrochée sous la bulle de la rangée 1');
});

test('trois bulles de la même couleur éclatent, deux non', () => {
  const p = plateauVide();
  p[0][0] = b(1);
  p[0][1] = b(1);
  p[0][2] = b(2);
  const ev = resoudre(p, { r: 1, c: 0 }, { k: 1 });
  assert.equal(ev.eclatees.length, 3);
  assert.equal(p[0][0], null);
  const q = plateauVide();
  q[0][0] = b(1);
  assert.equal(resoudre(q, { r: 0, c: 1 }, { k: 1 }).eclatees.length, 0);
});

test('les bulles qui ne tiennent plus au plafond tombent', () => {
  const p = plateauVide();
  p[0][0] = b(1); p[0][1] = b(1);
  p[1][0] = b(3); p[2][0] = b(3); p[2][1] = b(4); // accrochées seulement par les rouges
  const ev = resoudre(p, { r: 0, c: 2 }, { k: 1 });
  assert.equal(ev.eclatees.length, 3);
  assert.equal(ev.tombees.length, 3);
  assert.equal([...cases(p)].length, 0);
});

test('la glace protège une bulle jusqu’à ce qu’un groupe voisin éclate', () => {
  const p = plateauVide();
  p[0][0] = b(1, { glace: true });
  p[0][1] = b(2); p[0][2] = b(2);
  resoudre(p, { r: 1, c: 1 }, { k: 1 }); // touche la bulle gelée : rien
  assert.ok(p[0][0].glace);
  resoudre(p, { r: 0, c: 3 }, { k: 2 }); // le groupe bleu éclate à côté : la glace se brise
  assert.equal(p[0][0].glace, false);
});

test('les pierres ne s’éclatent pas mais tombent si elles se décrochent', () => {
  const p = plateauVide();
  p[0][0] = b(1); p[0][1] = b(1);
  p[1][0] = { type: 'pierre' };
  p[0][3] = { type: 'pierre' };
  const ev = resoudre(p, { r: 0, c: 2 }, { k: 1 });
  assert.equal(ev.tombees.length, 1, 'la pierre accrochée sous les rouges tombe');
  assert.deepEqual(p[0][3], { type: 'pierre' }, 'celle du plafond reste');
});

test('bombe tirée : elle emporte tout autour d’elle ; bombe du plateau : réaction en chaîne', () => {
  const p = plateauVide();
  for (let c = 0; c < 5; c++) p[0][c] = b(c % 3);
  p[1][1] = { type: 'bombe' };
  const ev = resoudre(p, { r: 1, c: 2 }, { tir: 'bombe' });
  assert.ok(ev.explosions.length >= 2, 'la bombe voisine explose aussi');
  assert.ok(ev.eclatees.length >= 4);
});

test('arc-en-ciel : prend la couleur du plus grand groupe touché', () => {
  const p = plateauVide();
  p[0][0] = b(2); p[0][1] = b(2); p[0][2] = b(4);
  const ev = resoudre(p, { r: 1, c: 0 }, { tir: 'arc' });
  assert.equal(ev.couleur, 2);
  assert.equal(ev.eclatees.length, 3);
});

test('poussins : libérés quand leur bulle éclate ou tombe', () => {
  const p = plateauVide();
  p[0][0] = b(1, { poussin: true }); p[0][1] = b(1);
  assert.equal(nbPoussins(p), 1);
  const ev = resoudre(p, { r: 0, c: 2 }, { k: 1 });
  assert.equal(ev.poussins, 1);
  assert.equal(reussi(p, 'liberer'), true);
});

test('fin de partie : plateau vidé, ou débordement en bas', () => {
  const p = plateauVide();
  assert.equal(reussi(p, 'vider'), true);
  p[0][0] = { type: 'pierre' };
  assert.equal(reussi(p, 'vider'), true, 'les pierres ne comptent pas');
  p[RANGEES_MAX - 1][0] = b(1);
  assert.equal(debordement(p), true);
});

test('points : chute et poussins rapportent plus', () => {
  assert.equal(points({ eclatees: [1, 2, 3], tombees: [], poussins: 0 }), 30);
  assert.ok(points({ eclatees: [1, 2, 3], tombees: [1, 2, 3, 4, 5], poussins: 1 }) > 200);
});

test('génération : un niveau donné est toujours le même', () => {
  const a = genererNiveau(7), c = genererNiveau(7);
  assert.deepEqual(a.plateau, c.plateau);
  assert.equal(a.tirs, c.tirs);
});

test('génération : tout est accroché, les couleurs suivent la difficulté, objectifs variés', () => {
  for (const n of [1, 3, 6, 12, 26, 40]) {
    const L = genererNiveau(n);
    const P = parametres(n);
    assert.ok(couleursPresentes(L.plateau).length <= P.couleurs);
    // rien ne doit tomber au départ
    const q = cloner(L.plateau);
    const avant = [...cases(q)].length;
    const ev = resoudre(q, { r: RANGEES_MAX - 2, c: 0 }, { k: 9 });
    assert.equal(ev.tombees.length, 1, 'seule la bulle posée en bas, isolée, tombe');
    assert.equal([...cases(q)].length, avant);
    if (P.objectif === 'liberer') assert.ok(nbPoussins(L.plateau) > 0);
    assert.ok(L.tirs > L.parfait && L.parfait > 0);
  }
});

test('génération : les 30 premiers niveaux sont gagnables par le joueur automatique, avec les tirs donnés', () => {
  for (let n = 1; n <= 30; n++) {
    const L = genererNiveau(n);
    assert.ok(L.variante >= 0, `niveau ${n} vérifié`);
    const r = simuler(L, 999 + n);
    assert.ok(r.gagne, `niveau ${n} gagné par une autre partie automatique`);
  }
});

test('le meilleur coup choisit d’éclater quand c’est possible', () => {
  const p = plateauVide();
  p[0][4] = b(2); p[0][5] = b(2); p[0][6] = b(1);
  const coup = meilleurCoup(p, { k: 2 }, { k: 1 }, 'vider', () => 0);
  const q = cloner(p);
  const ev = resoudre(q, coup.cible, coup.echange ? { k: 1 } : { k: 2 });
  assert.ok(ev.eclatees.length >= 3);
  assert.ok(cibles(p).length > 5);
});

test('étoiles : 3 si l’on fait aussi bien que le joueur automatique, 1 avec des tirs offerts', () => {
  const L = { parfait: 10, bien: 13 };
  assert.equal(etoilesNiveau(L, 9), 3);
  assert.equal(etoilesNiveau(L, 12), 2);
  assert.equal(etoilesNiveau(L, 20), 1);
  assert.equal(etoilesNiveau(L, 5, true), 1);
  assert.ok(niveauPourDefi('difficile', 3) > niveauPourDefi('facile', 3));
});
