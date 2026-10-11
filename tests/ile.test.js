import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ILES, BATIMENTS, DECORS, MINUTE, PLAFOND_PAR_NIVEAU, etatVide, migrer, cle, coord, estTerre, estCote, terrainDe,
  peutPoser, construire, ameliorer, accelerer, prixAcceleration, actualiser, decorer, retirer, produit, stock,
  ramasser, toutRamasser, amenager, peutAmenager, acheterCase, coutCase, casesAchetables, peutAcheter, nbTerres, beauteIle, beauteTotale,
  PORTEE_MAX, formeOrganique,
  ilesOuvertes, estDebloque, apercu, habitants, manque, pointsCase, voisinsDe,
} from '../src/ile/regles.js';

const T0 = 1_800_000_000_000;
const bourse = (n) => {
  let etoiles = n;
  const payer = (prix) => (prix <= etoiles ? ((etoiles -= prix), true) : false);
  payer.reste = () => etoiles;
  return payer;
};
/** Première case d'herbe libre de l'île 0 qui vérifie une condition. */
function caseHerbe(e, condition = () => true) {
  const ile = e.iles[0];
  for (let y = ile.ext.y0; y <= ile.ext.y1; y++) for (let x = ile.ext.x0; x <= ile.ext.x1; x++) {
    if (terrainDe(ile, x, y) === 'herbe' && !ile.cases[cle(x, y)] && condition(x, y)) return [x, y];
  }
  return null;
}
const pres = (e, terrain) => (x, y) => voisinsDe(x, y).some(([vx, vy]) => terrainDe(e.iles[0], vx, vy) === terrain);

/** Une case d'eau qui touche la terre par un côté. */
function caseCote(ile) {
  for (let y = ile.ext.y0 - 1; y <= ile.ext.y1 + 1; y++) for (let x = ile.ext.x0 - 1; x <= ile.ext.x1 + 1; x++) if (estCote(ile, x, y)) return [x, y];
  return null;
}

test('île de départ : une forme naturelle, d’un seul tenant, avec bois et rochers', () => {
  const e = etatVide();
  e.iles.forEach((ile, n) => {
    assert.equal(nbTerres(ile), ILES[n].surface, `île ${n} : sa surface`);
    // d'un seul tenant : depuis une case, on atteint toutes les autres
    const cles = Object.keys(ile.terre), vus = new Set([cles[0]]), file = [coord(cles[0])];
    while (file.length) for (const [x, y] of voisinsDe(...file.shift())) if (estTerre(ile, x, y) && !vus.has(cle(x, y))) { vus.add(cle(x, y)); file.push([x, y]); }
    assert.equal(vus.size, cles.length, `île ${n} d'un seul tenant`);
    // pas un rectangle plein
    const { x0, y0, x1, y1 } = ile.ext;
    assert.ok((x1 - x0 + 1) * (y1 - y0 + 1) > cles.length, `île ${n} de forme libre`);
  });
  const ile = e.iles[0];
  assert.ok(Object.values(ile.terrain).includes('foret'));
  assert.ok(Object.values(ile.terrain).includes('montagne'));
  assert.equal(estTerre(ile, 0, 0), false);
  const [cx, cy] = caseCote(ile);
  assert.equal(estTerre(ile, cx, cy), false);
  assert.deepEqual(etatVide().iles[0].terre, ile.terre, 'toujours la même île');
});

test('forme organique : pas de lac fermé au milieu', () => {
  let graine = 7;
  const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  for (let essai = 0; essai < 30; essai++) {
    const terre = new Set(formeOrganique(7, 6, 26, alea));
    for (let y = 1; y <= 6; y++) for (let x = 1; x <= 7; x++) {
      if (terre.has(cle(x, y))) continue;
      // chaque case d'eau du rectangle rejoint la mer du bord
      const vus = new Set([cle(x, y)]), file = [[x, y]];
      let mer = false;
      while (file.length && !mer) {
        const [a, b] = file.shift();
        if (a < 1 || b < 1 || a > 7 || b > 6) { mer = true; break; }
        for (const [c, d] of voisinsDe(a, b)) if (!terre.has(cle(c, d)) && !vus.has(cle(c, d))) { vus.add(cle(c, d)); file.push([c, d]); }
      }
      assert.ok(mer, 'aucune eau prisonnière');
    }
  }
});

