// Point d'entrée : accueil, navigation entre écrans, installation, mises à jour.
//   #/            accueil
//   #/<jeu>       un jeu en partie libre (sudoku, solitaire, dames, backgammon)
//   #/niveaux     la carte de l'Aventure
//   #/niveau/<n>  le niveau n de la carte (un jeu en mode défi)
//   #/ile         Mon île (on construit avec ses étoiles)
import { JEUX } from './registre.js';
import { VERSION } from './version.js';
import { $ } from './core/outils.js';
import { victoires } from './core/stockage.js';
import { fermerDialogue, demander } from './core/dialogue.js';
import { solde } from './core/etoiles.js';
import { modeDev, definirModeDev, lireModeDevDansAdresse, ETOILES_DEV } from './core/config.js';
import { ecouter } from './core/evenements.js';
import { definirNavigation } from './core/navigation.js';
import { animer, apparaitre, mouvementReduit, pop } from './core/mouvement.js';
import './progression/branchement.js';
import carte from './progression/carte.js';
import { niveau, etat as etatAventure, niveauCourant, statut } from './progression/niveaux.js';
import { liste as listeMissions } from './progression/missions.js';
import ile from './ile/index.js';

lireModeDevDansAdresse(); // « ?dev=1 » active le mode développeur sur ce téléphone
const app = $('#app');
/** Le solde affiché : ∞ en mode développeur. */
const soldeTexte = () => (modeDev() ? '∞' : String(solde()));
// Dans l'APK (Capacitor), les fichiers sont déjà dans l'appli : pas de service worker ni d'installation.
const dansApk = Boolean(window.Capacitor);
const ECRANS = { niveaux: carte, ile };

let actif = null; // module de l'écran affiché (jeu, carte ou île)
let installation = null; // événement beforeinstallprompt mis de côté
let miseAJourEnAttente = false;
const parcours = []; // écrans visités pendant cette session (pour un retour logique)

// Le compteur d'étoiles se met à jour (et saute un peu) quand on en gagne.
ecouter('etoiles', ({ solde: n }) => {
  for (const puce of document.querySelectorAll('.star-chip b')) {
    puce.textContent = n >= ETOILES_DEV ? '∞' : n;
    pop(puce.parentElement, 1.25);
  }
});

// ---------- Navigation : le bouton Retour d'Android remonte d'un écran ----------

