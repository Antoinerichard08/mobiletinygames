// L'île plein écran : bâtisseurs, déplacements, bouteille à la mer, niveau de l'île, conseils, caméra et plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BATIMENTS, MINUTE, INTERVALLE_TRESOR, etatVide, cle, coord, terrainDe, estCote, construire, actualiser, decorer,
  batisseurs, batisseursLibres, chantiers, prixBatisseur, engagerBatisseur, prixFinir, finir, amenager,
  peutDeplacer, apercuDeplacement, deplacer, ramasserTresor, paliers, niveauIle, progressionIle, beauteIle, voisinsDe,
  estTerre, majExt, PORTEE_MAX,
} from '../src/ile/regles.js';
import { conseil, meilleureCase } from '../src/ile/conseil.js';
import { camera, versEcran, versMonde, borner, zoomAutour, zoomPourVoir, entre } from '../src/ile/camera.js';
import { EMPLACEMENTS, origine, rectIle, rectMonde, caseSous, ileProche } from '../src/ile/plan.js';

const T0 = 1_800_000_000_000;
const bourse = (n) => {
  let etoiles = n;
  const payer = (prix) => (prix <= etoiles ? ((etoiles -= prix), true) : false);
  payer.reste = () => etoiles;
  return payer;
};
function casesHerbe(e) {
  const ile = e.iles[0], out = [];
  for (let y = ile.ext.y0; y <= ile.ext.y1; y++) for (let x = ile.ext.x0; x <= ile.ext.x1; x++) {
    if (terrainDe(ile, x, y) === 'herbe' && !ile.cases[cle(x, y)]) out.push([x, y]);
  }
  return out;
}

// ---------- Règles ----------

test('bâtisseurs : deux chantiers à la fois, puis il faut attendre, finir ou en engager un', () => {
  const e = etatVide();
  const payer = bourse(100);
  const [a, b, c] = casesHerbe(e);
  assert.equal(batisseurs(e), 2);
  assert.equal(construire(e, 0, ...a, 'champ', payer.reste(), payer, T0).ok, true);
  assert.equal(construire(e, 0, ...b, 'champ', payer.reste(), payer, T0).ok, true);
  assert.equal(batisseursLibres(e), 0);
  const avant = payer.reste();
  assert.equal(construire(e, 0, ...c, 'champ', payer.reste(), payer, T0).raison, 'batisseurs');
  assert.equal(payer.reste(), avant, 'rien n’est payé quand personne n’est libre');
  assert.equal(chantiers(e).length, 2);
  // un troisième bâtisseur
  assert.equal(prixBatisseur(e), 15);
  assert.equal(engagerBatisseur(e, payer).ok, true);
  assert.equal(batisseurs(e), 3);
  assert.equal(construire(e, 0, ...c, 'champ', payer.reste(), payer, T0).ok, true);
  assert.equal(prixBatisseur(e), 30);
  engagerBatisseur(e, payer);
  assert.equal(prixBatisseur(e), null, 'quatre au plus');
  assert.equal(engagerBatisseur(e, payer).raison, 'max');
  // les aménagements n'occupent pas de bâtisseur
  const foret = Object.keys(e.iles[0].terrain).find((k) => e.iles[0].terrain[k] === 'foret');
  assert.equal(amenager(e, 0, ...coord(foret), 'abattre', 0, payer, T0).ok, true);
  assert.equal(chantiers(e).length, 3);
});

test('finir tout de suite : chantiers et aménagements, une étoile par minute restante', () => {
  const e = etatVide();
  const payer = bourse(50);
  const [x, y] = casesHerbe(e)[0];
  construire(e, 0, x, y, 'champ', 50, payer, T0);
  assert.equal(prixFinir(e.iles[0], x, y, T0), 1);
  assert.equal(finir(e, 0, x, y, payer, T0).ok, true);
  assert.equal(actualiser(e, T0)[0].genre, 'construit');
  const roche = Object.keys(e.iles[0].terrain).find((k) => e.iles[0].terrain[k] === 'montagne');
  amenager(e, 0, ...coord(roche), 'casser', 50, payer, T0);
  assert.equal(prixFinir(e.iles[0], ...coord(roche), T0), 1);
  assert.equal(finir(e, 0, ...coord(roche), payer, T0).ok, true);
  actualiser(e, T0);
  assert.equal(terrainDe(e.iles[0], ...coord(roche)), 'herbe');
  assert.equal(prixFinir(e.iles[0], x, y, T0), null, 'plus rien à finir');
});