test('construire : on paie, un chantier démarre, puis le bâtiment est fini', () => {
  const e = etatVide();
  const payer = bourse(10);
  const [x, y] = caseHerbe(e);
  assert.equal(construire(e, 0, x, y, 'champ', payer.reste(), payer, T0).ok, true);
  assert.equal(payer.reste(), 7);
  const c = e.iles[0].cases[cle(x, y)];
  assert.equal(c.niveau, 0);
  assert.equal(beauteIle(e.iles[0]), 0, 'pas de beauté pendant le chantier');
  assert.deepEqual(actualiser(e, T0 + 10_000), []);
  const ev = actualiser(e, T0 + BATIMENTS.champ.duree * MINUTE);
  assert.equal(ev[0].genre, 'construit');
  assert.equal(c.niveau, 1);
  assert.ok(beauteIle(e.iles[0]) > 0);
});

test('il faut aussi des ressources : ce qui manque est indiqué', () => {
  const e = etatVide();
  const payer = bourse(20);
  const [x, y] = caseHerbe(e);
  const r = construire(e, 0, x, y, 'maison', payer.reste(), payer, T0);
  assert.equal(r.ok, false);
  assert.deepEqual(r.manque, { bois: 6 });
  assert.equal(payer.reste(), 20, 'rien n’est payé');
  e.ressources.bois = 6;
  assert.equal(construire(e, 0, x, y, 'maison', payer.reste(), payer, T0).ok, true);
  assert.equal(e.ressources.bois, 0);
  assert.deepEqual(manque(e, 0, { etoiles: 2, pierre: 1 }), { etoiles: 2, pierre: 1 });
});

test('production en temps réel, avec un plafond, même appli fermée', () => {
  const e = etatVide();
  const payer = bourse(10);
  const [x, y] = caseHerbe(e);
  construire(e, 0, x, y, 'champ', 10, payer, T0);
  const fin = T0 + BATIMENTS.champ.duree * MINUTE;
  actualiser(e, fin);
  const ile = e.iles[0];
  const unite = BATIMENTS.champ.prod.minutes * MINUTE;
  assert.equal(stock(ile, x, y, fin + unite * 3.5), 3);
  assert.equal(stock(ile, x, y, fin + unite * 1000), PLAFOND_PAR_NIVEAU, 'plafond atteint, rien ne se perd');
  const r = ramasser(e, 0, x, y, fin + unite * 3.5);
  assert.deepEqual(r, { res: 'ble', n: 3 });
  assert.equal(e.ressources.ble, 3);
  assert.equal(stock(ile, x, y, fin + unite * 4), 1, 'l’unité en cours est conservée');
});

test('la cabane de bûcheron ne coupe du bois que près d’une forêt', () => {
  const e = etatVide();
  const payer = bourse(20);
  const loin = caseHerbe(e, (x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2 && terrainDe(e.iles[0], x + dx, y + dy) === 'foret') return false;
    return true;
  });
  const proche = caseHerbe(e, pres(e, 'foret'));
  assert.ok(proche);
  construire(e, 0, ...proche, 'hameau', 20, payer, T0);
  if (loin) construire(e, 0, ...loin, 'hameau', 20, payer, T0);
  actualiser(e, T0 + 10 * MINUTE);
  assert.equal(produit(e.iles[0], ...proche), true);
  if (loin) assert.equal(produit(e.iles[0], ...loin), false);
  const total = toutRamasser(e, T0 + 30 * MINUTE);
  assert.ok(total.bois > 0);
});

test('améliorer : nouveau chantier, coût du niveau suivant, accélération possible', () => {
  const e = etatVide();
  const payer = bourse(50);
  const [x, y] = caseHerbe(e);
  construire(e, 0, x, y, 'champ', 50, payer, T0);
  actualiser(e, T0 + MINUTE);
  e.ressources.bois = 4;
  assert.equal(ameliorer(e, 0, x, y, payer.reste(), payer, T0 + MINUTE).ok, true);
  assert.equal(e.ressources.bois, 0);
  const c = e.iles[0].cases[cle(x, y)];
  assert.equal(c.niveau, 1, 'continue de produire pendant les travaux');
  assert.ok(prixAcceleration(c, T0 + MINUTE) >= 1);
  assert.equal(accelerer(e, 0, x, y, payer, T0 + MINUTE).ok, true);
  actualiser(e, T0 + MINUTE);
  assert.equal(c.niveau, 2);
});

