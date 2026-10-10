// Dames : affichage et commandes. Règles dans moteur.js, ordinateur dans ia.js (calculé en arrière-plan).
// On touche un pion, puis la case d'arrivée ; pour une rafle, on touche chaque case d'arrivée l'une après l'autre.
import { $, $$, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire, ajouterVictoire } from '../../core/stockage.js';
import { demander, confirmer } from '../../core/dialogue.js';
import { BLANC, ROUGE, plateauInitial, coupsPermis, jouerCoup, compter } from './moteur.js';
import { NOMS_NIVEAUX, choisirCoup } from './ia.js';

chargerStyle(new URL('./dames.css', import.meta.url));

const CLE = 'dames';
const HISTORIQUE_SAUVE = 40;
const COUPS_SANS_PROGRES = 50; // 25 coups de chaque côté avec seulement des dames, sans prise : match nul

let D = null; // état sauvegardé
let racine = null;
let coups = []; // coups permis pour le camp qui joue
let sel = -1; // pion choisi
let chemin = []; // cases déjà touchées pendant une rafle
let conseil = null;
let reflechit = false;
let jeton = 0; // invalide les réponses de l'ordinateur devenues inutiles (annuler, nouvelle partie…)

// ---------- Calcul de l'ordinateur en arrière-plan (Web Worker), avec repli si indisponible ----------

let travailleur = null;
let travailleurEnPanne = false;
const enAttente = new Map();
let prochainId = 0;

function calculer(plateau, camp, N, niveau) {
  return new Promise((resoudre) => {
    if (!travailleurEnPanne && !travailleur) {
      try {
        travailleur = new Worker(new URL('./ia-worker.js', import.meta.url), { type: 'module' });
        travailleur.onmessage = (e) => {
          const fin = enAttente.get(e.data.id);
          enAttente.delete(e.data.id);
          if (fin) fin(e.data.coup);
        };
        travailleur.onerror = () => {
          travailleurEnPanne = true;
          travailleur = null;
          for (const [, fin] of enAttente) fin(undefined);
          enAttente.clear();
        };
      } catch {
        travailleurEnPanne = true;
      }
    }
    const surPlace = () => setTimeout(() => resoudre(choisirCoup(plateau, camp, N, { niveau, tempsMax: 2500 })), 30);
    if (travailleurEnPanne || !travailleur) return surPlace();
    const id = ++prochainId;
    enAttente.set(id, (coup) => (coup === undefined ? surPlace() : resoudre(coup)));
    travailleur.postMessage({ id, plateau, camp, N, niveau });
  });
}

// ---------- État ----------

function charger() {
  const s = lire(CLE, null);
  D = s && s.plateau && s.plateau.length ? s : null;
  if (D && !D.historique) D.historique = [];
}
function sauver() {
  if (D) ecrire(CLE, { ...D, historique: D.historique.slice(-HISTORIQUE_SAUVE) });
}
const partieCommencee = () => Boolean(D) && !D.fini && D.historique.length > 0;

function nouvelle(n, niveau) {
  jeton++;
  reflechit = false;
  const N = n || (D && D.n) || 8;
  D = { n: N, plateau: plateauInitial(N), tour: BLANC, niveau: niveau || (D && D.niveau) || 'moyen', dernier: [], calme: 0, fini: false, resultat: '', historique: [] };
  sel = -1;
  chemin = [];
  conseil = null;
  coups = coupsPermis(D.plateau, BLANC, N);
  sauver();
  dessiner();
}

// ---------- Affichage ----------

function texteStatut() {
  if (D.fini) {
    if (D.resultat === 'gagne') return '<strong>Bravo, vous avez gagné !</strong>';
    if (D.resultat === 'perdu') return '<strong>L’ordinateur a gagné cette fois.</strong>';
    return '<strong>Match nul.</strong>';
  }
  if (reflechit) return 'L’ordinateur réfléchit…';
  if (sel >= 0 && chemin.length) return '<strong>Continuez la prise :</strong> touchez la case suivante, marquée d’un point.';
  if (sel >= 0) return 'Touchez une case marquée d’un point jaune.';
  const prise = coups.length && coups[0].caps.length > 0;
  return prise ? '<strong>À vous :</strong> une prise est obligatoire (pion entouré de jaune).' : '<strong>À vous de jouer</strong> (pions blancs).';
}

function candidats() {
  return coups.filter((m) => m.from === sel && chemin.every((p, k) => m.path[k] === p));
}

