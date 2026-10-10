// Moteur du Backgammon : règles complètes (sans videau). Aucune dépendance au navigateur.
//
// Position : { p: [24 nombres], barre: { 1: n, '-1': n }, sortis: { 1: n, '-1': n } }
//   p[i] > 0 : pions BLANCS (le joueur), p[i] < 0 : pions NOIRS (l'ordinateur, affichés en rouge).
//   Pour les blancs, la case i est la « flèche » i + 1 : ils avancent de 24 vers 1 (indices décroissants),
//   leur jan intérieur (maison) est 0..5 et ils sortent en dessous de 0.
//   Les noirs avancent dans l'autre sens : maison 18..23, sortie au-delà de 23.
// Coup simple : { from: indice | 'barre', to: indice | 'sortie', de: valeur du dé, frappe: bool }
//
// Règles : entrer d'abord les pions de la barre ; une flèche tenue par 2 pions adverses ou plus est fermée ;
// un pion seul adverse (« blot ») est frappé et part sur la barre ; on doit jouer les deux dés si possible,
// sinon le plus fort ; un double se joue quatre fois ; on ne sort que lorsque tous ses pions sont dans sa maison,
// et un dé plus fort que nécessaire sort le pion le plus éloigné s'il n'y en a pas au-dessus.

export const BLANC = 1;
export const NOIR = -1;

export function positionInitiale() {
  const p = new Array(24).fill(0);
  p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5; // blancs
  p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5; // noirs
  return { p, barre: { 1: 0, '-1': 0 }, sortis: { 1: 0, '-1': 0 } };
}

export const cloner = (pos) => ({ p: pos.p.slice(), barre: { ...pos.barre }, sortis: { ...pos.sortis } });
export const cle = (pos) => `${pos.p.join(',')}|${pos.barre[1]},${pos.barre[-1]}|${pos.sortis[1]},${pos.sortis[-1]}`;

const mien = (v, camp) => v * camp > 0;
const nb = (v) => Math.abs(v);

/** Indice d'arrivée en entrant depuis la barre avec le dé d. */
export const entree = (camp, d) => (camp === BLANC ? 24 - d : d - 1);
/** Distance qu'il reste à parcourir pour sortir depuis l'indice i. */
export const distanceSortie = (camp, i) => (camp === BLANC ? i + 1 : 24 - i);

function toutALaMaison(pos, camp) {
  if (pos.barre[camp]) return false;
  for (let i = 0; i < 24; i++) {
    if (mien(pos.p[i], camp) && distanceSortie(camp, i) > 6) return false;
  }
  return true;
}

function ouvert(pos, camp, i) {
  const v = pos.p[i];
  return !(v * camp < 0 && nb(v) >= 2);
}

/** Coups simples possibles avec un dé (sans tenir compte de l'obligation d'utiliser les deux dés). */
export function coupsAvecDe(pos, camp, d) {
  const out = [];
  if (pos.barre[camp] > 0) {
    const to = entree(camp, d);
    if (ouvert(pos, camp, to)) out.push({ from: 'barre', to, de: d, frappe: pos.p[to] * camp === -1 });
    return out; // tant qu'un pion est sur la barre, on ne peut rien jouer d'autre
  }
  const maison = toutALaMaison(pos, camp);
  for (let i = 0; i < 24; i++) {
    if (!mien(pos.p[i], camp)) continue;
    const dest = camp === BLANC ? i - d : i + d;
    if (dest >= 0 && dest <= 23) {
      if (ouvert(pos, camp, dest)) out.push({ from: i, to: dest, de: d, frappe: pos.p[dest] * camp === -1 });
    } else if (maison) {
      const dist = distanceSortie(camp, i);
      if (dist === d) out.push({ from: i, to: 'sortie', de: d, frappe: false });
      else if (dist < d) {
        // dé trop fort : permis seulement s'il n'y a aucun pion plus loin de la sortie
        let plusLoin = false;
        for (let j = 0; j < 24; j++) if (mien(pos.p[j], camp) && distanceSortie(camp, j) > dist) plusLoin = true;
        if (!plusLoin) out.push({ from: i, to: 'sortie', de: d, frappe: false });
      }
    }
  }
  return out;
}

/** Applique un coup simple (renvoie une nouvelle position). */
export function jouerSimple(pos, camp, m) {
  const n = cloner(pos);
  if (m.from === 'barre') n.barre[camp]--;
  else n.p[m.from] -= camp;
  if (m.to === 'sortie') n.sortis[camp]++;
  else {
    if (n.p[m.to] * camp === -1) {
      n.p[m.to] = 0;
      n.barre[-camp]++;
    }
    n.p[m.to] += camp;
  }
  return n;
}

