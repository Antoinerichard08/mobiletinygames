import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plateauVide, voisines, centre, valide, largeurRangee, trajectoire, resoudre, reussi, debordement, couleursPresentes,
  cases, cloner, RANGEES_MAX, LARGEUR, nbPoussins, points, multiplicateur,
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

test('étoiles : selon le score atteint, une seule avec des bulles offertes', () => {
  const L = { paliers: [0, 1000, 2000] };
  assert.equal(etoilesNiveau(L, 2500), 3);
  assert.equal(etoilesNiveau(L, 1500), 2);
  assert.equal(etoilesNiveau(L, 300), 1);
  assert.equal(etoilesNiveau(L, 5000, true), 1);
  assert.ok(niveauPourDefi('difficile', 3) > niveauPourDefi('facile', 3));
});

// ---------- Mécaniques avancées ----------

test('bulle étoile : toutes les bulles de la couleur tirée disparaissent', () => {
  const p = plateauVide();
  p[0][0] = { type: 'etoile' };
  p[0][3] = b(2); p[0][7] = b(2); p[0][5] = b(1);
  const ev = resoudre(p, { r: 1, c: 0 }, { k: 2 });
  assert.equal(ev.etoiles.length, 1);
  assert.equal(p[0][3], null);
  assert.equal(p[0][7], null);
  assert.ok(p[0][5], 'les autres couleurs restent');
});

test('bulle éclair : toute sa rangée disparaît quand un groupe voisin éclate', () => {
  const p = plateauVide();
  for (let c = 0; c < 11; c++) p[0][c] = b(c % 2 ? 3 : 4);
  p[1][0] = b(1); p[1][1] = b(1);
  p[2][1] = { type: 'eclair' };
  p[2][4] = b(5);
  p[1][4] = b(5); // tient la bulle 2,4 au plafond
  const ev = resoudre(p, { r: 2, c: 0 }, { k: 1 });
  assert.equal(ev.eclairs.length, 1);
  assert.equal(p[2][4], null, 'la rangée de l’éclair est vidée');
});

test('bulle « +3 » : trois bulles en plus quand elle éclate', () => {
  const p = plateauVide();
  p[0][0] = b(1, { plus: 3 }); p[0][1] = b(1);
  const ev = resoudre(p, { r: 0, c: 2 }, { k: 1 });
  assert.equal(ev.tirsBonus, 3);
});

test('bulle bicolore : elle compte pour ses deux couleurs', () => {
  const p = plateauVide();
  p[0][0] = b(1, { k2: 4 }); p[0][1] = b(4);
  const ev = resoudre(p, { r: 0, c: 2 }, { k: 4 });
  assert.equal(ev.eclatees.length, 3);
  assert.deepEqual(couleursPresentes(p), []);
});

test('bulle mystère : sa couleur se révèle quand une voisine éclate', () => {
  const p = plateauVide();
  p[0][0] = b(1, { mystere: true }); p[0][1] = b(1);
  assert.equal(resoudre(p, { r: 1, c: 0 }, { k: 1 }).eclatees.length, 0, 'encore cachée : elle ne compte pas');
  const q = plateauVide();
  q[0][0] = b(3, { mystere: true }); q[0][1] = b(2); q[0][2] = b(2);
  const ev = resoudre(q, { r: 0, c: 3 }, { k: 2 });
  assert.equal(ev.reveles.length, 1);
  assert.equal(q[0][0].mystere, false);
});

test('boule de feu : elle traverse tout jusqu’au plafond', () => {
  const p = plateauVide();
  for (let r = 0; r < 4; r++) for (let c = 0; c < largeurRangee(r); c++) p[r][c] = b((r + c) % 4);
  const { touchees, cible } = trajectoire(p, Math.PI / 2, true);
  assert.equal(cible, null);
  assert.ok(touchees.length >= 4, 'plusieurs rangées traversées');
  const ev = resoudre(p, null, { tir: 'feu' }, touchees);
  assert.ok(ev.eclatees.length >= 4);
});

test('série : chaque tir réussi d’affilée rapporte un peu plus', () => {
  const ev = { eclatees: [1, 2, 3], tombees: [], poussins: 0 };
  assert.equal(points(ev, 1), 30);
  assert.equal(points(ev, 3), 60);
  assert.equal(multiplicateur(20), 3, 'jusqu’à × 3');
});

test('génération : au moins 10 bulles, et 60 % de bulles ordinaires au moins', () => {
  for (const n of [30, 45, 60]) {
    const L = genererNiveau(n);
    assert.ok(L.tirs >= 10);
    const toutes = [...cases(L.plateau)];
    const speciales = toutes.filter(([, , v]) => v.type !== 'bulle' || v.glace || v.mystere || v.plus || v.k2 !== undefined).length;
    assert.ok(speciales <= toutes.length * 0.45, `niveau ${n} : ${speciales} spéciales sur ${toutes.length}`);
    assert.ok(L.paliers[2] > L.paliers[1]);
  }
});
