// Moteur du Solitaire (Klondike, une carte à la fois, pioche illimitée).
// Aucune dépendance au navigateur : testable avec Node (tests/solitaire.test.js).
//
// Une carte : { s: couleur 0..3 (♠ ♥ ♦ ♣), r: rang 1..13 (As..Roi), up: visible ? }
// L'état : { stock, waste, found: [4 piles], tab: [7 colonnes], moves, tirage: 1 ou 3 cartes à la fois }
// Une origine : { loc: 'waste' | 'found' | 'tab', i: numéro de pile, k: position dans la colonne }

import { melanger } from '../../core/outils.js';

export const SYMBOLES = ['♠', '♥', '♦', '♣'];
export const RANGS = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
export const NOMS_RANGS = [null, 'As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi'];
export const NOMS_COULEURS = ['pique', 'cœur', 'carreau', 'trèfle'];

export const estRouge = (carte) => carte.s === 1 || carte.s === 2;
export const nomCarte = (carte) => `${NOMS_RANGS[carte.r]} de ${NOMS_COULEURS[carte.s]}`;
/** « l’As de cœur », « la Dame de pique », « le 7 de trèfle » */
export const nomCarteAvecArticle = (carte) => (carte.r === 1 ? 'l’' : carte.r === 12 ? 'la ' : 'le ') + nomCarte(carte);

export function nouvellePartie(alea = Math.random, { tirage = 1 } = {}) {
  const paquet = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) paquet.push({ s, r, up: false });
  melanger(paquet, alea);
  const tab = [];
  for (let i = 0; i < 7; i++) {
    const col = paquet.splice(0, i + 1);
    col[col.length - 1].up = true;
    tab.push(col);
  }
  return { stock: paquet, waste: [], found: [[], [], [], []], tab, moves: 0, tirage };
}

/**
 * Niveaux du Solitaire : Facile = 1 carte et donne gagnable ; Moyen = 3 cartes et donne gagnable ;
 * Difficile = 3 cartes, donne au hasard.
 */
export const NIVEAUX = {
  facile: { tirage: 1, gagnable: true },
  moyen: { tirage: 3, gagnable: true },
  difficile: { tirage: 3, gagnable: false },
};

export const cloner = (etat) => JSON.parse(JSON.stringify(etat));

/** Les cartes qui partent si l'on prend l'origine o (null si ce n'est pas possible). */
export function pile(etat, o) {
  if (o.loc === 'waste') return etat.waste.length ? [etat.waste[etat.waste.length - 1]] : null;
  if (o.loc === 'found') {
    const p = etat.found[o.i];
    return p.length ? [p[p.length - 1]] : null;
  }
  const col = etat.tab[o.i];
  return col && col[o.k] && col[o.k].up ? col.slice(o.k) : null;
}

/** La carte peut-elle aller sur la colonne j ? (Roi sur colonne vide, sinon rang -1 et couleur alternée) */
export function peutAllerColonne(etat, carte, j) {
  const col = etat.tab[j];
  if (!col.length) return carte.r === 13;
  const dessus = col[col.length - 1];
  return dessus.up && estRouge(dessus) !== estRouge(carte) && dessus.r === carte.r + 1;
}

export function peutAllerFondation(etat, carte, f) {
  const p = etat.found[f];
  if (!p.length) return carte.r === 1;
  const dessus = p[p.length - 1];
  return dessus.s === carte.s && carte.r === dessus.r + 1;
}

/** Numéro de la fondation qui accepte la carte, ou -1. */
export function fondationPour(etat, carte) {
  for (let f = 0; f < 4; f++) if (peutAllerFondation(etat, carte, f)) return f;
  return -1;
}

/** Vérifie qu'un déplacement est permis, sans le faire. */
export function estPermis(etat, o, dest) {
  const cartes = pile(etat, o);
  if (!cartes) return false;
  if (dest.loc === 'tab') {
    if (o.loc === 'tab' && o.i === dest.i) return false;
    return peutAllerColonne(etat, cartes[0], dest.i);
  }
  if (dest.loc === 'found') {
    if (cartes.length !== 1 || (o.loc === 'found' && o.i === dest.i)) return false;
    return peutAllerFondation(etat, cartes[0], dest.i);
  }
  return false;
}

// Déplacement sans vérification (à appeler après estPermis) ; retourne la carte cachée découverte.
function bouger(etat, o, dest) {
  let cartes;
  if (o.loc === 'waste') cartes = [etat.waste.pop()];
  else if (o.loc === 'found') cartes = [etat.found[o.i].pop()];
  else cartes = etat.tab[o.i].splice(o.k);
  if (dest.loc === 'tab') etat.tab[dest.i].push(...cartes);
  else etat.found[dest.i].push(cartes[0]);
  if (o.loc === 'tab') {
    const col = etat.tab[o.i];
    if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true;
  }
  etat.moves++;
}

