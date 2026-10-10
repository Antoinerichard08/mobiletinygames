// Personnalise le projet Android généré par Capacitor (dossier android/, non versionné) :
// numéro de version, icônes, écran de démarrage, orientation portrait.
// Utilisé par le workflow .github/workflows/apk.yml, après « npx cap add android ».
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './fichiers-appli.mjs';

const android = join(RACINE, 'android');
if (!existsSync(android)) {
  console.error('Dossier android/ introuvable : lancer d’abord « npx cap add android ».');
  process.exit(1);
}

function modifier(fichier, transformer) {
  const chemin = join(android, fichier);
  const avant = readFileSync(chemin, 'utf8');
  const apres = transformer(avant);
  if (apres === avant) throw new Error(`Rien n'a changé dans ${fichier} : le modèle Capacitor a peut-être évolué.`);
  writeFileSync(chemin, apres);
  console.log('modifié :', fichier);
}

// 1. Version : versionCode doit augmenter à chaque version pour qu'Android accepte la mise à jour.
const version = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')).version;
const [maj, min, cor] = version.split('.').map(Number);
const versionCode = maj * 10000 + min * 100 + cor;
modifier('app/build.gradle', (t) =>
  t.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${version}"`),
);
console.log(`version ${version} (versionCode ${versionCode})`);

// 2. Icônes et écran de démarrage (générés par npm run icones)
const res = join(android, 'app/src/main/res');
for (const dossier of readdirSync(res)) {
  if (dossier.startsWith('drawable')) rmSync(join(res, dossier, 'splash.png'), { force: true });
}
cpSync(join(RACINE, 'assets/android/res'), res, { recursive: true });
console.log('icônes et écran de démarrage copiés');

// 3. Appli en mode portrait, comme la PWA
modifier('app/src/main/AndroidManifest.xml', (t) =>
  t.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"'),
);
