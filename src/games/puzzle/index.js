// Le jeu Puzzle : cinq tableaux à compléter avec les pièces de puzzle fabriquées sur l'île.
// 1. On place ses pièces sur le puzzle de son choix (le tableau, flou, se précise à mesure).
// 2. Quand il a toutes ses pièces, on l'assemble : grosses pièces, aimantées vers leur place, bouton Annuler,
//    pas d'indice. On fait glisser une pièce, ou on la touche puis on touche sa place.
// 3. Le tableau terminé rejoint la bibliothèque (elle marche sans réseau) ; un nouveau puzzle le remplace.
// Règles : moteur.js · images : images.js · tableaux : data/catalogue-puzzles.json.
import { $, $$, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire } from '../../core/stockage.js';
import { demander } from '../../core/dialogue.js';
import { soldePieces, depenserPieces } from '../../core/pieces.js';
import { modeDev } from '../../core/config.js';
import { animer, pop, secouer, mouvementReduit, apparaitre, COURBE_REBOND } from '../../core/mouvement.js';
import { sprite, S } from '../../core/tuiles.js';
import {
  TAILLES, NOMS_TAILLES, etatNeuf, investir, terminer, pret, manquantes, grille, formes, bordsPiece, aimantee, melangees,
} from './moteur.js';
import { chargerCatalogue, obtenirImage, imageGardee } from './images.js';

chargerStyle(new URL('./puzzle.css', import.meta.url));

const cleEtat = () => (modeDev() ? 'puzzle.dev' : 'puzzle'); // le mode développeur a ses puzzles à part
let racine = null;
let catalogue = null;
let etat = null;
let vue = 'accueil';
let urls = new Map(); // id → adresse locale de l'image nette (objet Blob)
let surRedim = null;
let assemblage = null; // l'assemblage en cours (voir ouvrirAssemblage)

const sauver = () => ecrire(cleEtat(), etat);
const tableau = (id) => catalogue.images.find((t) => t.id === id);
const icone = (taille = 26) => sprite(S.piece, taille);
const soldeTexte = () => (modeDev() ? '∞' : String(soldePieces()));

async function charger() {
  catalogue = await chargerCatalogue();
  etat = lire(cleEtat(), null);
  // un tableau retiré du catalogue (nouvelle version) est remplacé sans rien perdre des pièces placées
  if (!etat || !etat.emplacements) etat = etatNeuf(catalogue);
  etat.assemblages ||= {};
  for (const e of etat.emplacements) if (!tableau(e.id)) e.id = catalogue.images.find((t) => t.taille === e.taille)?.id || catalogue.images[0].id;
  sauver();
}

