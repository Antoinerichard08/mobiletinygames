// Dames : affichage, animations et commandes. Règles dans moteur.js, ordinateur dans ia.js (calculé en arrière-plan).
// On touche un pion, puis la case d'arrivée ; pour une rafle, on touche chaque case d'arrivée l'une après l'autre.
// Chaque pion a une identité stable : il glisse de case en case, rien ne se téléporte.
import { $, $$, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire } from '../../core/stockage.js';
import { confirmer, demander } from '../../core/dialogue.js';
import { finirPartie } from '../../core/partie.js';
import { revenir } from '../../core/navigation.js';
import { creerTravailleur } from '../../core/travail.js';
import { animer, attendre, secouer, pop, mouvementReduit, COURBE_DOUCE, COURBE_REBOND } from '../../core/mouvement.js';
import { BLANC, ROUGE, plateauInitial, coupsPermis, jouerCoup, compter } from './moteur.js';
import { NOMS_NIVEAUX, choisirCoup } from './ia.js';

chargerStyle(new URL('./dames.css', import.meta.url));

const HISTORIQUE_SAUVE = 40;
const COUPS_SANS_PROGRES = 50; // 25 coups de chaque côté avec seulement des dames, sans prise : match nul
const SEGMENT_JOUEUR = 200; // durée d'un saut (ms)
const SEGMENT_ORDI = 300;

const cerveau = creerTravailleur(
  new URL('./ia-worker.js', import.meta.url),
  ({ plateau, camp, N, niveau }) => ({ coup: choisirCoup(plateau, camp, N, { niveau, tempsMax: 2500 }) }),
);

let D = null; // état sauvegardé
let racine = null;
let options = {};
let coups = []; // coups permis pour le camp qui joue
let sel = -1; // pion choisi
let chemin = []; // cases déjà touchées pendant une rafle
let conseil = null;
let reflechit = false;
let anime = false;
let jeton = 0; // invalide les réponses de l'ordinateur devenues inutiles (annuler, nouvelle partie…)

const cleSauvegarde = () => (options.defi ? `dames.defi.${options.defi.id}` : 'dames');

// ---------- État ----------

function idsDepuis(plateau) {
  return plateau.map((v, i) => (v ? `p${i}` : null));
}

function charger() {
  const s = lire(cleSauvegarde(), null);
  D = s && s.plateau && s.plateau.length ? s : null;
  if (D) {
    D.historique ||= [];
    D.ids ||= idsDepuis(D.plateau);
    D.indices ||= 0;
    D.annulations ||= 0;
  }
}
function sauver() {
  if (D) ecrire(cleSauvegarde(), { ...D, historique: D.historique.slice(-HISTORIQUE_SAUVE) });
}
const partieCommencee = () => Boolean(D) && !D.fini && D.historique.length > 0;

function nouvelle(n, niveau) {
  jeton++;
  reflechit = false;
  const defi = options.defi;
  const N = defi?.taille || n || (D && D.n) || 8;
  const plateau = plateauInitial(N);
  D = {
    n: N, plateau, ids: idsDepuis(plateau), tour: BLANC,
    niveau: defi?.niveau || niveau || (D && D.niveau) || 'moyen',
    dernier: [], calme: 0, fini: false, resultat: '', historique: [], indices: 0, annulations: 0,
  };
  sel = -1;
  chemin = [];
  conseil = null;
  coups = coupsPermis(D.plateau, BLANC, N);
  sauver();
  construirePlateau();
  dessiner();
  // les pions arrivent en douceur, rangée après rangée
  if (!mouvementReduit()) {
    $$('.dm-pieces .pc', racine).forEach((el) => {
      const r = Number(el.style.getPropertyValue('--r'));
      const versLeHaut = r > N / 2;
      animer(el, [
        { opacity: 0, transform: `${transformee(r + (versLeHaut ? 1.2 : -1.2), Number(el.style.getPropertyValue('--c')))} scale(.6)` },
        { opacity: 1, transform: transformee(r, Number(el.style.getPropertyValue('--c'))) },
      ], { duration: 420, delay: (versLeHaut ? N - 1 - r : r) * 70, fill: 'backwards' });
    });
  }
}

