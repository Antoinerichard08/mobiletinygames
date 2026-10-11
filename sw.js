// Service worker : met toute l'appli en cache pour qu'elle marche sans internet.
// À chaque nouvelle version, « npm run nouvelle-version -- X.Y.Z » change VERSION (et la liste des fichiers) :
// le navigateur voit que ce fichier a changé, télécharge la nouvelle version et efface l'ancienne.

const VERSION = '1.7.0';
const CACHE = `salon-de-jeux-${VERSION}`;

// FICHIERS-DEBUT (liste générée par scripts/nouvelle-version.mjs, vérifiée par les tests)
const FICHIERS = [
  'index.html',
  'manifest.webmanifest',
  'assets/fonts/atkinson-hyperlegible-400.woff2',
  'assets/fonts/atkinson-hyperlegible-700.woff2',
  'assets/fonts/young-serif-400.woff2',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'assets/icons/icone-192.png',
  'assets/icons/icone-512.png',
  'assets/icons/icone-maskable-512.png',
  'assets/icons/logo-256.png',
  'assets/ile/sprites.png',
  'assets/ile/tuiles.png',
  'data/catalogue-puzzles.json',
  'src/app.js',
  'src/core/config.js',
  'src/core/dialogue.js',
  'src/core/etoiles.js',
  'src/core/evenements.js',
  'src/core/mouvement.js',
  'src/core/navigation.js',
  'src/core/outils.js',
  'src/core/partie.js',
  'src/core/pieces.js',
  'src/core/resultat.js',
  'src/core/stockage.js',
  'src/core/travail.js',
  'src/core/tuiles.js',
  'src/games/backgammon/backgammon.css',
  'src/games/backgammon/ia-worker.js',
  'src/games/backgammon/ia.js',
  'src/games/backgammon/index.js',
  'src/games/backgammon/moteur.js',
  'src/games/backgammon/plateau.js',
  'src/games/bulles/bulles.css',
  'src/games/bulles/generateur-worker.js',
  'src/games/bulles/generateur.js',
  'src/games/bulles/index.js',
  'src/games/bulles/moteur.js',
  'src/games/bulles/rendu.js',
  'src/games/dames/dames.css',
  'src/games/dames/ia-worker.js',
  'src/games/dames/ia.js',
  'src/games/dames/index.js',
  'src/games/dames/moteur.js',
  'src/games/puzzle/images.js',
  'src/games/puzzle/index.js',
  'src/games/puzzle/moteur.js',
  'src/games/puzzle/puzzle.css',
  'src/games/solitaire/donne-worker.js',
  'src/games/solitaire/donne.js',
  'src/games/solitaire/index.js',
  'src/games/solitaire/moteur.js',
  'src/games/solitaire/solitaire.css',
  'src/games/solitaire/solveur.js',
  'src/games/sudoku/index.js',
  'src/games/sudoku/moteur.js',
  'src/games/sudoku/sudoku.css',
  'src/ile/atelier.js',
  'src/ile/camera.js',
  'src/ile/conseil.js',
  'src/ile/cote.js',
  'src/ile/gestes.js',
  'src/ile/icones.js',
  'src/ile/ile.css',
  'src/ile/index.js',
  'src/ile/monde.js',
  'src/ile/plan.js',
  'src/ile/regles.js',
  'src/ile/vie.js',
  'src/progression/branchement.js',
  'src/progression/carte.css',
  'src/progression/carte.js',
  'src/progression/missions.js',
  'src/progression/niveaux.js',
  'src/registre.js',
  'src/styles/base.css',
  'src/version.js',
];
// FICHIERS-FIN

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: 'reload' : on ignore le cache HTTP pour être sûr d'avoir les nouveaux fichiers
      .then((cache) => cache.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => n.startsWith('salon-de-jeux-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Pages : toujours l'accueil en cache (l'adresse #/jeu est gérée par l'appli)
      if (req.mode === 'navigate') {
        return (await cache.match('index.html')) || fetch(req);
      }
      const trouve = await cache.match(req, { ignoreSearch: true });
      if (trouve) return trouve;
      return fetch(req);
    })(),
  );
});