/** L'image nette d'un tableau (adresse locale), si elle est sur le téléphone ou si on peut la télécharger. */
async function urlNette(entree, telecharger = true) {
  if (urls.has(entree.id)) return urls.get(entree.id);
  const blob = telecharger ? await obtenirImage(entree) : await imageGardee(entree.id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(entree.id, url);
  return url;
}

const dire = (html) => { const el = $('#pz-message', racine); if (el) { el.innerHTML = html || ''; el.hidden = !html; } };

// ---------- 1. Les cinq puzzles ----------

function carte(e, i) {
  const t = tableau(e.id), total = TAILLES[e.taille], part = e.investies / total, ok = pret(e);
  const solde = soldePieces(), manque = manquantes(e);
  const flou = Math.round(14 * (1 - part) + 3);
  return `<article class="pz-carte ${ok ? 'pret' : ''}" data-i="${i}">
    <div class="pz-image" style="aspect-ratio:${t.largeur} / ${t.hauteur}; --flou:${flou}px">
      <img class="pz-vignette" src="${t.vignette}" alt="">
      <img class="pz-nette" alt="" hidden>
      <span class="pz-taille" title="${NOMS_TAILLES[e.taille]}">${total} pièces</span>
      ${ok ? '<span class="pz-pret">Prêt à assembler</span>' : ''}
    </div>
    <p class="pz-auteur">Un tableau de <b>${t.artiste}</b></p>
    <div class="pz-barre" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${e.investies}">
      <i style="width:${Math.round(part * 100)}%"></i><span>${e.investies} / ${total} pièces</span>
    </div>
    <div class="pz-actions">
      ${ok
        ? '<button class="btn primary pz-assembler" data-action="assembler">Assembler</button>'
        : `<button class="btn" data-action="une" ${solde < 1 ? 'disabled' : ''}>${icone(22)} +1</button>
           <button class="btn primary" data-action="tout" ${solde < 1 ? 'disabled' : ''}>Placer ${Math.max(1, Math.min(manque, modeDev() ? manque : solde))}</button>`}
    </div>
    <p class="pz-reseau" hidden>Connectez-vous à internet pour recevoir ce tableau. Rien n’est perdu.</p>
  </article>`;
}

function dessinerAccueil() {
  vue = 'accueil';
  const tous = etat.termines.length;
  racine.innerHTML = `
    <div class="pz">
      <div class="pz-haut">
        <span class="pz-solde" aria-label="${soldeTexte()} pièces de puzzle">${icone(30)}<b>${soldeTexte()}</b> pièces</span>
        <button class="btn" id="pz-biblio">Bibliothèque${tous ? ` (${tous})` : ''}</button>
      </div>
      <p class="pz-aide">Placez vos pièces sur le tableau de votre choix. Quand il les a toutes, assemblez-le : le tableau se révèle !</p>
      <p class="status pz-message" id="pz-message" aria-live="polite" hidden></p>
      <div class="pz-cartes">${etat.emplacements.map(carte).join('')}</div>
      <p class="pz-note">Les pièces se fabriquent à l’<b>Atelier du puzzle</b>, sur votre île. Chaque partie gagnée et chaque mission le font avancer, et l’Aventure en offre tous les 10 niveaux.</p>
      <p class="pz-note petit">Seules les images des tableaux sont téléchargées, depuis le site de l’appli, sans identifiant ni envoi de données. Une fois reçues, elles restent sur ce téléphone.</p>
    </div>`;
  $$('.pz-carte', racine).forEach((el, n) => apparaitre(el, { delai: 40 + n * 50 }));
  $('#pz-biblio', racine).addEventListener('click', dessinerBibliotheque);
  $('.pz-cartes', racine).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const i = Number(b.closest('.pz-carte').dataset.i);
    if (b.dataset.action === 'assembler') ouvrirAssemblage(i);
    else placer(i, b.dataset.action === 'une' ? 1 : Infinity);
  });
  // les images nettes déjà sur le téléphone apparaissent en fondu ; celles qui ont des pièces sont demandées
  etat.emplacements.forEach((e, i) => montrerNette(i, e.investies > 0));
}

