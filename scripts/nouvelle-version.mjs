// Prépare une nouvelle version : met le numéro partout et régénère la liste du cache.
//   npm run nouvelle-version -- 1.2.0
// Puis : git commit -am "Version 1.2.0" && git tag v1.2.0 && git push --follow-tags
// Sans numéro, le script ne fait que remettre à jour la liste des fichiers dans sw.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE, listerFichiersAppli } from './fichiers-appli.mjs';

const version = process.argv[2];
if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Numéro de version attendu sous la forme X.Y.Z, par exemple 1.2.0');
  process.exit(1);
}

function modifier(fichier, transformer) {
  const chemin = join(RACINE, fichier);
  const avant = readFileSync(chemin, 'utf8');
  const apres = transformer(avant);
  if (apres !== avant) {
    writeFileSync(chemin, apres);
    console.log('modifié :', fichier);
  }
}

if (version) {
  modifier('package.json', (t) => t.replace(/"version": "[^"]+"/, `"version": "${version}"`));
  modifier('src/version.js', (t) => t.replace(/VERSION = '[^']+'/, `VERSION = '${version}'`));
  modifier('sw.js', (t) => t.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`));
}

const liste = listerFichiersAppli().map((f) => `  '${f}',`).join('\n');
modifier('sw.js', (t) =>
  t.replace(/(\/\/ FICHIERS-DEBUT[^\n]*\r?\nconst FICHIERS = \[\r?\n)[\s\S]*?(\r?\n\];\r?\n\/\/ FICHIERS-FIN)/, `$1${liste}$2`),
);

if (version) console.log(`Version ${version} prête. Pensez à : git commit, git tag v${version}, git push --follow-tags`);
