// Sudoku : affichage, animations et commandes. Les règles et la génération sont dans moteur.js.
import { $, $$, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire } from '../../core/stockage.js';
import { confirmer, demander } from '../../core/dialogue.js';
import { finirPartie } from '../../core/partie.js';
import { revenir } from '../../core/navigation.js';
import { animer, attendre, pop, secouer, mouvementReduit, COURBE_REBOND } from '../../core/mouvement.js';
import { NIVEAUX, NOMS_NIVEAUX, VOISINS, genererGrille, conflits } from './moteur.js';

chargerStyle(new URL('./sudoku.css', import.meta.url));

const MAX_HISTORIQUE = 150;

// État de la partie (sauvegardé) + état d'affichage (non sauvegardé)
let S = null;
let racine = null;
let options = {};
let sel = -1;
let crayon = false;
let fausses = new Set(); // cases signalées par « Vérifier »

const cleSauvegarde = () => (options.defi ? `sudoku.defi.${options.defi.id}` : 'sudoku');

function vierge(niveau = 'moyen') {
  return { grille: null, solution: null, actuel: null, notes: null, niveau, gagne: false, historique: [], indices: 0, erreurs: 0, annulations: 0 };
}

function charger() {
  const s = lire(cleSauvegarde(), null);
  S = s && s.grille ? s : vierge(options.defi?.niveau);
  S.historique ||= [];
  S.indices ||= 0;
  S.erreurs ||= 0;
  S.annulations ||= 0;
}
function sauver() {
  ecrire(cleSauvegarde(), S);
}
function partieCommencee() {
  return Boolean(S.grille) && !S.gagne && S.actuel.some((v, i) => v !== S.grille[i]);
}
function dire(texte) {
  const el = $('#sdk-status', racine);
  if (el) el.textContent = texte || '';
}

function nouvelleGrille(niveau) {
  S.niveau = options.defi?.niveau || niveau || S.niveau;
  dire('Préparation de la grille…');
  // petit délai pour que le message s'affiche avant le calcul
  setTimeout(() => {
    const { grille, solution } = genererGrille(NIVEAUX[S.niveau]);
    Object.assign(S, vierge(S.niveau), { grille, solution, actuel: grille.slice(), notes: new Array(81).fill(0) });
    sel = -1;
    fausses = new Set();
    sauver();
    if (!racine) return;
    dessiner();
    dire('Touchez une case vide, puis un chiffre.');
    // les chiffres apparaissent en vague, du coin en haut à gauche vers le bas
    if (!mouvementReduit()) {
      $$('#sdk-board .cell.given', racine).forEach((el) => {
        const i = Number(el.dataset.i), d = Math.floor(i / 9) + (i % 9);
        animer(el, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 300, delay: d * 28, easing: COURBE_REBOND, fill: 'backwards' });
      });
    }
  }, 30);
}

async function demanderNouvelleGrille(niveau) {
  if (partieCommencee()) {
    const ok = options.defi
      ? await demander({ titre: 'Recommencer ?', texte: 'La grille en cours sera effacée.', oui: 'Oui, recommencer', non: 'Non, continuer' })
      : await confirmer('La grille en cours sera abandonnée.', 'Oui, nouvelle grille');
    if (!ok) return dessiner();
  }
  nouvelleGrille(niveau);
}

// ---------- Affichage ----------

function construire() {
  const defi = options.defi;
  racine.innerHTML = `
    <div class="sdk-body">
      ${defi ? '' : `<div class="seg sdk-level" id="sdk-level" role="group" aria-label="Niveau">
        ${Object.keys(NIVEAUX).map((n) => `<button data-level="${n}">${NOMS_NIVEAUX[n]}</button>`).join('')}
      </div>`}
      <div class="sdk" id="sdk-board">${Array.from({ length: 81 }, (_, i) => `<button class="cell" data-i="${i}"></button>`).join('')}</div>
      <div class="sdk-side">
        <p class="status" id="sdk-status" aria-live="polite"></p>
        <div class="pad" id="sdk-pad">
          ${Array.from({ length: 9 }, (_, k) => `<button data-d="${k + 1}" aria-label="Chiffre ${k + 1}">${k + 1}<small></small></button>`).join('')}
          <button class="erase" data-d="0" aria-label="Effacer">⌫</button>
        </div>
        <div class="tools">
          <button class="btn" id="sdk-undo">Annuler</button>
          <button class="btn" id="sdk-pencil" aria-pressed="false">Crayon</button>
          <button class="btn" id="sdk-hint">Indice</button>
          <button class="btn" id="sdk-check">Vérifier</button>
        </div>
        <button class="btn" id="sdk-new">${defi ? 'Recommencer' : 'Nouvelle grille'}</button>
      </div>
    </div>`;

  $('#sdk-board', racine).addEventListener('click', (e) => {
    const c = e.target.closest('.cell');
    if (!c) return;
    sel = Number(c.dataset.i);
    dire('');
    dessiner();
  });
  $('#sdk-pad', racine).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (b) saisir(Number(b.dataset.d), b);
  });
  $('#sdk-level', racine)?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (b) demanderNouvelleGrille(b.dataset.level);
  });
  $('#sdk-new', racine).addEventListener('click', () => demanderNouvelleGrille());
  $('#sdk-undo', racine).addEventListener('click', annuler);
  $('#sdk-hint', racine).addEventListener('click', indice);
  $('#sdk-check', racine).addEventListener('click', verifier);
  $('#sdk-pencil', racine).addEventListener('click', () => {
    crayon = !crayon;
    dire(crayon ? 'Mode crayon : les chiffres deviennent de petites notes.' : 'Mode crayon terminé.');
    dessiner();
    pop($('#sdk-pencil', racine), 1.08);
  });
}