async function montrerNette(i, telecharger) {
  const e = etat.emplacements[i], url = await urlNette(tableau(e.id), telecharger);
  const el = racine && vue === 'accueil' ? $(`.pz-carte[data-i="${i}"]`, racine) : null;
  if (!el) return;
  $('.pz-reseau', el).hidden = Boolean(url) || !telecharger;
  if (!url) return;
  const img = $('.pz-nette', el);
  if (!img.hidden && img.src === url) return;
  img.src = url;
  img.hidden = false;
  animer(img, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
}

function placer(i, combien) {
  const e = etat.emplacements[i];
  const voulu = Math.min(combien, manquantes(e), modeDev() ? Infinity : soldePieces());
  if (voulu < 1) return dire('Plus de pièces pour l’instant : votre Atelier en fabrique, même appli fermée.');
  if (!depenserPieces(voulu)) return;
  investir(etat, i, voulu);
  sauver();
  const el = $(`.pz-carte[data-i="${i}"]`, racine);
  el.outerHTML = carte(e, i);
  const neuf = $(`.pz-carte[data-i="${i}"]`, racine);
  pop($('.pz-barre', neuf), 1.06);
  $('.pz-solde b', racine).textContent = soldeTexte();
  $$('.pz-carte', racine).forEach((c) => {
    // le nombre de pièces disponibles a changé : on met à jour les boutons des autres cartes (sans les redessiner)
    const j = Number(c.dataset.i), ej = etat.emplacements[j];
    if (j === i || pret(ej)) return;
    c.querySelectorAll('[data-action]').forEach((b) => { b.disabled = soldePieces() < 1; });
    const tout = $('[data-action="tout"]', c);
    if (tout) tout.textContent = `Placer ${Math.max(1, Math.min(manquantes(ej), modeDev() ? manquantes(ej) : soldePieces()))}`;
  });
  etat.emplacements.forEach((x, j) => montrerNette(j, x.investies > 0));
  dire(pret(e)
    ? 'Toutes les pièces sont là : touchez « Assembler » !'
    : `${pluriel(voulu, 'pièce placée', 'pièces placées')}. Encore ${pluriel(manquantes(e), 'pièce')} pour ce tableau.`);
}

// ---------- 2. L'assemblage ----------

/** Dessine le contour d'une pièce (ergots et encoches) ; le chemin commence en haut à gauche, dans le sens des aiguilles. */
function chemin(ctx, x, y, l, h, b) {
  const cote = (ax, ay, bx, by, s) => {
    if (!s) { ctx.lineTo(bx, by); return; }
    const dx = bx - ax, dy = by - ay, nx = dy, ny = -dx; // la normale vers l'extérieur
    const P = (t, k) => [ax + dx * t + nx * k * s, ay + dy * t + ny * k * s];
    ctx.lineTo(...P(0.34, 0));
    ctx.bezierCurveTo(...P(0.40, 0), ...P(0.43, 0.06), ...P(0.39, 0.12));
    ctx.bezierCurveTo(...P(0.33, 0.22), ...P(0.43, 0.27), ...P(0.5, 0.27));
    ctx.bezierCurveTo(...P(0.57, 0.27), ...P(0.67, 0.22), ...P(0.61, 0.12));
    ctx.bezierCurveTo(...P(0.57, 0.06), ...P(0.60, 0), ...P(0.66, 0));
    ctx.lineTo(bx, by);
  };
  ctx.beginPath();
  ctx.moveTo(x, y);
  cote(x, y, x + l, y, b.haut);
  cote(x + l, y, x + l, y + h, b.droite);
  cote(x + l, y + h, x, y + h, b.bas);
  cote(x, y + h, x, y, b.gauche);
  ctx.closePath();
}

async function ouvrirAssemblage(i) {
  const e = etat.emplacements[i], t = tableau(e.id);
  dire('');
  const url = await urlNette(t, true);
  if (!url) {
    const el = $(`.pz-carte[data-i="${i}"] .pz-reseau`, racine);
    if (el) el.hidden = false;
    return dire('Connectez-vous à internet pour recevoir ce tableau. Les autres restent jouables, rien n’est perdu.');
  }
  const image = new Image();
  image.src = url;
  await image.decode().catch(() => {});
  const n = TAILLES[e.taille], { colonnes, lignes } = grille(n, image.naturalWidth / image.naturalHeight);
  etat.assemblages[e.id] ||= { places: [] };
  assemblage = { i, e, t, image, n, colonnes, lignes, f: formes(colonnes, lignes, e.id), ordre: melangees(n, e.id), places: etat.assemblages[e.id].places, choisie: null };
  vue = 'assemblage';
  dessinerAssemblage();
}

/** La taille du tableau, mesurée une fois la page posée : il tient dans l'écran, la réserve prend le reste. */
function mesures(zone, paysage) {
  const a = assemblage;
  const largeurDispo = zone.clientWidth;
  const hauteurDispo = Math.max(200, window.innerHeight - zone.getBoundingClientRect().top - 12);
  const ratio = a.image.naturalWidth / a.image.naturalHeight;
  const cadre = 20; // le cadre de bois autour du tableau
  // à l'horizontale : le tableau à gauche ; à la verticale : en haut
  let l = paysage ? largeurDispo - 200 - cadre : largeurDispo - cadre;
  let h = l / ratio;
  const hMax = (paysage ? hauteurDispo : hauteurDispo * 0.58) - cadre;
  if (h > hMax) { h = hMax; l = h * ratio; }
  const cw = l / a.colonnes, ch = h / a.lignes;
  return { l, h, cw, ch, m: Math.ceil(0.28 * Math.max(cw, ch)) + 2, paysage, hauteurDispo };
}

/** Une pièce : un petit canvas avec le morceau de tableau découpé et un contour bien visible. */
function creerPiece(k, M) {
  const a = assemblage, c = k % a.colonnes, l = Math.floor(k / a.colonnes);
  const b = bordsPiece(a.f, a.colonnes, a.lignes, c, l);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const L = M.cw + 2 * M.m, H = M.ch + 2 * M.m;
  const el = document.createElement('div');
  el.className = 'pz-piece';
  el.dataset.k = k;
  el.style.width = `${L}px`;
  el.style.height = `${H}px`;
  const toile = document.createElement('canvas');
  toile.width = Math.round(L * dpr);
  toile.height = Math.round(H * dpr);
  const g = toile.getContext('2d');
  g.scale(dpr, dpr);
  chemin(g, M.m, M.m, M.cw, M.ch, b);
  g.save();
  g.clip();
  g.drawImage(a.image, M.m - c * M.cw, M.m - l * M.ch, M.l, M.h);
  g.restore();
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(40, 25, 10, .85)';
  g.stroke();
  g.lineWidth = 1.2;
  g.strokeStyle = 'rgba(255, 255, 255, .7)';
  g.stroke();
  el.append(toile);
  el.setAttribute('aria-label', `Pièce ${k + 1}`);
  return el;
}

function dessinerAssemblage() {
  const a = assemblage, paysage = window.innerWidth > window.innerHeight;
  const aide = a.places.length ? '' : 'Faites glisser une pièce sur le tableau, ou touchez-la puis touchez sa place.';
  racine.innerHTML = `
    <div class="pz-assemblage ${paysage ? 'paysage' : ''}">
      <div class="pz-commandes">
        <button class="btn" id="pz-retour">← Puzzles</button>
        <span class="pz-compte" id="pz-compte"></span>
        <button class="btn" id="pz-annuler">Annuler</button>
      </div>
      <p class="status pz-message" id="pz-message" aria-live="polite">${aide}</p>
      <div class="pz-zone">
        <div class="pz-plateau"><canvas class="pz-fond"></canvas></div>
        <div class="pz-reserve" aria-label="Les pièces à placer"></div>
      </div>
    </div>`;
  // on mesure une fois la page posée, pour que le tableau tienne entier dans l'écran
  const M = mesures($('.pz-zone', racine), paysage);
  a.M = M;
  Object.assign($('.pz-plateau', racine).style, { width: `${M.l}px`, height: `${M.h}px` });
  // le cadre : la forme de chaque pièce, en pointillés clairs (pour voir où vont les ergots, pas l'image)
  const fond = $('.pz-fond', racine), dpr = Math.min(2, window.devicePixelRatio || 1);
  fond.width = Math.round(M.l * dpr);
  fond.height = Math.round(M.h * dpr);
  fond.style.width = `${M.l}px`;
  fond.style.height = `${M.h}px`;
  const g = fond.getContext('2d');
  g.scale(dpr, dpr);
  g.setLineDash([5, 4]);
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(120, 95, 60, .45)';
  for (let k = 0; k < a.n; k++) {
    const c = k % a.colonnes, l = Math.floor(k / a.colonnes);
    chemin(g, c * M.cw, l * M.ch, M.cw, M.ch, bordsPiece(a.f, a.colonnes, a.lignes, c, l));
    g.stroke();
  }
  const plateau = $('.pz-plateau', racine), reserve = $('.pz-reserve', racine);
  const hauteurReserve = Math.max(130, M.paysage ? M.hauteurDispo : M.hauteurDispo - M.h - 34);
  reserve.style.maxHeight = `${hauteurReserve}px`;
  // à la verticale, la réserve est un bandeau qui défile de côté (le doigt monte pour soulever une pièce)
  if (!M.paysage) reserve.style.setProperty('--rangs', String(Math.max(1, Math.min(3, Math.floor((hauteurReserve - 16) / (M.ch + 2 * M.m + 2))))));
  for (const k of a.places) poserSurPlateau(creerPiece(k, M), k, false);
  for (const k of a.ordre) if (!a.places.includes(k)) reserve.append(creerPiece(k, M));
  majCompte();
  $('#pz-retour', racine).addEventListener('click', () => { assemblage = null; dessinerAccueil(); });
  $('#pz-annuler', racine).addEventListener('click', annuler);
  brancherGestes(plateau, reserve);
}

function majCompte() {
  const a = assemblage;
  $('#pz-compte', racine).textContent = `${a.places.length} / ${a.n} placées`;
  $('#pz-annuler', racine).disabled = a.places.length === 0;
}

function poserSurPlateau(el, k, anime = true, depuis = null) {
  const a = assemblage, M = a.M, c = k % a.colonnes, l = Math.floor(k / a.colonnes);
  el.classList.add('placee');
  el.classList.remove('choisie', 'volante');
  el.style.left = `${c * M.cw - M.m}px`;
  el.style.top = `${l * M.ch - M.m}px`;
  el.style.transform = '';
  $('.pz-plateau', racine).append(el);
  if (anime && depuis) animer(el, [{ transform: `translate(${depuis.x}px, ${depuis.y}px)` }, { transform: 'none' }], { duration: 260, easing: COURBE_REBOND });
  else if (anime) pop(el, 1.08);
}

function placerPiece(el, k, depuis = null) {
  const a = assemblage;
  a.places.push(k);
  sauver();
  poserSurPlateau(el, k, true, depuis);
  a.choisie = null;
  majCompte();
  dire('');
  try { navigator.vibrate?.(12); } catch { /* rien */ }
  if (a.places.length === a.n) {
    // c'est gagné : on l'enregistre tout de suite (rien ne se perd si l'on quitte pendant la révélation)
    a.fini = true;
    $('#pz-annuler', racine).disabled = true;
    terminer(etat, a.i, catalogue);
    sauver();
    setTimeout(() => finir(a), mouvementReduit() ? 0 : 350);
  }
}

function annuler() {
  const a = assemblage;
  if (!a || a.fini) return;
  const k = a.places.pop();
  if (k === undefined) return;
  sauver();
  const el = $(`.pz-plateau .pz-piece[data-k="${k}"]`, racine);
  el.classList.remove('placee');
  el.style.left = el.style.top = '';
  $('.pz-reserve', racine).prepend(el);
  animer(el, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260 });
  majCompte();
}

