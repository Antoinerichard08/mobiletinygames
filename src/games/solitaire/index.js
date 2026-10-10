// Solitaire (Klondike) : affichage, animations et commandes. Les règles sont dans moteur.js.
// Tout se joue en touchant : une carte, puis l'endroit où la poser. Toucher deux fois la même carte la range seule.
// Les cartes glissent d'un endroit à l'autre (rien ne se téléporte) ; le jeu se joue aussi téléphone à l'horizontale.
import { $, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire } from '../../core/stockage.js';
import { demander } from '../../core/dialogue.js';
import { finirPartie } from '../../core/partie.js';
import { revenir } from '../../core/navigation.js';
import { creerTravailleur } from '../../core/travail.js';
import { noterPositions, animerDepuis, animer, secouer, attendre, mouvementReduit, COURBE_REBOND } from '../../core/mouvement.js';
import {
  SYMBOLES, RANGS, NIVEAUX, estRouge, nomCarte, nomCarteAvecArticle, cloner, pile, estPermis, deplacer,
  piocher, destinationAuto, monterCartes, estGagne, indice, fondationPour, peutFinirSeul,
} from './moteur.js';
import { preparerDonne } from './donne.js';

chargerStyle(new URL('./solitaire.css', import.meta.url));

const NOMS = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
const DESCRIPTIONS = {
  facile: 'Une carte à la fois. La partie peut toujours être gagnée.',
  moyen: 'Trois cartes à la fois. La partie peut toujours être gagnée.',
  difficile: 'Trois cartes à la fois, cartes mélangées au hasard.',
};
const MAX_HISTORIQUE = 200;
const HISTORIQUE_SAUVE = 30;

const fabrique = creerTravailleur(new URL('./donne-worker.js', import.meta.url), ({ niveau }) => ({ etat: preparerDonne(niveau) }));

let E = null; // { jeu, niveau, gagne, historique, indices, annulations }
let racine = null;
let options = {};
let sel = null;
let conseil = null;
let occupe = false; // animation ou préparation en cours : on ignore les touches
let prochaine = null; // { niveau, promesse } : donne préparée à l'avance
let observateur = null;

const cleSauvegarde = () => (options.defi ? `solitaire.defi.${options.defi.id}` : 'solitaire');
const cleCarte = (c) => `c${c.s}-${c.r}`;

function charger() {
  const s = lire(cleSauvegarde(), null);
  E = s && s.jeu && s.jeu.tab ? s : null;
  if (E) {
    E.historique ||= [];
    E.niveau ||= 'facile';
    E.jeu.tirage ||= 1;
    E.indices ||= 0;
    E.annulations ||= 0;
  }
}
function sauver() {
  if (E) ecrire(cleSauvegarde(), { ...E, historique: E.historique.slice(-HISTORIQUE_SAUVE) });
}
const partieCommencee = () => Boolean(E) && !E.gagne && E.jeu.moves > 0;

function dire(texte) {
  const el = $('#sol-status', racine);
  if (el) el.textContent = texte || '';
}

// ---------- Préparation des donnes ----------

function commanderDonne(niveau) {
  if (!prochaine || prochaine.niveau !== niveau) {
    prochaine = { niveau, promesse: fabrique.calculer({ niveau }).then((r) => r.etat) };
  }
  return prochaine;
}

async function nouvelle(niveau = E?.niveau || options.defi?.niveau || 'facile') {
  occupe = true;
  dire('Je mélange les cartes…');
  const etat = await commanderDonne(niveau).promesse;
  prochaine = null;
  E = { jeu: etat, niveau, gagne: false, historique: [], indices: 0, annulations: 0 };
  sel = null;
  conseil = null;
  sauver();
  if (!racine) { occupe = false; return; }
  await distribuer();
  occupe = false;
  dire(E.jeu.tirage === 3 ? 'Touchez la pioche pour retourner trois cartes.' : 'Touchez la pioche (en haut à gauche) pour retourner une carte.');
  commanderDonne(niveau); // la suivante se prépare pendant que l'on joue
}

