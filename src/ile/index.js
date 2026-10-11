// Écran « Mon île » : le cœur de l'appli. Un monde plein écran, à l'horizontale, qu'on parcourt du doigt.
// Interface inspirée des grands jeux de construction : ressources en haut à droite, niveau en haut à gauche,
// « Jouer » en bas à gauche, « Construire » en bas à droite ; on touche un bâtiment pour voir ses actions,
// on pose les constructions directement sur l'île (un fantôme, puis ✓).
// Règles : regles.js · plan de l'archipel : plan.js · rendu : monde.js · vie : vie.js · gestes : gestes.js.
// Graphismes : « Tiny Islands » (Majadroid, CC0), « Tiny Town » (Kenney, CC0), le reste dessiné pour l'appli.
import { $, $$, chargerStyle, pluriel } from '../core/outils.js';
import { lire, ecrire } from '../core/stockage.js';
import { solde, depenserEtoiles, ajouterEtoiles } from '../core/etoiles.js';
import { soldePieces, ajouterPieces } from '../core/pieces.js';
import { revenir } from '../core/navigation.js';
import { mouvementReduit } from '../core/mouvement.js';
import { T, S, tuile, sprite, ilot } from '../core/tuiles.js';
import { modeDev } from '../core/config.js';
import { JEUX } from '../registre.js';
import {
  ILES, BATIMENTS, DECORS, AMENAGEMENTS, ORDRE_BATIMENTS, ORDRE_DECORS, RESSOURCES, NOMS_RESSOURCES,
  MINUTE, migrer, cle, coord, estTerre, estCote, terrainDe, construire, ameliorer, decorer, retirer, produit, stock,
  plafond, periode, ramasser, toutRamasser, peutAmenager, amenager, acheterCase, coutCase, casesAchetables, peutAcheter, actualiser, beauteTotale,
  ilesOuvertes, estDebloque, apercu, habitants, peutPayer, manque, niveauMax, pointsCase, ouvrirTout, batisseurs,
  batisseursLibres, chantiers, prixBatisseur, engagerBatisseur, prixFinir, finir, peutDeplacer, apercuDeplacement,
  deplacer, ramasserTresor, paliers, progressionIle, dureeChantier, voisinsDe, dejaConstruit,
} from './regles.js';
import { conseil } from './conseil.js';
import { camera, versEcran, versMonde, borner, zoomAutour, zoomPourVoir, centrePourVoir, entre } from './camera.js';
import { origine, rectIle, rectMonde, caseSous, ileProche, centreCase } from './plan.js';
import { creerRendu, imageCase, imageType } from './monde.js';
import { creerCotes, masqueCote } from './cote.js';
import { creerVie } from './vie.js';
import { suivreGestes } from './gestes.js';
import { ICONE } from './icones.js';

chargerStyle(new URL('./ile.css', import.meta.url));

const CLE = 'ile';
const ICONES_RES = { bois: T.icones.bois, pierre: T.icones.pierre, ble: T.icones.ble };
const OUTILS = { abattre: S.outils.hache, casser: S.outils.pioche, planter: S.pousse, creuser: S.outils.pelle, combler: S.outils.seau, debroussailler: S.outils.fourche, cailloux: S.outils.seau };
const NOMS_TERRAIN = { herbe: 'Herbe libre', foret: 'Forêt', montagne: 'Rochers', etang: 'Étang', eau: 'Mer', buisson: 'Buisson sauvage', caillou: 'Cailloux' };
const GUIDE = 'Rose';
const MARGES = { haut: 70, bas: 84, gauche: 8, droite: 8 }; // la place prise par l'interface autour du monde
// pour cadrer une île : l'interface peut déborder un peu sur la mer, mais pas sur la terre
const CADRE = { haut: 44, bas: 28, gauche: 120, droite: 160 };
const CADRE_AGRANDIR = { haut: 56, bas: 16, gauche: 24, droite: 170 };

let E = null;
let racine = null;
let scene = null;
let toile = null;
let rendu = null;
let vie = null;
let cam = camera();
let tourne = false;
let animation = 0;
let dernier = 0;
let temps = 0; // secondes, pour les animations
let horloge = null;
let ui = null;
let surRedimension = null;
let surTouche = null;
let surVisibilite = null;

const maintenant = () => Date.now();
const reduit = () => mouvementReduit();
const ouvertes = () => ilesOuvertes(E);
const etoilesTexte = () => (modeDev() ? '∞' : String(solde()));
const payerEtoiles = (n) => depenserEtoiles(n);
const vibrer = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* rien */ } };

function charger() {
  E = migrer(lire(CLE, null), maintenant());
  ouvrirTout(modeDev());
  remplirSiDev();
}
/** Mode développeur : ressources illimitées (on remplit le grenier à chaque action). */
function remplirSiDev() {
  if (modeDev()) for (const r of RESSOURCES) E.ressources[r] = Math.max(E.ressources[r], 9999);
}
function sauver() {
  remplirSiDev();
  if (!modeDev()) E.soldeVu = solde();
  ecrire(CLE, E);
}

// ---------- Petits morceaux d'affichage ----------

function icone(res, taille = 20) {
  if (res === 'etoiles') return `<span class="ic-etoile" style="font-size:${taille}px">${ICONE.etoile}</span>`;
  if (res === 'pieces') return sprite(S.piece, taille);
  return tuile(ICONES_RES[res], taille);
}
/** Coût sous forme de pastilles ; ce qui manque est en rouge. */
function coutHtml(cout, taille = 20) {
  const m = manque(E, solde(), cout);
  const morceaux = Object.entries(cout).filter(([, v]) => v).map(([r, v]) => `<span class="prix ${m[r] ? 'manque' : ''}">${icone(r, taille)}<b>${v}</b></span>`);
  return morceaux.join('') || '<span class="prix"><b>Gratuit</b></span>';
}
function texteManque(m) {
  return Object.entries(m).map(([r, v]) => (r === 'etoiles' ? pluriel(v, 'étoile') : `${v} ${NOMS_RESSOURCES[r]}`)).join(', ');
}
const duree = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  return s % 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s / 60} min`;
};
const imageHtml = (img, taille) => (img.f === 's' ? sprite(img.c, taille) : tuile(img.c, taille));
const nomDe = (type) => (BATIMENTS[type] || DECORS[type]).nom;
const coutDe = (genre, type) => (genre === 'construire' ? BATIMENTS[type].cout[0] : DECORS[type].cout);

/** Position d'un élément de l'interface dans la scène (la scène peut être tournée : on ne lit pas l'écran). */
function posScene(el) {
  let x = 0, y = 0;
  for (let n = el; n && n !== scene; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}

// ---------- Plein écran, à l'horizontale ----------

async function pleinEcran() {
  if (!matchMedia('(pointer: coarse)').matches) return; // sur ordinateur, on reste dans la fenêtre
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* pas permis : tant pis, l'île prend déjà toute la page */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* le téléphone refuse : on tourne la scène nous-mêmes */ }
  orienter();
}
function quitterPleinEcran() {
  try { screen.orientation?.unlock?.(); } catch { /* rien */ }
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

/** Si le téléphone est tenu droit, la scène est tournée d'un quart de tour : le jeu reste à l'horizontale. */
const taille = { l: 0, h: 0 };
function orienter() {
  if (!scene) return;
  const W = window.innerWidth, H = window.innerHeight;
  taille.l = W;
  taille.h = H;
  tourne = H > W * 1.05;
  const l = tourne ? H : W, h = tourne ? W : H;
  scene.style.width = `${l}px`;
  scene.style.height = `${h}px`;
  scene.style.transform = tourne ? `translate(${W}px, 0) rotate(90deg)` : 'none';
  scene.classList.toggle('tourne', tourne);
  const ancien = { l: cam.l, h: cam.h };
  cam = { ...cam, l, h };
  rendu.dimensionner(l, h, Math.min(2, window.devicePixelRatio || 1));
  if (ancien.l !== l || ancien.h !== h) cam = borner(cam, bornes());
}
const versScene = (cx, cy) => (tourne ? { x: cy, y: window.innerWidth - cx } : { x: cx, y: cy });

// ---------- Caméra ----------

/** Jusqu'où la caméra peut aller : tout l'archipel, et assez de mer autour pour centrer n'importe quelle île. */
function bornes() {
  const r = rectMonde(E, 1), mx = Math.max(0, cam.l / cam.z / 2 - 5), my = Math.max(0, cam.h / cam.z / 2 - 4);
  return { x0: r.x0 - mx, y0: r.y0 - my, x1: r.x1 + mx, y1: r.y1 + my };
}
function limitesZoom() {
  const m = rectMonde(E, 1);
  return { min: Math.max(14, Math.min(cam.l / (m.x1 - m.x0), cam.h / (m.y1 - m.y0))), max: 120 };
}
/** La caméra qui montre une île en entier, entre les boutons. */
function cameraPourIle(n, marge = 0.2, cadre = CADRE) {
  const r = rectIle(E.iles[n], n);
  const b = { x0: r.x0 - marge, y0: r.y0 - marge, x1: r.x1 + marge, y1: r.y1 + marge };
  const z = Math.min(96, zoomPourVoir(cam, b, cadre));
  return { ...cam, z, ...centrePourVoir(cam, b, z, cadre) };
}
function volerVers(cible, ms = 650) {
  const fin = borner({ ...cam, ...cible, l: cam.l, h: cam.h }, bornes());
  if (reduit()) { cam = fin; ui.vol = null; return; }
  ui.vol = { de: { ...cam }, vers: fin, debut: temps, duree: ms / 1000 };
  ui.inertie = null;
}
/** S'assure qu'une case est bien visible (et pas sous les boutons) ; sinon la caméra y va. */
function montrerCase(n, k, zoom = null) {
  const [x, y] = coord(k), c = centreCase(E.iles[n], n, x, y);
  const p = versEcran(cam, c.x, c.y);
  const dedans = p.x > 90 && p.x < cam.l - 90 && p.y > MARGES.haut + 30 && p.y < cam.h - MARGES.bas - 20;
  if (dedans && !zoom) return;
  volerVers({ x: c.x, y: c.y + (MARGES.bas - MARGES.haut) / 2 / (zoom || cam.z), z: zoom || cam.z });
}

// ---------- La boucle d'animation ----------

function etatDessin() {
  const sel = ui.selection;
  let fantome = null, propositions = null, deplacement = null;
  if (ui.mode === 'poser' || ui.mode === 'deplacer') {
    const p = ui.pose;
    propositions = { n: p.n, gains: p.gains, meilleur: p.meilleur };
    const gain = p.gains.get(p.cle);
    fantome = { n: p.n, cle: p.cle, image: p.image, valide: p.gains.has(p.cle), gain: gain ?? null };
    if (ui.mode === 'deplacer') deplacement = { n: p.n, de: p.de };
  }
  return {
    E, cam, t: maintenant(), temps, ouvertes: ouvertes(), vie, reduit: reduit(),
    selection: ui.mode === 'libre' && sel ? sel : null,
    propositions, fantome, deplacement,
    agrandir: ui.mode === 'agrandir' ? ui.agrandir : null,
    agrandirChoix: ui.mode === 'agrandir' ? ui.agrandirChoix : null,
    guide: ui.guide?.cible?.genre === 'case' ? ui.guide.cible : null,
  };
}

let derniereAction = 0;
let image = 0;
function boucle(t) {
  animation = requestAnimationFrame(boucle);
  if (!racine) return;
  // au repos depuis un moment : une image sur deux suffit (la batterie dit merci)
  image++;
  if (t - derniereAction > 20000 && !ui.vol && !ui.inertie && image % 2) return;
  const dt = Math.min(0.05, Math.max(0, (t - dernier) / 1000));
  dernier = t;
  temps += dt;
  // l'écran a changé de taille (rotation, barre du navigateur…) sans prévenir : on se recale
  if (window.innerWidth !== taille.l || window.innerHeight !== taille.h) orienter();
  if (ui.vol) {
    const p = (temps - ui.vol.debut) / ui.vol.duree;
    cam = entre(ui.vol.de, ui.vol.vers, p);
    if (p >= 1) ui.vol = null;
  } else if (ui.inertie) {
    cam = { ...cam, x: cam.x - (ui.inertie.vx * dt) / cam.z, y: cam.y - (ui.inertie.vy * dt) / cam.z };
    const frein = Math.exp(-dt * 5);
    ui.inertie = { vx: ui.inertie.vx * frein, vy: ui.inertie.vy * frein };
    if (Math.hypot(ui.inertie.vx, ui.inertie.vy) < 8) ui.inertie = null;
  }
  cam = borner(cam, bornes());
  const a = versMonde(cam, 0, 0), b = versMonde(cam, cam.l, cam.h);
  if (!reduit()) vie.maj(dt, { x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  rendu.dessiner(etatDessin());
  placerEtiquettes();
  // l'île qu'on regarde (pour le titre et les constructions)
  const centre = versMonde(cam, cam.l / 2, cam.h / 2);
  const proche = ileProche(E, ouvertes(), centre.x, centre.y);
  if (proche !== E.active && ui.mode === 'libre' && !ui.vol) { E.active = proche; majRuban(); }
}

/** Le nom au-dessus de la case choisie, et les boutons ✓ ✗ à côté du fantôme : ils suivent la caméra. */
function placerEtiquettes() {
  const etiquette = $('#ile-etiquette', scene);
  const cible = ui.mode === 'libre' ? ui.selection : null;
  if (cible) {
    const [x, y] = coord(cible.cle), c = centreCase(E.iles[cible.n], cible.n, x, y);
    const p = versEcran(cam, c.x, c.y - 0.5);
    etiquette.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - 12)}px) translate(-50%, -100%)`;
  }
  const valider = $('#ile-valider', scene);
  const suivie = (ui.mode === 'poser' || ui.mode === 'deplacer') && ui.pose ? { n: ui.pose.n, cle: ui.pose.cle }
    : ui.mode === 'agrandir' && ui.agrandirChoix ? { n: ui.agrandir, cle: ui.agrandirChoix } : null;
  if (suivie) {
    const [x, y] = coord(suivie.cle), c = centreCase(E.iles[suivie.n], suivie.n, x, y);
    const p = versEcran(cam, c.x, c.y);
    const l = valider.offsetWidth || 140, h = valider.offsetHeight || 64;
    let px = p.x + cam.z * 0.55 + 10, py = p.y - h / 2;
    if (px + l > cam.l - 8) px = p.x - cam.z * 0.55 - 10 - l;
    px = Math.max(8, Math.min(cam.l - l - 8, px));
    py = Math.max(MARGES.haut - 10, Math.min(cam.h - h - 8, py));
    valider.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
  }
}

