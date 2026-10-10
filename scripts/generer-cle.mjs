// Génère UNE FOIS POUR TOUTES la clé qui signe l'APK.
//   node scripts/generer-cle.mjs
// Android n'accepte une mise à jour que si elle est signée avec la même clé que la version installée :
// cette clé doit donc être conservée précieusement (sauvegarde hors de l'ordinateur) et ne jamais être perdue.
// Elle est écrite dans cle-android/ (ignoré par git) avec un fichier secrets-github.txt à recopier
// dans les secrets du dépôt GitHub. Nécessite keytool (fourni avec Java).
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './fichiers-appli.mjs';

const dossier = join(RACINE, 'cle-android');
const fichier = join(dossier, 'salon-de-jeux.jks');
if (existsSync(fichier)) {
  console.error(`Une clé existe déjà (${fichier}). On ne la remplace pas : les mises à jour de l'APK seraient refusées.`);
  process.exit(1);
}
mkdirSync(dossier, { recursive: true });

// keytool : variable KEYTOOL, sinon JAVA_HOME, sinon les dossiers Java habituels de Windows, sinon le PATH
function trouverKeytool() {
  const exe = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
  const candidats = [process.env.KEYTOOL, process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin', exe)];
  for (const base of ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Android\\Android Studio']) {
    if (!existsSync(base)) continue;
    if (existsSync(join(base, 'jbr', 'bin', exe))) candidats.push(join(base, 'jbr', 'bin', exe));
    for (const d of readdirSync(base)) candidats.push(join(base, d, 'bin', exe));
  }
  return candidats.find((c) => c && existsSync(c)) || 'keytool';
}

const alias = 'salon-de-jeux';
const motDePasse = randomBytes(18).toString('base64url');
execFileSync(trouverKeytool(), [
  '-genkeypair', '-v',
  '-keystore', fichier,
  '-storetype', 'PKCS12',
  '-alias', alias,
  '-keyalg', 'RSA', '-keysize', '2048',
  '-validity', '20000',
  '-storepass', motDePasse,
  '-keypass', motDePasse,
  '-dname', 'CN=Salon de Jeux, O=Antoinerichard08, C=FR',
], { stdio: ['ignore', 'ignore', 'inherit'] });

const base64 = readFileSync(fichier).toString('base64');
writeFileSync(join(dossier, 'secrets-github.txt'), [
  'À recopier dans GitHub : dépôt → Settings → Secrets and variables → Actions → New repository secret',
  'Créer 3 secrets (Name = la ligne en MAJUSCULES, Secret = la valeur en dessous) :',
  '',
  'ANDROID_KEY_ALIAS',
  alias,
  '',
  'ANDROID_KEYSTORE_PASSWORD',
  motDePasse,
  '',
  'ANDROID_KEYSTORE_BASE64',
  base64,
  '',
  'IMPORTANT : sauvegarder tout le dossier cle-android/ ailleurs (clé USB, gestionnaire de mots de passe).',
  'Sans cette clé, il faudra désinstaller l’appli du téléphone pour installer une nouvelle version.',
  '',
].join('\n'));

console.log(`Clé créée : ${fichier}`);
console.log(`Secrets à recopier dans GitHub : ${join(dossier, 'secrets-github.txt')}`);