// ---------- Affichage ----------

const transformee = (r, c) => `translate(${c * 100}%, ${r * 100}%)`;

function texteStatut() {
  if (D.fini) {
    if (D.resultat === 'gagne') return '<strong>Bravo, vous avez gagné !</strong>';
    if (D.resultat === 'perdu') return '<strong>L’ordinateur a gagné cette fois.</strong>';
    return '<strong>Match nul.</strong>';
  }
  if (reflechit) return 'L’ordinateur réfléchit<span class="dots"><i>.</i><i>.</i><i>.</i></span>';
  if (sel >= 0 && chemin.length) return '<strong>Continuez la prise :</strong> touchez la case suivante, marquée d’un point.';
  if (sel >= 0) return 'Touchez une case marquée d’un point jaune.';
  const prise = coups.length && coups[0].caps.length > 0;
  return prise ? '<strong>À vous :</strong> une prise est obligatoire (pion entouré de jaune).' : '<strong>À vous de jouer</strong> (pions blancs).';
}

function candidats() {
  return coups.filter((m) => m.from === sel && chemin.every((p, k) => m.path[k] === p));
}

function construirePlateau() {
  const N = D.n, el = $('#dm-board', racine);
  el.style.setProperty('--n', N);
  let h = '<div class="dm-squares">';
  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N), c = i % N;
    h += (r + c) % 2 === 0 ? '<div class="sq lt"></div>' : `<button class="sq dk" data-i="${i}" aria-label="Ligne ${r + 1}, colonne ${c + 1}"></button>`;
  }
  el.innerHTML = h + '</div><div class="dm-pieces" aria-hidden="true"></div>';
}

/** Vue actuelle (pendant une rafle, le pion est déjà sur la dernière case touchée). */
function vueActuelle() {
  if (sel < 0 || !chemin.length) return { plateau: D.plateau, ids: D.ids, prises: new Set() };
  const plateau = D.plateau.slice(), ids = D.ids.slice();
  const fin = chemin[chemin.length - 1];
  plateau[fin] = plateau[sel]; ids[fin] = ids[sel];
  plateau[sel] = 0; ids[sel] = null;
  const prises = new Set(candidats()[0].caps.slice(0, chemin.length));
  return { plateau, ids, prises };
}

/**
 * Place les pions. Ceux qui ont changé de case glissent (sauf ceux de `sansGlisser`, animés à part),
 * ceux qui ont disparu s'effacent (après le délai indiqué dans `fondus`).
 */