// Animation de distribution : toutes les cartes partent de la pioche, une par une.
async function distribuer() {
  dessiner();
  if (mouvementReduit()) return;
  const table = $('#sol-table', racine);
  const pioche = table.querySelector('[data-loc="stock"]').getBoundingClientRect();
  const avant = new Map();
  const ordre = new Map();
  let n = 0;
  // ordre de distribution classique : rangée par rangée
  for (let rangee = 0; rangee < 7; rangee++) {
    for (let col = rangee; col < 7; col++) {
      const c = E.jeu.tab[col][rangee];
      avant.set(cleCarte(c), pioche);
      ordre.set(cleCarte(c), n++);
    }
  }
  await animerDepuis(table, avant, { duree: 260, decalage: 28, ordre: (k) => ordre.get(k) ?? 99 });
}

// ---------- Affichage ----------

function carteHtml(c, attrs, style, classes = '') {
  const cle = `data-cle="${cleCarte(c)}"`;
  if (!c.up) return `<div class="card back ${classes}" ${cle} ${attrs} style="${style}"></div>`;
  const figure = c.r > 10 ? `<span class="fig">${RANGS[c.r]}</span>` : '';
  return `<div class="card ${estRouge(c) ? 'red' : ''} ${c.r > 10 ? 'face' : ''} ${classes}" ${cle} ${attrs} style="${style}" aria-label="${nomCarte(c)}">`
    + `<span class="idx"><b>${RANGS[c.r]}</b><span>${SYMBOLES[c.s]}</span></span>${figure}<span class="big">${SYMBOLES[c.s]}</span></div>`;
}

const memeOrigine = (a, b) => a && b && a.loc === b.loc && (a.loc === 'waste' || a.i === b.i);
const paysage = () => matchMedia('(orientation: landscape) and (max-height: 560px)').matches;

// Taille des cartes et écartement des colonnes, selon la place disponible (portrait ou paysage).
function mesures() {
  const table = $('#sol-table', racine);
  const gap = 5;
  const largeur = (racine.clientWidth || 360) - 16;
  let cw = (largeur - 6 * gap) / 7;
  let hauteurDispo;
  if (paysage()) {
    const haut = table.getBoundingClientRect().top + window.scrollY;
    hauteurDispo = Math.max(200, window.innerHeight - haut - 16);
    const cote = parseFloat(getComputedStyle(racine).getPropertyValue('--cote')) || 190;
    cw = Math.min((window.innerWidth - cote - 60 - 6 * gap) / 7, hauteurDispo / 3.4);
  } else {
    hauteurDispo = Math.max(cw * 6, window.innerHeight * 0.68);
  }
  cw = Math.max(34, Math.floor(cw));
  const ch = Math.round(cw * 1.4);
  const colonneMax = hauteurDispo - ch - Math.round(cw * 0.3) - 20;
  return { cw, ch, gap, colonneMax };
}

function decalages(col, m) {
  const pasCache = 0.22 * m.cw, pasVisible = 0.5 * m.cw;
  let brut = 0;
  col.forEach((c, k) => { if (k < col.length - 1) brut += c.up ? pasVisible : pasCache; });
  const reste = m.colonneMax - m.ch;
  const f = brut > reste && brut > 0 ? Math.max(reste / brut, 0.5) : 1;
  const out = [];
  let y = 0;
  col.forEach((c) => { out.push(y); y += (c.up ? Math.max(pasVisible * f, 0.3 * m.cw) : Math.max(pasCache * f, 0.1 * m.cw)); });
  return { tops: out, hauteur: out.length ? out[out.length - 1] + m.ch : m.ch };
}