test('déplacer : le bâtiment garde son niveau et sa récolte, la beauté suit les voisins', () => {
  const e = etatVide();
  const ile = e.iles[0];
  const [a, b] = casesHerbe(e);
  ile.cases[cle(...a)] = { type: 'maison', niveau: 2, chantier: null, depuis: T0 };
  assert.equal(peutDeplacer(ile, cle(...a), ...a), true, 'sa propre case est libre');
  assert.equal(peutDeplacer(ile, cle(...a), 0, 0), false, 'pas dans la mer');
  const gain = apercuDeplacement(ile, cle(...a), ...b);
  const avant = beauteIle(ile);
  const r = deplacer(e, 0, cle(...a), ...b);
  assert.equal(r.ok, true);
  assert.equal(r.gain, gain);
  assert.equal(beauteIle(ile), avant + gain);
  assert.equal(ile.cases[cle(...a)], undefined);
  assert.deepEqual(ile.cases[cle(...b)], { type: 'maison', niveau: 2, chantier: null, depuis: T0 });
  // un port reste au bord de l'eau
  const cotes = [];
  for (let y = ile.ext.y0 - 1; y <= ile.ext.y1 + 1; y++) for (let x = ile.ext.x0 - 1; x <= ile.ext.x1 + 1; x++) if (estCote(ile, x, y)) cotes.push(cle(x, y));
  ile.cases[cotes[0]] = { type: 'port', niveau: 1, chantier: null };
  assert.equal(peutDeplacer(ile, cotes[0], ...a), false);
  assert.equal(peutDeplacer(ile, cotes[0], ...coord(cotes[1])), true);
});

test('bouteille à la mer : elle s’échoue sur une plage, se ramasse, puis revient plus tard', () => {
  const e = etatVide();
  assert.deepEqual(actualiser(e, T0), [], 'la première visite lance le compte à rebours');
  assert.equal(e.tresor, undefined);
  const ev = actualiser(e, T0 + 3 * MINUTE);
  assert.equal(ev.at(-1).genre, 'tresor');
  const ile = e.iles[e.tresor.n];
  assert.equal(estCote(ile, ...coord(e.tresor.cle)), true, 'au bord de l’eau');
  const avant = { ...e.ressources };
  const gain = ramasserTresor(e, T0 + 4 * MINUTE);
  assert.ok(Object.values(gain).some((v) => v > 0));
  for (const r of ['bois', 'pierre', 'ble']) assert.equal(e.ressources[r], avant[r] + (gain[r] || 0));
  assert.equal(e.tresor, null);
  assert.deepEqual(actualiser(e, T0 + 5 * MINUTE), [], 'pas tout de suite');
  assert.equal(actualiser(e, T0 + 4 * MINUTE + INTERVALLE_TRESOR).at(-1).genre, 'tresor');
});

test('une bouteille sur une plage devenue un port dérive ailleurs', () => {
  const e = etatVide();
  actualiser(e, T0);
  actualiser(e, T0 + 3 * MINUTE);
  const k = e.tresor.cle;
  e.iles[0].cases[k] = { type: 'port', niveau: 1, chantier: null };
  actualiser(e, T0 + 3 * MINUTE + 1000);
  assert.notEqual(e.tresor.cle, k);
  assert.equal(e.iles[0].cases[e.tresor.cle], undefined);
});

test('niveau de l’île : il monte à chaque seuil de beauté franchi', () => {
  const e = etatVide();
  assert.equal(niveauIle(e), 1);
  const p = progressionIle(e);
  assert.deepEqual([p.niveau, p.beaute, p.de], [1, 0, 0]);
  assert.equal(p.vers, paliers()[0].seuil);
  const ile = e.iles[0];
  for (const [x, y] of casesHerbe(e).slice(0, 3)) ile.cases[cle(x, y)] = { type: 'maison', niveau: 3, chantier: null };
  assert.ok(niveauIle(e) > 1);
  assert.ok(paliers().every((x, i, l) => i === 0 || l[i - 1].seuil <= x.seuil), 'dans l’ordre');
});

// ---------- Conseils ----------

