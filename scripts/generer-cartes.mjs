// Photographie les planches de cartes du Solitaire (design/cartes/planche.html) avec Chrome ou Edge sans fenêtre.
//   npm run cartes
// Sorties :
//   design/cartes/gabarit-reperes.png    le gabarit avec les zones à respecter et le mode d'emploi
//   design/cartes/gabarit-vierge.png     le même, vide, prêt à peindre
//   design/cartes/classique.png          l'apparence actuelle en images : une base à retoucher
//   assets/cartes/creme.png              l'apparence de démonstration « Crème et rouge » (dans le jeu)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RACINE } from './fichiers-appli.mjs';

const NAVIGATEURS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const navigateur = process.env.CHROME || NAVIGATEURS.find((c) => existsSync(c));
if (!navigateur) {
  console.error('Chrome ou Edge introuvable : indiquer son chemin dans la variable CHROME.');
  process.exit(1);
}

const PLANCHES = [
  { mode: 'reperes', cw: 300, sortie: 'design/cartes/gabarit-reperes.png' },
  { mode: 'vierge', cw: 300, sortie: 'design/cartes/gabarit-vierge.png' },
  { mode: 'classique', cw: 300, sortie: 'design/cartes/classique.png' },
  // dans le jeu, une carte fait au plus ~80 px de large (× 3 pour un écran très fin) : 240 px suffisent
  { mode: 'creme', cw: 240, sortie: 'assets/cartes/creme.png' },
];

const page = pathToFileURL(join(RACINE, 'design/cartes/planche.html')).href;
const profil = mkdtempSync(join(tmpdir(), 'cartes-'));
try {
  for (const p of PLANCHES) {
    const sortie = join(RACINE, p.sortie);
    mkdirSync(join(sortie, '..'), { recursive: true });
    execFileSync(navigateur, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
      '--force-device-scale-factor=1', '--default-background-color=00000000', '--virtual-time-budget=3000',
      `--user-data-dir=${profil}`, `--window-size=${13 * p.cw},${Math.round(5 * p.cw * 1.4)}`,
      `--screenshot=${sortie}`, `${page}?mode=${p.mode}&cw=${p.cw}`,
    ], { stdio: 'ignore' });
    console.log('écrit :', p.sortie);
  }
} finally {
  rmSync(profil, { recursive: true, force: true });
}