/** Glisser une pièce, ou la toucher puis toucher sa place. */
function brancherGestes(plateau, reserve) {
  const a = assemblage;
  let tenue = null; // { el, k, dx, dy, x0, y0, bouge, origine }
  const caseDe = (cx, cy) => {
    const r = plateau.getBoundingClientRect(), M = a.M;
    return { c: (cx - r.left) / M.cw, l: (cy - r.top) / M.ch, dedans: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom };
  };
  reserve.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest('.pz-piece');
    if (!el) return;
    ev.preventDefault();
    const r = el.getBoundingClientRect();
    tenue = { el, k: Number(el.dataset.k), dx: ev.clientX - r.left, dy: ev.clientY - r.top, x0: ev.clientX, y0: ev.clientY, bouge: false, origine: r };
    a.tenue = true;
    // pendant le geste, on écoute toute la page : la pièce quitte la réserve pour suivre le doigt
    document.addEventListener('pointermove', bouger);
    document.addEventListener('pointerup', lacher);
    document.addEventListener('pointercancel', lacher);
  });
  const bouger = (ev) => {
    if (!tenue) return;
    if (!tenue.bouge && Math.hypot(ev.clientX - tenue.x0, ev.clientY - tenue.y0) < 8) return;
    if (!tenue.bouge) {
      // un geste dans le sens où la réserve défile la fait défiler (le navigateur s'en charge) : on ne soulève pas la pièce
      const dx = Math.abs(ev.clientX - tenue.x0), dy = Math.abs(ev.clientY - tenue.y0);
      if (a.M.paysage ? dy > dx : dx > dy) return;
      tenue.bouge = true;
      tenue.el.classList.add('volante');
      document.body.append(tenue.el);
    }
    tenue.el.style.left = `${ev.clientX - tenue.dx}px`;
    tenue.el.style.top = `${ev.clientY - tenue.dy}px`;
  };
  const lacher = (ev) => {
    document.removeEventListener('pointermove', bouger);
    document.removeEventListener('pointerup', lacher);
    document.removeEventListener('pointercancel', lacher);
    a.tenue = false;
    if (!tenue) return;
    const { el, k, bouge } = tenue;
    tenue = null;
    if (!bouge) {
      if (ev.type === 'pointerup') choisir(el, k); // un simple toucher (pas un défilement de la réserve)
      return redessinerSiBesoin();
    }
    // où est le coin de la case de la pièce ?
    const M = a.M, r = el.getBoundingClientRect(), pr = plateau.getBoundingClientRect();
    const x = (r.left + M.m - pr.left) / M.cw, y = (r.top + M.m - pr.top) / M.ch;
    const c = k % a.colonnes, l = Math.floor(k / a.colonnes);
    if (aimantee(x, y, c, l)) {
      const cible = { x: pr.left + c * M.cw - M.m, y: pr.top + l * M.ch - M.m };
      placerPiece(el, k, { x: r.left - cible.x, y: r.top - cible.y });
    } else {
      // pas sa place : la pièce retourne doucement dans la réserve
      el.classList.remove('volante');
      el.style.left = el.style.top = '';
      reserve.prepend(el);
      animer(el, [{ transform: `translate(${r.left - el.getBoundingClientRect().left}px, ${r.top - el.getBoundingClientRect().top}px)` }, { transform: 'none' }], { duration: 300 });
      if (Math.hypot(x - c, y - l) < 3 && caseDe(ev.clientX, ev.clientY).dedans) dire('Pas tout à fait : essayez une autre place.');
    }
    redessinerSiBesoin();
  };
  // l'écran a changé de taille pendant le geste : on redessine maintenant que la pièce est posée
  const redessinerSiBesoin = () => {
    if (!a.redessiner || assemblage !== a || !racine) return;
    a.redessiner = false;
    dessinerAssemblage();
  };
  // une pièce choisie, puis un toucher sur le tableau
  plateau.addEventListener('click', (ev) => {
    if (a.choisie === null) return;
    const { c, l } = caseDe(ev.clientX, ev.clientY);
    const k = a.choisie, el = $(`.pz-reserve .pz-piece[data-k="${k}"]`, racine);
    if (!el) return;
    if (Math.floor(c) === k % a.colonnes && Math.floor(l) === Math.floor(k / a.colonnes)) {
      const r = el.getBoundingClientRect(), pr = plateau.getBoundingClientRect(), M = a.M;
      placerPiece(el, k, { x: r.left - (pr.left + (k % a.colonnes) * M.cw - M.m), y: r.top - (pr.top + Math.floor(k / a.colonnes) * M.ch - M.m) });
    } else {
      secouer(el);
      dire('Ce n’est pas sa place : essayez ailleurs.');
    }
  });
}

