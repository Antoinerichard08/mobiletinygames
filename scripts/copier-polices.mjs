// Copie les polices depuis node_modules (@fontsource) vers assets/fonts,
// pour qu'elles soient servies avec l'appli et marchent hors ligne.
// À lancer seulement si l'on veut mettre à jour les polices : npm install && npm run polices
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const dest = join(racine, 'assets', 'fonts');
mkdirSync(dest, { recursive: true });

const copies = [
  ['@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2', 'atkinson-hyperlegible-400.woff2'],
  ['@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2', 'atkinson-hyperlegible-700.woff2'],
  ['@fontsource/atkinson-hyperlegible/LICENSE', 'LICENCE-atkinson-hyperlegible.txt'],
  ['@fontsource/young-serif/files/young-serif-latin-400-normal.woff2', 'young-serif-400.woff2'],
  ['@fontsource/young-serif/LICENSE', 'LICENCE-young-serif.txt'],
];

for (const [src, nom] of copies) {
  copyFileSync(join(racine, 'node_modules', src), join(dest, nom));
  console.log('copié :', nom);
}