function placerPieces({ sansGlisser = new Set(), fondus = new Map(), glisser = true } = {}) {
  const couche = $('.dm-pieces', racine);
  if (!couche) return;
  const { plateau, ids, prises } = vueActuelle();
  const N = D.n;
  const jouables = new Set(sel < 0 && D.tour === BLANC && !D.fini && !reflechit && !anime ? coups.map((m) => m.from) : []);
  const existants = new Map([...couche.children].filter((e) => !e.classList.contains('sortie')).map((e) => [e.dataset.cle, e]));
  const presents = new Set();
  plateau.forEach((v, i) => {
    if (!v) return;
    const id = ids[i];
    presents.add(id);
    let el = existants.get(id);
    const neuf = !el;
    if (neuf) {
      el = document.createElement('span');
      el.dataset.cle = id;
      el.innerHTML = '<i></i>';
      couche.append(el);
    }
    const r = Math.floor(i / N), c = i % N;
    const ancienR = Number(el.style.getPropertyValue('--r')), ancienC = Number(el.style.getPropertyValue('--c'));
    el.className = `pc ${v > 0 ? 'w' : 'r'}${Math.abs(v) === 2 ? ' king' : ''}${prises.has(i) ? ' taken' : ''}${jouables.has(i) ? ' can' : ''}${i === (chemin.length ? chemin[chemin.length - 1] : sel) && sel >= 0 ? ' lifted' : ''}`;
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
    if (!neuf && glisser && !sansGlisser.has(id) && (ancienR !== r || ancienC !== c)) {
      animer(el, [{ transform: transformee(ancienR, ancienC) }, { transform: transformee(r, c) }], { duration: 320 });
    } else if (neuf && glisser) {
      animer(el, [{ opacity: 0, transform: `${transformee(r, c)} scale(.5)` }, { opacity: 1, transform: transformee(r, c) }], { duration: 300 });
    }
  });
  for (const [id, el] of existants) {
    if (presents.has(id)) continue;
    el.classList.add('sortie', 'taken');
    animer(el, [
      { opacity: 1, transform: `${el.style.transform || transformee(Number(el.style.getPropertyValue('--r')), Number(el.style.getPropertyValue('--c')))}` },
      { opacity: 0, transform: `${transformee(Number(el.style.getPropertyValue('--r')), Number(el.style.getPropertyValue('--c')))} scale(.3)` },
    ], { duration: 280, delay: fondus.get(id) || 0, fill: 'forwards' }).then(() => el.remove());
  }
}

function dessiner(message, optionsPieces = {}) {
  if (!racine || !D) return;
  const N = D.n;
  const suivantes = new Set(), conseillees = new Set();
  let ici = sel;
  if (sel >= 0) {
    if (chemin.length) ici = chemin[chemin.length - 1];
    candidats().forEach((m) => { if (m.path.length > chemin.length) suivantes.add(m.path[chemin.length]); });
  }
  if (conseil) [conseil.from, ...conseil.path].forEach((x) => conseillees.add(x));
  $$('.dm-squares .sq.dk', racine).forEach((b) => {
    const i = Number(b.dataset.i);
    b.className = 'sq dk'
      + (D.dernier.includes(i) ? ' last' : '')
      + (i === ici && sel >= 0 ? ' sel' : '')
      + (conseillees.has(i) ? ' hint' : '')
      + (suivantes.has(i) ? ' target' : '');
    const v = vueActuelle().plateau[i];
    b.setAttribute('aria-label', `Ligne ${Math.floor(i / N) + 1}, colonne ${(i % N) + 1}${v ? `, ${v > 0 ? 'blanc' : 'rouge'}${Math.abs(v) === 2 ? ' (dame)' : ''}` : ''}${suivantes.has(i) ? ', case possible' : ''}`);
  });
  placerPieces(optionsPieces);
  $('#dm-status', racine).innerHTML = message || texteStatut();
  $('#dm-score', racine).textContent = `Vos pions : ${compter(D.plateau, BLANC)} · Pions de l’ordinateur : ${compter(D.plateau, ROUGE)}`;
  $$('#dm-level button', racine).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === D.niveau)));
  $$('#dm-size button', racine).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === N)));
  $('#dm-undo', racine).disabled = !D.historique.length || reflechit || anime;
  $('#dm-hint', racine).disabled = reflechit || anime || D.fini || D.tour !== BLANC;
}

// ---------- Animation d'un coup ----------

/**
 * Anime le pion qui joue le long de sa rafle, à partir du saut n° `depuis` (les précédents ont déjà été montrés).
 * Les pièces prises s'effacent quand le pion passe au-dessus d'elles.
 */
async function animerCoup(m, idPion, depuis, segment) {
  const el = $(`.dm-pieces [data-cle="${idPion}"]`, racine);
  if (!el || mouvementReduit()) return;
  const N = D.n;
  const points = [m.from, ...m.path].slice(depuis).map((i) => [Math.floor(i / N), i % N]);
  if (points.length < 2) return;
  const images = points.map(([r, c], k) => ({
    transform: `${transformee(r, c)} scale(${k === 0 || k === points.length - 1 ? 1 : 1.12})`,
    offset: k / (points.length - 1),
  }));
  // le pion se soulève pendant le trajet
  images[0].transform = `${transformee(points[0][0], points[0][1])} scale(1.1)`;
  el.classList.add('moving');
  await animer(el, images, { duration: segment * (points.length - 1), easing: points.length > 2 ? 'linear' : COURBE_DOUCE });
  el.classList.remove('moving');
}