// ---------- Le temps passe ----------

function deblocages() {
  return { ouvertes: ouvertes(), debloques: [...ORDRE_BATIMENTS, ...ORDRE_DECORS].filter((t) => estDebloque(E, t)) };
}

async function tic() {
  if (!racine || document.hidden) return;
  // pendant une fenêtre ou une pose, on attend : tout se calcule à partir de l'heure, rien n'est perdu
  if (ui.fenetre || ui.mode !== 'libre') { majHud(); return; }
  const avant = deblocages();
  const evenements = actualiser(E, maintenant());
  if (evenements.length) {
    sauver();
    for (const ev of evenements) celebrer(ev);
  }
  vie.peupler(E);
  majHud();
  majActions(true);
  if (evenements.length) await annoncerDeblocages(avant);
}

/** Les effets quand quelque chose se termine. */
function celebrer(ev) {
  const ile = E.iles[ev.n], [x, y] = coord(ev.cle), c = centreCase(ile, ev.n, x, y);
  if (ev.genre === 'pousse') {
    if (ev.n < ouvertes()) rendu.gerbe(c.x, c.y, ev.terrain === 'caillou' ? 'cailloux' : 'feuilles', temps);
    return;
  }
  if (ev.genre === 'tresor') {
    if (ev.n < ouvertes()) dire('Une bouteille s’est échouée sur la plage ! Touchez-la.');
    return;
  }
  rendu.pop(ev.n, ev.cle, 'fini', temps);
  if (ev.genre === 'construit' || ev.genre === 'agrandi') {
    rendu.gerbe(c.x, c.y, 'poussiere', temps);
    rendu.gerbe(c.x, c.y - 0.2, 'etoiles', temps);
    rendu.texte(c.x, c.y - 0.6, `+${ev.gain} beauté`, temps, '#ffe066');
    const nom = BATIMENTS[ev.type].nom;
    dire(ev.genre === 'construit' ? `${nom} : c’est construit !` : `${nom} : niveau ${ev.niveau} !`);
    vibrer(20);
  } else {
    rendu.gerbe(c.x, c.y, ['casser', 'cailloux'].includes(ev.action) ? 'cailloux' : ev.action === 'creuser' || ev.action === 'combler' ? 'eau' : 'feuilles', temps);
    const gain = Object.entries(ev.gain).map(([r, q]) => `+${q} ${NOMS_RESSOURCES[r]}`).join(' ');
    if (gain) {
      rendu.texte(c.x, c.y - 0.5, gain, temps);
      for (const [r, q] of Object.entries(ev.gain)) voler(c, r, q);
    }
    dire(`${AMENAGEMENTS[ev.action].nom} : c’est fait !`);
  }
  if (ui.selection?.n === ev.n && ui.selection.cle === ev.cle) majActions();
}

async function annoncerDeblocages(avant) {
  const nouveaux = [...ORDRE_BATIMENTS, ...ORDRE_DECORS].filter((t) => estDebloque(E, t) && !avant.debloques.includes(t));
  for (const t of nouveaux) {
    const def = BATIMENTS[t] || DECORS[t];
    rendu.gerbe(cam.x, cam.y, 'confettis', temps);
    await fenetre({
      classe: 'nouveau', titre: 'Nouveau !',
      corps: `<div class="rayons" aria-hidden="true"></div><div class="nouveau-image">${imageHtml(imageType(t), 112)}</div>
        <p class="nouveau-nom">${def.nom}</p><p>${def.desc}.</p><p class="petit">Votre île est de plus en plus belle : vous le trouverez dans « Construire ».</p>`,
      boutons: [{ id: 'ok', texte: 'Super !', classe: 'vert' }],
    });
  }
  if (ouvertes() > avant.ouvertes) {
    const n = ouvertes() - 1;
    const choix = await fenetre({
      classe: 'nouveau', titre: 'Une nouvelle île !',
      corps: `<div class="rayons" aria-hidden="true"></div><div class="nouveau-image">${ilot(3, 2, 30, [T.foret, null, T.montagne, null, T.foret, null])}</div>
        <p class="nouveau-nom">${ILES[n].nom}</p><p>Les nuages se lèvent : une nouvelle île est apparue au large. Vous pourrez y construire encore plus.</p>`,
      boutons: [{ id: 'plus-tard', texte: 'Plus tard' }, { id: 'voir', texte: 'Aller la voir', classe: 'vert' }],
    });
    rendu.devoiler(n, temps + (choix === 'voir' ? 0.5 : 0));
    vie.oublier();
    vie.peupler(E);
    if (choix === 'voir') { E.active = n; volerVers(cameraPourIle(n), 1100); majRuban(); }
  }
  if (nouveaux.length || ouvertes() > avant.ouvertes) majHud();
}

// ---------- L'interface (HUD) ----------

function dire(html, ms = 4200) {
  const el = $('#ile-toast', scene);
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !html;
  el.classList.remove('montre');
  void el.offsetWidth;
  el.classList.add('montre');
  clearTimeout(dire.minuterie);
  if (html) dire.minuterie = setTimeout(() => { el.hidden = true; }, ms);
}

let dernieresRessources = null;
function majHud() {
  if (!scene) return;
  // ressources (en haut à droite), avec un petit saut quand elles montent
  const valeurs = {
    etoiles: etoilesTexte(), ...Object.fromEntries(RESSOURCES.map((r) => [r, modeDev() ? '∞' : String(E.ressources[r])])),
    pieces: modeDev() ? '∞' : String(soldePieces()),
  };
  for (const [r, v] of Object.entries(valeurs)) {
    const el = $(`.capsule[data-res="${r}"] b`, scene);
    if (!el || el.textContent === v) continue;
    const monte = dernieresRessources && Number(v) > Number(dernieresRessources[r]);
    el.textContent = v;
    el.closest('.capsule').setAttribute('aria-label', `${v} ${r === 'etoiles' ? 'étoiles' : NOMS_RESSOURCES[r]}`);
    if (monte && !reduit()) el.closest('.capsule').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 320 });
  }
  dernieresRessources = valeurs;
  const hab = $('.capsule[data-res="habitants"] b', scene);
  if (hab) hab.textContent = String(habitants(E));
  // niveau et beauté (en haut à gauche)
  const p = progressionIle(E);
  $('#ile-niveau-n', scene).textContent = String(p.niveau);
  $('#ile-beaute', scene).textContent = `Beauté ${p.beaute}`;
  $('#ile-jauge', scene).style.width = `${p.vers === null ? 100 : Math.round(((p.beaute - p.de) / (p.vers - p.de)) * 100)}%`;
  const prochain = paliers().find((x) => x.seuil > p.beaute);
  $('#ile-prochain', scene).textContent = prochain ? `${prochain.seuil} : ${prochain.nom}` : 'Tout est découvert !';
  // bâtisseurs
  const libres = batisseursLibres(E), total = batisseurs(E);
  $('#ile-batisseurs b', scene).textContent = `${libres}/${total}`;
  $('#ile-batisseurs', scene).classList.toggle('occupes', libres === 0);
  $('#ile-batisseurs', scene).setAttribute('aria-label', `Bâtisseurs libres : ${libres} sur ${total}`);
  // tout ramasser
  const t = maintenant();
  let q = 0;
  for (let n = 0; n < ouvertes(); n++) for (const k of Object.keys(E.iles[n].cases)) q += stock(E.iles[n], ...coord(k), t);
  const b = $('#ile-ramasser', scene);
  b.hidden = q === 0;
  $('#ile-ramasser .compte', scene).textContent = String(q);
  majRuban();
}

function majRuban() {
  if (!scene) return;
  const n = E.active, o = ouvertes();
  $('#ile-nom', scene).textContent = ILES[n].nom;
  $('#ile-prec', scene).hidden = o < 2;
  $('#ile-suiv', scene).hidden = o < 2;
  $('#ile-prec', scene).disabled = n === 0;
  $('#ile-suiv', scene).disabled = n >= o - 1;
}

