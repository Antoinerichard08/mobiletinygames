// IA du Backgammon. Évaluation « à la main » inspirée des programmes classiques (pubeval, gnubg) :
// avance à la course, pions exposés (nombre de lancers adverses qui les frappent), flèches tenues,
// primes, ancres, maison solide, pions sur la barre. Recherche à 1 coup (Moyen) ou 2 coups (Difficile :
// on regarde aussi la meilleure réponse de l'adversaire pour chacun des 21 lancers possibles).
// Aucune dépendance au navigateur.
import { BLANC, toursPossibles, pips, course, distanceSortie, desAJouer, gagnant } from './moteur.js';

export const NOMS_NIVEAUX = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

// Les 21 lancers différents et leur poids (un double sort 1 fois sur 36, les autres 2 fois).
export const LANCERS = (() => {
  const out = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) out.push({ d1: a, d2: b, poids: a === b ? 1 : 2 });
  return out;
})();

// Valeur d'une flèche tenue, selon sa distance de la sortie (1 = flèche la plus proche).
const VALEUR_POINT = [0, 2, 4, 6, 9, 11, 9, 8, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 3, 4, 5, 5, 4, 3, 2];

/** Nombre de lancers (sur 36) qui permettent à l'adversaire de frapper le pion seul en `cible`. */
function lancersQuiFrappent(pos, camp, cible) {
  const adv = -camp;
  const distances = [];
  // depuis la barre, l'adversaire entre puis peut continuer
  if (pos.barre[adv] > 0) distances.push(adv === BLANC ? 24 - cible : cible + 1);
  for (let j = 0; j < 24; j++) {
    if (pos.p[j] * adv <= 0) continue;
    const dist = adv === BLANC ? j - cible : cible - j; // l'adversaire avance vers la cible
    if (dist > 0 && dist <= 24) distances.push(dist);
  }
  if (!distances.length) return 0;
  const bloque = (depart, pas) => {
    // case intermédiaire fermée par le camp attaqué ?
    const i = adv === BLANC ? depart - pas : depart + pas;
    return i >= 0 && i < 24 && pos.p[i] * camp >= 2;
  };
  let total = 0;
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      let touche = false;
      for (const dist of distances) {
        const depart = adv === BLANC ? cible + dist : cible - dist;
        if (dist === a || dist === b) { touche = true; break; }
        if (a !== b && dist === a + b && (!bloque(depart, a) || !bloque(depart, b))) { touche = true; break; }
        if (a === b && dist % a === 0 && dist / a <= 4) {
          let ok = true;
          for (let k = 1; k < dist / a; k++) if (bloque(depart, a * k)) ok = false;
          if (ok) { touche = true; break; }
        }
      }
      if (touche) total++;
    }
  }
  return total;
}

/** Évaluation de la position du point de vue de `camp` (plus c'est grand, mieux c'est pour lui). */
export function evaluer(pos, camp) {
  const g = gagnant(pos);
  if (g) return g === camp ? 10000 : -10000;
  const adv = -camp;
  const pipsMoi = pips(pos, camp), pipsLui = pips(pos, adv);
  if (course(pos)) {
    // simple course : avance au compte, et éviter de gaspiller des pions empilés loin de la sortie
    let gaspillage = 0;
    for (let i = 0; i < 24; i++) {
      if (pos.p[i] * camp > 0) {
        const n = Math.abs(pos.p[i]);
        if (n > 3) gaspillage += (n - 3) * 0.5;
      }
    }
    return (pipsLui - pipsMoi) * 1.2 + (pos.sortis[camp] - pos.sortis[adv]) * 4 - gaspillage;
  }
  let s = (pipsLui - pipsMoi) * 0.5;
  s += (pos.barre[adv] - pos.barre[camp]) * 14;
  s += (pos.sortis[camp] - pos.sortis[adv]) * 3;

  // flèches tenues, primes
  let suite = 0, plusLongue = 0;
  for (let dist = 1; dist <= 24; dist++) {
    const i = camp === BLANC ? dist - 1 : 24 - dist;
    const v = pos.p[i] * camp;
    if (v >= 2) {
      s += VALEUR_POINT[dist];
      if (v > 4) s -= (v - 4) * 1.5; // trop de pions entassés
      suite++;
      plusLongue = Math.max(plusLongue, suite);
    } else suite = 0;
  }
  if (plusLongue >= 3) s += (plusLongue - 2) * 9;

  // pions exposés : risque d'être frappés, plus coûteux s'ils sont avancés et si la maison adverse est solide
  let maisonAdverse = 0;
  for (let dist = 1; dist <= 6; dist++) {
    const i = camp === BLANC ? 24 - dist : dist - 1; // maison de l'adversaire
    if (pos.p[i] * adv >= 2) maisonAdverse++;
  }
  for (let i = 0; i < 24; i++) {
    if (pos.p[i] * camp !== 1) continue;
    const lancers = lancersQuiFrappent(pos, camp, i);
    if (!lancers) continue;
    const perte = 25 - distanceSortie(camp, i) + 8; // les pips perdus si l'on est frappé, plus le tempo
    s -= (lancers / 36) * perte * (1 + maisonAdverse * 0.18) * 0.9;
  }
  return s;
}

const meilleurScore = (pos, camp, des) => {
  let m = -Infinity;
  for (const t of toursPossibles(pos, camp, des)) m = Math.max(m, evaluer(t.pos, camp));
  return m;
};

/**
 * Choisit le tour complet de l'ordinateur.
 * @returns {object[]} la liste des coups simples à jouer, dans l'ordre (vide si aucun coup possible)
 */
export function choisirTour(pos, camp, d1, d2, options = {}) {
  return choisirAvecDes(pos, camp, desAJouer(d1, d2), options);
}

/** Comme choisirTour, avec la liste des dés qui restent à jouer (pour un conseil en cours de tour). */
export function choisirAvecDes(pos, camp, des, { niveau = 'moyen', alea = Math.random } = {}) {
  const tours = toursPossibles(pos, camp, des);
  if (tours.length <= 1) return tours[0]?.coups || [];
  const notes = tours.map((t) => ({ t, s: evaluer(t.pos, camp) })).sort((a, b) => b.s - a.s);
  if (niveau === 'facile') {
    if (alea() < 0.45) return tours[Math.floor(alea() * tours.length)].coups;
    return notes[Math.floor(alea() * Math.min(3, notes.length))].t.coups;
  }
  if (niveau !== 'difficile') return notes[0].t.coups;
  // Difficile : pour les meilleurs candidats, on regarde la meilleure réponse adverse sur chaque lancer.
  let choix = notes[0].t, meilleur = -Infinity;
  for (const { t } of notes.slice(0, 5)) {
    let somme = 0;
    for (const l of LANCERS) somme += l.poids * -meilleurScore(t.pos, -camp, desAJouer(l.d1, l.d2));
    if (somme / 36 > meilleur) { meilleur = somme / 36; choix = t; }
  }
  return choix.coups;
}