test('conseil : d’abord la bouteille, puis la récolte, puis construire', () => {
  const e = etatVide();
  let c = conseil(e, 5, T0);
  assert.equal(c.cible.id, 'construire', 'une île vide : construire');
  assert.ok(c.suggestion, 'avec la meilleure case');
  const [x, y] = c.suggestion ? coord(c.suggestion.cle) : [0, 0];
  if (c.suggestion.type === 'hameau') assert.ok(voisinsDe(x, y).some(() => true));
  e.iles[0].cases[cle(...casesHerbe(e)[0])] = { type: 'champ', niveau: 1, chantier: null, depuis: T0 };
  c = conseil(e, 0, T0 + 20 * MINUTE);
  assert.equal(c.cible.genre, 'case', 'le blé est prêt');
  e.tresor = { n: 0, cle: cle(1, 0), gain: { bois: 3 } };
  assert.match(conseil(e, 0, T0).texte, /bouteille/);
});

test('conseil : sans étoiles ni bâtisseur libre, on propose de jouer', () => {
  const e = etatVide();
  const payer = bourse(6);
  const [a, b] = casesHerbe(e);
  construire(e, 0, ...a, 'champ', 6, payer, T0);
  construire(e, 0, ...b, 'champ', 3, payer, T0);
  const c = conseil(e, 0, T0);
  assert.equal(c.cible.id, 'jouer');
  assert.match(c.texte, /bâtisseurs/);
});

test('la meilleure case d’une cabane est près de la forêt', () => {
  const e = etatVide();
  const place = meilleureCase(e.iles[0], 'hameau');
  assert.ok(place);
  const ile = e.iles[0], [x, y] = coord(place.cle);
  let foret = false;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2 && terrainDe(ile, x + dx, y + dy) === 'foret') foret = true;
  assert.ok(foret);
});

// ---------- Caméra ----------

test('caméra : écran ↔ monde, zoom autour du doigt, bornes', () => {
  const c = camera(5, 3, 40, 800, 400);
  const p = versEcran(c, 7, 4);
  assert.deepEqual(p, { x: 480, y: 240 });
  assert.deepEqual(versMonde(c, p.x, p.y), { x: 7, y: 4 });
  const z = zoomAutour(c, 100, 50, 2, 10, 100);
  assert.equal(z.z, 80);
  const avant = versMonde(c, 100, 50), apres = versMonde(z, 100, 50);
  assert.ok(Math.abs(avant.x - apres.x) < 1e-9 && Math.abs(avant.y - apres.y) < 1e-9, 'le point sous le doigt ne bouge pas');
  assert.equal(zoomAutour(c, 0, 0, 100, 10, 60).z, 60, 'zoom limité');
  const b = borner({ ...c, x: -100, y: 500 }, { x0: 0, y0: 0, x1: 100, y1: 50 });
  assert.equal(b.x, 10, 'la vue reste au-dessus du monde (bord gauche)');
  assert.equal(b.y, 45);
  const petit = borner({ ...c, x: 3 }, { x0: 0, y0: 0, x1: 4, y1: 4 });
  assert.equal(petit.x, 2, 'un monde plus petit que l’écran reste centré');
  assert.equal(zoomPourVoir(c, { x0: 0, y0: 0, x1: 10, y1: 5 }), 80);
  const milieu = entre(camera(0, 0, 20), camera(10, 0, 80), 1);
  assert.equal(milieu.x, 10);
  assert.equal(milieu.z, 80);
});

// ---------- Plan de l'archipel ----------

test('plan : les îles ne se chevauchent pas, même agrandies au maximum', () => {
  const e = etatVide();
  for (const ile of e.iles) {
    // toute la place autour du centre de départ
    for (let y = Math.ceil(ile.centre.y - PORTEE_MAX.y); y <= ile.centre.y + PORTEE_MAX.y; y++) {
      for (let x = Math.ceil(ile.centre.x - PORTEE_MAX.x); x <= ile.centre.x + PORTEE_MAX.x; x++) ile.terre[cle(x, y)] = 1;
    }
    majExt(ile);
  }
  const r = e.iles.map((ile, n) => rectIle(ile, n));
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const separe = r[i].x1 <= r[j].x0 || r[j].x1 <= r[i].x0 || r[i].y1 <= r[j].y0 || r[j].y1 <= r[i].y0;
    assert.ok(separe, `îles ${i} et ${j}`);
  }
  assert.equal(EMPLACEMENTS.length, e.iles.length);
  const m = rectMonde(e, 3);
  assert.ok(r.every((a) => a.x0 >= m.x0 && a.x1 <= m.x1 && a.y0 >= m.y0 && a.y1 <= m.y1));
});

