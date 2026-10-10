// Registre central des jeux. L'écran d'accueil est généré à partir de cette liste.
// Pour ajouter un jeu : créer src/games/<jeu>/index.js puis l'importer ici (voir README).
//
// Chaque jeu exporte par défaut :
//   { id, nom, description, icone, monter(conteneur), demonter() }
// et, en option :
//   resume()  → texte court pour la tuile (ex. « Partie en cours ») ou '' ;
//   bientot   → true pour afficher une tuile « Bientôt disponible » non cliquable.

import sudoku from './games/sudoku/index.js';
import solitaire from './games/solitaire/index.js';
import backgammon from './games/backgammon/index.js';

export const JEUX = [sudoku, solitaire, backgammon];
