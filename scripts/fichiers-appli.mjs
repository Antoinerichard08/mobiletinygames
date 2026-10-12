// Liste des fichiers qui composent l'appli (ceux que le service worker met en cache).
// Utilisé par preparer-site.mjs, nouvelle-version.mjs et les tests.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = fileURLToPath(new URL('..', import.meta.url));

function parcourir(dossier, filtre) {
  const out = [];
  for (const nom of readdirSync(join(RACINE, dossier))) {
    const chemin = join(RACINE, dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...parcourir(join(dossier, nom), filtre));
    else if (filtre(nom)) out.push(relative(RACINE, chemin).split(sep).join('/'));
  }
  return out;
}

/** Fichiers à mettre en cache, sans sw.js lui-même. */
export function listerFichiersAppli() {
  return [
    'index.html',
    'manifest.webmanifest',
    ...[
      ...parcourir('assets/fonts', (n) => n.endsWith('.woff2')),
      ...parcourir('assets/icons', (n) => n.endsWith('.png')),
      ...parcourir('assets/ile', (n) => n.endsWith('.png')),
      ...parcourir('assets/cartes', (n) => n.endsWith('.png') || n.endsWith('.webp')), // apparences du Solitaire
      ...parcourir('data', (n) => n.endsWith('.json')),
      ...parcourir('src', () => true),
    ].sort(),
  ];
}

/**
 * Les tableaux du jeu Puzzle : publiés avec l'appli mais PAS mis en cache d'avance (8 Mo) ; chaque téléphone
 * télécharge seulement ceux dont il a besoin, puis les garde (src/games/puzzle/images.js).
 */
export function listerImagesPuzzles() {
  return parcourir('assets/puzzles', (n) => n.endsWith('.jpg')).sort();
}