function dessiner(message) {
  if (!racine || !D) return;
  const N = D.n, el = $('#dm-board', racine);
  el.style.setProperty('--n', N);
  let vue = D.plateau;
  const prises = new Set(), suivantes = new Set(), jouables = new Set(), conseillees = new Set();
  let ici = sel;
  if (sel >= 0) {
    const cands = candidats();
    if (chemin.length) {
      vue = D.plateau.slice();
      const p = vue[sel];
      vue[sel] = 0;
      ici = chemin[chemin.length - 1];
      vue[ici] = p;
      cands[0].caps.slice(0, chemin.length).forEach((x) => prises.add(x));
    }
    cands.forEach((m) => { if (m.path.length > chemin.length) suivantes.add(m.path[chemin.length]); });
  } else if (D.tour === BLANC && !D.fini && !reflechit) {
    coups.forEach((m) => jouables.add(m.from));
  }
  if (conseil) [conseil.from, ...conseil.path].forEach((x) => conseillees.add(x));

  let h = '';
  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N), c = i % N;
    if ((r + c) % 2 === 0) { h += '<div class="sq lt"></div>'; continue; }
    const v = vue[i];
    let cls = 'sq dk';
    if (D.dernier.includes(i)) cls += ' last';
    if (i === ici && sel >= 0) cls += ' sel';
    if (conseillees.has(i)) cls += ' hint';
    let dedans = '';
    if (v) {
      dedans += `<span class="pc ${v > 0 ? 'w' : 'r'}${Math.abs(v) === 2 ? ' king' : ''}${prises.has(i) ? ' taken' : ''}${jouables.has(i) ? ' can' : ''}"></span>`;
    }
    if (suivantes.has(i)) dedans += '<span class="dot"></span>';
    const nom = v ? `, ${v > 0 ? 'blanc' : 'rouge'}${Math.abs(v) === 2 ? ' (dame)' : ''}` : '';
    h += `<button class="${cls}" data-i="${i}" aria-label="Ligne ${r + 1}, colonne ${c + 1}${nom}">${dedans}</button>`;
  }
  el.innerHTML = h;
  $('#dm-status', racine).innerHTML = message || texteStatut();
  $('#dm-score', racine).textContent = `Vos pions : ${compter(D.plateau, BLANC)} · Pions de l’ordinateur : ${compter(D.plateau, ROUGE)}`;
  $$('#dm-level button', racine).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === D.niveau)));
  $$('#dm-size button', racine).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === N)));
  $('#dm-undo', racine).disabled = !D.historique.length || reflechit;
  $('#dm-hint', racine).disabled = reflechit || D.fini || D.tour !== BLANC;
}

// ---------- Déroulement ----------

function valider(m) {
  D.historique.push({ plateau: D.plateau.slice(), tour: D.tour, dernier: D.dernier.slice(), calme: D.calme });
  const piece = D.plateau[m.from], joueur = D.tour;
  D.plateau = jouerCoup(D.plateau, m, D.n);
  D.calme = m.caps.length || Math.abs(piece) === 1 ? 0 : D.calme + 1;
  D.dernier = [m.from, m.path[m.path.length - 1]];
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
  dessiner();
  if (D.fini) finDePartie();
  else if (D.tour === ROUGE) tourOrdinateur();
}

function finDePartie() {
  const textes = {
    gagne: ['Bravo !', 'Vous avez gagné la partie.'],
    perdu: ['Perdu cette fois', 'L’ordinateur a gagné. On refait une partie ?'],
    nul: ['Match nul', 'Plus personne ne peut gagner.'],
  };
  if (D.resultat === 'gagne') ajouterVictoire('dames');
  const [titre, texte] = textes[D.resultat];
  demander({ titre, texte, oui: 'Nouvelle partie', non: 'Fermer' }).then((oui) => oui && nouvelle());
}

async function tourOrdinateur() {
  reflechit = true;
  const monJeton = ++jeton;
  dessiner();
  const debut = Date.now();
  const coup = await calculer(D.plateau, ROUGE, D.n, D.niveau);
  // une petite pause pour que l'on voie bien l'ordinateur jouer
  const attente = Math.max(0, 500 - (Date.now() - debut));
  await new Promise((r) => setTimeout(r, attente));
  if (monJeton !== jeton) return;
  reflechit = false;
  valider(coup);
}

function toucher(i) {
  if (D.fini) return dessiner('La partie est finie. Touchez « Nouvelle partie » pour rejouer.');
  if (D.tour !== BLANC || reflechit) return;
  conseil = null;
  if (sel >= 0) {
    const cands = candidats();
    if (cands.some((m) => m.path.length > chemin.length && m.path[chemin.length] === i)) {
      chemin.push(i);
      const complet = cands.find((m) => m.path.length === chemin.length && m.path.every((p, k) => p === chemin[k]));
      if (complet) valider(complet);
      else dessiner();
      return;
    }
    if (chemin.length) return dessiner('<strong>Continuez la prise :</strong> touchez une case marquée d’un point jaune.');
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
  } else if (sel >= 0) {
    sel = -1;
    dessiner('Cette case n’est pas possible. Choisissez un pion entouré de jaune.');
  }
}