function choisir(el, k) {
  const a = assemblage;
  $$('.pz-reserve .pz-piece.choisie', racine).forEach((p) => p.classList.remove('choisie'));
  if (a.choisie === k) { a.choisie = null; return; }
  a.choisie = k;
  el.classList.add('choisie');
  dire('Touchez maintenant sa place sur le tableau.');
}

async function finir(a) {
  if (assemblage !== a || !racine) return; // on a déjà quitté l'assemblage
  // le tableau se révèle : les découpes s'effacent
  const plateau = $('.pz-plateau', racine);
  const revele = document.createElement('img');
  revele.className = 'pz-revele';
  revele.src = a.image.src;
  revele.alt = a.t.titre;
  plateau.append(revele);
  await animer(revele, [{ opacity: 0, filter: 'brightness(1.4)' }, { opacity: 1, filter: 'brightness(1)' }], { duration: 1200, fill: 'forwards' });
  if (assemblage !== a || !racine) return;
  $$('.pz-piece', plateau).forEach((p) => p.remove());
  const choix = await demander({
    titre: 'Bravo, le tableau est terminé !',
    texte: `« ${a.t.titre} », ${a.t.artiste}, ${a.t.date}.\nIl rejoint votre bibliothèque. Un nouveau puzzle vous attend à sa place.`,
    oui: 'Voir la bibliothèque', non: 'Retour aux puzzles',
  });
  if (assemblage !== a || !racine) return;
  assemblage = null;
  if (choix) dessinerBibliotheque(); else dessinerAccueil();
}