test('aménager : abattre donne du bois, casser donne de la pierre, planter fait pousser une forêt', () => {
  const e = etatVide();
  const ile = e.iles[0];
  const foret = Object.keys(ile.terrain).find((k) => ile.terrain[k] === 'foret');
  const roche = Object.keys(ile.terrain).find((k) => ile.terrain[k] === 'montagne');
  const payer = bourse(5);
  assert.equal(amenager(e, 0, ...coord(foret), 'abattre', 5, payer, T0).ok, true);
  assert.equal(amenager(e, 0, ...coord(roche), 'casser', 5, payer, T0).ok, true);
  assert.equal(peutAmenager(ile, ...coord(foret), 'abattre'), false, 'déjà en travaux');
  actualiser(e, T0 + 5 * MINUTE);
  assert.equal(terrainDe(ile, ...coord(foret)), 'herbe');
  assert.equal(e.ressources.bois, 4);
  assert.equal(e.ressources.pierre, 4);
  assert.equal(amenager(e, 0, ...coord(foret), 'planter', 5, payer, T0 + 5 * MINUTE).ok, true);
  assert.equal(e.ressources.bois, 3);
  actualiser(e, T0 + 20 * MINUTE);
  assert.equal(terrainDe(ile, ...coord(foret)), 'foret');
});

test('un étang embellit l’île et ses voisins', () => {
  const e = etatVide();
  const payer = bourse(10);
  const [x, y] = caseHerbe(e);
  amenager(e, 0, x, y, 'creuser', 10, payer, T0);
  actualiser(e, T0 + MINUTE);
  assert.equal(terrainDe(e.iles[0], x, y), 'etang');
  assert.ok(beauteIle(e.iles[0]) >= 3);
});

test('décorer : pose immédiate, beauté et bonus de voisinage', () => {
  const e = etatVide();
  const payer = bourse(10);
  const [x, y] = caseHerbe(e);
  const gain = apercu(e.iles[0], x, y, 'fleurs');
  const r = decorer(e, 0, x, y, 'fleurs', 10, payer);
  assert.equal(r.ok, true);
  assert.equal(r.gain, gain);
  assert.equal(pointsCase(e.iles[0], x, y), DECORS.fleurs.beaute);
  assert.equal(estDebloque(e, 'puits'), false, 'le puits demande une île plus belle');
});

test('retirer rend ce qui a été payé', () => {
  const e = etatVide();
  const payer = bourse(20);
  const [x, y] = caseHerbe(e);
  e.ressources.bois = 6;
  construire(e, 0, x, y, 'maison', 20, payer, T0);
  const rendu = retirer(e, 0, x, y);
  assert.deepEqual(rendu, { etoiles: 4, bois: 6 });
  assert.equal(e.ressources.bois, 6);
  assert.equal(e.iles[0].cases[cle(x, y)], undefined);
});

test('agrandir l’île case par case : une case d’eau au bord devient de l’herbe', () => {
  const e = etatVide();
  const ile = e.iles[0];
  const payer = bourse(20);
  const [x, y] = caseCote(ile);
  assert.equal(peutAcheter(ile, x, y), true);
  assert.equal(peutAcheter(ile, ile.ext.x0 - 3, ile.ext.y0 - 3), false, 'pas au large');
  const cout = coutCase(ile);
  assert.deepEqual(cout, { etoiles: 1 + Math.floor(ILES[0].surface / 12), pierre: 2 + Math.floor(ILES[0].surface / 8) });
  assert.equal(acheterCase(e, 0, x, y, 20, payer).raison, 'cout', 'il faut de la pierre');
  e.ressources.pierre = 50;
  assert.equal(acheterCase(e, 0, x, y, 20, payer).ok, true);
  assert.equal(terrainDe(ile, x, y), 'herbe');
  assert.equal(nbTerres(ile), ILES[0].surface + 1);
  assert.equal(payer.reste(), 20 - cout.etoiles);
  assert.equal(e.ressources.pierre, 50 - cout.pierre);
  assert.equal(peutAcheter(ile, x, y), false, 'déjà de la terre');
});