async function valider(m, depuis = 0) {
  const segment = D.tour === BLANC ? SEGMENT_JOUEUR : SEGMENT_ORDI;
  D.historique.push({ plateau: D.plateau.slice(), ids: D.ids.slice(), tour: D.tour, dernier: D.dernier.slice(), calme: D.calme });
  const piece = D.plateau[m.from], joueur = D.tour, idPion = D.ids[m.from];
  const etaitPion = Math.abs(piece) === 1;
  // nouvelles identités : le pion change de case, les pièces prises disparaissent
  const ids = D.ids.slice();
  const fondus = new Map();
  m.caps.forEach((c, k) => {
    // la pièce prise s'efface au moment où le pion passe au-dessus d'elle
    fondus.set(ids[c], Math.max(0, (k - depuis + 0.5) * segment));
    ids[c] = null;
  });
  const arrivee = m.path[m.path.length - 1];
  ids[m.from] = null;
  ids[arrivee] = idPion;
  D.plateau = jouerCoup(D.plateau, m, D.n);
  D.ids = ids;
  D.calme = m.caps.length || etaitPion ? 0 : D.calme + 1;
  D.dernier = [m.from, arrivee];
  D.tour = -D.tour;
  sel = -1;
  chemin = [];
  conseil = null;
  coups = coupsPermis(D.plateau, D.tour, D.n);
  if (!coups.length) {
    D.fini = true;
    D.resultat = joueur === BLANC ? 'gagne' : 'perdu';
  } else if (D.calme >= COUPS_SANS_PROGRES) {
    D.fini = true;
    D.resultat = 'nul';
  }
  sauver();
  anime = true;
  dessiner(undefined, { sansGlisser: new Set([idPion]), fondus });
  await animerCoup(m, idPion, depuis, segment);
  // promotion : la couronne apparaît
  if (etaitPion && Math.abs(D.plateau[arrivee]) === 2) {
    const el = $(`.dm-pieces [data-cle="${idPion}"] i`, racine);
    await pop(el, 1.35);
  }
  anime = false;
  dessiner();
  if (D.fini) finDePartie();
  else if (D.tour === ROUGE) tourOrdinateur();
}

async function finDePartie() {
  await attendre(400);
  const textes = {
    gagne: ['Bravo !', 'Vous avez gagné la partie.'],
    perdu: ['Perdu cette fois', 'L’ordinateur a gagné. On refait une partie ?'],
    nul: ['Match nul', 'Plus personne ne peut gagner.'],
  };
  const [titre, texte] = textes[D.resultat];
  const choix = await finirPartie({
    jeu: 'dames',
    gagne: D.resultat === 'gagne',
    difficulte: D.niveau,
    defi: options.defi,
    titre,
    texte,
    details: {
      pionsRestants: compter(D.plateau, BLANC),
      indices: D.indices,
      annulations: D.annulations,
      taille: D.n,
      nul: D.resultat === 'nul',
    },
  });
  if (choix === 'rejouer') nouvelle();
  else if (choix === 'carte') revenir('niveaux');
}

async function tourOrdinateur() {
  reflechit = true;
  const monJeton = ++jeton;
  dessiner();
  const debut = Date.now();
  const { coup } = await cerveau.calculer({ plateau: D.plateau, camp: ROUGE, N: D.n, niveau: D.niveau });
  // une petite pause pour que l'on voie bien l'ordinateur jouer
  const reste = Math.max(0, 600 - (Date.now() - debut));
  await new Promise((r) => setTimeout(r, reste));
  if (monJeton !== jeton || !racine) return;
  reflechit = false;
  await valider(coup);
}