function dessiner() {
  if (!racine || !E) return;
  const J = E.jeu;
  const m = mesures();
  const table = $('#sol-table', racine);
  table.style.setProperty('--cw', `${m.cw}px`);
  table.style.setProperty('--gap', `${m.gap}px`);
  table.style.width = paysage() ? `${7 * m.cw + 6 * m.gap + 20}px` : '';

  const surbrillance = (o, k) => {
    let cls = '';
    if (sel && memeOrigine(sel, o) && (o.loc !== 'tab' || k >= sel.k)) cls += ' sel';
    if (conseil && conseil.o && memeOrigine(conseil.o, o) && (o.loc !== 'tab' || k >= conseil.o.k)) cls += ' hint';
    return cls;
  };
  const destConseil = (loc, i) => conseil && conseil.dest && conseil.dest.loc === loc && conseil.dest.i === i;

  let h = '<div class="deck"><div class="row7">';
  // pioche
  const piocheConseil = conseil && conseil.pioche ? ' hint' : '';
  const dessus = J.stock[J.stock.length - 1];
  h += `<div class="slot stock${piocheConseil}" data-loc="stock" aria-label="Pioche, ${J.stock.length} cartes">`
    + (dessus ? carteHtml(dessus, 'data-loc="stock"', 'top:-2px;left:-2px') + `<span class="cnt">${J.stock.length}</span>`
      : J.waste.length ? '<span class="recycle" aria-hidden="true">↻</span>' : '')
    + '</div>';
  // défausse (jusqu'à 3 cartes en éventail en mode trois cartes)
  const visibles = J.tirage === 3 ? J.waste.slice(-3) : J.waste.slice(-1);
  h += '<div class="slot plain waste">';
  visibles.forEach((c, n) => {
    const estDessus = n === visibles.length - 1;
    h += carteHtml(c, estDessus ? 'data-loc="waste"' : '', `top:-2px;left:calc(var(--cw) * ${(n * 0.3).toFixed(2)} - 2px)`,
      estDessus ? surbrillance({ loc: 'waste' }, 0) : 'under');
  });
  h += '</div><div></div>';
  // fondations
  for (let f = 0; f < 4; f++) {
    const p = J.found[f], t = p[p.length - 1], d = destConseil('found', f) ? ' hint' : '';
    h += `<div class="slot found${t ? ' plain' : d}" data-loc="found" data-i="${f}">`;
    if (p.length > 1) h += carteHtml(p[p.length - 2], '', 'top:-2px;left:-2px', 'under');
    h += t ? carteHtml(t, `data-loc="found" data-i="${f}"`, 'top:-2px;left:-2px', surbrillance({ loc: 'found', i: f }, 0) + d) : '<span>A</span>';
    h += '</div>';
  }
  h += '</div><div class="row7">';
  // colonnes
  for (let i = 0; i < 7; i++) {
    const col = J.tab[i];
    const d = destConseil('tab', i);
    if (!col.length) {
      h += `<div class="col" data-loc="tab" data-i="${i}" data-k="-1" style="height:var(--ch)"><div class="slot${d ? ' hint' : ''}" style="pointer-events:none"><span>R</span></div></div>`;
      continue;
    }
    const { tops, hauteur } = decalages(col, m);
    let cartes = '';
    col.forEach((c, k) => {
      let cls = surbrillance({ loc: 'tab', i }, k);
      if (d && k === col.length - 1) cls += ' hint';
      cartes += carteHtml(c, `data-loc="tab" data-i="${i}" data-k="${k}"`, `top:${tops[k].toFixed(1)}px`, cls);
    });
    h += `<div class="col" data-loc="tab" data-i="${i}" data-k="-1" style="height:${hauteur.toFixed(1)}px">${cartes}</div>`;
  }
  h += '</div></div>';
  table.innerHTML = h;

  $('#sol-undo', racine).disabled = !E.historique.length || occupe;
  $('#sol-finish', racine).hidden = !(peutFinirSeul(J) && !E.gagne);
  $('#sol-info', racine).textContent = `${NOMS[E.niveau]} · ${J.tirage === 3 ? '3 cartes' : '1 carte'} à la fois · ${pluriel(J.moves, 'coup')}`;
}

// ---------- Animations des coups ----------