/** Les dés à jouer : un double se joue quatre fois. */
export const desAJouer = (d1, d2) => (d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]);

const sansUn = (des, d) => {
  const k = des.indexOf(d);
  return des.slice(0, k).concat(des.slice(k + 1));
};
const valeursDistinctes = (des) => [...new Set(des)];

/** Nombre maximal de dés que l'on peut utiliser depuis cette position. */
export function maxDes(pos, camp, des, memo = new Map()) {
  if (!des.length) return 0;
  const k = cle(pos) + '#' + des.join('');
  if (memo.has(k)) return memo.get(k);
  let best = 0;
  for (const d of valeursDistinctes(des)) {
    for (const m of coupsAvecDe(pos, camp, d)) {
      best = Math.max(best, 1 + maxDes(jouerSimple(pos, camp, m), camp, sansUn(des, d), memo));
      if (best === des.length) break;
    }
    if (best === des.length) break;
  }
  memo.set(k, best);
  return best;
}

/**
 * Coups simples autorisés maintenant, en respectant l'obligation d'utiliser le plus de dés possible
 * (et le dé le plus fort quand un seul des deux peut être joué).
 * @param {number[]} des  dés qui restent à jouer
 */
export function coupsAutorises(pos, camp, des) {
  if (!des.length) return [];
  const memo = new Map();
  const max = maxDes(pos, camp, des, memo);
  if (max === 0) return [];
  let out = [];
  for (const d of valeursDistinctes(des)) {
    for (const m of coupsAvecDe(pos, camp, d)) {
      if (1 + maxDes(jouerSimple(pos, camp, m), camp, sansUn(des, d), memo) === max) out.push(m);
    }
  }
  // un seul dé jouable sur deux différents : il faut jouer le plus fort si on le peut
  if (max === 1 && des.length === 2 && des[0] !== des[1]) {
    const fort = Math.max(...des);
    if (out.some((m) => m.de === fort)) out = out.filter((m) => m.de === fort);
  }
  return out;
}

export const retirerDe = sansUn;

/** Tous les tours complets possibles (positions finales distinctes), pour l'ordinateur. */
export function toursPossibles(pos, camp, des) {
  const resultats = new Map();
  (function explorer(p, restants, coups) {
    const autorises = coupsAutorises(p, camp, restants);
    if (!autorises.length) {
      const k = cle(p);
      if (!resultats.has(k)) resultats.set(k, { coups, pos: p });
      return;
    }
    // éviter d'explorer deux fois le même ensemble de coups dans un ordre différent
    const vus = new Set();
    for (const m of autorises) {
      const suivant = jouerSimple(p, camp, m);
      const k = cle(suivant) + '#' + restants.length;
      if (vus.has(k)) continue;
      vus.add(k);
      explorer(suivant, sansUn(restants, m.de), coups.concat(m));
    }
  })(pos, des, []);
  return [...resultats.values()];
}

export const gagnant = (pos) => (pos.sortis[BLANC] === 15 ? BLANC : pos.sortis[NOIR] === 15 ? NOIR : 0);

/** Points gagnés : 1 simple, 2 « gammon » (l'adversaire n'a sorti aucun pion), 3 « backgammon ». */
export function pointsVictoire(pos, camp) {
  const adv = -camp;
  if (pos.sortis[adv] > 0) return 1;
  if (pos.barre[adv] > 0) return 3;
  for (let i = 0; i < 24; i++) {
    // un pion adverse encore dans la maison du gagnant
    if (pos.p[i] * adv > 0 && distanceSortie(camp, i) <= 6) return 3;
  }
  return 2;
}

/** Compte de course : total des cases à parcourir pour sortir tous ses pions. */
export function pips(pos, camp) {
  let s = pos.barre[camp] * 25;
  for (let i = 0; i < 24; i++) if (pos.p[i] * camp > 0) s += nb(pos.p[i]) * distanceSortie(camp, i);
  return s;
}

/** Plus aucun contact entre les deux camps : c'est une simple course. */
export function course(pos) {
  if (pos.barre[1] || pos.barre[-1]) return false;
  let dernierBlanc = -1, premierNoir = 24;
  for (let i = 0; i < 24; i++) {
    if (pos.p[i] > 0) dernierBlanc = i;
    if (pos.p[i] < 0 && i < premierNoir) premierNoir = i;
  }
  // les blancs vont vers 0, les noirs vers 23 : contact si un noir est « derrière » un blanc
  return premierNoir > dernierBlanc;
}

export const compterPions = (pos, camp) =>
  pos.barre[camp] + pos.sortis[camp] + pos.p.reduce((s, v) => s + (v * camp > 0 ? nb(v) : 0), 0);