/** Les capsules de ressources : l'icône à droite, le nombre en gros, comme dans les jeux de construction. */
function capsules() {
  const capsule = (res, ic, classe = '') => `<button class="capsule ${classe}" data-res="${res}"><b>0</b><span class="capsule-ic">${ic}</span></button>`;
  return [
    `<button class="capsule capsule-etoiles" data-res="etoiles" id="ile-etoiles" aria-label="Étoiles"><b>0</b><span class="capsule-ic">${icone('etoiles', 28)}</span></button>`,
    capsule('bois', tuile(ICONES_RES.bois, 46)),
    capsule('pierre', tuile(ICONES_RES.pierre, 46)),
    capsule('ble', tuile(ICONES_RES.ble, 46)),
    capsule('pieces', sprite(S.piece, 36)),
    capsule('habitants', sprite(S.habitant(4, 0), 34), 'petite'),
  ].join('');
}

// ---------- Sélection et actions (en bas au centre) ----------

function infosCase(n, k) {
  const ile = E.iles[n], [x, y] = coord(k), c = ile.cases[k], w = ile.travaux[k], t = maintenant();
  if (c) {
    const def = BATIMENTS[c.type] || DECORS[c.type];
    let sous = BATIMENTS[c.type] ? `Niveau ${c.niveau} sur ${niveauMax(c.type)}` : `${pointsCase(ile, x, y)} de beauté`;
    if (c.chantier) sous = c.niveau === 0 ? `En construction · ${duree(c.chantier.fin - t)}` : `Vers le niveau ${c.chantier.vers} · ${duree(c.chantier.fin - t)}`;
    return { nom: def.nom, sous };
  }
  if (w) return { nom: AMENAGEMENTS[w.action].nom, sous: `Encore ${duree(w.fin - t)}` };
  if (E.tresor && E.tresor.n === n && E.tresor.cle === k) return { nom: 'Une bouteille !', sous: 'Touchez-la' };
  const terrain = terrainDe(ile, x, y);
  if (terrain === 'eau') return { nom: estCote(ile, x, y) ? 'Bord de mer' : 'La mer', sous: estCote(ile, x, y) && estDebloque(E, 'port') ? 'On peut y construire un port' : '' };
  const sous = { foret: 'Du bois pour les bûcherons', montagne: 'De la pierre pour la carrière', buisson: 'Il a poussé tout seul', caillou: 'Ils gênent un peu' }[terrain] || '';
  return { nom: NOMS_TERRAIN[terrain], sous };
}

/** Les boutons ronds proposés pour la case choisie. */
function actionsPour(n, k) {
  const ile = E.iles[n], [x, y] = coord(k), c = ile.cases[k], w = ile.travaux[k], t = maintenant();
  const out = [];
  const prix = prixFinir(ile, x, y, t);
  if (c) {
    const bat = BATIMENTS[c.type];
    out.push({ id: 'info', texte: 'Infos', icone: ICONE.info, couleur: 'bleu' });
    if (bat && c.niveau > 0 && !c.chantier && c.niveau < niveauMax(c.type)) out.push({ id: 'ameliorer', texte: 'Améliorer', icone: ICONE.monter, couleur: 'vert', prix: bat.cout[c.niveau] });
    if (bat && stock(ile, x, y, t) > 0) out.push({ id: 'ramasser', texte: 'Ramasser', icone: ICONE.panier, couleur: 'vert' });
    if (prix !== null) out.push({ id: 'finir', texte: 'Finir', icone: ICONE.eclair, couleur: 'violet', prix: { etoiles: prix } });
    out.push({ id: 'deplacer', texte: 'Déplacer', icone: ICONE.deplacer, couleur: 'bleu' });
    out.push({ id: 'retirer', texte: 'Retirer', icone: ICONE.poubelle, couleur: 'rouge' });
    return out;
  }
  if (w) return prix !== null ? [{ id: 'finir', texte: 'Finir', icone: ICONE.eclair, couleur: 'violet', prix: { etoiles: prix } }] : [];
  const terrain = terrainDe(ile, x, y);
  const amenagement = (action) => {
    const a = AMENAGEMENTS[action];
    if (!peutAmenager(ile, x, y, action)) return;
    const gain = Object.entries(a.gain).map(([r, v]) => `+${v} ${NOMS_RESSOURCES[r]}`).join(' ');
    out.push({ id: `amenager:${action}`, texte: a.nom.replace(/ (la forêt|les rochers|des arbres|un étang|l’étang|les cailloux)$/, ''), image: sprite(OUTILS[action], 40), couleur: 'bois', prix: Object.keys(a.cout).length ? a.cout : null, note: gain });
  };
  if (terrain === 'herbe') {
    out.push({ id: 'construire-ici', texte: 'Construire', icone: ICONE.marteau, couleur: 'orange' });
    amenagement('planter');
    amenagement('creuser');
  } else if (terrain === 'foret') amenagement('abattre');
  else if (terrain === 'montagne') amenagement('casser');
  else if (terrain === 'etang') amenagement('combler');
  else if (terrain === 'buisson') amenagement('debroussailler');
  else if (terrain === 'caillou') amenagement('cailloux');
  else if (estCote(ile, x, y) && estDebloque(E, 'port')) out.push({ id: 'construire-ici', texte: 'Un port', icone: ICONE.marteau, couleur: 'orange' });
  return out;
}

let signatureActions = '';
function majActions(seulementSiChange = false) {
  const boite = $('#ile-actions', scene), etiquette = $('#ile-etiquette', scene);
  const sel = ui.mode === 'libre' ? ui.selection : null;
  if (!sel) {
    if (!boite.hidden || !etiquette.hidden) { boite.hidden = true; etiquette.hidden = true; signatureActions = ''; scene.classList.remove('choix-actif'); }
    return;
  }
  const infos = infosCase(sel.n, sel.cle);
  const actions = actionsPour(sel.n, sel.cle);
  const sig = `${sel.n}|${sel.cle}|${JSON.stringify(actions)}|${etoilesTexte()}|${JSON.stringify(E.ressources)}`;
  etiquette.innerHTML = `<b>${infos.nom}</b>${infos.sous ? `<small>${infos.sous}</small>` : ''}`;
  etiquette.hidden = false;
  if (seulementSiChange && sig === signatureActions) return;
  const nouveau = boite.hidden || !signatureActions.startsWith(`${sel.n}|${sel.cle}|`);
  signatureActions = sig;
  boite.innerHTML = actions.map((a) => `
    <button class="action ${a.couleur}" data-action="${a.id}">
      <span class="action-rond">${a.image || a.icone}</span>
      <span class="action-texte">${a.texte}</span>
      ${a.prix ? `<span class="action-prix">${coutHtml(a.prix, 16)}</span>` : a.note ? `<span class="action-prix"><span class="prix"><b>${a.note}</b></span></span>` : ''}
    </button>`).join('');
  boite.hidden = actions.length === 0;
  scene.classList.toggle('choix-actif', !boite.hidden);
  if (nouveau && !reduit()) {
    [...boite.children].forEach((b, i) => b.animate([{ transform: 'translateY(40px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, delay: i * 40, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' }));
  }
}

function choisir(n, k) {
  ui.selection = { n, cle: k };
  rendu.pop(n, k, 'choisi', temps);
  majActions();
  montrerCase(n, k);
}
function deselectionner() {
  ui.selection = null;
  majActions();
}

// ---------- Toucher le monde ----------

function cibleSous(p) {
  for (let i = rendu.cibles.length - 1; i >= 0; i--) {
    const c = rendu.cibles[i];
    if (p.x >= c.x0 - 6 && p.x <= c.x1 + 6 && p.y >= c.y0 - 6 && p.y <= c.y1 + 6) return c;
  }
  return null;
}

async function toucher(p) {
  if (ui.fenetre) return;
  fermerGuide();
  ui.inertie = null;
  const cible = cibleSous(p);
  if (cible?.genre === 'tresor') return ouvrirBouteille();
  const w = versMonde(cam, p.x, p.y);
  const sous = cible?.genre === 'bulle' ? { n: cible.n, cle: cible.cle } : caseSous(E, ouvertes(), w.x, w.y);
  if (ui.mode === 'poser' || ui.mode === 'deplacer') return toucherEnPose(sous);
  if (ui.mode === 'agrandir') return toucherEnAgrandissant(sous);
  if (!sous) {
    // une île encore dans les nuages ?
    for (let n = ouvertes(); n < E.iles.length; n++) {
      const r = rectIle(E.iles[n], n);
      if (w.x >= r.x0 && w.x < r.x1 && w.y >= r.y0 && w.y < r.y1) {
        const il = ILES[n], b = beauteTotale(E);
        return dire(`<b>${il.nom}</b> se découvrira quand votre île aura ${il.seuil} de beauté (encore ${il.seuil - b}).`);
      }
    }
    return deselectionner();
  }
  const ile = E.iles[sous.n], [x, y] = coord(sous.cle), c = ile.cases[sous.cle];
  // toucher un bâtiment qui a une récolte prête : on ramasse tout de suite
  if (c && BATIMENTS[c.type] && stock(ile, x, y, maintenant()) > 0 && !(ui.selection?.n === sous.n && ui.selection.cle === sous.cle)) {
    recolter(sous.n, sous.cle);
    return;
  }
  if (ui.selection && ui.selection.n === sous.n && ui.selection.cle === sous.cle) return deselectionner();
  if (sous.n !== E.active) { E.active = sous.n; majRuban(); }
  vibrer(8);
  choisir(sous.n, sous.cle);
}

async function action(id) {
  const sel = ui.selection;
  if (!sel) return;
  const { n, cle: k } = sel, ile = E.iles[n], [x, y] = coord(k), t = maintenant();
  if (id === 'info') return fenetreInfo(n, k);
  if (id === 'ameliorer') return fenetreAmelioration(n, k);
  if (id === 'ramasser') return recolter(n, k);
  if (id === 'deplacer') return commencerDeplacement(n, k);
  if (id === 'retirer') return retirerCase(n, k);
  if (id === 'construire-ici') return ouvrirBoutique({ n, cle: k, onglet: terrainDe(ile, x, y) === 'eau' ? 'batiments' : null });
  if (id === 'finir') {
    const prix = prixFinir(ile, x, y, t);
    if (!(await confirmer(`Finir tout de suite ?`, `Cela coûte ${pluriel(prix, 'étoile')}.`, `Finir (${prix} ★)`))) return;
    const r = finir(E, n, x, y, payerEtoiles, maintenant());
    if (!r.ok) return dire(`Il manque ${texteManque(r.manque || {})}. Jouez une partie pour gagner des étoiles.`);
    sauver();
    await tic();
    return;
  }
  if (id.startsWith('amenager:')) {
    const a = id.split(':')[1];
    const r = amenager(E, n, x, y, a, solde(), payerEtoiles, t);
    if (!r.ok) return dire(r.manque ? `Il manque ${texteManque(r.manque)}.` : 'Ce n’est pas possible ici.');
    sauver();
    rendu.pop(n, k, 'pose', temps);
    const c = centreCase(ile, n, x, y);
    rendu.gerbe(c.x, c.y, ['abattre', 'planter', 'debroussailler'].includes(a) ? 'feuilles' : ['casser', 'cailloux'].includes(a) ? 'cailloux' : 'poussiere', temps);
    vibrer(12);
    dire(`${AMENAGEMENTS[a].nom} : c’est parti, prêt dans ${duree(AMENAGEMENTS[a].minutes * MINUTE)}. Les habitants s’en occupent.`);
    vie.peupler(E);
    majHud();
    majActions();
  }
}

// ---------- Ramasser ----------

/** Des icônes de ressource volent d'un point du monde vers leur compteur, en haut à droite. */
function voler(depart, res, q) {
  if (reduit() || !scene) return Promise.resolve();
  const cible = $(`.capsule[data-res="${res}"] .capsule-ic`, scene);
  if (!cible) return Promise.resolve();
  const a = versEcran(cam, depart.x, depart.y), b = posScene(cible);
  const couche = $('.hud', scene), vols = [];
  for (let i = 0; i < Math.min(q, 6); i++) {
    const el = document.createElement('span');
    el.className = 'vol';
    el.innerHTML = icone(res, 30);
    el.style.left = `${a.x - 15}px`;
    el.style.top = `${a.y - 15}px`;
    couche.append(el);
    const ecart = (Math.random() - 0.5) * 60;
    vols.push(el.animate([
      { transform: 'translate(0, 0) scale(.5)', opacity: 0 },
      { transform: `translate(${ecart}px, -50px) scale(1.25)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(.8)`, opacity: 1 },
    ], { duration: 820, delay: i * 80, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'backwards' }).finished.then(() => el.remove(), () => el.remove()));
  }
  return Promise.all(vols).then(() => {
    const capsule = cible.closest('.capsule');
    capsule?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 260 });
  });
}

