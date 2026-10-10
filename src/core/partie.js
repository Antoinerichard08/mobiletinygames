// Fin de partie commune à tous les jeux : calcul des étoiles, victoires, missions, écran de résultat.
// Les jeux appellent finirPartie() ; la carte des niveaux et les missions s'y branchent avec
// definirGestionDefi() et ajouterAnalyse(), sans que les jeux aient à les connaître.
import { ajouterVictoire } from './stockage.js';
import { ajouterEtoiles, etoilesPartie } from './etoiles.js';
import { annoncer } from './evenements.js';

let gestionDefi = null; // (resultat) => { etoilesGagnees, etoilesNiveau, titre, texte }
const analyses = []; // (resultat) => [{ texte, etoiles }] : récompenses supplémentaires (missions…)

export function definirGestionDefi(f) {
  gestionDefi = f;
}
export function ajouterAnalyse(f) {
  analyses.push(f);
}

/**
 * Calcule et crédite les récompenses d'une partie (sans rien afficher). Testable sans navigateur.
 * @param {object} r { jeu, gagne, difficulte, defi?, details? }
 * @returns {{ etoiles: number, bonus: {texte: string, etoiles: number}[], niveau?: object }}
 */
export function recompenser(r) {
  let etoiles, niveau = null;
  if (r.defi && gestionDefi) {
    niveau = gestionDefi(r);
    etoiles = niveau.etoilesGagnees;
  } else {
    etoiles = etoilesPartie(r);
  }
  if (r.gagne) ajouterVictoire(r.jeu);
  if (etoiles > 0) ajouterEtoiles(etoiles, r.jeu);
  const bonus = [];
  const complet = { ...r, etoiles };
  for (const a of analyses) {
    for (const b of a(complet) || []) {
      bonus.push(b);
      if (b.etoiles > 0) ajouterEtoiles(b.etoiles, 'bonus');
    }
  }
  annoncer('partie-terminee', { ...r, etoiles });
  return { etoiles, bonus, niveau };
}

/**
 * À appeler par un jeu quand la partie se termine. Affiche l'écran de résultat.
 * @param {object} r { jeu, gagne, difficulte, defi?, details?, titre?, texte? }
 * @returns {Promise<string>} l'action choisie : 'rejouer', 'carte', 'fermer'
 */
export async function finirPartie(r) {
  const { etoiles, bonus, niveau } = recompenser(r);
  const { afficherResultat } = await import('./resultat.js');
  const titre = niveau?.titre || r.titre || (r.gagne ? 'Bravo !' : 'Perdu cette fois');
  const texte = niveau?.texte || r.texte || (r.gagne ? 'Vous avez gagné la partie.' : 'On refait une partie ?');
  const boutons = r.defi
    ? [
        { action: 'carte', texte: 'Retour à la carte', principal: true },
        { action: 'rejouer', texte: 'Rejouer ce niveau' },
      ]
    : [
        { action: 'rejouer', texte: r.gagne ? 'Nouvelle partie' : 'Rejouer', principal: true },
        { action: 'fermer', texte: 'Fermer' },
      ];
  return afficherResultat({
    titre,
    texte,
    etoiles,
    etoilesNiveau: niveau ? niveau.etoilesNiveau : null,
    gagne: r.gagne,
    bonus,
    boutons,
  });
}
