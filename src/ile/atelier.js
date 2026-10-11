// L'Atelier du puzzle vu depuis le reste de l'appli : une partie gagnée ou une mission accomplie
// font avancer son temps de travail, même quand l'écran de l'île n'est pas ouvert.
// Sans dépendance au navigateur (testé avec Node).
import { lire, ecrire } from '../core/stockage.js';
import { migrer, avancerAtelier, AVANCE_PARTIE, AVANCE_PARTIE_DEFAUT, AVANCE_MISSION } from './regles.js';

const CLE = 'ile';

/** Minutes de travail gagnées pour une partie : selon la difficulté si elle est gagnée, plus une heure par mission. */
export function minutesGagnees(r, missions = 0) {
  const partie = r.gagne ? AVANCE_PARTIE[r.difficulte] ?? AVANCE_PARTIE_DEFAUT : 0;
  return partie + missions * AVANCE_MISSION;
}

/** Fait avancer l'Atelier de la sauvegarde. Renvoie les minutes vraiment gagnées (0 s'il n'y a pas encore d'Atelier). */
export function accelererAtelier(minutes, t = Date.now()) {
  if (!(minutes > 0)) return 0;
  const sauvegarde = lire(CLE, null);
  if (!sauvegarde) return 0;
  const e = migrer(sauvegarde, t);
  const gagne = avancerAtelier(e, minutes, t);
  if (gagne) ecrire(CLE, e);
  return gagne;
}

/** « 45 min », « 1 h », « 1 h 45 ». */
export function texteDuree(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** La petite ligne de l'écran de fin de partie (ou rien). */
export function analyseAtelier(r, bonus = [], t = Date.now()) {
  const missions = bonus.filter((b) => b.genre === 'mission').length;
  const gagne = accelererAtelier(minutesGagnees(r, missions), t);
  return gagne ? [{ texte: `L’Atelier du puzzle a avancé de ${texteDuree(gagne)} : vos pièces arrivent plus vite`, etoiles: 0, genre: 'atelier' }] : [];
}
