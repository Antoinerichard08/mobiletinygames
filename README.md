# Salon de Jeux

Des jeux classiques **sans aucune publicité**, sans compte et sans internet une fois installés :
Sudoku, Solitaire et Dames (le Backgammon arrive plus tard).

---

## 1. Pour ma maman 💚

### Installer l'application (la méthode conseillée)

1. Sur le téléphone, ouvrez **Chrome** et allez à cette adresse :
   **https://antoinerichard08.github.io/mobiletinygames/**
2. Touchez le gros bouton vert **« Installer sur le téléphone »**, en bas de la liste des jeux.
   *(S'il n'apparaît pas : touchez les **trois petits points ⋮** en haut à droite de Chrome, puis **« Installer l'application »**. Selon le téléphone, ce choix s'appelle **« Ajouter à l'écran d'accueil »**.)*
3. Touchez **« Installer »** pour confirmer.
4. C'est fini ! L'icône **Salon de Jeux** (deux pions, un blanc et un rouge, sur fond vert) est sur l'écran du téléphone. Elle marche même sans internet.

Les mises à jour arrivent toutes seules : rien à faire.

### Si l'installation ne marche pas : le fichier APK

*(Cette partie sera prête à la fin du projet.)*

### Bon à savoir

- Vos parties sont **enregistrées automatiquement**. Vous pouvez fermer l'application, vous reprendrez où vous en étiez.
- Le bouton **« Annuler »** défait le dernier coup. Le bouton **« Indice »** vous aide quand vous êtes bloquée.
- Le bouton **Retour** du téléphone ramène à la liste des jeux.

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
src/app.js                                accueil, navigation (#/jeu), installation, mises à jour
src/registre.js                           LA liste des jeux : l'accueil est généré depuis elle
src/core/                                 outils, stockage, fenêtre de confirmation
src/games/<jeu>/index.js                  affichage et commandes du jeu
src/games/<jeu>/moteur.js                 règles, IA, génération : sans navigateur, testé avec Node
src/games/<jeu>/<jeu>.css                 styles propres au jeu
assets/                                   polices, icônes (PWA et Android)
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

Les tests couvrent le moteur de chaque jeu et la cohérence de la PWA (manifeste, liste du cache, versions).

### Ajouter un jeu

1. Créer `src/games/<jeu>/` avec :
   - `moteur.js` : les règles, sans `document` ni `window`, pour pouvoir le tester ;
   - `index.js` qui exporte par défaut `{ id, nom, description, icone, monter(conteneur), demonter() }`
     (et, en option, `resume()` qui renvoie un texte court comme « Partie en cours ») ;
   - `<jeu>.css`, chargé par `index.js` avec `chargerStyle(new URL('./<jeu>.css', import.meta.url))`.
2. L'importer dans `src/registre.js` et l'ajouter au tableau `JEUX`.
3. Ajouter `tests/<jeu>.test.js`.
4. Lancer `npm run nouvelle-version` pour remettre à jour la liste des fichiers mis en cache, puis `npm test`.

Les autres jeux ne sont pas touchés. `monter()` reçoit un conteneur vide sous la barre « ← Accueil » ;
`demonter()` est appelé quand on quitte le jeu.

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
git push --follow-tags
```

Le téléphone télécharge la nouvelle version à la prochaine ouverture de l'appli (avec internet), puis
l'applique dès qu'on revient sur l'écran d'accueil.

### Configuration GitHub (une seule fois)

- Dépôt **public** `mobiletinygames` (GitHub Pages gratuit).
- **Settings → Pages → Build and deployment → Source : GitHub Actions**.

### Icônes

```bash
npm run icones
```

Régénère toutes les icônes (PWA et Android) à partir de `scripts/generer-icones.mjs`, sans dépendance.
