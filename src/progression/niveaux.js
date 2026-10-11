// Mode Aventure : la carte des niveaux (façon « carte saga »). Sans dépendance au navigateur (testé avec Node).
//
// Les niveaux sont fabriqués à la demande : 8 chapitres de 12 niveaux, puis on continue sans fin.
// Chaque niveau : un jeu, une difficulté, un objectif ; 1 étoile pour la victoire, +1 par objectif bonus réussi.
// Rythme : quelques NOUVEAUX niveaux par jour (« jetons ») ; les niveaux déjà gagnés se rejouent à volonté.
import { lire, ecrire } from '../core/stockage.js';
import { modeDev } from '../core/config.js';
import { ajouterPieces } from '../core/pieces.js';

export const PAR_CHAPITRE = 12;
export const JETONS_PAR_JOUR = 3;
/** Pièces de puzzle offertes tous les 10 niveaux de la carte (la première fois qu'on les réussit). */
export const LOT_PIECES = 4;
export const JETONS_MAX = 6;
export const JETONS_PREMIER_JOUR = 5;

export const CHAPITRES = [
  { nom: 'Le Jardin', teinte: 'jardin' },
  { nom: 'La Rivière', teinte: 'riviere' },
  { nom: 'Le Village', teinte: 'village' },
  { nom: 'La Forêt', teinte: 'foret' },
  { nom: 'Les Collines', teinte: 'collines' },
  { nom: 'Le Port', teinte: 'port' },
  { nom: 'La Montagne', teinte: 'montagne' },
  { nom: 'Le Château', teinte: 'chateau' },
];

// Le premier chapitre garde les 4 jeux d'origine (les niveaux déjà joués ne changent pas) ;
// les bulles rejoignent le cycle à partir du chapitre 2.
const ORDRE_JEUX = ['sudoku', 'solitaire', 'dames', 'backgammon'];
const ORDRE_JEUX_2 = ['sudoku', 'bulles', 'solitaire', 'dames', 'backgammon'];
const NOMS_JEUX = { sudoku: 'Sudoku', solitaire: 'Solitaire', dames: 'Dames', backgammon: 'Backgammon', bulles: 'Bulles' };
const NOMS_DIFF = { facile: 'facile', moyen: 'moyen', difficile: 'difficile' };

function difficulte(c, k) {
  if (k === PAR_CHAPITRE - 1) return c === 0 ? 'moyen' : 'difficile'; // grand défi de fin de chapitre
  if (c === 0) return 'facile';
  if (c === 1) return k < 6 ? 'facile' : 'moyen';
  if (c === 2) return 'moyen';
  if (c === 3) return k % 3 === 2 ? 'difficile' : 'moyen';
  return k % 3 === 0 ? 'moyen' : 'difficile';
}

/** Définition du niveau n (n ≥ 1). */
export function niveau(n) {
  const c = Math.floor((n - 1) / PAR_CHAPITRE), k = (n - 1) % PAR_CHAPITRE;
  const chapitre = CHAPITRES[c % CHAPITRES.length];
  const ordre = c === 0 ? ORDRE_JEUX : ORDRE_JEUX_2;
  const jeu = ordre[(k + c) % ordre.length];
  const diff = difficulte(c, k);
  const def = { numero: n, id: `n${n}`, chapitre: c, rang: k, nomChapitre: chapitre.nom, teinte: chapitre.teinte, jeu, niveau: diff };
  def.grandDefi = k === PAR_CHAPITRE - 1;
  def.cadeau = k === 5 ? 'cadeau' : def.grandDefi ? 'coffre' : null;
  def.pieces = n % 10 === 0 ? LOT_PIECES : 0; // un lot de pièces de puzzle tous les 10 niveaux
  let objectif, bonus;
  if (jeu === 'sudoku') {
    objectif = `Sudoku ${NOMS_DIFF[diff]} : terminer la grille`;
    bonus = [
      { texte: 'Sans indice', reussi: (d) => d.indices === 0 },
      { texte: 'Sans aucune erreur', reussi: (d) => d.erreurs === 0 },
    ];
  } else if (jeu === 'solitaire') {
    const seuil = diff === 'facile' ? 170 : 150;
    objectif = `Solitaire ${NOMS_DIFF[diff]} : gagner la partie`;
    bonus = [
      { texte: `En ${seuil} coups ou moins`, reussi: (d) => d.coups <= seuil },
      { texte: 'Sans indice', reussi: (d) => d.indices === 0 },
    ];
  } else if (jeu === 'bulles') {
    objectif = `Bulles (${NOMS_DIFF[diff]}) : réussir le niveau`;
    bonus = [
      { texte: 'Sans indice', reussi: (d) => d.indices === 0 },
      { texte: 'Avec 3 étoiles de réussite', reussi: (d) => d.etoiles === 3 },
    ];
  } else if (jeu === 'dames') {
    def.taille = c >= 3 && k % 2 === 1 ? 10 : 8;
    const garder = def.taille === 10 ? 6 : 4;
    objectif = `Dames ${def.taille} × ${def.taille} (${NOMS_DIFF[diff]}) : battre l’ordinateur`;
    bonus = [
      { texte: `Garder au moins ${garder} pions`, reussi: (d) => d.pionsRestants >= garder },
      { texte: 'Sans annuler de coup', reussi: (d) => d.annulations === 0 },
    ];
  } else {
    def.longueur = def.grandDefi && c >= 2 ? 3 : 1;
    objectif = def.longueur > 1
      ? `Backgammon (${NOMS_DIFF[diff]}) : gagner un match en ${def.longueur} points`
      : `Backgammon (${NOMS_DIFF[diff]}) : gagner une manche`;
    bonus = [
      { texte: 'Sans indice', reussi: (d) => d.indices === 0 },
      { texte: 'Sans annuler de coup', reussi: (d) => d.annulations === 0 },
    ];
  }
  def.objectif = objectif;
  def.nomJeu = NOMS_JEUX[jeu];
  def.bonus = bonus;
  return def;
}