async function recolter(n, k) {
  const ile = E.iles[n], [x, y] = coord(k);
  const { res, n: q } = ramasser(E, n, x, y, maintenant());
  if (!q) return;
  if (res === 'pieces') ajouterPieces(q, 'atelier');
  sauver();
  vibrer(10);
  const c = centreCase(ile, n, x, y);
  rendu.texte(c.x, c.y - 0.6, `+${q} ${NOMS_RESSOURCES[res]}`, temps);
  rendu.gerbe(c.x, c.y - 0.4, 'etoiles', temps);
  dire(`+${q} ${NOMS_RESSOURCES[res]} !`, 2500);
  await voler(c, res, q);
  majHud();
  majActions();
}

async function toutRecolter() {
  const t = maintenant(), envols = [];
  for (let n = 0; n < ouvertes(); n++) {
    const ile = E.iles[n];
    for (const k of Object.keys(ile.cases)) {
      const q = stock(ile, ...coord(k), t);
      if (q) envols.push([centreCase(ile, n, ...coord(k)), BATIMENTS[ile.cases[k].type].prod.res, q]);
    }
  }
  const total = toutRamasser(E, t);
  if (!Object.keys(total).length) return;
  if (total.pieces) ajouterPieces(total.pieces, 'atelier');
  sauver();
  vibrer(15);
  dire(`Récolte : ${Object.entries(total).map(([r, q]) => `+${q} ${NOMS_RESSOURCES[r]}`).join(', ')} !`);
  for (const [c, , q] of envols) rendu.texte(c.x, c.y - 0.6, `+${q}`, temps);
  await Promise.all(envols.slice(0, 8).map(([c, r, q], i) => new Promise((ok) => setTimeout(ok, i * 110)).then(() => voler(c, r, q))));
  majHud();
  majActions();
}

async function ouvrirBouteille() {
  const tresor = E.tresor;
  if (!tresor) return;
  const ile = E.iles[tresor.n], [x, y] = coord(tresor.cle), c = centreCase(ile, tresor.n, x, y);
  const gain = ramasserTresor(E, maintenant());
  if (gain.etoiles) ajouterEtoiles(gain.etoiles, 'bouteille');
  sauver();
  vibrer(25);
  rendu.gerbe(c.x, c.y, 'eau', temps);
  rendu.gerbe(c.x, c.y - 0.3, 'etoiles', temps);
  const texte = Object.entries(gain).map(([r, q]) => `+${q} ${r === 'etoiles' ? '★' : NOMS_RESSOURCES[r]}`).join(', ');
  const messages = ['« Bonne journée à vous ! »', '« Un petit cadeau de la mer. »', '« Votre île est magnifique ! »', '« Pensée du jour : prenez votre temps. »', '« Avec l’amitié d’un vieux marin. »'];
  dire(`Dans la bouteille : <b>${texte}</b><br><small>${messages[Math.floor(Math.random() * messages.length)]}</small>`, 6000);
  await Promise.all(Object.entries(gain).map(([r, q]) => voler(c, r, q)));
  majHud();
}

// ---------- Poser une construction (le fantôme) ----------

function gainsPour(n, type) {
  const ile = E.iles[n], gains = new Map();
  for (let y = ile.ext.y0 - 1; y <= ile.ext.y1 + 1; y++) for (let x = ile.ext.x0 - 1; x <= ile.ext.x1 + 1; x++) {
    const g = apercu(ile, x, y, type);
    if (g !== null) gains.set(cle(x, y), g);
  }
  return gains;
}
function gainsDeplacement(n, de) {
  const ile = E.iles[n], gains = new Map();
  for (let y = ile.ext.y0 - 1; y <= ile.ext.y1 + 1; y++) for (let x = ile.ext.x0 - 1; x <= ile.ext.x1 + 1; x++) {
    const g = apercuDeplacement(ile, de, x, y);
    if (g !== null) gains.set(cle(x, y), g);
  }
  return gains;
}
/** La meilleure case : la plus belle, puis la plus proche du centre de l'écran. */
function meilleureDe(n, gains, preferee = null) {
  if (preferee && gains.has(preferee)) return preferee;
  const centre = versMonde(cam, cam.l / 2, cam.h / 2), ile = E.iles[n];
  let mieux = null, score = -Infinity;
  for (const [k, g] of gains) {
    const c = centreCase(ile, n, ...coord(k));
    const s = g * 10 - Math.hypot(c.x - centre.x, c.y - centre.y);
    if (s > score) { score = s; mieux = k; }
  }
  return mieux;
}

function entrerModePose(pose) {
  fermerGuide();
  ui.mode = pose.genre === 'deplacer' ? 'deplacer' : 'poser';
  ui.pose = pose;
  ui.selection = null;
  majActions();
  scene.classList.add('en-pose');
  const nom = pose.genre === 'deplacer' ? `Déplacer : ${nomDe(pose.type)}` : nomDe(pose.type);
  $('#ile-bandeau', scene).innerHTML = `<b>${nom}</b><span>touchez une case entourée</span>`;
  $('#ile-bandeau', scene).hidden = false;
  $('#ile-valider', scene).hidden = false;
  majValider();
  volerVers(cameraPourIle(pose.n));
  ouvrirCouche();
}
function sortirModePose(dejaRetire = false) {
  if (ui.mode !== 'poser' && ui.mode !== 'deplacer') return;
  if (!dejaRetire) fermerCouche();
  ui.mode = 'libre';
  ui.pose = null;
  scene.classList.remove('en-pose');
  $('#ile-bandeau', scene).hidden = true;
  $('#ile-valider', scene).hidden = true;
}
function majValider() {
  const ok = ui.mode === 'agrandir' ? Boolean(ui.agrandirChoix) : ui.pose && ui.pose.gains.has(ui.pose.cle);
  $('#ile-ok', scene).disabled = !ok;
}

async function commencerPose(genre, type, cible = null) {
  if (!estDebloque(E, type)) return dire(`Pas encore : il faut plus de beauté.`);
  const cout = coutDe(genre, type);
  if (!peutPayer(E, solde(), cout)) {
    return dire(`Il manque ${texteManque(manque(E, solde(), cout))}. ${cout.etoiles && manque(E, solde(), cout).etoiles ? 'Jouez une partie pour gagner des étoiles.' : 'Récoltez ou aménagez l’île.'}`);
  }
  if (BATIMENTS[type]?.unique && dejaConstruit(E, type)) return dire(`« ${nomDe(type)} » est déjà sur l’île : il n’y en a qu’un.`);
  if (genre === 'construire' && !batisseursLibres(E)) return fenetreBatisseurs(true);
  // l'île visée : celle de la case touchée, sinon celle qu'on regarde ; s'il n'y a plus de place, une autre île ouverte
  let n = cible?.n ?? E.active;
  let gains = gainsPour(n, type);
  if (!gains.size) {
    for (let m = 0; m < ouvertes() && !gains.size; m++) { gains = gainsPour(m, type); if (gains.size) n = m; }
  }
  if (!gains.size) return dire(BATIMENTS[type]?.cote ? 'Le port se construit au bord de l’île : il n’y a plus de place libre.' : 'Plus de place libre : abattez une forêt, comblez un étang ou agrandissez l’île.');
  const meilleur = Math.max(...gains.values());
  entrerModePose({ genre, type, n, gains, meilleur, cle: meilleureDe(n, gains, cible?.cle), image: imageType(type) });
}

function commencerDeplacement(n, k) {
  const c = E.iles[n].cases[k];
  const gains = gainsDeplacement(n, k);
  const img = imageCase(E.iles[n], ...coord(k), maintenant());
  entrerModePose({ genre: 'deplacer', type: c.type, n, de: k, gains, meilleur: Math.max(...gains.values()), cle: k, image: img });
}

function toucherEnPose(sous) {
  const p = ui.pose;
  if (!sous) return;
  if (sous.n !== p.n) {
    if (p.genre === 'deplacer') return dire('On déplace sur la même île.');
    const gains = gainsPour(sous.n, p.type);
    if (!gains.size) return dire('Plus de place sur cette île.');
    Object.assign(p, { n: sous.n, gains, meilleur: Math.max(...gains.values()), cle: meilleureDe(sous.n, gains, sous.cle) });
    E.active = sous.n;
    majRuban();
    return majValider();
  }
  if (sous.cle === p.cle && p.gains.has(p.cle)) return confirmerPose();
  if (!p.gains.has(sous.cle)) { dire('Choisissez une case entourée de pointillés.', 2500); return; }
  p.cle = sous.cle;
  vibrer(6);
  majValider();
}

async function confirmerPose() {
  const p = ui.pose;
  if (!p || !p.gains.has(p.cle)) return;
  const [x, y] = coord(p.cle), t = maintenant(), ile = E.iles[p.n], c = centreCase(ile, p.n, x, y);
  const avant = deblocages();
  if (p.genre === 'deplacer') {
    const r = deplacer(E, p.n, p.de, x, y);
    if (!r.ok) return;
    sauver();
    sortirModePose();
    rendu.pop(p.n, p.cle, 'pose', temps);
    rendu.gerbe(c.x, c.y + 0.3, 'poussiere', temps);
    if (r.gain) rendu.texte(c.x, c.y - 0.6, `${r.gain > 0 ? '+' : '−'}${Math.abs(r.gain)} beauté`, temps, r.gain > 0 ? '#ffe066' : '#ffffff');
    vibrer(15);
    vie.peupler(E);
    majHud();
    choisir(p.n, p.cle);
    await annoncerDeblocages(avant);
    return;
  }
  const r = p.genre === 'construire'
    ? construire(E, p.n, x, y, p.type, solde(), payerEtoiles, t)
    : decorer(E, p.n, x, y, p.type, solde(), payerEtoiles);
  if (!r.ok) {
    sortirModePose();
    if (r.raison === 'batisseurs') return fenetreBatisseurs(true);
    return dire(r.manque ? `Il manque ${texteManque(r.manque)}.` : 'Ce n’est pas possible ici.');
  }
  sauver();
  vibrer(18);
  rendu.pop(p.n, p.cle, 'pose', temps);
  rendu.gerbe(c.x, c.y + 0.3, 'poussiere', temps);
  if (p.genre === 'decorer') {
    rendu.gerbe(c.x, c.y - 0.2, 'etoiles', temps);
    rendu.texte(c.x, c.y - 0.6, `+${r.gain} beauté`, temps, '#ffe066');
    // on garde la décoration en main si l'on peut en poser une autre
    const gains = gainsPour(p.n, p.type);
    if (peutPayer(E, solde(), coutDe('decorer', p.type)) && gains.size) {
      Object.assign(p, { gains, meilleur: Math.max(...gains.values()), cle: meilleureDe(p.n, gains) });
      majValider();
      dire(`+${r.gain} de beauté ! Vous pouvez en poser une autre, ou toucher ✗.`);
    } else {
      sortirModePose();
      dire(`+${r.gain} de beauté !`);
    }
  } else {
    sortirModePose();
    dire(`Le chantier commence : prêt dans ${duree(dureeChantier(p.type, 1))}. Un bâtisseur s’en occupe.`);
  }
  vie.peupler(E);
  majHud();
  await annoncerDeblocages(avant);
}

