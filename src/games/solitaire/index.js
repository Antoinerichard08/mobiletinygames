// Solitaire : affichage et commandes. Les règles sont dans moteur.js.
// Tout se joue en touchant : une carte, puis l'endroit où la poser. Toucher deux fois la même carte la range seule.
import { $, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire, ajouterVictoire } from '../../core/stockage.js';
import { demander, confirmer } from '../../core/dialogue.js';
import {
  SYMBOLES, RANGS, estRouge, nomCarte, nomCarteAvecArticle, nouvellePartie, cloner, pile, estPermis, deplacer,
  piocher, destinationAuto, monterCartes, estGagne, indice,
} from './moteur.js';

chargerStyle(new URL('./solitaire.css', import.meta.url));

const CLE = 'solitaire';
const MAX_HISTORIQUE = 200;
const HISTORIQUE_SAUVE = 30;

let E = null; // { jeu: état du moteur, gagne, historique: [états] }
let racine = null;
let sel = null; // origine sélectionnée
let conseil = null; // indice affiché

function charger() {
  const s = lire(CLE, null);
  E = s && s.jeu && s.jeu.tab ? s : null;
  if (E && !E.historique) E.historique = [];
}
function sauver() {
  ecrire(CLE, { ...E, historique: E.historique.slice(-HISTORIQUE_SAUVE) });
}
const partieCommencee = () => Boolean(E) && !E.gagne && E.jeu.moves > 0;

function dire(texte) {
  const el = $('#sol-status', racine);
  if (el) el.textContent = texte || '';
}

function nouvelle() {
  E = { jeu: nouvellePartie(), gagne: false, historique: [] };
  sel = null;
  conseil = null;
  sauver();
  dessiner();
  dire('Touchez la pioche (en haut à gauche) pour retourner une carte.');
}

// ---------- Affichage ----------

function carteHtml(c, attrs, style, classes = '') {
  if (!c.up) return `<div class="card back ${classes}" ${attrs} style="${style}"></div>`;
  return `<div class="card ${estRouge(c) ? 'red' : ''} ${classes}" ${attrs} style="${style}" aria-label="${nomCarte(c)}">`
    + `<span class="idx"><b>${RANGS[c.r]}</b><span>${SYMBOLES[c.s]}</span></span><span class="big">${SYMBOLES[c.s]}</span></div>`;
}

const memeOrigine = (a, b) => a && b && a.loc === b.loc && (a.loc === 'waste' || a.i === b.i);

function dessiner() {
  if (!racine || !E) return;
  const J = E.jeu;
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
  h += `<div class="slot${piocheConseil}" data-loc="stock" aria-label="Pioche">`
    + (J.stock.length ? `<div class="card back" data-loc="stock" style="top:-2px"></div><span class="cnt">${J.stock.length}</span>` : J.waste.length ? '↻' : '')
    + '</div>';
  // défausse
  const w = J.waste[J.waste.length - 1];
  h += `<div class="slot${w ? ' plain' : ''}">` + (w ? carteHtml(w, 'data-loc="waste"', 'top:-2px', surbrillance({ loc: 'waste' }, 0)) : '') + '</div>';
  h += '<div></div>';
  // fondations
  for (let f = 0; f < 4; f++) {
    const p = J.found[f], t = p[p.length - 1];
    const d = destConseil('found', f) ? ' hint' : '';
    h += `<div class="slot${t ? ' plain' : ''}${t ? '' : d}" data-loc="found" data-i="${f}">`
      + (t ? carteHtml(t, `data-loc="found" data-i="${f}"`, 'top:-2px', surbrillance({ loc: 'found', i: f }, 0) + d) : 'A')
      + '</div>';
  }
  h += '</div><div class="row7">';
  // colonnes
  for (let i = 0; i < 7; i++) {
    const col = J.tab[i];
    const d = destConseil('tab', i);
    if (!col.length) {
      h += `<div class="col" data-loc="tab" data-i="${i}" data-k="-1" style="height:var(--ch)"><div class="slot${d ? ' hint' : ''}" style="pointer-events:none">R</div></div>`;
      continue;
    }
    let decalage = 0, cartes = '';
    col.forEach((c, k) => {
      let cls = surbrillance({ loc: 'tab', i }, k);
      if (d && k === col.length - 1) cls += ' hint';
      cartes += carteHtml(c, `data-loc="tab" data-i="${i}" data-k="${k}"`, `top:calc(var(--cw) * ${decalage.toFixed(2)})`, cls);
      decalage += c.up ? 0.52 : 0.22;
    });
    const total = decalage - (col[col.length - 1].up ? 0.52 : 0.22);
    h += `<div class="col" data-loc="tab" data-i="${i}" data-k="-1" style="height:calc(var(--ch) + var(--cw) * ${total.toFixed(2)})">${cartes}</div>`;
  }
  h += '</div></div>';
  $('#sol-table', racine).innerHTML = h;
  $('#sol-undo', racine).disabled = !E.historique.length;
}

// ---------- Actions ----------

function memoriser() {
  E.historique.push(cloner(E.jeu));
  if (E.historique.length > MAX_HISTORIQUE) E.historique.shift();
}

