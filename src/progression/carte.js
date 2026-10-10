// Écran « Aventure » : la carte des niveaux, comme un voyage en mer d'escale en escale.
// Le niveau 1 est en bas ; on monte vers le haut. Le bateau attend devant le prochain niveau
// et navigue jusqu'à lui après chaque nouveau succès.
import { $, chargerStyle, pluriel, aleaGraine } from '../core/outils.js';
import { animer, attendre, pop, mouvementReduit, COURBE_REBOND } from '../core/mouvement.js';
import { T, tuile, ilot, tuileBatiment } from '../core/tuiles.js';
import { niveau, etat, niveauCourant, statut, prendreDerniere, PAR_CHAPITRE, CHAPITRES, JETONS_PAR_JOUR } from './niveaux.js';
import { liste as listeMissions, coffreOuvert, BONUS_COFFRE } from './missions.js';
import { solde } from '../core/etoiles.js';

chargerStyle(new URL('./carte.css', import.meta.url));

const ESPACE = 118; // distance verticale entre deux niveaux (px)
const ICONES_JEUX = {
  sudoku: '<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  solitaire: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8c-1.5-2.5-5-1-3.2 1.8L12 13l3.2-3.2C17 7 13.5 5.5 12 8z" fill="currentColor"/></svg>',
  dames: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
  backgammon: '<svg viewBox="0 0 24 24"><path d="M3 3l3 12 3-12zM10.5 3l3 12 3-12zM18 3l1.5 6 1.5-6z" fill="currentColor"/></svg>',
};
const ETOILE = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.9 6.2 20.1l1.4-6.4L2.7 9.3l6.5-.7z"/></svg>';
const CADENAS = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';
const CADEAU = '<svg viewBox="0 0 24 24"><path d="M3 9h18v4H3zM5 13h14v8H5zM12 9v12" fill="currentColor" stroke="#00000030"/><path d="M12 9C9 9 7 4 9.5 4S12 9 12 9s.5-5 2.5-5S15 9 12 9z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

let racine = null;
let surRedimension = null;

function positionNoeud(n, largeur, total) {
  const marge = 70;
  const x = largeur / 2 + Math.sin(n * 1.05) * Math.min(largeur * 0.3, 150);
  const y = marge + (total - n) * ESPACE;
  return { x, y };
}

function cheminSvg(points) {
  // courbes douces entre les escales
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    const my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  return d;
}

function dessiner() {
  const e = etat();
  const courant = niveauCourant(e);
  // on montre jusqu'à la fin du chapitre en cours, et au moins 6 niveaux à venir
  const total = Math.max(courant + 6, Math.ceil(courant / PAR_CHAPITRE) * PAR_CHAPITRE);
  const largeur = racine.clientWidth || 360;
  const hauteur = 140 + total * ESPACE;
  const points = [];
  for (let n = 1; n <= total; n++) points.push(positionNoeud(n, largeur, total));

  // décor : vagues et îlots, toujours au même endroit (tirage avec une graine)
  const alea = aleaGraine(42);
  let decor = '';
  for (let k = 0; k < total * 2; k++) {
    const y = 40 + alea() * (hauteur - 80), x = alea() * (largeur - 40);
    decor += `<span class="vague" style="left:${x}px;top:${y}px;animation-delay:${(alea() * 4).toFixed(2)}s">${tuile(T.vagues[k % 5], 32)}</span>`;
  }
  const batiments = ['hameau', 'maison', 'champ', 'ferme', 'village', 'chateau'];
  for (let n = 2; n <= total; n += 3) {
    const p = points[n - 1];
    const gauche = p.x > largeur / 2;
    const l = 1 + (n % 2), contenu = [];
    for (let k = 0; k < l; k++) contenu.push(k === 0 ? tuileBatiment(batiments[(n + k) % batiments.length], 1 + (n % 3)) : (n % 4 ? T.foret : T.montagne));
    const taille = 28;
    const x = gauche ? Math.max(4, p.x - 150 - (l + 2) * taille / 2) : Math.min(largeur - (l + 2) * taille - 4, p.x + 90);
    decor += `<span class="deco" style="left:${x}px;top:${p.y - 1.5 * taille + 40}px">${ilot(l, 1, taille, contenu)}</span>`;
  }

  let noeuds = '';
  for (let n = 1; n <= total; n++) {
    const def = niveau(n), p = points[n - 1], st = statut(n, e), best = e.etoiles[n] || 0;
    const etoiles = [0, 1, 2].map((k) => `<i class="${k < best ? 'on' : ''}">${ETOILE}</i>`).join('');
    noeuds += `<button class="noeud ${st}${def.grandDefi ? ' grand' : ''}" data-n="${n}" style="left:${p.x}px;top:${p.y}px"
      aria-label="Niveau ${n}, ${def.nomJeu}, ${st === 'gagne' ? `${best} étoile${best > 1 ? 's' : ''}` : st === 'ouvert' ? 'à jouer' : st === 'demain' ? 'demain' : 'fermé'}">
      <span class="pastille">${st === 'verrouille' || st === 'demain' ? `<b class="cadenas">${CADENAS}</b>` : `<b>${n}</b>`}<span class="jeu">${ICONES_JEUX[def.jeu]}</span></span>
      <span class="etoiles">${etoiles}</span>
      ${def.cadeau && st !== 'gagne' ? `<span class="cadeau ${def.cadeau}">${CADEAU}</span>` : ''}
      ${st === 'ouvert' ? '<span class="bulle">Jouer</span>' : ''}
    </button>`;
    // bannière de chapitre sous le premier niveau de chaque chapitre
    if ((n - 1) % PAR_CHAPITRE === 0) {
      const c = Math.floor((n - 1) / PAR_CHAPITRE);
      noeuds += `<div class="banniere" style="top:${p.y + 58}px">Chapitre ${c + 1} · ${CHAPITRES[c % CHAPITRES.length].nom}</div>`;
    }
  }

  const fait = points.slice(0, Math.min(courant, total));
  const pBateau = points[Math.min(courant, total) - 1];
  racine.querySelector('.carte').style.height = `${hauteur}px`;
  racine.querySelector('.carte').innerHTML = `
    ${decor}
    <svg class="chemin" width="${largeur}" height="${hauteur}" aria-hidden="true">
      <path class="avenir" d="${cheminSvg(points)}"/>
      ${fait.length > 1 ? `<path class="parcouru" d="${cheminSvg(fait)}"/>` : ''}
    </svg>
    ${noeuds}
    <span class="bateau" style="left:${pBateau.x + 50}px;top:${pBateau.y - 4}px">${tuile(T.bateaux[0], 48)}</span>`;
  dessinerEntete(e, courant);
  return { points, courant, total };
}

