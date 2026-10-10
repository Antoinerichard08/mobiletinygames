// Missions du jour : 3 petites missions renouvelées chaque jour, et un coffre quand les trois sont faites.
// Sans dépendance au navigateur (testé avec Node).
import { lire, ecrire } from '../core/stockage.js';
import { aleaGraine } from '../core/outils.js';
import { jourDe } from './niveaux.js';

const CLE = 'missions';
export const BONUS_COFFRE = 5;

// Chaque modèle : texte, objectif (nombre de fois), récompense, et ce qui compte pour avancer.
export const MODELES = [
  { id: 'gagner-sudoku', texte: 'Terminer une grille de Sudoku', but: 1, etoiles: 2, compte: (r) => r.jeu === 'sudoku' && r.gagne },
  { id: 'gagner-solitaire', texte: 'Gagner une partie de Solitaire', but: 1, etoiles: 2, compte: (r) => r.jeu === 'solitaire' && r.gagne },
  { id: 'gagner-dames', texte: 'Battre l’ordinateur aux Dames', but: 1, etoiles: 2, compte: (r) => r.jeu === 'dames' && r.gagne },
  { id: 'gagner-backgammon', texte: 'Gagner une manche de Backgammon', but: 1, etoiles: 2, compte: (r) => r.jeu === 'backgammon' && r.gagne },
  { id: 'jouer-2', texte: 'Finir 2 parties, de n’importe quel jeu', but: 2, etoiles: 2, compte: () => true },
  { id: 'gagner-3', texte: 'Gagner 3 parties', but: 3, etoiles: 3, compte: (r) => r.gagne },
  { id: 'niveau', texte: 'Réussir un niveau de la carte', but: 1, etoiles: 2, compte: (r) => Boolean(r.defi) && r.gagne },
  { id: 'sans-indice', texte: 'Gagner une partie sans indice', but: 1, etoiles: 2, compte: (r) => r.gagne && (r.details?.indices ?? 0) === 0 },
  { id: 'moyen', texte: 'Gagner une partie en niveau Moyen ou Difficile', but: 1, etoiles: 3, compte: (r) => r.gagne && r.difficulte !== 'facile' },
  { id: 'etoiles-5', texte: 'Gagner 5 étoiles', but: 5, etoiles: 2, compte: (r) => r.etoiles || 0 },
];

/** Les 3 missions d'un jour donné (toujours les mêmes pour une date : tirage avec une graine). */
export function missionsDuJour(jour) {
  const graine = [...jour].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const alea = aleaGraine(graine);
  const tas = MODELES.slice();
  const choix = [];
  while (choix.length < 3) choix.push(tas.splice(Math.floor(alea() * tas.length), 1)[0]);
  return choix;
}

export function etat(aujourdhui = jourDe()) {
  let e = lire(CLE, null);
  if (!e || e.jour !== aujourdhui) {
    e = { jour: aujourdhui, progres: {}, faites: {}, coffre: false };
    ecrire(CLE, e);
  }
  return e;
}

/** Les missions du jour avec leur avancement. */
export function liste(aujourdhui = jourDe()) {
  const e = etat(aujourdhui);
  return missionsDuJour(aujourdhui).map((m) => ({
    ...m, progres: Math.min(m.but, e.progres[m.id] || 0), faite: Boolean(e.faites[m.id]),
  }));
}

export const coffreOuvert = (aujourdhui = jourDe()) => etat(aujourdhui).coffre;

/**
 * À appeler à la fin de chaque partie. Renvoie les récompenses débloquées : [{ texte, etoiles }].
 * @param {object} r résultat de partie (jeu, gagne, difficulte, defi, details, etoiles)
 */
export function signaler(r, aujourdhui = jourDe()) {
  const e = etat(aujourdhui);
  const recompenses = [];
  for (const m of missionsDuJour(aujourdhui)) {
    if (e.faites[m.id]) continue;
    const plus = m.compte(r);
    if (!plus) continue;
    e.progres[m.id] = (e.progres[m.id] || 0) + (plus === true ? 1 : plus);
    if (e.progres[m.id] >= m.but) {
      e.faites[m.id] = true;
      recompenses.push({ texte: `Mission accomplie : ${m.texte.toLowerCase()}`, etoiles: m.etoiles });
    }
  }
  const toutes = missionsDuJour(aujourdhui).every((m) => e.faites[m.id]);
  if (toutes && !e.coffre) {
    e.coffre = true;
    recompenses.push({ texte: 'Les 3 missions du jour sont faites : le coffre s’ouvre !', etoiles: BONUS_COFFRE });
  }
  ecrire(CLE, e);
  return recompenses;
}