// ---------- Agrandir l'île, case par case ----------

function bandeauAgrandir() {
  const ile = E.iles[ui.agrandir];
  $('#ile-bandeau', scene).innerHTML = casesAchetables(ile).length
    ? `<b>Agrandir l’île</b><span>touchez une case marquée <b class="plus">+</b></span><span class="bandeau-prix">la case : ${coutHtml(coutCase(ile), 18)}</span>`
    : '<b>Agrandir l’île</b><span>elle est déjà au plus grand</span>';
}
function commencerAgrandir() {
  fermerGuide();
  ui.mode = 'agrandir';
  ui.agrandir = E.active;
  ui.agrandirChoix = null;
  ui.selection = null;
  majActions();
  scene.classList.add('en-pose');
  bandeauAgrandir();
  $('#ile-bandeau', scene).hidden = false;
  $('#ile-terminer', scene).hidden = false;
  volerVers(cameraPourIle(E.active, 1.4, CADRE_AGRANDIR));
  ouvrirCouche();
}
function finirAgrandir(dejaRetire = false) {
  if (ui.mode !== 'agrandir') return;
  if (!dejaRetire) fermerCouche();
  ui.mode = 'libre';
  ui.agrandir = null;
  ui.agrandirChoix = null;
  scene.classList.remove('en-pose');
  $('#ile-bandeau', scene).hidden = true;
  $('#ile-terminer', scene).hidden = true;
  $('#ile-valider', scene).hidden = true;
}
/** Une case à vendre : on la choisit (elle s'éclaire, avec son prix), puis on confirme avec ✓ ou en la touchant encore. */
function toucherEnAgrandissant(sous) {
  if (sous && sous.n !== ui.agrandir && sous.n < ouvertes()) {
    ui.agrandir = sous.n;
    ui.agrandirChoix = null;
    E.active = sous.n;
    majRuban();
    bandeauAgrandir();
    $('#ile-valider', scene).hidden = true;
  }
  if (!sous || !peutAcheter(E.iles[sous.n], ...coord(sous.cle))) {
    ui.agrandirChoix = null;
    $('#ile-valider', scene).hidden = true;
    return dire('Touchez une case d’eau marquée d’un +, au bord de l’île.', 2500);
  }
  if (ui.agrandirChoix === sous.cle) return acheter();
  ui.agrandirChoix = sous.cle;
  vibrer(6);
  $('#ile-valider', scene).hidden = false;
  majValider();
}
async function acheter() {
  const n = ui.agrandir, k = ui.agrandirChoix;
  if (n === null || !k) return;
  const ile = E.iles[n], [x, y] = coord(k), cout = coutCase(ile);
  const avant = deblocages();
  const r = acheterCase(E, n, x, y, solde(), payerEtoiles);
  if (!r.ok) {
    return dire(r.manque
      ? `Il manque ${texteManque(r.manque)}. ${r.manque.etoiles ? 'Jouez une partie pour gagner des étoiles.' : 'Cassez des rochers ou ramassez des cailloux pour la pierre.'}`
      : 'Cette case ne peut pas être achetée.');
  }
  sauver();
  vibrer(25);
  ui.agrandirChoix = null;
  $('#ile-valider', scene).hidden = true;
  rendu.pop(n, k, 'terre', temps);
  const c = centreCase(ile, n, x, y);
  rendu.gerbe(c.x, c.y, 'eau', temps);
  rendu.texte(c.x, c.y - 0.6, `−${cout.etoiles}★ −${cout.pierre} pierre`, temps);
  vie.peupler(E);
  majHud();
  bandeauAgrandir();
  dire('Une case de plus : l’île grandit !', 2500);
  await annoncerDeblocages(avant);
}

// ---------- Retirer ----------

async function retirerCase(n, k) {
  const c = E.iles[n].cases[k], def = BATIMENTS[c.type] || DECORS[c.type];
  if (!(await confirmer(`Retirer « ${def.nom} » ?`, 'Vous récupérez tout ce qu’il a coûté.', 'Oui, retirer', 'rouge'))) return;
  const ile = E.iles[n], [x, y] = coord(k), centre = centreCase(ile, n, x, y);
  const rendu2 = retirer(E, n, x, y);
  if (rendu2?.etoiles) ajouterEtoiles(rendu2.etoiles, 'remboursement');
  sauver();
  rendu.gerbe(centre.x, centre.y, 'poussiere', temps);
  rendu.pop(n, k, 'pose', temps);
  deselectionner();
  vie.peupler(E);
  majHud();
  dire('C’est retiré : tout vous a été rendu.');
}

// ---------- Le bouton Retour du téléphone ferme d'abord ce qui est ouvert ----------
// Chaque fenêtre (et chaque pose) ajoute une étape à l'historique, sans changer l'adresse : « Retour » la referme
// au lieu de quitter l'île. Quand on la ferme soi-même, on retire l'étape (et l'on ignore le « popstate » qui suit).
let couches = 0, popIgnores = 0, apresRetour = [];
function ouvrirCouche() {
  history.pushState({ ile: true }, '');
  couches++;
}
function fermerCouche(ensuite = null) {
  if (couches <= 0) { ensuite?.(); return; }
  couches--;
  popIgnores++;
  apresRetour.push(ensuite);
  history.back();
}
function surRetour() {
  if (popIgnores) { popIgnores--; apresRetour.shift()?.(); return; }
  if (couches <= 0 || !scene) return; // une vraie navigation : app.js s'en occupe (changement d'adresse)
  couches--;
  if (ui.fenetre) ui.fermerFenetre?.('', { dejaRetire: true });
  else if (ui.mode === 'poser' || ui.mode === 'deplacer') sortirModePose(true);
  else if (ui.mode === 'agrandir') finirAgrandir(true);
}

// ---------- Fenêtres ----------

/**
 * Une fenêtre dans la scène (elle tourne avec elle).
 * @returns {Promise<string>} l'identifiant du bouton touché ('' si fermée)
 */
function fenetre({ titre, corps, boutons = [], classe = '', large = false }) {
  const fond = $('#ile-fenetre', scene);
  return new Promise((ok) => {
    ui.fenetre = true;
    fond.hidden = false;
    fond.className = `ile-fenetre ${large === true ? 'large' : large ? `large-${large}` : ''}`;
    fond.innerHTML = `
      <div class="panneau ${classe}" role="dialog" aria-modal="true" aria-labelledby="ile-fen-titre">
        <header><h3 id="ile-fen-titre">${titre}</h3><button class="fermer" data-r="" aria-label="Fermer">${ICONE.croix}</button></header>
        <div class="panneau-corps">${corps}</div>
        ${boutons.length ? `<footer>${boutons.map((b) => `<button class="gros ${b.classe || 'gris'}" data-r="${b.id}" ${b.desactive ? 'disabled' : ''}>${b.texte}</button>`).join('')}</footer>` : ''}
      </div>`;
    const panneau = fond.firstElementChild;
    if (!reduit()) panneau.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1.03)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out' });
    ouvrirCouche();
    const fermer = (r, { dejaRetire = false, ensuite = null } = {}) => {
      if (dejaRetire) ensuite?.(); else fermerCouche(ensuite);
      fond.removeEventListener('click', clic);
      ui.fermerFenetre = null;
      ui.fenetre = false;
      fond.hidden = true;
      fond.innerHTML = '';
      ok(r);
    };
    const clic = (e) => {
      const b = e.target.closest('[data-r]');
      if (b && !b.disabled) return fermer(b.dataset.r);
      if (e.target === fond) fermer('');
      // les autres boutons (cartes de la boutique…) sont gérés par qui a ouvert la fenêtre
    };
    fond.addEventListener('click', clic);
    ui.fermerFenetre = fermer;
    (panneau.querySelector('footer .vert') || panneau.querySelector('footer button') || panneau.querySelector('.fermer'))?.focus({ preventScroll: true });
  });
}
const confirmer = async (titre, texte, oui, couleur = 'vert') => (await fenetre({ titre, corps: `<p>${texte}</p>`, boutons: [{ id: 'non', texte: 'Non' }, { id: 'oui', texte: oui, classe: couleur }] })) === 'oui';

function fenetreInfo(n, k) {
  const ile = E.iles[n], [x, y] = coord(k), c = ile.cases[k], t = maintenant();
  const bat = BATIMENTS[c.type], def = bat || DECORS[c.type];
  const lignes = [];
  lignes.push(`<li><span>Beauté rapportée</span><b>${pointsCase(ile, x, y)}</b></li>`);
  if (bat) {
    lignes.push(`<li><span>Niveau</span><b>${c.niveau} sur ${niveauMax(c.type)}</b></li>`);
    if (bat.habitants && c.niveau) lignes.push(`<li><span>Habitants</span><b>${bat.habitants * c.niveau}</b></li>`);
    if (bat.prod && c.niveau) {
      lignes.push(produit(ile, x, y)
        ? `<li><span>Production</span><b>1 ${NOMS_RESSOURCES[bat.prod.res]} toutes les ${duree(periode(c))}</b></li><li><span>Réserve</span><b>${stock(ile, x, y, t)} sur ${plafond(c)}</b></li>`
        : `<li class="alerte"><span>Ne produit rien</span><b>Il faut ${bat.prod.besoin === 'foret' ? 'une forêt à deux cases au plus' : 'des rochers juste à côté'}</b></li>`);
    }
    if (c.chantier) lignes.push(`<li><span>${c.niveau === 0 ? 'Construction' : `Vers le niveau ${c.chantier.vers}`}</span><b>encore ${duree(c.chantier.fin - t)}</b></li>`);
  }
  const aime = Object.entries(def.aime || {});
  const voisins = voisinsDe(x, y).map(([vx, vy]) => { const v = ile.cases[cle(vx, vy)]; return v && v.niveau > 0 ? v.type : terrainDe(ile, vx, vy); });
  const nomAime = (k2) => (BATIMENTS[k2] || DECORS[k2])?.nom || { foret: 'Forêt', montagne: 'Rochers', etang: 'Étang', herbe: 'Herbe' }[k2] || k2;
  const imgAime = (k2) => (BATIMENTS[k2] || DECORS[k2] ? imageHtml(imageType(k2), 36) : imageHtml(imageCase({ cases: {}, travaux: {}, terre: { '0,0': 1 }, terrain: { '0,0': k2 }, ext: { x0: 0, y0: 0, x1: 0, y1: 0 } }, 0, 0, t), 36));
  fenetre({
    titre: def.nom,
    large: 'moyen',
    corps: `<div class="deux-colonnes"><div class="gauche fiche-tete">${imageHtml(imageCase(ile, x, y, t), 96)}<p class="fiche-desc">${def.desc}.</p></div><div>
      <ul class="fiche-lignes">${lignes.join('')}</ul>
      ${aime.length ? `<p class="fiche-sous">Aime avoir à côté (chaque voisin rapporte de la beauté) :</p>
      <ul class="aime">${aime.map(([k2, v]) => `<li class="${voisins.includes(k2) ? 'ok' : ''}">${imgAime(k2)}<span>${nomAime(k2)}</span><b>+${v}</b></li>`).join('')}</ul>` : ''}</div></div>`,
    boutons: [{ id: 'ok', texte: 'Fermer', classe: 'bleu' }],
  });
}

