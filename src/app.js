// Point d'entrée : accueil généré depuis le registre, navigation, installation, mises à jour.
import { JEUX } from './registre.js';
import { VERSION } from './version.js';
import { $ } from './core/outils.js';
import { victoires } from './core/stockage.js';
import { fermerDialogue } from './core/dialogue.js';

const app = $('#app');
// Dans l'APK (Capacitor), les fichiers sont déjà dans l'appli : pas de service worker ni d'installation.
const dansApk = Boolean(window.Capacitor);

let jeuActif = null;
let ouvertDepuisAccueil = false;
let installation = null; // événement beforeinstallprompt mis de côté
let miseAJourEnAttente = false;

// ---------- Navigation (#/sudoku, etc.) : le bouton Retour d'Android ramène à l'accueil ----------

function idDepuisAdresse() {
  return location.hash.replace(/^#\/?/, '');
}

function route() {
  fermerDialogue(false);
  document.querySelectorAll('.sheet.result-sheet, .sheet.temp').forEach((s) => s.remove()); // fenêtres de fin de partie, de choix…
  if (jeuActif) {
    jeuActif.demonter();
    jeuActif = null;
  }
  const jeu = JEUX.find((j) => j.id === idDepuisAdresse() && !j.bientot);
  if (jeu) afficherJeu(jeu);
  else afficherAccueil();
  window.scrollTo(0, 0);
}

function allerAccueil() {
  if (ouvertDepuisAccueil) {
    ouvertDepuisAccueil = false;
    history.back();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}

// ---------- Accueil ----------

function texteTuile(jeu) {
  if (jeu.bientot) return jeu.description;
  const n = victoires(jeu.id);
  const etat = (jeu.resume && jeu.resume()) || jeu.description;
  return n > 0 ? `${etat} · ${n} victoire${n > 1 ? 's' : ''}` : etat;
}

function afficherAccueil() {
  if (miseAJourEnAttente) {
    location.reload();
    return;
  }
  document.title = 'Salon de Jeux';
  app.innerHTML = `
    <section id="home" class="screen">
      <div>
        <h1>Salon de Jeux</h1>
        <p class="lede">Vos jeux préférés, sans publicité.</p>
      </div>
      <div class="tiles"></div>
      <button class="btn primary install" id="install" hidden>Installer sur le téléphone</button>
      <p class="status" id="install-msg" aria-live="polite"></p>
      <p class="foot">Aucune publicité, aucun compte. Vos parties restent sur ce téléphone.<br>Version ${VERSION}</p>
    </section>`;
  const tuiles = $('.tiles', app);
  for (const jeu of JEUX) {
    const el = document.createElement(jeu.bientot ? 'div' : 'button');
    el.className = 'tile' + (jeu.bientot ? ' soon' : '');
    if (jeu.bientot) el.setAttribute('aria-disabled', 'true');
    el.innerHTML = `${jeu.icone}<span><span class="t-name"></span><span class="t-desc"></span></span>`;
    $('.t-name', el).textContent = jeu.nom;
    $('.t-desc', el).textContent = texteTuile(jeu);
    if (!jeu.bientot) {
      el.addEventListener('click', () => {
        ouvertDepuisAccueil = true;
        location.hash = '#/' + jeu.id;
      });
    }
    tuiles.append(el);
  }
  const bouton = $('#install', app);
  bouton.hidden = !installation;
  bouton.addEventListener('click', installer);
}

// ---------- Écran d'un jeu ----------

/**
 * @param {object} jeu     module du jeu (registre)
 * @param {object} options { defi } quand le jeu est lancé depuis la carte des niveaux
 */
function afficherJeu(jeu, options = {}) {
  document.title = `${jeu.nom} · Salon de Jeux`;
  app.innerHTML = `
    <section class="screen game" id="${jeu.id}" ${jeu.paysage ? 'data-paysage' : ''}>
      <header class="bar">
        <button class="btn" id="back">${options.defi ? '← Carte' : '← Accueil'}</button>
        <h2></h2>
      </header>
      ${options.defi ? '<p class="defi-banner"></p>' : ''}
      <div class="game-body"></div>
    </section>`;
  $('h2', app).textContent = jeu.nom;
  if (options.defi) $('.defi-banner', app).textContent = `Niveau ${options.defi.numero} : ${options.defi.objectif}`;
  $('#back', app).addEventListener('click', allerAccueil);
  jeuActif = jeu;
  jeu.monter($('.game-body', app), options);
}

// ---------- Installation sur le téléphone (PWA) ----------

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installation = e;
  const bouton = document.getElementById('install');
  if (bouton) bouton.hidden = false;
});

window.addEventListener('appinstalled', () => {
  installation = null;
  const bouton = document.getElementById('install');
  if (bouton) bouton.hidden = true;
  const msg = document.getElementById('install-msg');
  if (msg) msg.textContent = 'C’est installé ! L’icône « Salon de Jeux » est sur l’écran du téléphone.';
});

async function installer() {
  if (!installation) return;
  const evt = installation;
  installation = null;
  document.getElementById('install').hidden = true;
  // Si la personne refuse, Chrome renverra beforeinstallprompt plus tard et le bouton reviendra.
  try {
    await evt.prompt();
  } catch {
    /* rien */
  }
}

// ---------- Service worker : hors ligne + mises à jour ----------

// En local (npm start), pas de cache pour voir ses modifications tout de suite ; ajouter ?sw=1 pour tester le hors-ligne.
const enLocal = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.)/.test(location.hostname) && !location.search.includes('sw=1');

if (!dansApk && !enLocal && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const avaitDejaUnSw = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitDejaUnSw) return; // toute première installation : rien à recharger
    // Nouvelle version disponible : on recharge tout de suite sur l'accueil,
    // sinon au prochain retour à l'accueil (pour ne pas couper une partie).
    if (!jeuActif) location.reload();
    else miseAJourEnAttente = true;
  });
}

window.addEventListener('hashchange', route);
route();