function dessinerEntete(e, courant) {
  const missions = listeMissions();
  const faites = missions.filter((m) => m.faite).length;
  let infoJour;
  if (statut(courant, e) === 'ouvert') infoJour = `${pluriel(e.jetons, 'nouveau niveau', 'nouveaux niveaux')} à découvrir aujourd’hui`;
  else infoJour = `Revenez demain pour ${pluriel(JETONS_PAR_JOUR, 'nouveau niveau', 'nouveaux niveaux')} !`;
  $('.carte-entete', racine).innerHTML = `
    <div class="ligne"><span class="star-chip">★ <b>${solde()}</b></span><span class="jour">${infoJour}</span></div>
    <button class="btn missions-btn" id="carte-missions">Missions du jour <b>${faites}/3</b>${coffreOuvert() ? ' ✓' : ''}</button>`;
  $('#carte-missions', racine).addEventListener('click', montrerMissions);
}

// ---------- Fenêtres ----------

function fenetre(html) {
  return new Promise((resoudre) => {
    const fond = document.createElement('div');
    fond.className = 'sheet temp';
    fond.innerHTML = `<div class="sheet-box" role="dialog" aria-modal="true">${html}</div>`;
    document.body.append(fond);
    animer(fond.firstElementChild, [{ transform: 'translateY(50px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 });
    fond.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-r]');
      if (!b && ev.target !== fond) return;
      fond.remove();
      resoudre(b ? b.dataset.r : '');
    });
    fond.querySelector('.btn.primary, .btn')?.focus();
  });
}

async function ouvrirNiveau(n) {
  const e = etat();
  const def = niveau(n), st = statut(n, e), best = e.etoiles[n] || 0;
  const criteres = [{ texte: def.jeu === 'backgammon' && def.longueur > 1 ? 'Gagner le match' : 'Gagner' }, ...def.bonus]
    .map((b, k) => `<li class="${k < best ? 'ok' : ''}"><i>${ETOILE}</i>${b.texte}</li>`).join('');
  let pied;
  if (st === 'verrouille') pied = `<p class="note">Réussissez d’abord le niveau ${niveauCourant(e)}.</p><div class="sheet-actions"><button class="btn primary" data-r="">D’accord</button></div>`;
  else if (st === 'demain') pied = '<p class="note">Ce niveau s’ouvrira <b>demain</b>. En attendant, rejouez un niveau déjà réussi pour gagner plus d’étoiles !</p><div class="sheet-actions"><button class="btn primary" data-r="">D’accord</button></div>';
  else pied = `<div class="sheet-actions"><button class="btn" data-r="">Fermer</button><button class="btn primary" data-r="jouer">${st === 'gagne' ? 'Rejouer' : 'Jouer'}</button></div>`;
  const r = await fenetre(`
    <p class="niveau-chapitre">Chapitre ${def.chapitre + 1} · ${def.nomChapitre}</p>
    <h3>Niveau ${n}${def.grandDefi ? ' · Grand défi' : ''}</h3>
    <p class="niveau-objectif">${def.objectif}</p>
    <ul class="criteres">${criteres}</ul>
    ${def.cadeau && st !== 'gagne' ? `<p class="note">${def.cadeau === 'coffre' ? 'Un coffre de 10 ★' : 'Un cadeau de 3 ★'} vous attend en réussissant ce niveau.</p>` : ''}
    ${pied}`);
  if (r === 'jouer') location.hash = `#/niveau/${n}`;
}