async function fenetreAmelioration(n, k) {
  const ile = E.iles[n], [x, y] = coord(k), c = ile.cases[k], bat = BATIMENTS[c.type];
  const vers = c.niveau + 1, cout = bat.cout[c.niveau];
  const lignes = [`<li><span>Beauté de base</span><b>${bat.base * c.niveau} <i>→</i> <em>${bat.base * vers}</em></b></li>`];
  if (bat.habitants) lignes.push(`<li><span>Habitants</span><b>${bat.habitants * c.niveau} <i>→</i> <em>${bat.habitants * vers}</em></b></li>`);
  if (bat.prod) {
    lignes.push(`<li><span>Production</span><b>1 ${NOMS_RESSOURCES[bat.prod.res]} / ${duree(periode(c))} <i>→</i> <em>${duree(periode({ ...c, niveau: vers }))}</em></b></li>`);
    lignes.push(`<li><span>Réserve</span><b>${plafond(c)} <i>→</i> <em>${plafond({ ...c, niveau: vers })}</em></b></li>`);
  }
  lignes.push(`<li><span>Durée des travaux</span><b>${duree(dureeChantier(c.type, vers))}</b></li>`);
  const payable = peutPayer(E, solde(), cout), libres = batisseursLibres(E);
  const r = await fenetre({
    titre: `Améliorer : ${bat.nom}`,
    large: 'moyen',
    corps: `<div class="deux-colonnes"><div class="gauche"><div class="evolution">
        <figure>${imageHtml(imageType(c.type, c.niveau), 88)}<figcaption>Niveau ${c.niveau}</figcaption></figure>
        <span class="evolution-fleche" aria-hidden="true">${ICONE.droite}</span>
        <figure class="suivant">${imageHtml(imageType(c.type, vers), 88)}<figcaption>Niveau ${vers}</figcaption></figure>
      </div><p class="prix-ligne">${coutHtml(cout, 26)}</p></div><div>
      <ul class="fiche-lignes">${lignes.join('')}</ul>
      ${!payable ? `<p class="alerte-texte">Il manque ${texteManque(manque(E, solde(), cout))}.</p>` : !libres ? '<p class="alerte-texte">Tous les bâtisseurs sont occupés.</p>' : ''}</div></div>`,
    boutons: [{ id: 'non', texte: 'Plus tard' }, !payable || libres ? { id: 'oui', texte: 'Améliorer', classe: 'vert', desactive: !payable } : { id: 'batisseurs', texte: 'Bâtisseurs', classe: 'orange' }],
  });
  if (r === 'batisseurs') return fenetreBatisseurs(true);
  if (r !== 'oui') return;
  const res = ameliorer(E, n, x, y, solde(), payerEtoiles, maintenant());
  if (!res.ok) return res.raison === 'batisseurs' ? fenetreBatisseurs(true) : dire(res.manque ? `Il manque ${texteManque(res.manque)}.` : 'Pas possible pour l’instant.');
  sauver();
  vibrer(18);
  const centre = centreCase(ile, n, x, y);
  rendu.pop(n, k, 'fini', temps);
  rendu.gerbe(centre.x, centre.y, 'poussiere', temps);
  dire(`Les travaux commencent : niveau ${vers} dans ${duree(c.chantier.fin - maintenant())}.`);
  vie.peupler(E);
  majHud();
  majActions();
}

async function fenetreBatisseurs(occupes = false) {
  const t = maintenant(), liste = chantiers(E), prix = prixBatisseur(E);
  const lignes = liste.map((ch) => {
    const c = E.iles[ch.n].cases[ch.cle], [x, y] = coord(ch.cle);
    const p = prixFinir(E.iles[ch.n], x, y, t);
    return `<li>${imageHtml(imageType(c.type, Math.max(1, c.chantier.vers)), 44)}<span><b>${BATIMENTS[c.type].nom}</b><small>${c.niveau === 0 ? 'Construction' : `Niveau ${c.chantier.vers}`} · encore ${duree(ch.fin - t)}</small></span>
      <button class="petit-bouton bleu" data-voir="${ch.n}|${ch.cle}">Voir</button><button class="petit-bouton violet" data-finir="${ch.n}|${ch.cle}">${ICONE.eclair}${p} ★</button></li>`;
  });
  const fond = $('#ile-fenetre', scene);
  const surClic = async (e) => {
    const v = e.target.closest('[data-voir]'), f = e.target.closest('[data-finir]');
    if (!v && !f) return;
    const [n, k] = (v || f).dataset[v ? 'voir' : 'finir'].split('|');
    ui.fermerFenetre?.('');
    if (v) { choisir(Number(n), k); montrerCase(Number(n), k, Math.max(cam.z, 56)); return; }
    const [x, y] = coord(k);
    const r = finir(E, Number(n), x, y, payerEtoiles, maintenant());
    if (!r.ok) return dire(`Il manque ${texteManque(r.manque || {})}.`);
    sauver();
    await tic();
  };
  fond.addEventListener('click', surClic);
  const r = await fenetre({
    titre: 'Les bâtisseurs',
    corps: `${occupes ? '<p class="alerte-texte">Tous les bâtisseurs sont occupés. Attendez un peu, finissez un chantier, ou engagez-en un de plus.</p>' : ''}
      <p>${pluriel(batisseurs(E), 'bâtisseur')} sur l’île : chacun mène un chantier à la fois. Défricher, planter ou creuser ne les occupe pas.</p>
      ${lignes.length ? `<ul class="liste-chantiers">${lignes.join('')}</ul>` : '<p class="petit">Aucun chantier en cours : ils attendent vos ordres !</p>'}`,
    boutons: prix !== null ? [{ id: 'non', texte: 'Fermer' }, { id: 'engager', texte: `Engager un bâtisseur · ${prix} ★`, classe: 'vert', desactive: solde() < prix }] : [{ id: 'non', texte: 'Fermer', classe: 'bleu' }],
  });
  fond.removeEventListener('click', surClic);
  if (r === 'engager') {
    const res = engagerBatisseur(E, payerEtoiles);
    if (!res.ok) return dire(`Il manque ${texteManque(res.manque || {})}.`);
    sauver();
    majHud();
    vibrer(20);
    rendu.gerbe(cam.x, cam.y, 'confettis', temps);
    dire('Un nouveau bâtisseur arrive sur l’île !');
  }
}