// ---------- 3. La bibliothèque ----------

async function dessinerBibliotheque() {
  vue = 'bibliotheque';
  const finis = [...etat.termines].reverse();
  racine.innerHTML = `
    <div class="pz">
      <div class="pz-haut"><button class="btn" id="pz-retour">← Puzzles</button><b class="pz-titre-biblio">Ma bibliothèque</b></div>
      ${finis.length ? `<div class="pz-galerie">${finis.map((f, n) => {
        const t = tableau(f.id);
        return t ? `<button class="pz-oeuvre" data-id="${t.id}" data-n="${n}">
          <span class="pz-cadre"><img class="pz-vignette" src="${t.vignette}" alt=""><img class="pz-nette" alt="" hidden></span>
          <b>${t.titre}</b><small>${t.artiste}, ${t.date}</small></button>` : '';
      }).join('')}</div>` : '<p class="pz-aide">Pas encore de tableau terminé. Placez des pièces sur un puzzle, puis assemblez-le : il viendra se ranger ici.</p>'}
    </div>`;
  $('#pz-retour', racine).addEventListener('click', dessinerAccueil);
  $('.pz-galerie', racine)?.addEventListener('click', (ev) => {
    const b = ev.target.closest('.pz-oeuvre');
    if (b) voirTableau(tableau(b.dataset.id));
  });
  // les images nettes sont sur le téléphone : pas besoin du réseau
  for (const b of $$('.pz-oeuvre', racine)) {
    const url = await urlNette(tableau(b.dataset.id), true);
    if (!url || vue !== 'bibliotheque' || !b.isConnected) continue;
    const img = $('.pz-nette', b);
    img.src = url;
    img.hidden = false;
  }
}