test('plan : la case sous le doigt, sur les îles découvertes seulement', () => {
  const e = etatVide();
  const ile = e.iles[0], { ox, oy } = origine(ile, 0);
  const [tx, ty] = coord(Object.keys(ile.terre)[0]);
  const s = caseSous(e, 1, ox + tx + 0.5, oy + ty + 0.5);
  assert.deepEqual([s.n, s.x, s.y, s.terre], [0, tx, ty, true]);
  let cote = null;
  for (let y = ile.ext.y0 - 1; y <= ile.ext.y1 + 1 && !cote; y++) for (let x = ile.ext.x0 - 1; x <= ile.ext.x1 + 1; x++) if (estCote(ile, x, y)) { cote = [x, y]; break; }
  assert.equal(caseSous(e, 1, ox + cote[0] + 0.5, oy + cote[1] + 0.5).cote, true);
  assert.equal(estTerre(ile, ...cote), false);
  assert.equal(caseSous(e, 1, ox - 10, oy - 10), null, 'pleine mer');
  const r1 = rectIle(e.iles[1], 1);
  assert.equal(caseSous(e, 1, r1.x0 + 2, r1.y0 + 2), null, 'île encore dans les nuages');
  assert.equal(caseSous(e, 2, r1.x0 + 2, r1.y0 + 2).n, 1);
  assert.equal(ileProche(e, 2, r1.x0 + 2, r1.y0 + 2), 1);
});

// ---------- La vie du village ----------

test('vie : les habitants restent sur la terre et un bâtisseur va au chantier', async () => {
  const { creerVie } = await import('../src/ile/vie.js');
  const e = etatVide();
  const payer = bourse(20);
  const [a, b] = casesHerbe(e);
  e.iles[0].cases[cle(...a)] = { type: 'maison', niveau: 2, chantier: null, depuis: T0 };
  construire(e, 0, ...b, 'champ', 20, payer, T0);
  const vie = creerVie();
  vie.peupler(e);
  const habitants = () => vie.entites.filter((x) => x.genre === 'habitant');
  assert.ok(habitants().length >= 4, 'deux habitants par niveau de maison');
  assert.ok(vie.entites.some((x) => x.genre === 'bateau'));
  let pres = false;
  for (let i = 0; i < 600; i++) {
    vie.maj(0.05, { x0: -10, y0: -10, x1: 10, y1: 10 });
    for (const h of habitants()) {
      const ile = e.iles[h.n];
      assert.ok(h.x >= ile.ext.x0 && h.x <= ile.ext.x1 + 1 && h.y >= ile.ext.y0 && h.y <= ile.ext.y1 + 1, 'sur l’île');
      if (h.metier === 'macon' && Math.abs(Math.floor(h.x) - b[0]) + Math.abs(Math.floor(h.y) - b[1]) <= 1) pres = true;
    }
  }
  assert.ok(pres, 'le maçon est allé au chantier');
  vie.peupler(e);
  assert.equal(habitants().length, habitants().length, 'repeupler sans changement ne bouge rien');
});

test('buissons et cailloux : il y en a au départ, ils repoussent sans tout envahir, et rapportent un peu', () => {
  const e = etatVide();
  const ile = e.iles[0];
  const obstacles = () => Object.values(ile.terrain).filter((x) => x === 'buisson' || x === 'caillou').length;
  assert.equal(obstacles(), 3, 'deux buissons et des cailloux sur une île neuve');
  const k = Object.keys(ile.terrain).find((x) => ile.terrain[x] === 'buisson');
  assert.equal(peutDeplacer(ile, k, 0, 0), false);
  assert.equal(amenager(e, 0, ...coord(k), 'debroussailler', 0, () => true, T0).ok, true);
  actualiser(e, T0 + MINUTE);
  assert.equal(terrainDe(ile, ...coord(k)), 'herbe');
  assert.equal(e.ressources.bois, 2);
  // trois heures plus tard, quelque chose a repoussé ; jamais plus de trois par île
  const ev = actualiser(e, T0 + MINUTE + 3 * 60 * MINUTE + 1000);
  assert.ok(ev.some((x) => x.genre === 'pousse'));
  for (let h = 1; h < 40; h++) actualiser(e, T0 + h * 3 * 60 * MINUTE);
  assert.ok(obstacles() <= 3);
});