function apresCoup() {
  sel = null;
  conseil = null;
  sauver();
  dessiner();
  if (!E.gagne && estGagne(E.jeu)) {
    E.gagne = true;
    ajouterVictoire('solitaire');
    sauver();
    dire('Partie gagnée !');
    demander({ titre: 'Bravo !', texte: `Vous avez gagné en ${pluriel(E.jeu.moves, 'déplacement')}.`, oui: 'Nouvelle partie', non: 'Fermer' })
      .then((oui) => oui && nouvelle());
  }
}

function jouer(o, dest) {
  memoriser();
  deplacer(E.jeu, o, dest);
  dire('');
  apresCoup();
}

function toucher(loc, i, k) {
  if (E.gagne) return dire('La partie est gagnée. Touchez « Nouvelle partie » pour rejouer.');
  conseil = null;
  if (loc === 'stock') {
    sel = null;
    memoriser();
    const r = piocher(E.jeu);
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
      return dire('Cette carte ne peut aller nulle part pour l’instant.');
    }
  }
  // 3) sinon, on sélectionne la carte touchée (si elle est visible)
  const o = loc === 'waste' ? { loc, i: 0, k: 0 } : loc === 'found' ? { loc, i, k: 0 } : { loc, i, k };
  const avait = sel;
  sel = pile(E.jeu, o) && (loc !== 'tab' || k >= 0) ? o : null;
  if (sel) dire('Touchez maintenant l’endroit où poser la carte, ou touchez-la encore pour la ranger.');
  else if (avait) dire('Impossible de poser cette carte ici.');
  else dire('');
  dessiner();
}

function montrerIndice() {
  if (E.gagne) return;
  sel = null;
  const c = indice(E.jeu);
  conseil = c;
  if (!c) dire('Aucun coup possible. Vous pouvez commencer une nouvelle partie.');
  else if (c.pioche) dire('Touchez la pioche, entourée en jaune.');
  else {
    const carte = pile(E.jeu, c.o)[0];
    dire(`Déplacez ${nomCarteAvecArticle(carte)} vers l’endroit entouré en jaune.`);
  }
  dessiner();
}

function annuler() {
  const precedent = E.historique.pop();
  if (!precedent) return;
  E.jeu = precedent;
  E.gagne = false;
  dire('Dernier coup annulé.');
  sel = null;
  conseil = null;
  sauver();
  dessiner();
}

function monter() {
  if (E.gagne) return;
  memoriser();
  const n = monterCartes(E.jeu);
  if (!n) {
    E.historique.pop();
    sel = null;
    conseil = null;
    dessiner();
    return dire('Aucune carte ne peut monter pour l’instant.');
  }
  dire(`${pluriel(n, 'carte rangée', 'cartes rangées')}.`);
  apresCoup();
}

function construire() {
  racine.innerHTML = `
    <div class="table" id="sol-table"></div>
    <p class="status" id="sol-status" aria-live="polite"></p>
    <div class="tools">
      <button class="btn" id="sol-undo">Annuler</button>
      <button class="btn" id="sol-hint">Indice</button>
      <button class="btn" id="sol-collect">Monter les cartes</button>
    </div>
    <button class="btn" id="sol-new">Nouvelle partie</button>
    <p class="tip">Touchez une carte, puis l’endroit où la poser. Touchez-la une deuxième fois pour qu’elle se range toute seule.</p>`;
  $('#sol-table', racine).addEventListener('click', (e) => {
    const t = e.target.closest('[data-loc]');
    if (!t) return;
    toucher(t.dataset.loc, Number(t.dataset.i || 0), t.dataset.k === undefined ? -1 : Number(t.dataset.k));
  });
  $('#sol-undo', racine).addEventListener('click', annuler);
  $('#sol-hint', racine).addEventListener('click', montrerIndice);
  $('#sol-collect', racine).addEventListener('click', monter);
  $('#sol-new', racine).addEventListener('click', async () => {
    if (partieCommencee() && !(await confirmer('La partie en cours sera abandonnée.', 'Oui, nouvelle partie'))) return;
    nouvelle();
  });
}

// ---------- Module ----------

export default {
  id: 'solitaire',
  nom: 'Solitaire',
  description: 'Le classique, une carte à la fois',
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-9 24 36)"><rect class="ic-back" x="8" y="12" width="32" height="44" rx="5"/></g><g transform="rotate(8 40 36)"><rect class="ic-card" x="26" y="10" width="32" height="44" rx="5"/><text class="ic-red" x="42" y="30">A</text><text class="ic-red" x="42" y="48">♥</text></g></svg>`,

  resume() {
    charger();
    return partieCommencee() ? `Partie en cours, ${pluriel(E.jeu.moves, 'coup')}` : '';
  },

  monter(conteneur) {
    racine = conteneur;
    charger();
    sel = null;
    conseil = null;
    construire();
    if (!E) nouvelle();
    else {
      dessiner();
      dire(E.gagne ? 'Partie gagnée. Touchez « Nouvelle partie » pour rejouer.' : '');
    }
  },

  demonter() {
    racine = null;
  },
};
