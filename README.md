# Mom's games

Des jeux classiques **sans aucune publicité**, sans compte et sans internet une fois installés :
Sudoku, Solitaire, Dames et Backgammon. Plus une **Aventure** (une carte de niveaux, quelques nouveaux
chaque jour) et **Mon île**, où l'on construit avec les étoiles gagnées en jouant.

---

## 1. Pour ma maman 💚

### Installer l'application (la méthode conseillée)

1. Sur le téléphone, ouvrez **Chrome** et allez à cette adresse :
   **https://antoinerichard08.github.io/mobiletinygames/**
2. Touchez le gros bouton vert **« Installer sur le téléphone »**, en bas de la liste des jeux.
   *(S'il n'apparaît pas : touchez les **trois petits points ⋮** en haut à droite de Chrome, puis **« Installer l'application »**. Selon le téléphone, ce choix s'appelle **« Ajouter à l'écran d'accueil »**.)*
3. Touchez **« Installer »** pour confirmer.
4. C'est fini ! L'icône **Mom's games** (une maman souriante entourée de ses jeux) est sur l'écran du téléphone. Elle marche même sans internet.

Les mises à jour arrivent toutes seules : rien à faire.

### Si l'installation ne marche pas : le fichier APK

1. Dans **Chrome**, ouvrez ce lien :
   **https://github.com/Antoinerichard08/mobiletinygames/releases/latest/download/moms-games.apk**
   Si Chrome prévient que le fichier peut être dangereux, touchez **« Télécharger quand même »**.
2. Quand le téléchargement est fini, touchez **« Ouvrir »** en bas de l'écran.
3. Si le téléphone affiche *« Pour votre sécurité, votre téléphone n'est pas autorisé à installer des applications inconnues provenant de cette source »* :
   touchez **« Paramètres »**, activez **« Autoriser cette source »**, puis revenez en arrière avec la flèche **Retour**.
4. Touchez **« Installer »**, puis **« Ouvrir »**.
   *(Si un message « Play Protect » apparaît : touchez **« Plus de détails »** puis **« Installer quand même »**.)*

Pour une nouvelle version : refaire les mêmes étapes, le bouton s'appellera **« Mettre à jour »**. Les parties sont conservées.

### Bon à savoir

- Vos parties sont **enregistrées automatiquement**. Vous pouvez fermer l'application, vous reprendrez où vous en étiez.
- Le bouton **« Annuler »** défait le dernier coup. Le bouton **« Indice »** vous aide quand vous êtes bloquée.
- Le bouton **Retour** du téléphone ramène à l'écran précédent.
- Chaque partie gagnée rapporte des **étoiles** ★ (1 en facile, 2 en moyen, 3 en difficile ; 1 d'encouragement si l'on perd).
- **Aventure** : une carte en mer, d'escale en escale. **3 nouveaux niveaux s'ouvrent chaque jour** ; les niveaux
  déjà réussis se rejouent quand on veut pour gagner plus d'étoiles. Les **missions du jour** donnent des étoiles en plus.
- **Mon île** : choisissez un bâtiment en bas, puis touchez une case : le chiffre montre les points de beauté gagnés,
  la meilleure case brille. Une île très belle en fait apparaître une nouvelle !
- Le **Solitaire**, les **Dames**, le **Sudoku** et le **Backgammon** se jouent aussi téléphone tourné à l'horizontale.

---

## 2. Pour le développeur

### Principes

- HTML, CSS et JavaScript pur (modules ES), **sans framework ni étape de build**.
- 100 % hors ligne : un service worker met tous les fichiers en cache. Aucun appel réseau, aucun traqueur.
- Polices Atkinson Hyperlegible (texte) et Young Serif (titres) incluses dans `assets/fonts` (licence OFL).
- Thème clair/sombre automatique ; toutes les couleurs sont des variables CSS dans `src/styles/base.css`.
- Sauvegarde dans `localStorage` (clés `salon.*`), toujours protégée par `try/catch`.

### Arborescence