async function montrerIndice() {
  if (D.fini || D.tour !== BLANC || reflechit) return;
  sel = -1;
  chemin = [];
  const monJeton = jeton;
  dessiner('Je cherche un bon coup…');
  const coup = await calculer(D.plateau, BLANC, D.n, 'moyen');
  if (monJeton !== jeton || !racine || D.tour !== BLANC || !coup) return;
  conseil = coup;
  dessiner(coup.caps.length > 1
    ? `Conseil : prenez ${pluriel(coup.caps.length, 'pièce')} avec le pion entouré, en passant par les cases entourées.`
    : 'Conseil : jouez le pion entouré vers la case entourée.');
}

function annuler() {
  if (reflechit || !D.historique.length) return;
  jeton++;
  // on revient au dernier moment où c'était à vous de jouer
  while (D.historique.length) {
    const h = D.historique.pop();
    if (h.tour === BLANC) {
      Object.assign(D, { plateau: h.plateau, tour: BLANC, dernier: h.dernier, calme: h.calme, fini: false, resultat: '' });
      break;
    }
  }
  sel = -1;
  chemin = [];
  conseil = null;
  coups = coupsPermis(D.plateau, D.tour, D.n);
  sauver();
  dessiner('Coup annulé. À vous de jouer.');
  if (D.tour === ROUGE) tourOrdinateur();
}

function construire() {
  racine.innerHTML = `
    <div class="seg" id="dm-level" role="group" aria-label="Niveau de l’ordinateur">
      ${Object.keys(NOMS_NIVEAUX).map((n) => `<button data-level="${n}">${NOMS_NIVEAUX[n]}</button>`).join('')}
    </div>
    <p class="status" id="dm-status" aria-live="polite"></p>
    <div class="dm" id="dm-board"></div>
    <p class="dm-score" id="dm-score"></p>
    <div class="tools">
      <button class="btn" id="dm-undo">Annuler</button>
      <button class="btn" id="dm-hint">Indice</button>
      <button class="btn" id="dm-new">Nouvelle partie</button>
    </div>
    <div class="seg" id="dm-size" role="group" aria-label="Taille du plateau">
      <button data-size="8">Plateau 8 × 8</button><button data-size="10">Plateau 10 × 10</button>
    </div>
    <p class="tip">Vous jouez les pions blancs. La prise est obligatoire (on prend le plus de pièces possible), les pions peuvent prendre en arrière, et la dame se déplace de plusieurs cases.</p>`;

  $('#dm-board', racine).addEventListener('click', (e) => {
    const b = e.target.closest('.sq.dk');
    if (b) toucher(Number(b.dataset.i));
  });
  $('#dm-level', racine).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (!b) return;
    D.niveau = b.dataset.level;
    sauver();
    dessiner(`Niveau de l’ordinateur : ${NOMS_NIVEAUX[D.niveau].toLowerCase()}.`);
  });
  $('#dm-size', racine).addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-size]');
    if (!b || Number(b.dataset.size) === D.n) return;
    if (partieCommencee() && !(await confirmer('La partie en cours sera abandonnée.', 'Oui, changer de plateau'))) return;
    nouvelle(Number(b.dataset.size));
  });
  $('#dm-new', racine).addEventListener('click', async () => {
    if (partieCommencee() && !(await confirmer('La partie en cours sera abandonnée.', 'Oui, nouvelle partie'))) return;
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
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect class="ic-lt" x="4" y="4" width="28" height="28"/><rect class="ic-dk" x="32" y="4" width="28" height="28"/><rect class="ic-dk" x="4" y="32" width="28" height="28"/><rect class="ic-lt" x="32" y="32" width="28" height="28"/><circle class="ic-pr" cx="46" cy="18" r="10"/><circle class="ic-pw" cx="18" cy="46" r="10"/></svg>`,

  resume() {
    charger();
    return partieCommencee() ? `Partie en cours, plateau ${D.n} × ${D.n}` : '';
  },

  monter(conteneur) {
    racine = conteneur;
    charger();
    sel = -1;
    chemin = [];
    conseil = null;
    reflechit = false;
    construire();
    if (!D) return nouvelle(8);
    coups = coupsPermis(D.plateau, D.tour, D.n);
    dessiner();
    if (D.tour === ROUGE && !D.fini) tourOrdinateur();
  },

  demonter() {
    jeton++; // ignore un calcul de l'ordinateur encore en cours
    reflechit = false;
    racine = null;
  },
};
