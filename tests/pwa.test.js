// Vérifie que la PWA est cohérente : manifeste complet, service worker à jour, versions alignées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE, listerFichiersAppli } from '../scripts/fichiers-appli.mjs';

const lireTexte = (f) => readFileSync(join(RACINE, f), 'utf8');

test('le manifeste est complet', () => {
  const m = JSON.parse(lireTexte('manifest.webmanifest'));
  for (const champ of ['name', 'short_name', 'start_url', 'theme_color', 'background_color']) assert.ok(m[champ], champ);
  assert.equal(m.lang, 'fr');
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'portrait');
  const icone = (taille, but) => m.icons.find((i) => i.sizes === taille && i.purpose === but);
  assert.ok(icone('192x192', 'any'));
  assert.ok(icone('512x512', 'any'));
  assert.ok(icone('512x512', 'maskable'));
  for (const i of m.icons) assert.ok(existsSync(join(RACINE, i.src)), `icône manquante : ${i.src}`);
});

test('le service worker met en cache tous les fichiers de l’appli', () => {
  const sw = lireTexte('sw.js');
  const liste = [...sw.matchAll(/^ {2}'([^']+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(liste, listerFichiersAppli(), 'lancer « npm run nouvelle-version » pour remettre la liste à jour');
});

test('le numéro de version est le même partout', () => {
  const version = JSON.parse(lireTexte('package.json')).version;
  assert.match(lireTexte('sw.js'), new RegExp(`const VERSION = '${version.replace(/\./g, '\\.')}'`));
  assert.match(lireTexte('src/version.js'), new RegExp(`VERSION = '${version.replace(/\./g, '\\.')}'`));
});

test('aucun appel réseau externe dans le code de l’appli', () => {
  for (const f of listerFichiersAppli().filter((f) => /\.(js|css|html)$/.test(f))) {
    assert.doesNotMatch(lireTexte(f), /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, `URL externe dans ${f}`);
  }
});

test('chaque jeu du registre a un module complet', async () => {
  const src = lireTexte('src/registre.js');
  const chemins = [...src.matchAll(/from '\.\/(games\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(chemins.length >= 2);
  for (const c of chemins) {
    const texte = lireTexte(join('src', c));
    for (const cle of ['id:', 'nom:', 'description:', 'icone:']) assert.ok(texte.includes(cle), `${c} : ${cle} manquant`);
    if (!texte.includes('bientot: true')) {
      assert.match(texte, /monter\(conteneur\)/, `${c} : monter() manquant`);
      assert.match(texte, /demonter\(\)/, `${c} : demonter() manquant`);
    }
  }
});