test('l’île grandit jusqu’à 10 × 8 cases au plus, et jamais par-dessus un port', () => {
  const e = etatVide();
  const ile = e.iles[0];
  const [px, py] = caseCote(ile);
  ile.cases[cle(px, py)] = { type: 'port', niveau: 1, chantier: null };
  assert.equal(peutAcheter(ile, px, py), false, 'le port reste sur l’eau');
  e.ressources.pierre = 1e6;
  for (let tour = 0; tour < 200 && casesAchetables(ile).length; tour++) {
    const [x, y] = coord(casesAchetables(ile)[0]);
    assert.equal(acheterCase(e, 0, x, y, 1e6, () => true).ok, true);
  }
  assert.ok(ile.ext.x1 - ile.ext.x0 + 1 <= PORTEE_MAX.x * 2 + 1);
  assert.ok(ile.ext.y1 - ile.ext.y0 + 1 <= PORTEE_MAX.y * 2 + 1);
  assert.ok(nbTerres(ile) > 60, 'on peut beaucoup agrandir');
  assert.equal(ile.cases[cle(px, py)].type, 'port');
});

test('habitants : selon les maisons terminées', () => {
  const e = etatVide();
  const payer = bourse(50);
  e.ressources.bois = 20;
  const [x, y] = caseHerbe(e);
  construire(e, 0, x, y, 'maison', 50, payer, T0);
  assert.equal(habitants(e), 0);
  actualiser(e, T0 + 10 * MINUTE);
  assert.equal(habitants(e), 2);
});

test('les îles suivantes s’ouvrent avec la beauté', () => {
  const e = etatVide();
  assert.equal(ilesOuvertes(e), 1);
  const ile = e.iles[0];
  for (let y = ile.ext.y0; y <= ile.ext.y1; y++) for (let x = ile.ext.x0; x <= ile.ext.x1; x++) {
    if (terrainDe(ile, x, y) === 'herbe') ile.cases[cle(x, y)] = { type: 'maison', niveau: 3, chantier: null };
  }
  assert.ok(beauteTotale(e) >= ILES[1].seuil);
  assert.ok(ilesOuvertes(e) >= 2);
});

test('migration : une sauvegarde de la première version est reprise telle quelle', () => {
  const L = 5 + 2; // la grille de la version 1 : la première île faisait 5 cases de large
  const ancien = { iles: [{ cases: { [L + 2]: { type: 'maison', niveau: 2 }, [1]: { type: 'port', niveau: 1 } } }, { cases: {} }, { cases: {} }, { cases: {} }], active: 0 };
  const e = migrer(ancien, T0);
  assert.equal(e.version, 3);
  assert.deepEqual(e.iles[0].cases[cle(2, 1)].niveau, 2);
  assert.equal(e.iles[0].cases[cle(1, 0)].type, 'port');
  assert.equal(estCote(e.iles[0], 1, 0), true);
  assert.equal(migrer(e, T0), e, 'une sauvegarde déjà en version 3 ne change pas');
});

test('migration : une île rectangulaire déjà construite est gardée, une île vierge prend la forme naturelle', () => {
  const ext = { x0: 1, y0: 1, x1: 5, y1: 4 };
  const ancien = {
    version: 2, active: 0, ressources: { bois: 3, pierre: 0, ble: 0 },
    iles: [
      { ext, terrain: { '1,1': 'foret' }, cases: { '2,2': { type: 'maison', niveau: 1, chantier: null, depuis: T0 } }, travaux: {} },
      { ext: { x0: 1, y0: 1, x1: 6, y1: 4 }, terrain: {}, cases: {}, travaux: {} },
      { ext: { x0: 1, y0: 1, x1: 6, y1: 5 }, terrain: {}, cases: {}, travaux: {} },
      { ext: { x0: 1, y0: 1, x1: 7, y1: 5 }, terrain: {}, cases: {}, travaux: {} },
    ],
  };
  const e = migrer(ancien, T0);
  assert.equal(e.version, 3);
  assert.equal(nbTerres(e.iles[0]), 20, 'les 20 cases du rectangle');
  assert.equal(e.iles[0].cases['2,2'].type, 'maison');
  assert.equal(e.iles[0].terrain['1,1'], 'foret');
  assert.equal(e.ressources.bois, 3);
  assert.equal(nbTerres(e.iles[1]), ILES[1].surface, 'île vierge : nouvelle forme');
});

test('les ports se posent sur l’eau du bord, le reste sur l’herbe', () => {
  const e = etatVide();
  const ile = e.iles[0];
  const [cx, cy] = caseCote(ile);
  assert.equal(peutPoser(ile, cx, cy, 'port'), true);
  assert.equal(peutPoser(ile, cx, cy, 'maison'), false);
  const [x, y] = caseHerbe(e);
  assert.equal(peutPoser(ile, x, y, 'port'), false);
});
