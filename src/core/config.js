// Réglages globaux.
// Mode développeur : crédits illimités (étoiles, ressources de l'île), tous les niveaux et bâtiments ouverts.
// Il s'active en ouvrant l'appli avec « ?dev=1 » à la fin de l'adresse, et se coupe avec « ?dev=0 »
// (ou le bouton de l'accueil) ; le choix est mémorisé sur le téléphone.
import { lire, ecrire } from './stockage.js';

/**
 * POUR LE MOMENT, le mode développeur est TOUJOURS actif, sur tous les téléphones (tests plus faciles) :
 * « ?dev=0 » n'y change rien. Mettre false pour revenir à la normale. Les tests Node restent en mode normal.
 */
export const DEV_TOUJOURS = true;

export function modeDev() {
  if (DEV_TOUJOURS && typeof document !== 'undefined') return true;
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