async function toucher(i, bouton) {
  if (D.fini) return dessiner('La partie est finie. Touchez « Nouvelle partie » pour rejouer.');
  if (D.tour !== BLANC || reflechit || anime) return;
  conseil = null;
  if (sel >= 0) {
    const cands = candidats();
    if (cands.some((m) => m.path.length > chemin.length && m.path[chemin.length] === i)) {
      const precedent = chemin.length ? chemin[chemin.length - 1] : sel;
      chemin.push(i);
      const complet = cands.find((m) => m.path.length === chemin.length && m.path.every((p, k) => p === chemin[k]));
      if (complet) return valider(complet, chemin.length - 1);
      // étape intermédiaire d'une rafle : le pion saute jusqu'à la case touchée
      const idPion = D.ids[sel];
      anime = true;
      dessiner(undefined, { sansGlisser: new Set([idPion]) });
      await animerCoup({ from: precedent, path: [i] }, idPion, 0, SEGMENT_JOUEUR);
      anime = false;
      dessiner();
      return;
    }
    if (chemin.length) {
      secouer(bouton);
      return dessiner('<strong>Continuez la prise :</strong> touchez une case marquée d’un point jaune.');
    }
    if (i === sel) {
      sel = -1;
      return dessiner();
    }
  }
  if (D.plateau[i] > 0 && coups.some((m) => m.from === i)) {
    sel = i;
    chemin = [];
    dessiner();
  } else if (D.plateau[i] > 0) {
    const prise = coups.length && coups[0].caps.length > 0;
    sel = -1;
    dessiner(prise ? '<strong>Prise obligatoire :</strong> choisissez un pion entouré de jaune.' : 'Ce pion ne peut pas bouger pour l’instant.');
    secouer($(`.dm-pieces [data-cle="${D.ids[i]}"] i`, racine));
  } else if (sel >= 0) {
    sel = -1;
    dessiner('Cette case n’est pas possible. Choisissez un pion entouré de jaune.');
  }
}

async function montrerIndice() {
  if (D.fini || D.tour !== BLANC || reflechit || anime) return;
  sel = -1;
  chemin = [];
  const monJeton = jeton;
  dessiner('Je cherche un bon coup…');
  const { coup } = await cerveau.calculer({ plateau: D.plateau, camp: BLANC, N: D.n, niveau: 'moyen' });
  if (monJeton !== jeton || !racine || D.tour !== BLANC || !coup) return;
  conseil = coup;
  D.indices++;
  sauver();
  dessiner(coup.caps.length > 1
    ? `Conseil : prenez ${pluriel(coup.caps.length, 'pièce')} avec le pion entouré, en passant par les cases entourées.`
    : 'Conseil : jouez le pion entouré vers la case entourée.');
}

function annuler() {
  if (reflechit || anime || !D.historique.length) return;
  jeton++;
  // on revient au dernier moment où c'était à vous de jouer
  while (D.historique.length) {
    const h = D.historique.pop();
    if (h.tour === BLANC) {
      Object.assign(D, { plateau: h.plateau, ids: h.ids || idsDepuis(h.plateau), tour: BLANC, dernier: h.dernier, calme: h.calme, fini: false, resultat: '' });
      break;
    }
  }
  D.annulations++;
  sel = -1;
  chemin = [];
  conseil = null;
  coups = coupsPermis(D.plateau, D.tour, D.n);
  sauver();
  dessiner('Coup annulé. À vous de jouer.');
  if (D.tour === ROUGE) tourOrdinateur();
}