/** La boutique : de grandes cartes qu'on fait défiler, par catégorie. */
async function ouvrirBoutique(cible = null) {
  ui.boutique = { onglet: cible?.onglet || ui.boutique?.onglet || 'batiments', cible };
  const dessiner = () => {
    const { onglet } = ui.boutique;
    let cartes = '';
    if (onglet === 'batiments' || onglet === 'decors') {
      const liste = onglet === 'batiments' ? ORDRE_BATIMENTS : ORDRE_DECORS;
      for (const type of liste) {
        const bat = BATIMENTS[type], def = bat || DECORS[type], ouvert = estDebloque(E, type);
        const cout = bat ? bat.cout[0] : def.cout;
        const nb = E.iles.reduce((s, ile) => s + Object.values(ile.cases).filter((c) => c.type === type).length, 0);
        if (bat?.unique && nb) {
          cartes += `<button class="carte construit" data-unique="${type}">
            <span class="carte-image">${imageHtml(imageType(type), 84)}</span><span class="carte-nom">${def.nom}</span>
            <span class="carte-desc">${def.desc}</span><span class="carte-prix"><b>Déjà sur l’île</b></span></button>`;
          continue;
        }
        const infos = bat
          ? [`${ICONE.etoile}<span>Beauté ${bat.base}+</span>`, `${ICONE.horloge}<span>${duree(dureeChantier(type, 1))}</span>`]
          : [`${ICONE.etoile}<span>Beauté ${def.beaute}+</span>`];
        cartes += `<button class="carte ${ouvert ? '' : 'verrou'} ${ouvert && !peutPayer(E, solde(), cout) ? 'cher' : ''}" data-genre="${bat ? 'construire' : 'decorer'}" data-type="${type}" ${ouvert ? '' : 'aria-disabled="true"'}>
          <span class="carte-image">${imageHtml(imageType(type), 84)}</span>
          <span class="carte-nom">${def.nom}</span>
          <span class="carte-infos">${infos.map((i) => `<span>${i}</span>`).join('')}</span>
          <span class="carte-desc">${def.desc}</span>
          ${nb ? `<span class="carte-nb">${nb} sur l’île</span>` : ''}
          <span class="carte-prix">${ouvert ? coutHtml(cout, 20) : `${ICONE.cadenas}<span>Beauté ${def.debloque}</span>`}</span>
        </button>`;
      }
    } else {
      const ile = E.iles[E.active], prix = prixBatisseur(E);
      cartes += `<button class="carte" data-special="agrandir"><span class="carte-image grand-ic">${ICONE.agrandir}</span><span class="carte-nom">Agrandir l’île</span>
        <span class="carte-desc">Choisissez les cases d’eau qui deviennent de la terre, une à une.</span><span class="carte-prix">${coutHtml(coutCase(ile), 20)}<small>la case</small></span></button>`;
      cartes += `<button class="carte" data-special="batisseurs"><span class="carte-image">${sprite(S.habitant(3, 3), 84)}</span><span class="carte-nom">Bâtisseurs</span>
        <span class="carte-desc">${batisseurs(E)} au travail. Chacun mène un chantier à la fois.</span><span class="carte-prix">${prix !== null ? coutHtml({ etoiles: prix }, 20) : '<b>Au complet</b>'}</span></button>`;
      cartes += `<button class="carte" data-special="progression"><span class="carte-image grand-ic or">${ICONE.etoile}</span><span class="carte-nom">Ce qui vous attend</span>
        <span class="carte-desc">Tout ce que la beauté de l’île va débloquer.</span><span class="carte-prix"><b>Voir</b></span></button>`;
    }
    const corps = $('#ile-fenetre .panneau-corps', scene);
    corps.innerHTML = `<div class="onglets" role="tablist">
        ${[['batiments', 'Bâtiments'], ['decors', 'Décorations'], ['ile', 'L’île']].map(([id, nom]) => `<button role="tab" data-onglet="${id}" aria-selected="${id === onglet}">${nom}</button>`).join('')}
      </div>
      <div class="rayon"><button class="defiler gauche" data-defiler="-1" aria-label="Voir les précédents">${ICONE.gauche}</button>
        <div class="cartes">${cartes}</div>
        <button class="defiler droite" data-defiler="1" aria-label="Voir les suivants">${ICONE.droite}</button></div>`;
    const rayon = $('.cartes', corps);
    const majDefiler = () => {
      $('.defiler.gauche', corps).disabled = rayon.scrollLeft < 8;
      $('.defiler.droite', corps).disabled = rayon.scrollLeft + rayon.clientWidth > rayon.scrollWidth - 8;
    };
    rayon.addEventListener('scroll', majDefiler, { passive: true });
    majDefiler();
    if (!reduit()) [...rayon.children].forEach((c, i) => c.animate([{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, delay: i * 35, easing: 'ease-out', fill: 'backwards' }));
  };
  const promesse = fenetre({ titre: 'Construire', corps: '', classe: 'boutique', large: true });
  dessiner();
  const fond = $('#ile-fenetre', scene);
  const surClic = (e) => {
    const o = e.target.closest('[data-onglet]');
    if (o) { ui.boutique.onglet = o.dataset.onglet; return dessiner(); }
    const d = e.target.closest('[data-defiler]');
    if (d) { const r = $('.cartes', fond); r.scrollBy({ left: Number(d.dataset.defiler) * r.clientWidth * 0.8, behavior: reduit() ? 'auto' : 'smooth' }); return; }
    const s = e.target.closest('[data-special]');
    if (s) { ui.fermerFenetre(''); ui.apresBoutique = s.dataset.special; return; }
    const unique = e.target.closest('[data-unique]');
    if (unique) return dire(`« ${nomDe(unique.dataset.unique)} » est déjà sur l’île : touchez-le pour l’améliorer.`);
    const carte = e.target.closest('.carte[data-type]');
    if (!carte) return;
    const { genre, type } = carte.dataset;
    if (!estDebloque(E, type)) {
      carte.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return dire(`« ${nomDe(type)} » se débloque à ${(BATIMENTS[type] || DECORS[type]).debloque} de beauté.`);
    }
    const cout = coutDe(genre, type);
    if (!peutPayer(E, solde(), cout)) {
      carte.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      const m = manque(E, solde(), cout);
      return dire(`Il manque ${texteManque(m)}. ${m.etoiles ? 'Touchez « Jouer » pour gagner des étoiles.' : 'Récoltez, abattez une forêt ou cassez des rochers.'}`);
    }
    ui.fermerFenetre('');
    ui.apresBoutique = { genre, type };
  };
  fond.addEventListener('click', surClic);
  ui.apresBoutique = null;
  await promesse;
  fond.removeEventListener('click', surClic);
  const suite = ui.apresBoutique;
  ui.apresBoutique = null;
  if (suite === 'agrandir') return commencerAgrandir();
  if (suite === 'batisseurs') return fenetreBatisseurs();
  if (suite === 'progression') return fenetreProgression();
  if (suite) return commencerPose(suite.genre, suite.type, ui.boutique.cible);
}

function fenetreProgression() {
  const p = progressionIle(E);
  const liste = paliers().map((x) => {
    const ok = p.beaute >= x.seuil;
    const img = x.genre === 'ile' ? `<span class="mini-ile">${tuile(T.herbe, 40)}</span>` : imageHtml(imageType(x.type), 40);
    return `<li class="${ok ? 'ok' : ''}">${img}<span><b>${x.nom}</b><small>${x.genre === 'ile' ? 'Une nouvelle île' : x.genre === 'decor' ? 'Décoration' : 'Bâtiment'}</small></span><em>${ok ? ICONE.coche : `${x.seuil}`}</em></li>`;
  }).join('');
  fenetre({
    titre: `Île de niveau ${p.niveau}`,
    corps: `<p>Chaque construction et chaque décoration rend l’île plus belle, surtout à côté des voisins qu’elle aime. La beauté débloque de nouvelles choses :</p>
      <div class="jauge-grande"><i style="width:${p.vers === null ? 100 : Math.round(((p.beaute - p.de) / (p.vers - p.de)) * 100)}%"></i><span>Beauté ${p.beaute}${p.vers !== null ? ` / ${p.vers}` : ''}</span></div>
      <ul class="paliers">${liste}</ul>`,
    boutons: [{ id: 'ok', texte: 'Fermer', classe: 'bleu' }],
  });
}

function fenetreJouer() {
  const cartes = [
    `<button class="jeu" data-aller="niveaux"><span class="jeu-ic aventure">${ICONE.etoile}</span><span><b>Aventure</b><small>Les niveaux du jour</small></span></button>`,
    ...JEUX.filter((j) => !j.bientot).map((j) => `<button class="jeu" data-aller="${j.id}"><span class="jeu-ic">${j.icone}</span><span><b>${j.nom}</b><small>${j.resume?.() || j.description || ''}</small></span></button>`),
  ].join('');
  const fond = $('#ile-fenetre', scene);
  const surClic = (e) => {
    const b = e.target.closest('[data-aller]');
    if (!b) return;
    const vers = b.dataset.aller;
    ui.fermerFenetre('', { ensuite: () => { quitterPleinEcran(); location.hash = `#/${vers}`; } });
  };
  fond.addEventListener('click', surClic);
  fenetre({ titre: 'Jouer pour gagner des étoiles', corps: `<p class="intro-jouer">Chaque partie rapporte des étoiles : revenez ensuite les dépenser sur l’île.</p><div class="jeux">${cartes}</div>`, large: true })
    .then(() => fond.removeEventListener('click', surClic));
}

// ---------- Le guide ----------

function montrerGuide(texte, cible = null, ms = 9000) {
  if (!scene || ui.mode !== 'libre' || ui.fenetre) return; // pas pendant qu'on pose ou qu'une fenêtre est ouverte
  const g = $('#ile-guide', scene);
  $('#ile-guide p', scene).innerHTML = texte;
  g.hidden = false;
  if (!reduit()) g.animate([{ transform: 'translateY(20px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.34, 1.56, .64, 1)' });
  ui.guide = { cible };
  $$('.hud .appel', scene).forEach((b) => b.classList.remove('appel'));
  if (cible?.genre === 'bouton') $(`#ile-${cible.id}`, scene)?.classList.add('appel');
  if (cible?.genre === 'case') montrerCase(cible.n, cible.cle);
  clearTimeout(montrerGuide.minuterie);
  if (ms) montrerGuide.minuterie = setTimeout(fermerGuide, ms);
}
function fermerGuide() {
  if (!ui?.guide || !scene) return;
  ui.guide = null;
  $('#ile-guide', scene).hidden = true;
  $$('.hud .appel', scene).forEach((b) => b.classList.remove('appel'));
}
function donnerConseil() {
  const c = conseil(E, solde(), maintenant(), E.active);
  montrerGuide(c.texte, c.cible);
}

// ---------- Module ----------

function construireScene() {
  racine.innerHTML = `
    <div class="ile-scene">
      <canvas class="ile-toile" aria-label="Votre île. Faites glisser pour vous déplacer, touchez pour choisir."></canvas>
      <div class="hud">
        <div class="hud-hg">
          <button class="rond bleu" id="ile-accueil" aria-label="Retour à l’accueil">${ICONE.maison}</button>
          <button class="niveau" id="ile-niveau" aria-label="Niveau de l’île et ce qu’il débloque">
            <span class="niveau-badge"><b id="ile-niveau-n">1</b></span>
            <span class="niveau-info"><b id="ile-beaute">Beauté 0</b><span class="jauge"><i id="ile-jauge"></i></span><small id="ile-prochain"></small></span>
          </button>
          <button class="pastille-batisseurs" id="ile-batisseurs">${sprite(S.habitant(3, 3), 30)}<b>2/2</b></button>
        </div>
        <div class="hud-hc">
          <div class="ruban">
            <button class="ruban-fleche" id="ile-prec" aria-label="Île précédente">${ICONE.gauche}</button>
            <button class="ruban-nom" id="ile-nom" aria-label="Revenir au centre de l’île"></button>
            <button class="ruban-fleche" id="ile-suiv" aria-label="Île suivante">${ICONE.droite}</button>
          </div>
        </div>
        <div class="hud-hd" id="ile-res">${capsules()}</div>
        <div class="hud-bg">
          <button class="gros-bouton jouer" id="ile-jouer"><span class="gb-ic">${ICONE.etoile}</span><span>Jouer</span></button>
          <button class="rond jaune" id="ile-conseil" aria-label="Un conseil">${ICONE.ampoule}</button>
        </div>
        <div class="hud-bd">
          <button class="rond vert" id="ile-ramasser" aria-label="Tout ramasser" hidden>${ICONE.panier}<span class="compte">0</span></button>
          <button class="gros-bouton construire" id="ile-construire"><span class="gb-ic">${ICONE.marteau}</span><span>Construire</span></button>
        </div>
        <div class="hud-actions" id="ile-actions" hidden></div>
        <div class="hud-etiquette" id="ile-etiquette" hidden></div>
        <div class="hud-valider" id="ile-valider" hidden>
          <button class="rond rouge" id="ile-annuler" aria-label="Annuler">${ICONE.croix}</button>
          <button class="rond vert grand" id="ile-ok" aria-label="Poser ici">${ICONE.coche}</button>
        </div>
        <div class="hud-bandeau" id="ile-bandeau" hidden></div>
        <button class="gros-bouton terminer" id="ile-terminer" hidden><span class="gb-ic">${ICONE.coche}</span><span>Terminé</span></button>
        <p class="hud-toast" id="ile-toast" aria-live="polite" hidden></p>
        <div class="hud-guide" id="ile-guide" hidden>
          <span class="guide-tete">${sprite(S.habitant(4, 0), 64)}</span>
          <p></p>
          <button class="guide-fermer" aria-label="Fermer le conseil">${ICONE.croix}</button>
        </div>
      </div>
      <div class="ile-fenetre" id="ile-fenetre" hidden></div>
    </div>`;
  scene = $('.ile-scene', racine);
  toile = $('.ile-toile', scene);
}

function brancher() {
  const reveiller = () => { derniereAction = performance.now(); };
  scene.addEventListener('pointerdown', reveiller, true);
  scene.addEventListener('wheel', reveiller, { capture: true, passive: true });
  suivreGestes(toile, versScene, {
    toucher: (p) => toucher(p),
    debutGlisse(p) {
      ui.vol = null;
      ui.inertie = null;
      if ((ui.mode === 'poser' || ui.mode === 'deplacer') && ui.pose) {
        const w = versMonde(cam, p.x, p.y), sous = caseSous(E, ouvertes(), w.x, w.y);
        if (sous && sous.n === ui.pose.n && sous.cle === ui.pose.cle) return 'objet';
      }
      return 'camera';
    },
    glisse(p, dx, dy, genre) {
      if (genre === 'objet') {
        const w = versMonde(cam, p.x, p.y - cam.z * 0.3), sous = caseSous(E, ouvertes(), w.x, w.y);
        if (sous && sous.n === ui.pose.n && sous.cle !== ui.pose.cle) { ui.pose.cle = sous.cle; majValider(); }
        return;
      }
      cam = { ...cam, x: cam.x - dx / cam.z, y: cam.y - dy / cam.z };
      fermerGuide();
    },
    finGlisse(vx, vy, genre) {
      if (genre === 'camera' && !reduit()) ui.inertie = { vx, vy };
    },
    pince(c, facteur, dx, dy) {
      const { min, max } = limitesZoom();
      cam = zoomAutour({ ...cam, x: cam.x - dx / cam.z, y: cam.y - dy / cam.z }, c.x, c.y, facteur, min, max);
    },
    molette(p, facteur) {
      const { min, max } = limitesZoom();
      ui.vol = null;
      cam = zoomAutour(cam, p.x, p.y, facteur, min, max);
    },
  });
  const sur = (id, f) => $(`#${id}`, scene).addEventListener('click', f);
  sur('ile-accueil', () => { quitterPleinEcran(); revenir(''); });
  sur('ile-niveau', fenetreProgression);
  sur('ile-batisseurs', () => fenetreBatisseurs());
  sur('ile-jouer', () => { fermerGuide(); fenetreJouer(); });
  sur('ile-conseil', () => (ui.guide ? fermerGuide() : donnerConseil()));
  sur('ile-ramasser', toutRecolter);
  sur('ile-construire', () => { fermerGuide(); deselectionner(); ouvrirBoutique(); });
  sur('ile-ok', () => (ui.mode === 'agrandir' ? acheter() : confirmerPose()));
  sur('ile-annuler', () => {
    if (ui.mode === 'agrandir') { ui.agrandirChoix = null; $('#ile-valider', scene).hidden = true; return; }
    sortirModePose();
    dire('');
  });
  sur('ile-terminer', finirAgrandir);
  sur('ile-prec', () => changerIle(-1));
  sur('ile-nom', () => { deselectionner(); volerVers(cameraPourIle(E.active), 700); }); // perdu ? on revient sur l'île
  sur('ile-suiv', () => changerIle(1));
  // toucher un compteur explique d'où vient la ressource
  const ORIGINES = {
    etoiles: ['Les étoiles se gagnent en jouant : Sudoku, Solitaire, Dames, Backgammon, Bulles et l’Aventure. Touchez « Jouer » !', { genre: 'bouton', id: 'jouer' }],
    bois: ['Le bois vient des cabanes de bûcheron (près d’une forêt), des forêts qu’on abat et des buissons.', null],
    pierre: ['La pierre vient de la carrière (à côté des rochers), des rochers qu’on casse et des cailloux.', null],
    ble: ['Le blé vient des champs et des fermes. Touchez leur bulle pour le ramasser.', null],
    pieces: ['Les pièces de puzzle viennent de l’Atelier du puzzle. Chaque partie gagnée et chaque mission le font avancer, et l’Aventure en offre tous les 10 niveaux. On les place dans le jeu Puzzle.', null],
    habitants: ['Les habitants vivent dans les maisons, les cabanes, les fermes et les villages. Ils travaillent tout seuls.', null],
  };
  $('#ile-res', scene).addEventListener('click', (e) => {
    const c = e.target.closest('.capsule');
    if (c) { const [texte, cible] = ORIGINES[c.dataset.res]; montrerGuide(texte, cible, 7000); }
  });
  $('#ile-guide', scene).addEventListener('click', fermerGuide);
  $('#ile-actions', scene).addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b) { vibrer(8); action(b.dataset.action); }
  });
  surTouche = (e) => {
    if (e.key !== 'Escape' || !racine) return;
    if (ui.fenetre) ui.fermerFenetre?.('');
    else if (ui.mode === 'poser' || ui.mode === 'deplacer') sortirModePose();
    else if (ui.mode === 'agrandir') finirAgrandir();
    else deselectionner();
  };
  document.addEventListener('keydown', surTouche);
  surRedimension = () => orienter();
  window.addEventListener('resize', surRedimension);
  screen.orientation?.addEventListener?.('change', surRedimension);
  surVisibilite = () => { if (!document.hidden) { dernier = performance.now(); tic(); } };
  document.addEventListener('visibilitychange', surVisibilite);
  window.addEventListener('popstate', surRetour);
}