async function montrerMissions() {
  const missions = listeMissions();
  const lignes = missions.map((m) => `
    <li class="${m.faite ? 'ok' : ''}">
      <span class="m-texte">${m.texte}</span>
      <span class="m-recompense">+${m.etoiles} ★</span>
      <span class="m-barre"><i style="width:${(m.progres / m.but) * 100}%"></i></span>
      <span class="m-progres">${m.faite ? 'Fait !' : `${m.progres} / ${m.but}`}</span>
    </li>`).join('');
  await fenetre(`
    <h3>Missions du jour</h3>
    <ul class="missions">${lignes}</ul>
    <p class="note">${coffreOuvert() ? 'Le coffre du jour est ouvert. De nouvelles missions arrivent demain !' : `Les trois missions faites ouvrent le coffre du jour : +${BONUS_COFFRE} ★.`}</p>
    <div class="sheet-actions"><button class="btn primary" data-r="">Fermer</button></div>`);
}

// ---------- Animations d'arrivée ----------

async function animerProgression({ points, courant }, derniere) {
  const carte = $('.carte', racine);
  const noeud = (n) => carte.querySelector(`.noeud[data-n="${n}"]`);
  const viser = (n, comportement) => {
    const p = points[Math.max(0, Math.min(n, points.length) - 1)];
    const haut = carte.getBoundingClientRect().top + window.scrollY + p.y - window.innerHeight * 0.55;
    window.scrollTo({ top: Math.max(0, haut), behavior: comportement });
  };
  if (!derniere || mouvementReduit()) {
    viser(courant, 'auto');
    return;
  }
  viser(derniere.numero, 'auto');
  await attendre(350);
  // les nouvelles étoiles apparaissent une à une
  const etoiles = noeud(derniere.numero)?.querySelectorAll('.etoiles i.on') || [];
  for (let k = derniere.avant; k < etoiles.length; k++) {
    animer(etoiles[k], [{ transform: 'scale(0) rotate(-60deg)' }, { transform: 'scale(1.5)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 420, easing: COURBE_REBOND });
    await attendre(220);
  }
  if (!derniere.nouveau) return;
  // le bateau navigue jusqu'au niveau suivant en suivant le chemin
  const bateau = carte.querySelector('.bateau');
  const a = points[derniere.numero - 1], b = points[Math.min(courant, points.length) - 1];
  if (!bateau || !a || !b || a === b) return;
  const segment = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  segment.setAttribute('d', cheminSvg([a, b]));
  const longueur = segment.getTotalLength();
  const images = [];
  for (let k = 0; k <= 16; k++) {
    const q = segment.getPointAtLength((longueur * k) / 16);
    images.push({ transform: `translate(${q.x - b.x}px, ${q.y - b.y}px) rotate(${Math.sin(k) * 4}deg)` });
  }
  viser(courant, 'smooth');
  await animer(bateau, images, { duration: 1400, easing: 'ease-in-out' });
  const n = noeud(courant);
  if (n) pop(n.querySelector('.pastille'), 1.3);
}

// ---------- Module ----------

export default {
  id: 'niveaux',
  nom: 'Aventure',

  monter(conteneur) {
    racine = conteneur;
    racine.innerHTML = `
      <div class="carte-entete"></div>
      <div class="carte-mer"><div class="carte"></div></div>`;
    const infos = dessiner();
    $('.carte', racine).addEventListener('click', (e) => {
      const b = e.target.closest('.noeud');
      if (b) ouvrirNiveau(Number(b.dataset.n));
    });
    animerProgression(infos, prendreDerniere());
    surRedimension = () => { if (racine) dessiner(); };
    window.addEventListener('resize', surRedimension);
  },

  demonter() {
    window.removeEventListener('resize', surRedimension);
    racine = null;
  },
};
