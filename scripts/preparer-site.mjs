// Copie l'appli (et seulement elle) dans un dossier prêt à publier.
//   node scripts/preparer-site.mjs _site   → pour GitHub Pages
//   node scripts/preparer-site.mjs www     → pour l'APK (Capacitor)
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RACINE, listerFichiersAppli } from './fichiers-appli.mjs';

const dest = join(RACINE, process.argv[2] || '_site');
rmSync(dest, { recursive: true, force: true });

const fichiers = [...listerFichiersAppli(), 'sw.js', 'assets/fonts/LICENCE-atkinson-hyperlegible.txt', 'assets/fonts/LICENCE-young-serif.txt', 'assets/ile/LICENCE.txt'];
for (const f of fichiers) {
  mkdirSync(dirname(join(dest, f)), { recursive: true });
  cpSync(join(RACINE, f), join(dest, f));
}
console.log(`${fichiers.length} fichiers copiés dans ${dest}`);