async function voirTableau(t) {
  const url = await urlNette(t, true);
  const fond = document.createElement('div');
  fond.className = 'sheet temp pz-visionneuse';
  fond.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true" aria-label="${t.titre}">
      <img src="${url || t.vignette}" alt="${t.titre}" class="${url ? '' : 'floue'}">
      <h3>${t.titre}</h3>
      <p>${t.artiste}, ${t.date}</p>
      <p class="petit">Licence ${t.licence}. ${t.source}.</p>
      <div class="sheet-actions"><button class="btn primary">Fermer</button></div>
    </div>`;
  document.body.append(fond);
  animer(fond.firstElementChild, [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280 });
  fond.addEventListener('click', (ev) => { if (ev.target === fond || ev.target.closest('button')) fond.remove(); });
}

// ---------- Module ----------

export default {
  id: 'puzzle',
  nom: 'Puzzle',
  description: 'De beaux tableaux à reconstituer, pièce par pièce',
  paysage: true,
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="4" width="56" height="56" rx="12" fill="#2f7ae5"/><path d="M12 22h10a5 5 0 1 1 10 0h10v10a5 5 0 1 1 0 10v10H12V42a5 5 0 1 0 0-10z" fill="#ffc21a" stroke="#5a3a00" stroke-width="2.5" stroke-linejoin="round"/><path d="M42 12h10v10H42z" fill="#8fe06a" stroke="#1d5a0a" stroke-width="2.5"/></svg>`,

  resume() {
    const e = lire(cleEtat(), null);
    if (!e?.emplacements) return 'Reconstituez de beaux tableaux';
    const prets = e.emplacements.filter((x) => x.investies >= TAILLES[x.taille]).length;
    if (prets) return prets > 1 ? `${prets} tableaux prêts à assembler` : 'Un tableau prêt à assembler';
    return `${pluriel(soldePieces(), 'pièce')} à placer · ${pluriel(e.termines.length, 'tableau terminé', 'tableaux terminés')}`;
  },

  async monter(conteneur) {
    racine = conteneur;
    racine.innerHTML = '<p class="pz-aide">Un instant…</p>';
    await charger();
    if (!racine) return;
    dessinerAccueil();
    surRedim = () => {
    if (vue !== 'assemblage' || !assemblage || !racine) return;
    if (assemblage.tenue) assemblage.redessiner = true; // une pièce est au bout du doigt : on attend qu'elle soit lâchée
    else dessinerAssemblage();
  };
    window.addEventListener('resize', surRedim);
  },

  demonter() {
    window.removeEventListener('resize', surRedim);
    $$('body > .pz-piece.volante').forEach((p) => p.remove());
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls = new Map();
    assemblage = null;
    racine = null;
  },
};