function construire() {
  const defi = options.defi;
  racine.innerHTML = `
    <div class="dm-body">
      <div class="dm-infos">
        ${defi ? '' : `<div class="seg" id="dm-level" role="group" aria-label="Niveau de l’ordinateur">
          ${Object.keys(NOMS_NIVEAUX).map((n) => `<button data-level="${n}">${NOMS_NIVEAUX[n]}</button>`).join('')}
        </div>`}
        <p class="status" id="dm-status" aria-live="polite"></p>
        <p class="dm-score" id="dm-score"></p>
      </div>
      <div class="dm-plateau"><div class="dm" id="dm-board"></div></div>
      <div class="dm-side">
        <div class="tools">
          <button class="btn" id="dm-undo">Annuler</button>
          <button class="btn" id="dm-hint">Indice</button>
          <button class="btn" id="dm-new">${defi ? 'Recommencer' : 'Nouvelle partie'}</button>
        </div>
        ${defi ? '' : `<div class="seg" id="dm-size" role="group" aria-label="Taille du plateau">
          <button data-size="8">Plateau 8 × 8</button><button data-size="10">Plateau 10 × 10</button>
        </div>`}
        <p class="tip">Vous jouez les pions blancs. La prise est obligatoire (on prend le plus de pièces possible), les pions peuvent prendre en arrière, et la dame se déplace de plusieurs cases.</p>
      </div>
    </div>`;

  $('#dm-board', racine).addEventListener('click', (e) => {
    const b = e.target.closest('.sq.dk');
    if (b) toucher(Number(b.dataset.i), b);
  });
  $('#dm-level', racine)?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (!b) return;
    D.niveau = b.dataset.level;
    sauver();
    dessiner(`Niveau de l’ordinateur : ${NOMS_NIVEAUX[D.niveau].toLowerCase()}.`);
  });
  $('#dm-size', racine)?.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-size]');
    if (!b || Number(b.dataset.size) === D.n) return;
    if (partieCommencee() && !(await confirmer('La partie en cours sera abandonnée.', 'Oui, changer de plateau'))) return;
    nouvelle(Number(b.dataset.size));
  });
  $('#dm-new', racine).addEventListener('click', async () => {
    if (anime) return;
    if (partieCommencee()) {
      const ok = options.defi
        ? await demander({ titre: 'Recommencer ?', texte: 'La partie en cours sera abandonnée.', oui: 'Oui, recommencer', non: 'Non, continuer' })
        : await confirmer('La partie en cours sera abandonnée.', 'Oui, nouvelle partie');
      if (!ok) return;
    }
    nouvelle();
  });
  $('#dm-undo', racine).addEventListener('click', annuler);
  $('#dm-hint', racine).addEventListener('click', montrerIndice);
}

// ---------- Module ----------

export default {
  id: 'dames',
  nom: 'Dames',
  description: 'Contre l’ordinateur, 8 × 8 ou 10 × 10',
  paysage: true,
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect class="ic-lt" x="4" y="4" width="28" height="28"/><rect class="ic-dk" x="32" y="4" width="28" height="28"/><rect class="ic-dk" x="4" y="32" width="28" height="28"/><rect class="ic-lt" x="32" y="32" width="28" height="28"/><circle class="ic-pr" cx="46" cy="18" r="10"/><circle class="ic-pw" cx="18" cy="46" r="10"/></svg>`,

  resume() {
    options = {};
    charger();
    return partieCommencee() ? `Partie en cours, plateau ${D.n} × ${D.n}` : '';
  },

  monter(conteneur, opts = {}) {
    racine = conteneur;
    options = opts;
    charger();
    if (D && options.defi && (D.niveau !== options.defi.niveau || D.fini)) D = null;
    sel = -1;
    chemin = [];
    conseil = null;
    reflechit = false;
    anime = false;
    construire();
    if (!D) return nouvelle(options.defi?.taille || 8);
    coups = coupsPermis(D.plateau, D.tour, D.n);
    construirePlateau();
    dessiner();
    if (D.tour === ROUGE && !D.fini) tourOrdinateur();
  },

  demonter() {
    jeton++; // ignore un calcul de l'ordinateur encore en cours
    reflechit = false;
    anime = false;
    racine = null;
  },
};
