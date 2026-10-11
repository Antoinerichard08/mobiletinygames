// Relie la progression (carte des niveaux, missions du jour) à la fin de partie commune.
// Importé une seule fois au démarrage de l'appli.
import { definirGestionDefi, ajouterAnalyse } from '../core/partie.js';
import { niveau, enregistrer } from './niveaux.js';
import { signaler } from './missions.js';
import { analyseAtelier } from '../ile/atelier.js';

definirGestionDefi((r) => enregistrer(niveau(r.defi.numero), r));
ajouterAnalyse((r) => signaler(r));
// après les missions : chaque partie gagnée et chaque mission font avancer l'Atelier du puzzle
ajouterAnalyse((r, bonus) => analyseAtelier(r, bonus));