/** Exécute une action qui modifie le jeu, puis anime les cartes de l'ancienne à la nouvelle position. */
async function avecAnimation(action, { decalage = 0, duree = 300 } = {}) {
  const table = $('#sol-table', racine);
  const avant = noterPositions(table);
  const pioche = table.querySelector('[data-loc="stock"]')?.getBoundingClientRect();
  const defausse = table.querySelector('.waste')?.getBoundingClientRect();
  const etaientVisibles = new Set();
  const etaientPioche = new Set(E.jeu.stock.map(cleCarte));
  const etaientDefausse = new Set(E.jeu.waste.map(cleCarte));
  for (const col of E.jeu.tab) for (const c of col) if (c.up) etaientVisibles.add(cleCarte(c));
  for (const c of E.jeu.waste) etaientVisibles.add(cleCarte(c));
  for (const p of E.jeu.found) for (const c of p) etaientVisibles.add(cleCarte(c));

  const resultat = action();
  dessiner();

  // cartes qui n'étaient pas dessinées avant (au fond de la pioche ou de la défausse) : elles partent de là
  for (const el of table.querySelectorAll('[data-cle]')) {
    const k = el.dataset.cle;
    if (avant.has(k)) continue;
    if (etaientPioche.has(k) && pioche) avant.set(k, pioche);
    else if (etaientDefausse.has(k) && defausse) avant.set(k, defausse);
  }
  const anim = animerDepuis(table, avant, { decalage, duree });
  // cartes qui viennent d'être retournées : petit effet de retournement
  if (!mouvementReduit()) {
    for (const el of table.querySelectorAll('.card:not(.back)')) {
      if (!etaientVisibles.has(el.dataset.cle)) {
        el.querySelectorAll('span').forEach((s) => animer(s, [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: 360 }));
        animer(el, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.05)', offset: 0.45 }, { transform: 'scaleX(1)' }], { duration: 360, composite: 'add' });
      }
    }
  }
  await anim;
  return resultat;
}

function memoriser() {
  E.historique.push(cloner(E.jeu));
  if (E.historique.length > MAX_HISTORIQUE) E.historique.shift();
}

async function apresCoup() {
  sel = null;
  conseil = null;
  sauver();
  dessiner();
  if (!E.gagne && estGagne(E.jeu)) await victoire();
}

async function victoire() {
  E.gagne = true;
  sauver();
  dire('Partie gagnée !');
  occupe = true;
  // les quatre Rois sautent de joie
  const rois = [...$('#sol-table', racine).querySelectorAll('.found .card:not(.under)')];
  for (const r of rois) {
    animer(r, [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-30%) rotate(-8deg)' }, { transform: 'translateY(0) rotate(0)' }],
      { duration: 520, easing: COURBE_REBOND });
    await attendre(140);
  }
  await attendre(450);
  occupe = false;
  const choix = await finirPartie({
    jeu: 'solitaire',
    gagne: true,
    difficulte: E.niveau,
    defi: options.defi,
    details: { coups: E.jeu.moves, indices: E.indices, annulations: E.annulations },
    texte: `Vous avez gagné en ${pluriel(E.jeu.moves, 'coup')}.`,
  });
  if (choix === 'rejouer') nouvelle(E.niveau);
  else if (choix === 'carte') revenir('niveaux');
}

async function jouer(o, dest) {
  memoriser();
  occupe = true;
  await avecAnimation(() => deplacer(E.jeu, o, dest));
  occupe = false;
  dire('');
  await apresCoup();
}