/** Étoiles obtenues (0 à 3) pour un résultat de partie sur ce niveau. */
export function etoilesObtenues(def, { gagne, details = {} }) {
  if (!gagne) return 0;
  return 1 + def.bonus.filter((b) => b.reussi(details)).length;
}

// ---------- Progression sauvegardée ----------

const CLE = 'progression';

export function jourDe(date = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function etat(aujourdhui = jourDe()) {
  const e = lire(CLE, null) || { etoiles: {}, jetons: JETONS_PREMIER_JOUR, jour: aujourdhui, derniere: null };
  if (e.jour !== aujourdhui) {
    // un nouveau jour : de nouveaux niveaux à découvrir (on peut en garder un peu d'avance)
    e.jetons = Math.min(JETONS_MAX, Math.max(e.jetons, 0) + JETONS_PAR_JOUR);
    e.jour = aujourdhui;
  }
  ecrire(CLE, e);
  return e;
}

const sauver = (e) => ecrire(CLE, e);

/** Le prochain niveau jamais gagné. */
export function niveauCourant(e = etat()) {
  let n = 1;
  while ((e.etoiles[n] || 0) > 0) n++;
  return n;
}

/** 'gagne' (déjà réussi), 'ouvert' (jouable maintenant), 'demain' (pas de nouveau niveau aujourd'hui), 'verrouille'. */
export function statut(n, e = etat()) {
  if ((e.etoiles[n] || 0) > 0) return 'gagne';
  if (modeDev()) return 'ouvert'; // mode développeur : tout est ouvert
  const courant = niveauCourant(e);
  if (n > courant) return 'verrouille';
  return e.jetons > 0 ? 'ouvert' : 'demain';
}

/**
 * Enregistre le résultat d'une partie jouée sur le niveau `def`.
 * @returns {{ etoilesNiveau, etoilesGagnees, nouveau, cadeau, titre, texte }}
 *   etoilesGagnees : étoiles ajoutées à la tirelire (amélioration du record + cadeaux + encouragement)
 */
export function enregistrer(def, resultat, aujourdhui = jourDe()) {
  const e = etat(aujourdhui);
  const avant = e.etoiles[def.numero] || 0;
  const obtenues = etoilesObtenues(def, resultat);
  const nouveau = avant === 0 && obtenues > 0;
  let gain = Math.max(0, obtenues - avant);
  let cadeau = 0;
  if (nouveau) {
    e.jetons = Math.max(0, e.jetons - 1);
    if (def.cadeau === 'cadeau') cadeau = 3;
    if (def.cadeau === 'coffre') cadeau = 10;
    gain += cadeau;
    if (def.pieces) ajouterPieces(def.pieces, 'aventure');
  }
  if (!resultat.gagne) gain = 1; // une étoile d'encouragement quand on va au bout
  if (obtenues > avant) e.etoiles[def.numero] = obtenues;
  e.derniere = nouveau || obtenues > avant ? { numero: def.numero, avant, apres: obtenues, nouveau } : null;
  sauver(e);
  let titre, texte;
  if (!resultat.gagne) {
    titre = 'Pas cette fois';
    texte = 'Ce n’est que partie remise : réessayez ce niveau quand vous voulez.';
  } else {
    titre = obtenues === 3 ? 'Parfait !' : 'Niveau réussi !';
    const manquants = def.bonus.filter((b) => !b.reussi(resultat.details || {})).map((b) => b.texte.toLowerCase());
    texte = obtenues === 3
      ? 'Les trois étoiles ! Bravo.'
      : `Pour une étoile de plus : ${manquants.join(', ')}.`;
    if (cadeau) texte += ` Et un ${def.cadeau === 'coffre' ? 'coffre' : 'cadeau'} : +${cadeau} ★ !`;
    if (nouveau && def.pieces) texte += ` Et un lot de ${def.pieces} pièces de puzzle !`;
  }
  return { etoilesNiveau: obtenues, etoilesGagnees: gain, nouveau, cadeau, pieces: nouveau ? def.pieces : 0, titre, texte };
}

/** Pour l'animation de la carte : la dernière progression, une seule fois. */
export function prendreDerniere() {
  const e = etat();
  const d = e.derniere;
  if (d) {
    e.derniere = null;
    sauver(e);
  }
  return d;
}

export const totalEtoilesCarte = (e = etat()) => Object.values(e.etoiles).reduce((a, b) => a + b, 0);