/** Déplace si c'est permis. Renvoie true si le déplacement a eu lieu. */
export function deplacer(etat, o, dest) {
  if (!estPermis(etat, o, dest)) return false;
  bouger(etat, o, dest);
  return true;
}

/** Retourne une carte de la pioche, ou remet la défausse dans la pioche si elle est vide. */
export function piocher(etat) {
  if (etat.stock.length) {
    const n = Math.min(etat.tirage || 1, etat.stock.length);
    for (let i = 0; i < n; i++) {
      const c = etat.stock.pop();
      c.up = true;
      etat.waste.push(c);
    }
    etat.moves++;
    return 'carte';
  }
  if (etat.waste.length) {
    etat.stock = etat.waste.reverse().map((c) => ({ ...c, up: false }));
    etat.waste = [];
    etat.moves++;
    return 'retour';
  }
  return 'vide';
}

/**
 * Meilleure destination automatique pour l'origine o (double-touche) :
 * d'abord une fondation, sinon une colonne (de préférence non vide).
 */
export function destinationAuto(etat, o) {
  const cartes = pile(etat, o);
  if (!cartes) return null;
  if (cartes.length === 1 && o.loc !== 'found') {
    const f = fondationPour(etat, cartes[0]);
    if (f >= 0) return { loc: 'found', i: f };
  }
  let vide = null;
  for (let j = 0; j < 7; j++) {
    if (!estPermis(etat, o, { loc: 'tab', i: j })) continue;
    if (etat.tab[j].length) return { loc: 'tab', i: j };
    // un Roi déjà en haut d'une colonne ne gagne rien à changer de colonne vide
    if (vide === null && !(o.loc === 'tab' && o.k === 0)) vide = { loc: 'tab', i: j };
  }
  return vide;
}

/** Monte sur les fondations tout ce qui peut y aller. Renvoie le nombre de cartes montées. */
export function monterCartes(etat) {
  let n = 0;
  for (let encore = true; encore; ) {
    encore = false;
    const origines = [];
    if (etat.waste.length) origines.push({ loc: 'waste', i: 0, k: 0 });
    for (let i = 0; i < 7; i++) if (etat.tab[i].length) origines.push({ loc: 'tab', i, k: etat.tab[i].length - 1 });
    for (const o of origines) {
      const f = fondationPour(etat, pile(etat, o)[0]);
      if (f >= 0) {
        bouger(etat, o, { loc: 'found', i: f });
        n++;
        encore = true;
        break;
      }
    }
  }
  return n;
}

export const estGagne = (etat) => etat.found.every((p) => p.length === 13);

/**
 * Un coup utile à proposer : { o, dest } ou { pioche: true }, ou null si rien n'est possible.
 * Ordre : monter sur une fondation, découvrir une carte cachée, poser la carte de la défausse, piocher.
 */
export function indice(etat) {
  const origines = [];
  if (etat.waste.length) origines.push({ loc: 'waste', i: 0, k: 0 });
  for (let i = 0; i < 7; i++) if (etat.tab[i].length) origines.push({ loc: 'tab', i, k: etat.tab[i].length - 1 });
  for (const o of origines) {
    const f = fondationPour(etat, pile(etat, o)[0]);
    if (f >= 0) return { o, dest: { loc: 'found', i: f } };
  }
  // déplacer toute la partie visible d'une colonne pour retourner la carte cachée dessous
  for (let i = 0; i < 7; i++) {
    const col = etat.tab[i];
    const k = col.findIndex((c) => c.up);
    if (k <= 0) continue;
    for (let j = 0; j < 7; j++) {
      if (j !== i && peutAllerColonne(etat, col[k], j)) return { o: { loc: 'tab', i, k }, dest: { loc: 'tab', i: j } };
    }
  }
  if (etat.waste.length) {
    const o = { loc: 'waste', i: 0, k: 0 };
    for (let j = 0; j < 7; j++) if (estPermis(etat, o, { loc: 'tab', i: j })) return { o, dest: { loc: 'tab', i: j } };
  }
  if (etat.stock.length || etat.waste.length) return { pioche: true };
  return null;
}

/** Toutes les cartes sont visibles et la pioche est vide : on peut tout ranger automatiquement. */
export const peutFinirSeul = (etat) =>
  !etat.stock.length && !etat.waste.length && etat.tab.every((col) => col.every((c) => c.up));
