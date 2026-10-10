// Réglages globaux.
// Mode développeur : crédits illimités (étoiles, ressources de l'île), tous les niveaux et bâtiments ouverts.
// Il s'active sur UN téléphone en ouvrant l'appli avec « ?dev=1 » à la fin de l'adresse, et se coupe avec « ?dev=0 »
// (ou le bouton de l'accueil). Les autres téléphones (celui de maman) ne sont pas concernés.
import { lire, ecrire } from './stockage.js';

export function modeDev() {
  return lire('dev', false) === true;
}

export function definirModeDev(actif) {
  ecrire('dev', Boolean(actif));
}

/** À appeler au démarrage : lit ?dev=1 / ?dev=0 dans l'adresse. */
export function lireModeDevDansAdresse() {
  if (typeof location === 'undefined') return;
  const p = new URLSearchParams(location.search);
  if (p.has('dev')) definirModeDev(p.get('dev') === '1');
}

/** Étoiles affichées en mode développeur. */
export const ETOILES_DEV = 999999;