async function toucher(loc, i, k, el) {
  if (occupe) return;
  if (E.gagne) return dire('La partie est gagnée. Touchez « Nouvelle partie » pour rejouer.');
  conseil = null;
  if (loc === 'stock') {
    sel = null;
    memoriser();
    occupe = true;
    const r = await avecAnimation(() => piocher(E.jeu), { decalage: 60, duree: 260 });
    occupe = false;
    if (r === 'vide') {
      E.historique.pop();
      dire('Il n’y a plus de cartes à piocher.');
    } else dire(r === 'retour' ? 'Les cartes sont revenues dans la pioche.' : '');
    sauver();
    dessiner();
    return;
  }
  if (sel) {
    // 1) la sélection va-t-elle là où l'on vient de toucher ?
    if ((loc === 'tab' || loc === 'found') && estPermis(E.jeu, sel, { loc, i })) return jouer(sel, { loc, i });
    // 2) même carte touchée une deuxième fois : rangement automatique
    if (memeOrigine(sel, { loc, i }) && (loc !== 'tab' || sel.k === k)) {
      const dest = destinationAuto(E.jeu, sel);
      if (dest) return jouer(sel, dest);
      sel = null;
      dessiner();
      secouer(el);
      return dire('Cette carte ne peut aller nulle part pour l’instant.');
    }
  }
  // 3) sinon, on sélectionne la carte touchée (si elle est visible)
  const o = loc === 'waste' ? { loc, i: 0, k: 0 } : loc === 'found' ? { loc, i, k: 0 } : { loc, i, k };
  const avait = sel;
  sel = pile(E.jeu, o) && (loc !== 'tab' || k >= 0) ? o : null;
  dessiner();
  if (sel) dire('Touchez l’endroit où poser la carte, ou touchez-la encore pour la ranger.');
  else if (avait) {
    dire('Impossible de poser cette carte ici.');
    secouer(el);
  } else dire('');
}

function montrerIndice() {
  if (E.gagne || occupe) return;
  sel = null;
  const c = indice(E.jeu);
  conseil = c;
  E.indices++;
  if (!c) dire('Aucun coup possible. Vous pouvez commencer une nouvelle partie.');
  else if (c.pioche) dire('Touchez la pioche, entourée en jaune.');
  else dire(`Déplacez ${nomCarteAvecArticle(pile(E.jeu, c.o)[0])} vers l’endroit entouré en jaune.`);
  sauver();
  dessiner();
}

async function annuler() {
  if (occupe || !E.historique.length) return;
  const precedent = E.historique.pop();
  E.annulations++;
  occupe = true;
  await avecAnimation(() => { E.jeu = precedent; E.gagne = false; });
  occupe = false;
  dire('Dernier coup annulé.');
  sel = null;
  conseil = null;
  sauver();
  dessiner();
}

async function monter() {
  if (E.gagne || occupe) return;
  memoriser();
  occupe = true;
  // une carte après l'autre, pour bien voir où elles vont
  let n = 0;
  for (;;) {
    const avant = cloner(E.jeu);
    const fait = await avecAnimation(() => monterUne(E.jeu), { duree: 240 });
    if (!fait) { E.jeu = avant; break; }
    n++;
  }
  occupe = false;
  if (!n) {
    E.historique.pop();
    sel = null;
    conseil = null;
    dessiner();
    return dire('Aucune carte ne peut monter pour l’instant.');
  }
  dire(`${pluriel(n, 'carte rangée', 'cartes rangées')}.`);
  await apresCoup();
}

// Monte une seule carte (la plus petite possible) ; renvoie true si une carte a bougé.
function monterUne(J) {
  const origines = [];
  if (J.waste.length) origines.push({ loc: 'waste', i: 0, k: 0 });
  J.tab.forEach((col, i) => { if (col.length) origines.push({ loc: 'tab', i, k: col.length - 1 }); });
  origines.sort((a, b) => pile(J, a)[0].r - pile(J, b)[0].r);
  for (const o of origines) {
    const f = fondationPour(J, pile(J, o)[0]);
    if (f >= 0) return deplacer(J, o, { loc: 'found', i: f });
  }
  return false;
}

async function toutRanger() {
  if (occupe) return;
  memoriser();
  occupe = true;
  while (await avecAnimation(() => monterUne(E.jeu), { duree: 200 })) await attendre(20);
  occupe = false;
  await apresCoup();
}

async function demanderNouvelle() {
  if (occupe) return;
  if (options.defi) {
    if (partieCommencee() && !(await demander({ titre: 'Recommencer ?', texte: 'La partie en cours sera abandonnée.', oui: 'Oui, recommencer', non: 'Non, continuer' }))) return;
    return nouvelle(options.defi.niveau);
  }
  const niveau = await choisirNiveau();
  if (niveau) nouvelle(niveau);
}