function changerIle(sens) {
  const n = Math.max(0, Math.min(ouvertes() - 1, E.active + sens));
  if (n === E.active) return;
  E.active = n;
  deselectionner();
  majRuban();
  volerVers(cameraPourIle(n), 900);
}

/** Au retour d'une partie : les étoiles gagnées arrivent sur l'île. */
function accueillir() {
  const gagnees = modeDev() || E.soldeVu === undefined ? 0 : solde() - E.soldeVu;
  if (!E.tuto) {
    E.tuto = true;
    sauver();
    setTimeout(() => montrerGuide(`Bonjour ! Je suis ${GUIDE}, votre voisine. Faites glisser le doigt pour vous promener, et touchez « Construire » pour bâtir. Le bouton ${ICONE.ampoule.replace('<svg', '<svg class="en-ligne"')} donne un conseil.`, { genre: 'bouton', id: 'construire' }, 14000), 700);
    return;
  }
  if (gagnees > 0) {
    sauver();
    setTimeout(() => {
      montrerGuide(`Bravo ! Vous avez gagné <b>${pluriel(gagnees, 'étoile')}</b> en jouant. De quoi construire !`, { genre: 'bouton', id: 'construire' }, 7000);
      const depart = posScene($('#ile-jouer', scene)), b = posScene($('#ile-etoiles .capsule-ic', scene));
      if (reduit()) return;
      for (let i = 0; i < Math.min(gagnees, 8); i++) {
        const el = document.createElement('span');
        el.className = 'vol';
        el.innerHTML = icone('etoiles', 30);
        el.style.left = `${depart.x - 15}px`;
        el.style.top = `${depart.y - 15}px`;
        $('.hud', scene).append(el);
        el.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: `translate(${(b.x - depart.x) * 0.4}px, ${(b.y - depart.y) * 0.4 - 80}px) scale(1.4)`, opacity: 1, offset: 0.45 }, { transform: `translate(${b.x - depart.x}px, ${b.y - depart.y}px) scale(.8)`, opacity: 1 }],
          { duration: 1000, delay: 300 + i * 110, easing: 'ease-in-out', fill: 'backwards' }).finished.then(() => el.remove(), () => el.remove());
      }
    }, 500);
    return;
  }
  // de temps en temps, un conseil pour savoir quoi faire
  const c = conseil(E, solde(), maintenant(), E.active);
  if (c.cible?.genre === 'case' || !Object.keys(E.iles[0].cases).length) setTimeout(() => montrerGuide(c.texte, c.cible), 900);
}

/**
 * Pour l'accueil : une miniature de l'île du joueur et ce qui l'attend là-bas (sans ouvrir l'écran).
 * @returns {{ miniature: string, peindre: (canvas) => void, niveau: number, beaute: number, aRamasser: number, chantiers: number, bouteille: boolean }}
 */
export function apercuIle() {
  const etat = migrer(JSON.parse(JSON.stringify(lire(CLE, null))), maintenant());
  const t = maintenant();
  actualiser(etat, t); // une copie : rien n'est enregistré
  const ile = etat.iles[0], { x0, y0, x1, y1 } = ile.ext;
  const L = x1 - x0 + 3, H = y1 - y0 + 3;
  const taille = Math.max(10, Math.min(18, Math.floor(150 / L)));
  const miniature = `<canvas class="miniature" width="${L * 16}" height="${H * 16}" style="width:${L * taille}px;height:${H * taille}px" aria-hidden="true"></canvas>`;
  /** Dessine la miniature dans son canvas (les tuiles une à une, sans bavure entre elles). */
  function peindre(toileMini) {
    if (!toileMini) return;
    const g = toileMini.getContext('2d'), feuilles = { t: new Image(), s: new Image() };
    feuilles.t.src = new URL('../../assets/ile/tuiles.png', import.meta.url).href;
    feuilles.s.src = new URL('../../assets/ile/sprites.png', import.meta.url).href;
    Promise.all(Object.values(feuilles).map((im) => im.decode().catch(() => {}))).then(() => {
      const cotes = creerCotes(feuilles.t);
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        const img = imageCase(ile, x, y, t), px = (x - x0 + 1) * 16, py = (y - y0 + 1) * 16;
        if (!estTerre(ile, x, y)) {
          // la mer et sa côte ; un port éventuel par-dessus
          const cote = cotes(masqueCote((dx, dy) => estTerre(ile, x + dx, y + dy)));
          if (cote) g.drawImage(cote, px, py); else g.drawImage(feuilles.t, T.eau[0] * 16, T.eau[1] * 16, 16, 16, px, py, 16, 16);
          if (img.eau) continue;
        }
        g.drawImage(feuilles[img.f], img.c[0] * 16, img.c[1] * 16, 16, 16, px, py, 16, 16);
      }
    });
  }
  let aRamasser = 0;
  const ouv = ilesOuvertes(etat);
  for (let n = 0; n < ouv; n++) for (const k of Object.keys(etat.iles[n].cases)) aRamasser += stock(etat.iles[n], ...coord(k), t);
  const p = progressionIle(etat);
  return { miniature, peindre, niveau: p.niveau, beaute: p.beaute, aRamasser, chantiers: chantiers(etat).length, bouteille: Boolean(etat.tresor) };
}

export default {
  id: 'ile',
  nom: 'Mon île',
  pleinEcran: true,

  monter(conteneur) {
    racine = conteneur;
    charger();
    actualiser(E, maintenant());
    E.active = Math.min(E.active || 0, ouvertes() - 1);
    ui = { mode: 'libre', selection: null, pose: null, agrandir: null, agrandirChoix: null, guide: null, vol: null, inertie: null, fenetre: false };
    dernieresRessources = null;
    signatureActions = '';
    construireScene();
    rendu = creerRendu(toile);
    vie = creerVie();
    vie.peupler(E);
    document.documentElement.classList.add('ile-ouverte');
    orienter();
    cam = cameraPourIle(E.active);
    cam = borner(cam, bornes());
    brancher();
    majHud();
    pleinEcran();
    dernier = performance.now();
    derniereAction = dernier;
    animation = requestAnimationFrame(boucle);
    horloge = setInterval(tic, 1000);
    accueillir();
    // pour tester (mode développeur) : l'état et les actions de l'écran
    if (modeDev()) window.ileDebug = { cam: () => cam, E: () => E, ui: () => ui, finirVol: () => { if (ui.vol) { cam = ui.vol.vers; ui.vol = null; } }, cameraPourIle, CADRE_AGRANDIR, ouvrirBoutique, commencerPose, confirmerPose, commencerAgrandir, toucherEnAgrandissant, acheter, choisir, action, toucher, donnerConseil, fenetreProgression, fenetreBatisseurs, fenetreJouer, versEcran: (x, y) => versEcran(cam, x, y), centreCase: (n, x, y) => centreCase(E.iles[n], n, x, y) };
  },

  demonter() {
    cancelAnimationFrame(animation);
    clearInterval(horloge);
    clearTimeout(dire.minuterie);
    clearTimeout(montrerGuide.minuterie);
    window.removeEventListener('resize', surRedimension);
    screen.orientation?.removeEventListener?.('change', surRedimension);
    document.removeEventListener('keydown', surTouche);
    document.removeEventListener('visibilitychange', surVisibilite);
    window.removeEventListener('popstate', surRetour);
    couches = 0;
    popIgnores = 0;
    apresRetour = [];
    document.documentElement.classList.remove('ile-ouverte');
    quitterPleinEcran();
    if (E) sauver();
    racine = null;
    scene = null;
  },
};