function notesHtml(m) {
  if (!m) return '';
  let h = '<span class="notes">';
  for (let d = 1; d <= 9; d++) h += `<span>${m & (1 << d) ? d : ''}</span>`;
  return h + '</span>';
}

function dessiner() {
  if (!racine) return;
  $$('#sdk-level button', racine).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === S.niveau)));
  $('#sdk-pencil', racine).setAttribute('aria-pressed', String(crayon));
  $('#sdk-undo', racine).disabled = !S.historique.length;
  if (!S.grille) return;
  const conf = conflits(S.actuel);
  const valeurSel = sel >= 0 ? S.actuel[sel] : 0;
  const voisins = sel >= 0 ? new Set(VOISINS[sel]) : null;
  $$('#sdk-board .cell', racine).forEach((el, i) => {
    const donne = S.grille[i] !== 0, v = S.actuel[i];
    let cls = 'cell';
    if (donne) cls += ' given';
    else if (v) cls += ' user';
    if (conf.has(i) && !donne) cls += ' bad';
    if (fausses.has(i)) cls += ' wrong';
    if (i === sel) cls += ' sel';
    else if (valeurSel && v === valeurSel) cls += ' same';
    else if (voisins && voisins.has(i)) cls += ' peer';
    el.className = cls;
    const contenu = v ? String(v) : notesHtml(S.notes[i]);
    if (el.innerHTML !== contenu) el.innerHTML = contenu;
    el.setAttribute('aria-label', `Ligne ${Math.floor(i / 9) + 1}, colonne ${(i % 9) + 1}, ${v ? 'chiffre ' + v : 'vide'}`);
  });
  $$('#sdk-pad button[data-d]', racine).forEach((b) => {
    const d = Number(b.dataset.d);
    if (!d) return;
    const reste = 9 - S.actuel.filter((v) => v === d).length;
    b.classList.toggle('done', reste <= 0);
    $('small', b).textContent = reste > 0 ? String(reste) : '';
  });
}

const cellule = (i) => $(`#sdk-board .cell[data-i="${i}"]`, racine);

// ---------- Actions ----------

function memoriser() {
  S.historique.push({ actuel: S.actuel.slice(), notes: S.notes.slice() });
  if (S.historique.length > MAX_HISTORIQUE) S.historique.shift();
}

async function apresCoup() {
  fausses = new Set();
  sauver();
  dessiner();
  if (!S.gagne && S.actuel.every((v, i) => v === S.solution[i])) {
    S.gagne = true;
    sauver();
    dire('Grille terminée, bravo !');
    await vagueDeVictoire();
    const choix = await finirPartie({
      jeu: 'sudoku',
      gagne: true,
      difficulte: S.niveau,
      defi: options.defi,
      texte: 'Vous avez terminé la grille.',
      details: { indices: S.indices, erreurs: S.erreurs, annulations: S.annulations },
    });
    if (choix === 'rejouer') nouvelleGrille();
    else if (choix === 'carte') revenir('niveaux');
  }
}

// Une vague de couleur traverse la grille depuis la dernière case remplie.
async function vagueDeVictoire() {
  if (mouvementReduit() || !racine) return;
  const depart = sel >= 0 ? sel : 40;
  const r0 = Math.floor(depart / 9), c0 = depart % 9;
  const css = getComputedStyle(document.documentElement);
  const fond = css.getPropertyValue('--surface').trim(), vague = css.getPropertyValue('--sdk-sel').trim();
  $$('#sdk-board .cell', racine).forEach((el, i) => {
    const d = Math.hypot(Math.floor(i / 9) - r0, (i % 9) - c0);
    animer(el, [
      { transform: 'scale(1)', backgroundColor: fond },
      { transform: 'scale(1.18)', backgroundColor: vague, offset: 0.4 },
      { transform: 'scale(1)', backgroundColor: fond },
    ], { duration: 520, delay: d * 55, easing: 'ease-out' });
  });
  await attendre(1100);
}