// Fenêtre de choix du niveau (avec la confirmation si une partie est en cours).
function choisirNiveau() {
  return new Promise((resoudre) => {
    const fond = document.createElement('div');
    fond.className = 'sheet temp';
    fond.innerHTML = `
      <div class="sheet-box" role="dialog" aria-modal="true" aria-labelledby="sol-choix">
        <h3 id="sol-choix">Nouvelle partie</h3>
        ${partieCommencee() ? '<p>La partie en cours sera abandonnée.</p>' : ''}
        <div class="choix-niveaux">
          ${Object.keys(NIVEAUX).map((n) => `<button class="btn choix ${n === E?.niveau ? 'actuel' : ''}" data-n="${n}"><b>${NOMS[n]}</b><small>${DESCRIPTIONS[n]}</small></button>`).join('')}
        </div>
        <button class="btn" data-n="">Annuler</button>
      </div>`;
    document.body.append(fond);
    animer(fond.firstElementChild, [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 });
    fond.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-n]');
      if (!b && e.target !== fond) return;
      fond.remove();
      resoudre(b ? b.dataset.n || null : null);
    });
    fond.querySelector('.choix').focus();
  });
}

function construire() {
  racine.innerHTML = `
    <div class="sol-body">
      <div class="table" id="sol-table"></div>
      <div class="sol-side">
        <p class="status" id="sol-status" aria-live="polite"></p>
        <p class="sol-info" id="sol-info"></p>
        <button class="btn primary" id="sol-finish" hidden>Tout ranger</button>
        <div class="tools">
          <button class="btn" id="sol-undo">Annuler</button>
          <button class="btn" id="sol-hint">Indice</button>
          <button class="btn" id="sol-collect">Monter</button>
        </div>
        <button class="btn" id="sol-new">${options.defi ? 'Recommencer' : 'Nouvelle partie'}</button>
        <p class="tip">Touchez une carte, puis l’endroit où la poser. Touchez-la deux fois pour qu’elle se range toute seule.</p>
      </div>
    </div>`;
  $('#sol-table', racine).addEventListener('click', (e) => {
    const t = e.target.closest('[data-loc]');
    if (!t) return;
    const carte = e.target.closest('.card') || t;
    toucher(t.dataset.loc, Number(t.dataset.i || 0), t.dataset.k === undefined ? -1 : Number(t.dataset.k), carte);
  });
  $('#sol-undo', racine).addEventListener('click', annuler);
  $('#sol-hint', racine).addEventListener('click', montrerIndice);
  $('#sol-collect', racine).addEventListener('click', monter);
  $('#sol-finish', racine).addEventListener('click', toutRanger);
  $('#sol-new', racine).addEventListener('click', demanderNouvelle);
  observateur = () => { if (!occupe) dessiner(); };
  window.addEventListener('resize', observateur);
}

// ---------- Module ----------

export default {
  id: 'solitaire',
  nom: 'Solitaire',
  description: 'Le classique, une ou trois cartes à la fois',
  paysage: true,
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-9 24 36)"><rect class="ic-back" x="8" y="12" width="32" height="44" rx="5"/></g><g transform="rotate(8 40 36)"><rect class="ic-card" x="26" y="10" width="32" height="44" rx="5"/><text class="ic-red" x="42" y="30">A</text><text class="ic-red" x="42" y="48">♥</text></g></svg>`,

  resume() {
    options = {};
    charger();
    return partieCommencee() ? `Partie en cours (${NOMS[E.niveau].toLowerCase()}), ${pluriel(E.jeu.moves, 'coup')}` : '';
  },

  monter(conteneur, opts = {}) {
    racine = conteneur;
    options = opts;
    charger();
    if (E && options.defi && E.niveau !== options.defi.niveau) E = null;
    sel = null;
    conseil = null;
    occupe = false;
    construire();
    if (!E || (options.defi && E.gagne)) nouvelle(options.defi?.niveau || 'facile');
    else {
      dessiner();
      dire(E.gagne ? 'Partie gagnée. Touchez « Nouvelle partie » pour rejouer.' : '');
      commanderDonne(E.niveau);
    }
  },

  demonter() {
    window.removeEventListener('resize', observateur);
    racine = null;
  },
};
