// Relie la progression (carte des niveaux, missions du jour) à la fin de partie commune.
// Importé une seule fois au démarrage de l'appli.
import { definirGestionDefi, ajouterAnalyse } from '../core/partie.js';
import { niveau, enregistrer } from './niveaux.js';
import { signaler } from './missions.js';

definirGestionDefi((r) => enregistrer(niveau(r.defi.numero), r));
ajouterAnalyse((r) => signaler(r));