function saisir(d, bouton) {
  if (S.gagne) return dire('Cette grille est terminée. Touchez « Nouvelle grille ».');
  if (sel < 0) {
    secouer($('#sdk-board', racine));
    return dire('Touchez d’abord une case de la grille.');
  }
  if (S.grille[sel]) {
    secouer(cellule(sel));
    return dire('Ce chiffre fait partie de la grille de départ, il ne peut pas changer.');
  }
  if (d === 0) {
    if (!S.actuel[sel] && !S.notes[sel]) return;
    memoriser();
    S.actuel[sel] = 0;
    S.notes[sel] = 0;
    dire('');
    return apresCoup();
  }
  if (crayon) {
    if (S.actuel[sel]) return dire('Effacez d’abord le chiffre pour écrire des notes.');
    memoriser();
    S.notes[sel] ^= 1 << d;
  } else {
    memoriser();
    if (S.actuel[sel] === d) S.actuel[sel] = 0;
    else {
      S.actuel[sel] = d;
      S.notes[sel] = 0;
      if (d !== S.solution[sel]) S.erreurs++;
      for (const j of VOISINS[sel]) S.notes[j] &= ~(1 << d); // les notes devenues impossibles disparaissent
    }
  }
  dire('');
  apresCoup();
  pop(cellule(sel), 1.22);
  if (bouton) pop(bouton, 1.08);
}

function indice() {
  if (S.gagne || !S.grille) return;
  let i = sel;
  if (i < 0 || S.actuel[i] === S.solution[i]) {
    const possibles = [];
    for (let k = 0; k < 81; k++) if (S.actuel[k] !== S.solution[k]) possibles.push(k);
    if (!possibles.length) return;
    i = possibles[Math.floor(Math.random() * possibles.length)];
  }
  memoriser();
  sel = i;
  S.actuel[i] = S.solution[i];
  S.notes[i] = 0;
  S.indices++;
  for (const j of VOISINS[i]) S.notes[j] &= ~(1 << S.solution[i]);
  dire(`Indice : le ${S.solution[i]} a été placé dans la case encadrée.`);
  apresCoup();
  animer(cellule(i), [
    { transform: 'scale(1)', boxShadow: '0 0 0 0 #F2B705' },
    { transform: 'scale(1.3)', boxShadow: '0 0 0 6px #F2B705', offset: 0.4 },
    { transform: 'scale(1)', boxShadow: '0 0 0 0 #F2B705' },
  ], { duration: 650, easing: COURBE_REBOND });
}

function verifier() {
  if (S.gagne || !S.grille) return;
  const f = new Set();
  S.actuel.forEach((v, i) => {
    if (v && v !== S.solution[i]) f.add(i);
  });
  fausses = f;
  dessiner();
  dire(f.size ? `${pluriel(f.size, 'case')} à corriger, en rouge.` : 'Tout est juste pour l’instant. Continuez !');
  for (const i of f) secouer(cellule(i));
}

function annuler() {
  const h = S.historique.pop();
  if (!h) return;
  S.actuel = h.actuel;
  S.notes = h.notes;
  S.gagne = false;
  S.annulations++;
  dire('Dernier coup annulé.');
  apresCoup();
}

// ---------- Module ----------

export default {
  id: 'sudoku',
  nom: 'Sudoku',
  description: 'Trois niveaux de difficulté',
  paysage: true,
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect class="ic-bg" x="4" y="4" width="56" height="56" rx="8"/><path class="ic-line" d="M23 4v56M41 4v56M4 23h56M4 41h56"/><text class="ic-t" x="13.5" y="19.5">5</text><text class="ic-t" x="32" y="38">3</text><text class="ic-t" x="50.5" y="56.5">8</text></svg>`,

  resume() {
    options = {};
    charger();
    return partieCommencee() ? `Partie en cours, niveau ${NOMS_NIVEAUX[S.niveau].toLowerCase()}` : '';
  },

  monter(conteneur, opts = {}) {
    racine = conteneur;
    options = opts;
    charger();
    if (options.defi && S.gagne) S = vierge(options.defi.niveau);
    sel = -1;
    crayon = false;
    fausses = new Set();
    construire();
    if (!S.grille) nouvelleGrille();
    else {
      dessiner();
      dire(S.gagne ? 'Grille terminée. Touchez « Nouvelle grille » pour rejouer.' : 'Votre partie a été retrouvée. Bonne continuation !');
    }
  },

  demonter() {
    racine = null;
  },
};