```
index.html, manifest.webmanifest, sw.js   l'appli et sa partie PWA
src/app.js                                accueil, navigation (#/jeu, #/niveaux, #/niveau/N, #/ile), installation, mises à jour
src/registre.js                           LA liste des jeux : l'accueil est généré depuis elle
src/core/                                 outils, stockage, dialogues, animations (mouvement.js), étoiles,
                                          fin de partie commune (partie.js), calculs en arrière-plan (travail.js)
src/progression/                          Aventure : niveaux.js (carte, rythme quotidien), missions.js, carte.js (écran)
src/ile/                                  Mon île : regles.js (sans navigateur, testé), index.js (écran)
src/games/<jeu>/index.js                  affichage et commandes du jeu
src/games/<jeu>/moteur.js                 règles, IA, génération : sans navigateur, testé avec Node
src/games/<jeu>/<jeu>.css                 styles propres au jeu
assets/                                   polices, icônes (PWA et Android), tuiles de l'île (assets/ile, CC0)
scripts/                                  serveur local, icônes, version, préparation du site
tests/                                    tests Node (node:test)
.github/workflows/                        publication GitHub Pages (et APK)
```

### Lancer en local

Il faut Node.js 20 ou plus récent. Aucune installation n'est nécessaire pour lancer l'appli.

```bash
npm start
```

Puis ouvrir http://localhost:8080. En local, le service worker est désactivé pour voir ses modifications
tout de suite ; ajoutez `?sw=1` à l'adresse pour tester le mode hors ligne.

### Lancer les tests

```bash
npm test
```

Les tests couvrent le moteur de chaque jeu (y compris des parties ordinateur contre ordinateur vérifiées coup
par coup), le solveur du Solitaire, la progression (niveaux, rythme quotidien, missions), les règles de l'île
et la cohérence de la PWA (manifeste, liste du cache, versions, fichiers utilisés par les styles).

### Ajouter un jeu

1. Créer `src/games/<jeu>/` avec :
   - `moteur.js` : les règles, sans `document` ni `window`, pour pouvoir le tester ;
   - `index.js` qui exporte par défaut `{ id, nom, description, icone, monter(conteneur, options), demonter() }`
     et, en option, `resume()` (texte court comme « Partie en cours ») et `paysage: true` si le jeu a une mise en
     page horizontale ;
   - en fin de partie, appeler `finirPartie({ jeu, gagne, difficulte, defi: options.defi, details })`
     (`src/core/partie.js`) : étoiles, victoires, missions et écran de résultat sont gérés pour vous ;
   - `<jeu>.css`, chargé par `index.js` avec `chargerStyle(new URL('./<jeu>.css', import.meta.url))`.
2. L'importer dans `src/registre.js` et l'ajouter au tableau `JEUX`.
3. Ajouter `tests/<jeu>.test.js`.
4. Lancer `npm run nouvelle-version` pour remettre à jour la liste des fichiers mis en cache, puis `npm test`.

Les autres jeux ne sont pas touchés. `monter()` reçoit un conteneur vide sous la barre « ← Accueil » ;
`demonter()` est appelé quand on quitte le jeu. Quand le jeu est lancé depuis la carte, `options.defi` donne le
niveau imposé (`defi.niveau`, `defi.taille`…) : il faut alors utiliser une sauvegarde à part et masquer le choix
du niveau. Pour qu'il apparaisse sur la carte, l'ajouter à `ORDRE_JEUX` dans `src/progression/niveaux.js`.

### Choix techniques et sources d'inspiration

Avant d'écrire les jeux, nous avons cherché les meilleurs projets libres. Les moteurs les plus forts
(**Scan** pour les dames internationales, **GNU Backgammon**) sont sous licence GPL-3 et très lourds ; pour garder
une appli légère, rapide sur un vieux téléphone et sous licence MIT, leurs techniques ont été réécrites simplement :

- **Dames** : négamax alpha-bêta, approfondissement progressif, table de transposition (hachage de Zobrist),
  ordre des coups par historique, prolongement des prises ; calcul dans un Web Worker, limité à 2,5 s.
- **Backgammon** : évaluation inspirée de pubeval et gnubg (course, pions exposés et lancers qui les frappent,
  primes, ancres) ; le niveau Difficile regarde la meilleure réponse adverse sur les 21 lancers possibles.
- **Solitaire** : un solveur (recherche « meilleur d'abord » avec table de transposition, coups sûrs joués d'office,
  comme Solvitaire) ne distribue que des donnes gagnables en Facile et Moyen.