const idDepuisAdresse = () => location.hash.replace(/^#\/?/, '');
const parent = (id) => (id.startsWith('niveau/') ? 'niveaux' : '');
const profondeur = (id) => (!id ? 0 : id.startsWith('niveau/') ? 2 : 1);

/** Revenir à un écran : en reculant dans l'historique si on en vient, sinon en remplaçant l'adresse. */
function revenirA(cible) {
  if (parcours.length >= 2 && parcours[parcours.length - 2] === cible) {
    history.back();
  } else {
    history.replaceState(null, '', cible ? `#/${cible}` : location.pathname + location.search);
    route();
  }
}
definirNavigation(revenirA);

/** Change d'écran avec une transition douce (vers la gauche en avançant, vers la droite en revenant). */
function changerEcran(dessinerEcran, sens) {
  const surPlace = () => {
    window.scrollTo(0, 0); // avant le dessin : un écran peut ensuite défiler où il veut (la carte, vers le niveau en cours)
    dessinerEcran();
  };
  if (mouvementReduit() || !document.startViewTransition || document.visibilityState !== 'visible') {
    surPlace();
    const ecran = $('.screen', app);
    if (ecran && !mouvementReduit()) animer(ecran, [{ opacity: 0, transform: `translateX(${sens === 'arriere' ? -24 : 24}px)` }, { opacity: 1, transform: 'none' }], { duration: 260 });
    return;
  }
  document.documentElement.dataset.sens = sens;
  const transition = document.startViewTransition(surPlace);
  // une transition interrompue (écran éteint, double toucher…) n'est pas une erreur
  for (const p of [transition.ready, transition.finished, transition.updateCallbackDone]) p.catch(() => {});
}

function route() {
  fermerDialogue(false);
  document.querySelectorAll('.sheet.result-sheet, .sheet.temp').forEach((s) => s.remove()); // fenêtres de fin de partie, de choix…
  if (actif) {
    actif.demonter();
    actif = null;
  }
  const id = idDepuisAdresse();
  const precedent = parcours[parcours.length - 1];
  if (parcours.length >= 2 && parcours[parcours.length - 2] === id) parcours.pop();
  else if (precedent !== id) parcours.push(id);
  const sens = precedent === undefined || profondeur(id) >= profondeur(precedent) ? 'avant' : 'arriere';

  let dessin;
  const m = id.match(/^niveau\/(\d+)$/);
  if (m) {
    const def = niveau(Number(m[1]));
    const jeu = JEUX.find((j) => j.id === def.jeu);
    // un niveau pas encore ouvert ramène à la carte
    if (!jeu || statut(def.numero) === 'verrouille' || statut(def.numero) === 'demain') dessin = () => afficherEcran(carte, 'Aventure', '');
    else dessin = () => afficherJeu(jeu, { defi: { id: def.id, numero: def.numero, niveau: def.niveau, taille: def.taille, longueur: def.longueur, objectif: def.objectif } });
  } else if (ECRANS[id]) {
    dessin = () => afficherEcran(ECRANS[id], id === 'ile' ? 'Mon île' : 'Aventure', '');
  } else {
    const jeu = JEUX.find((j) => j.id === id);
    dessin = jeu ? () => afficherJeu(jeu) : afficherAccueil;
  }
  changerEcran(dessin, sens);
}

// ---------- Accueil ----------

function texteTuile(jeu) {
  const n = victoires(jeu.id);
  const etat = (jeu.resume && jeu.resume()) || jeu.description;
  return n > 0 ? `${etat} · ${n} victoire${n > 1 ? 's' : ''}` : etat;
}

const ICONE_AVENTURE = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect class="ic-mer" x="4" y="4" width="56" height="56" rx="12"/><path d="M14 46c6-10 14 4 20-6s12-14 18-22" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="1 6" stroke-linecap="round"/><circle cx="14" cy="46" r="6" fill="#1D5C48" stroke="#fff" stroke-width="2.5"/><circle cx="52" cy="18" r="7" fill="#F2B705" stroke="#fff" stroke-width="2.5"/><path d="M30 33h12l-2 5H32z" fill="#7A3E1D"/><path d="M36 22v11M36 22l6 8h-6" fill="#fff" stroke="#fff" stroke-width="1.5"/></svg>`;
const ICONE_ILE = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect class="ic-mer" x="4" y="4" width="56" height="56" rx="12"/><ellipse cx="32" cy="40" rx="22" ry="11" fill="#E8D7A8"/><ellipse cx="32" cy="37" rx="19" ry="9" fill="#328C19"/><path d="M20 36l7-7 7 7v5H20z" fill="#C25B3A"/><rect x="23" y="35" width="8" height="6" fill="#F4EEDD"/><circle cx="42" cy="31" r="6" fill="#2E5E2B"/><rect x="41" y="34" width="2" height="6" fill="#6B4A2B"/></svg>`;

function afficherAccueil() {
  if (miseAJourEnAttente) {
    location.reload();
    return;
  }
  document.title = "Mom's games";
  const e = etatAventure();
  const courant = niveauCourant(e);
  const ouvert = statut(courant, e) === 'ouvert';
  const missions = listeMissions();
  const faites = missions.filter((x) => x.faite).length;
  app.innerHTML = `
    <section id="home" class="screen">
      <div class="home-top">
        <img class="logo" src="assets/icons/logo-256.png" alt="" width="64" height="64">
        <div class="titre">
          <h1>Mom's games</h1>
          <p class="lede">Vos jeux préférés, sans publicité.</p>
        </div>
        <span class="star-chip" aria-label="Vos étoiles">★ <b>${soldeTexte()}</b></span>
      </div>
      ${modeDev() ? '<div class="dev-bandeau"><span><b>Mode développeur</b> : étoiles et ressources illimitées, tout est ouvert.</span><button class="btn" id="dev-quitter">Quitter ce mode</button></div>' : ''}
      <div class="install-zone">
        <button class="btn primary install" id="install" hidden>Installer sur le téléphone</button>
        <button class="btn install-aide" id="install-aide" hidden>Comment installer l’appli sur le téléphone ?</button>
        <p class="status" id="install-msg" aria-live="polite" hidden></p>
      </div>
      <div class="tiles grandes">
        <button class="tile mode" data-aller="niveaux">${ICONE_AVENTURE}<span><span class="t-name">Aventure</span>
          <span class="t-desc">${ouvert ? `Niveau ${courant} vous attend · ${e.jetons} nouveau${e.jetons > 1 ? 'x' : ''} aujourd’hui` : `Niveau ${courant} : ouvert demain. Rejouez pour plus d’étoiles !`}</span></span></button>
        <button class="tile mode" data-aller="ile">${ICONE_ILE}<span><span class="t-name">Mon île</span>
          <span class="t-desc">Construisez, récoltez, agrandissez votre île (${soldeTexte()} ★)</span></span></button>
      </div>
      <div class="missions-accueil">
        <p class="titre-section">Missions du jour <b>${faites}/3</b></p>
        <ul>${missions.map((x) => `<li class="${x.faite ? 'ok' : ''}"><span class="coche" aria-hidden="true">${x.faite ? '✓' : ''}</span>${x.texte} <small>+${x.etoiles} ★</small></li>`).join('')}</ul>
      </div>
      <p class="titre-section">Jeux libres</p>
      <div class="tiles"></div>
      <p class="foot">Aucune publicité, aucun compte. Vos parties restent sur ce téléphone.<br>Graphismes de l’île : « Tiny Islands » par Majadroid, « Tiny Town » par Kenney.<br>Version ${VERSION}</p>
    </section>`;
  const tuiles = $('.tiles:not(.grandes)', app);
  for (const jeu of JEUX) {
    const el = document.createElement('button');
    el.className = 'tile';
    el.innerHTML = `${jeu.icone}<span><span class="t-name"></span><span class="t-desc"></span></span>`;
    $('.t-name', el).textContent = jeu.nom;
    $('.t-desc', el).textContent = texteTuile(jeu);
    el.addEventListener('click', () => { location.hash = '#/' + jeu.id; });
    tuiles.append(el);
  }
  app.querySelectorAll('[data-aller]').forEach((b) => b.addEventListener('click', () => { location.hash = '#/' + b.dataset.aller; }));
  // les blocs arrivent l'un après l'autre
  [...app.querySelectorAll('.tile, .missions-accueil')].forEach((el, n) => apparaitre(el, { delai: 40 + n * 60 }));
  $('#install', app).addEventListener('click', installer);
  $('#dev-quitter', app)?.addEventListener('click', () => { definirModeDev(false); location.replace(location.pathname); });
  $('#install-aide', app).addEventListener('click', aideInstallation);
  majZoneInstallation();
}

// ---------- Écrans : jeu, carte, île ----------

function enveloppe(id, titre, retour, avecPaysage, banniere) {
  app.innerHTML = `
    <section class="screen game" id="${id}" ${avecPaysage ? 'data-paysage' : ''}>
      <header class="bar">
        <button class="btn" id="back">${retour}</button>
        <h2></h2>
      </header>
      ${banniere ? '<p class="defi-banner"></p>' : ''}
      <div class="game-body"></div>
    </section>`;
  $('h2', app).textContent = titre;
  if (banniere) $('.defi-banner', app).textContent = banniere;
  const id2 = idDepuisAdresse();
  $('#back', app).addEventListener('click', () => revenirA(parent(id2)));
  return $('.game-body', app);
}

/**
 * @param {object} jeu     module du jeu (registre)
 * @param {object} options { defi } quand le jeu est lancé depuis la carte des niveaux
 */
function afficherJeu(jeu, options = {}) {
  document.title = `${jeu.nom} · Mom's games`;
  const corps = enveloppe(jeu.id, jeu.nom, options.defi ? '← Carte' : '← Accueil', jeu.paysage,
    options.defi ? `Niveau ${options.defi.numero} : ${options.defi.objectif}` : '');
  actif = jeu;
  jeu.monter(corps, options);
}

function afficherEcran(module, titre) {
  document.title = `${titre} · Mom's games`;
  const corps = enveloppe(module.id, titre, '← Accueil', false, '');
  actif = module;
  module.monter(corps);
}

// ---------- Installation sur le téléphone (PWA) ----------

// Déjà ouvert comme une appli (icône de l'écran d'accueil, ou APK) : rien à proposer.
const dejaEnAppli = () => dansApk || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installee = false;

/**
 * En haut de l'accueil : le gros bouton « Installer » quand Chrome le permet ; sinon, quand on est dans
 * le navigateur, une aide qui explique où trouver « Installer l'application » dans le menu de Chrome.
 */
function majZoneInstallation() {
  const bouton = document.getElementById('install');
  const aide = document.getElementById('install-aide');
  const msg = document.getElementById('install-msg');
  if (!bouton) return;
  bouton.hidden = !installation || dejaEnAppli();
  aide.hidden = Boolean(installation) || dejaEnAppli() || installee;
  msg.hidden = !installee;
  if (installee) msg.textContent = 'C’est installé ! L’icône « Mom’s games » est sur l’écran du téléphone.';
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installation = e;
  majZoneInstallation();
});

window.addEventListener('appinstalled', () => {
  installation = null;
  installee = true;
  majZoneInstallation();
});

async function installer() {
  if (!installation) return aideInstallation();
  const evt = installation;
  installation = null;
  majZoneInstallation();
  // Si la personne refuse, Chrome renverra beforeinstallprompt plus tard et le bouton reviendra.
  try {
    await evt.prompt();
  } catch {
    /* rien */
  }
}

function aideInstallation() {
  return demander({
    titre: 'Installer l’appli',
    texte: '1. Touchez les trois petits points ⋮, en haut à droite de Chrome.\n'
      + '2. Touchez « Installer l’application » (ou « Ajouter à l’écran d’accueil », puis « Installer »).\n'
      + '3. L’icône « Mom’s games » apparaît sur l’écran du téléphone.\n\n'
      + 'Si le menu propose « Ouvrir dans l’application », c’est qu’elle est déjà installée : cherchez l’icône sur l’écran du téléphone.',
    oui: 'J’ai compris',
  });
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
    if (!actif) location.reload();
    else miseAJourEnAttente = true;
  });
}

window.addEventListener('hashchange', route);
route();