- **Aventure** : le modèle de la « carte saga » popularisé par Candy Crush, avec un rythme quotidien.
- **Mon île** : inspiré d'*Islanders* (points selon les voisins), sans malus, sans minuteur, sans échec.
- **Graphismes de l'île et de la carte** : pack « Tiny Islands » de Majadroid (CC0), dans `assets/ile`.

### Publier une nouvelle version

Chaque push sur `main` publie automatiquement le site sur GitHub Pages (workflow `pages.yml`).
Pour que la mise à jour arrive sur les téléphones déjà installés, **il faut changer le numéro de version** :
c'est lui qui change le cache du service worker.

```bash
npm run nouvelle-version -- 1.1.0
```

```bash
git commit -am "Version 1.1.0"
```

```bash
git tag v1.1.0
```

```bash
git push origin main v1.1.0
```

Ensuite, tout se fait seul :
- le push sur `main` republie le site (workflow `pages.yml`, 1 à 2 minutes) ;
- le tag `v1.1.0` construit l'APK signé et le publie dans la Release **« Mom's games v1.1.0 »**
  (workflow `apk.yml`, environ 5 minutes). Le lien
  `https://github.com/Antoinerichard08/mobiletinygames/releases/latest/download/moms-games.apk`
  pointe toujours vers la dernière version.

Le tag doit correspondre au numéro de `package.json`, sinon le workflow APK s'arrête avec un message clair.

Côté PWA, le téléphone télécharge la nouvelle version à la prochaine ouverture de l'appli (avec internet),
puis l'applique dès qu'on revient sur l'écran d'accueil.

### Configuration GitHub (une seule fois)

- Dépôt **public** `mobiletinygames` (GitHub Pages gratuit).
- **Settings → Pages → Build and deployment → Source : GitHub Actions**.

### APK Android (Capacitor)

L'APK emballe exactement les mêmes fichiers que le site avec [Capacitor](https://capacitorjs.com) : ils sont
dans l'APK, donc l'appli marche hors ligne dès la première ouverture (pas de service worker dans l'APK).
Le dossier `android/` n'est pas versionné : le workflow le régénère à chaque fois avec `npx cap add android`,
puis `scripts/configurer-android.mjs` règle le numéro de version (`versionCode` = X×10000 + Y×100 + Z),
les icônes, l'écran de démarrage et l'orientation portrait.

Pour construire l'APK sur son PC (facultatif ; il faut le JDK 21 et le SDK Android, par exemple avec Android Studio) :

```bash
npm ci && node scripts/preparer-site.mjs www && npx cap add android && node scripts/configurer-android.mjs && npx cap sync android
```

Puis, dans le dossier `android/` : `./gradlew assembleRelease`.

### Signature de l'APK (une seule fois, très important)

Android n'installe une mise à jour **que si elle est signée avec la même clé** que la version déjà installée.
La clé est donc générée une seule fois, puis rangée dans les secrets du dépôt :

1. Générer la clé (déjà fait pour ce dépôt : ne pas refaire) :
   ```bash
   node scripts/generer-cle.mjs
   ```
   Cela crée `cle-android/salon-de-jeux.jks` et `cle-android/secrets-github.txt`. Ce dossier est ignoré par git.
2. Sur GitHub : **Settings → Secrets and variables → Actions → New repository secret**, et créer les trois
   secrets indiqués dans `secrets-github.txt` : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.
3. **Sauvegarder le dossier `cle-android/` ailleurs** (clé USB, gestionnaire de mots de passe). Si la clé est perdue,
   il faudra désinstaller l'appli du téléphone (et perdre les parties en cours) pour installer la suivante.

Le workflow `apk.yml` décode la clé, signe avec `apksigner` puis l'efface aussitôt. Sans les secrets, il s'arrête
avec un message qui renvoie ici.

> À noter : Google a annoncé que l'installation d'APK hors Play Store exigera progressivement (2026-2027) un
> développeur enregistré auprès de Google. Si un jour l'APK ne s'installe plus, la PWA reste la solution
> recommandée : elle n'est pas concernée.

### Icônes

```bash
npm run icones
```

Régénère toutes les icônes (PWA et Android) à partir du logo `design/logo-source.png`, avec `scripts/generer-icones.mjs`, sans dépendance.
