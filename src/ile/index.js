// Écran « Mon île » : on dépense ses étoiles pour construire une île paisible (règles dans regles.js).
// Choisir un bâtiment en bas, puis toucher une case : chaque case montre les points de beauté qu'il rapporterait.
// Graphismes : « Tiny Islands » par Majadroid (CC0).
import { $, chargerStyle, pluriel } from '../core/outils.js';
import { lire, ecrire } from '../core/stockage.js';
import { solde, depenserEtoiles, ajouterEtoiles } from '../core/etoiles.js';
import { demander } from '../core/dialogue.js';
import { animer, attendre, pop, secouer, mouvementReduit, COURBE_REBOND } from '../core/mouvement.js';
import { T, tuile, tuileBatiment } from '../core/tuiles.js';
import {
  ILES, BATIMENTS, ORDRE_BATIMENTS, grille, peutPoser, pointsCase, apercu, etatVide, beauteTotale, beaute,
  ilesOuvertes, estDebloque, prochainPalier, poser, agrandir, retirer, niveauMax, voisins,
} from './regles.js';

chargerStyle(new URL('./ile.css', import.meta.url));

const CLE = 'ile';
const UN = { hameau: 'un hameau', champ: 'un champ de blé', maison: 'une maison', ferme: 'une ferme', village: 'un village', port: 'un port', chateau: 'un château' };
const LE = { hameau: 'le hameau', champ: 'le champ', maison: 'la maison', ferme: 'la ferme', village: 'le village', port: 'le port', chateau: 'le château' };
const feminin = (type) => type === 'maison' || type === 'ferme';
const NOMS_TERRAIN = {
  foret: 'Une forêt : les hameaux et les fermes aiment l’avoir pour voisine.',
  montagne: 'Des rochers : le château aime les avoir pour voisins.',
  eau: 'La mer. Le port se construit au bord de l’eau.',
};

let E = null;
let racine = null;
let enPose = null; // type de bâtiment en cours de pose
let surRedimension = null;

function charger() {
  E = lire(CLE, null) || etatVide();
  while (E.iles.length < ILES.length) E.iles.push({ cases: {} });
}
const sauver = () => ecrire(CLE, E);
const dire = (t) => { const el = $('#ile-status', racine); if (el) el.innerHTML = t || ''; };

// ---------- Dessin ----------

/** La tuile à afficher pour une case (côte, terre, bois, rochers, bâtiment). */
function tuileCase(g, i) {
  const b = E.iles[E.active].cases[i];
  if (b) return tuileBatiment(b.type, b.niveau);
  const x = i % g.L, y = Math.floor(i / g.L), t = g.terrain[i];
  if (t === 'foret') return T.foret;
  if (t === 'montagne') return T.montagne;
  if (t === 'herbe') return T.herbe;
  const haut = y === 0, bas = y === g.H - 1, gauche = x === 0, droite = x === g.L - 1;
  if (haut) return gauche ? T.coinNO : droite ? T.coinNE : T.bordN;
  if (bas) return gauche ? T.coinSO : droite ? T.coinSE : T.bordS;
  return gauche ? T.bordO : T.bordE;
}

function tailleTuile(g) {
  const dispo = Math.min(($('.ile-mer', racine)?.clientWidth || 340) - 24, 620);
  const brut = Math.floor(dispo / g.L);
  // multiples de 8 : le pixel art reste net, et les cases restent grandes pour le doigt
  return brut >= 32 ? Math.floor(brut / 8) * 8 : Math.max(24, brut);
}

function dessiner() {
  if (!racine) return;
  const n = E.active, g = grille(n), cases = E.iles[n].cases;
  const ts = tailleTuile(g);
  const apercus = new Map();
  if (enPose) {
    g.terrain.forEach((_, i) => { const a = apercu(g, cases, i, enPose); if (a !== null) apercus.set(i, a); });
  }
  const meilleur = apercus.size ? Math.max(...apercus.values()) : null;
  let h = `<div class="ile-grille" style="--ts:${ts}px;grid-template-columns:repeat(${g.L}, ${ts}px)">`;
  g.terrain.forEach((t, i) => {
    const b = cases[i];
    const a = apercus.get(i);
    const cls = ['case', t, b ? 'bati' : '', a !== undefined ? 'possible' : '', a !== undefined && a === meilleur ? 'meilleur' : ''].join(' ');
    const nom = b ? `${BATIMENTS[b.type].nom}, niveau ${b.niveau}, ${pointsCase(g, cases, i)} points` : t === 'herbe' ? 'Herbe libre' : t;
    h += `<button class="${cls}" data-i="${i}" aria-label="${nom}${a !== undefined ? `, +${a} points ici` : ''}">${tuile(tuileCase(g, i), ts)}${a !== undefined ? `<span class="gain">+${a}</span>` : ''}</button>`;
  });
  h += '</div>';
  $('.ile-plan', racine).innerHTML = h;

  // en-tête : étoiles, beauté et prochain palier
  const total = beauteTotale(E), palier = prochainPalier(E);
  const precedent = [0, ...ORDRE_BATIMENTS.map((t) => BATIMENTS[t].debloque), ...ILES.map((x) => x.seuil)].filter((s) => s <= total).sort((a, b) => b - a)[0] || 0;
  const pourcent = palier ? Math.round(((total - precedent) / (palier.seuil - precedent)) * 100) : 100;
  $('.ile-entete', racine).innerHTML = `
    <span class="star-chip">★ <b>${solde()}</b></span>
    <div class="beaute">
      <p><b>Beauté : ${total}</b>${palier ? ` <small>· encore ${palier.seuil - total} pour : ${palier.texte}</small>` : ' <small>· tout est débloqué !</small>'}</p>
      <span class="barre"><i style="width:${pourcent}%"></i></span>
    </div>`;
  const ouvertes = ilesOuvertes(E);
  $('.ile-nav', racine).innerHTML = ouvertes > 1
    ? `<button class="btn" data-ile="-1" ${n === 0 ? 'disabled' : ''} aria-label="Île précédente">◀</button>
       <p><b>${ILES[n].nom}</b><small>Île ${n + 1} sur ${ouvertes} · beauté ${beaute(g, cases)}</small></p>
       <button class="btn" data-ile="1" ${n >= ouvertes - 1 ? 'disabled' : ''} aria-label="Île suivante">▶</button>`
    : `<p><b>${ILES[n].nom}</b></p>`;

  // boutique
  let boutique = '';
  for (const type of ORDRE_BATIMENTS) {
    const def = BATIMENTS[type];
    const ouvert = estDebloque(E, type), prix = def.cout[0];
    const manque = Math.max(0, prix - solde());
    boutique += `<button class="carte-bat ${enPose === type ? 'choisi' : ''}" data-type="${type}" ${ouvert ? '' : 'disabled'}>
      ${tuile(tuileBatiment(type, 1), 48)}
      <span class="cb-nom">${def.nom}</span>
      <span class="cb-prix">${ouvert ? `${prix} ★` : `Dès ${def.debloque} de beauté`}</span>
      <span class="cb-desc">${ouvert ? (manque ? `Il manque ${pluriel(manque, 'étoile')}` : def.desc) : 'Bientôt'}</span>
    </button>`;
  }
  $('.boutique', racine).innerHTML = boutique;
  $('#ile-annuler', racine).hidden = !enPose;
}

// ---------- Actions ----------

function choisir(type) {
  if (enPose === type) { enPose = null; dessiner(); dire(''); return; }
  const def = BATIMENTS[type];
  if (solde() < def.cout[0]) {
    dire(`Il vous faut ${pluriel(def.cout[0], 'étoile')} pour ${UN[type]}. Jouez pour en gagner !`);
    secouer($(`.carte-bat[data-type="${type}"]`, racine));
    return;
  }
  enPose = type;
  dessiner();
  dire(`Touchez une case pour poser : <b>${def.nom}</b>. Les nombres montrent les points de beauté gagnés ; la meilleure case brille.`);
  $('.ile-plan', racine).scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'center' });
}

async function toucherCase(i) {
  const n = E.active, g = grille(n), cases = E.iles[n].cases;
  if (enPose) {
    if (!peutPoser(g, cases, i, enPose)) {
      secouer($(`.case[data-i="${i}"]`, racine));
      return dire(BATIMENTS[enPose].cote ? 'Le port se pose sur l’eau, au bord de l’île (cases avec un nombre).' : 'Choisissez une case d’herbe libre (avec un nombre).');
    }
    const avant = { ouvertes: ilesOuvertes(E), debloques: ORDRE_BATIMENTS.filter((t) => estDebloque(E, t)) };
    const type = enPose;
    const r = poser(E, n, i, type, depenserEtoiles);
    if (!r.ok) return dire('Pas assez d’étoiles pour l’instant.');
    enPose = solde() >= BATIMENTS[type].cout[0] ? type : null; // on peut en poser un autre à la suite
    sauver();
    dessiner();
    await celebrerPose(i, r.gain, false);
    dire(enPose ? `+${r.gain} de beauté ! Touchez une autre case pour poser encore ${UN[type]}, ou « Terminer ».` : `+${r.gain} de beauté !`);
    await annoncerDeblocages(avant);
    return;
  }
  const b = cases[i];
  if (!b) {
    if (g.terrain[i] === 'herbe') return dire('Choisissez d’abord un bâtiment, en bas de l’écran.');
    return dire(NOMS_TERRAIN[g.terrain[i]] || '');
  }
  await ouvrirBatiment(i);
}

async function ouvrirBatiment(i) {
  const n = E.active, g = grille(n), cases = E.iles[n].cases, b = cases[i], def = BATIMENTS[b.type];
  const amis = voisins(g, i).map((v) => (cases[v] ? cases[v].type : g.terrain[v])).filter((t) => def.aime[t]);
  const prix = b.niveau < niveauMax(b.type) ? def.cout[b.niveau] : null;
  const rendu = def.cout.slice(0, b.niveau).reduce((a, c) => a + c, 0);
  const fond = document.createElement('div');
  fond.className = 'sheet temp';
  fond.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true">
      <div class="bat-tete">${tuile(tuileBatiment(b.type, b.niveau), 64)}<div><h3>${def.nom}</h3><p>Niveau ${b.niveau} sur ${niveauMax(b.type)} · <b>${pointsCase(g, cases, i)} points</b> de beauté</p></div></div>
      <p class="note">${def.desc}.${amis.length ? ` Ici, ${pluriel(amis.length, 'voisin aimé', 'voisins aimés')} : +${amis.reduce((s, t) => s + def.aime[t], 0)} points.` : ''}</p>
      <div class="sheet-actions">
        <button class="btn" data-r="">Fermer</button>
        <button class="btn" data-r="retirer">Retirer (rend ${rendu} ★)</button>
        ${prix !== null ? `<button class="btn primary" data-r="agrandir" ${solde() < prix ? 'disabled' : ''}>Agrandir pour ${prix} ★</button>` : '<p class="note">Ce bâtiment est au plus haut niveau.</p>'}
      </div>
    </div>`;
  document.body.append(fond);
  animer(fond.firstElementChild, [{ transform: 'translateY(50px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 });
  const r = await new Promise((ok) => fond.addEventListener('click', (e) => {
    const bt = e.target.closest('button[data-r]');
    if (!bt && e.target !== fond) return;
    if (bt?.disabled) return;
    fond.remove();
    ok(bt ? bt.dataset.r : '');
  }));
  if (r === 'agrandir') {
    const avant = { ouvertes: ilesOuvertes(E), debloques: ORDRE_BATIMENTS.filter((t) => estDebloque(E, t)) };
    const res = agrandir(E, n, i, depenserEtoiles);
    if (!res.ok) return dire('Pas assez d’étoiles pour l’instant.');
    sauver();
    dessiner();
    await celebrerPose(i, res.gain, true);
    dire(`${def.nom} agrandi${feminin(b.type) ? 'e' : ''} : +${res.gain} de beauté !`);
    await annoncerDeblocages(avant);
  } else if (r === 'retirer') {
    if (!(await demander({ titre: `Retirer ${LE[b.type]} ?`, texte: `Vous récupérez ${pluriel(rendu, 'étoile')}.`, oui: 'Oui, retirer', non: 'Non, garder' }))) return;
    const el = $(`.case[data-i="${i}"] .tuile`, racine);
    await animer(el, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.3)', opacity: 0 }], { duration: 260 });
    ajouterEtoiles(retirer(E, n, i), 'remboursement');
    sauver();
    dessiner();
    dire('Bâtiment retiré, étoiles rendues.');
  }
}

/** Le bâtiment tombe en rebondissant, un « +N » s'envole. */
async function celebrerPose(i, gain, agrandissement) {
  const caseEl = $(`.case[data-i="${i}"]`, racine);
  if (!caseEl || mouvementReduit()) return;
  const t = caseEl.querySelector('.tuile');
  animer(t, agrandissement
    ? [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.25)', filter: 'brightness(1.6)', offset: 0.4 }, { transform: 'scale(1)', filter: 'brightness(1)' }]
    : [{ transform: 'translateY(-60%) scale(.4)', opacity: 0 }, { transform: 'translateY(6%) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }],
  { duration: 520, easing: COURBE_REBOND });
  const bulle = document.createElement('span');
  bulle.className = 'envol';
  bulle.textContent = `+${gain}`;
  caseEl.append(bulle);
  await animer(bulle, [{ transform: 'translate(-50%, 0)', opacity: 0 }, { transform: 'translate(-50%, -20px)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%, -60px)', opacity: 0 }], { duration: 1100, easing: 'ease-out' });
  bulle.remove();
}

async function annoncerDeblocages(avant) {
  const nouveaux = ORDRE_BATIMENTS.filter((t) => estDebloque(E, t) && !avant.debloques.includes(t));
  for (const t of nouveaux) {
    await attendre(300);
    await demander({ titre: 'Nouveau bâtiment !', texte: `Votre île est de plus en plus belle : vous pouvez maintenant construire ${UN[t]}. ${BATIMENTS[t].desc}.`, oui: 'Super !' });
    pop($(`.carte-bat[data-type="${t}"]`, racine), 1.12);
  }
  if (ilesOuvertes(E) > avant.ouvertes) {
    const nouvelle = ilesOuvertes(E) - 1;
    await attendre(300);
    if (await demander({ titre: 'Une nouvelle île !', texte: `${ILES[nouvelle].nom} est apparue au large. Elle est plus grande : vous pourrez y construire encore plus.`, oui: 'Aller la voir', non: 'Plus tard' })) {
      E.active = nouvelle;
      sauver();
      dessiner();
      animer($('.ile-grille', racine), [{ transform: 'translateX(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420 });
    }
  }
}

function changerIle(sens) {
  const ouvertes = ilesOuvertes(E);
  const n = Math.max(0, Math.min(ouvertes - 1, E.active + sens));
  if (n === E.active) return;
  E.active = n;
  enPose = null;
  sauver();
  dessiner();
  dire('');
  animer($('.ile-grille', racine), [{ transform: `translateX(${sens * 40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360 });
}

// ---------- Module ----------

export default {
  id: 'ile',
  nom: 'Mon île',

  monter(conteneur) {
    racine = conteneur;
    charger();
    enPose = null;
    racine.innerHTML = `
      <div class="ile-body">
        <div class="ile-entete"></div>
        <div class="ile-nav"></div>
        <div class="ile-mer">
          <span class="navire n1">${tuile(T.bateaux[2], 32)}</span>
          <span class="navire n2">${tuile(T.bateaux[5], 32)}</span>
          <div class="ile-plan"></div>
        </div>
        <p class="status" id="ile-status" aria-live="polite"></p>
        <button class="btn" id="ile-annuler" hidden>Terminer</button>
        <p class="titre-section">Construire</p>
        <div class="boutique"></div>
        <p class="tip">Gagnez des étoiles en jouant (parties, niveaux de l’Aventure, missions du jour), puis dépensez-les ici.</p>
      </div>`;
    dessiner();
    dire(Object.keys(E.iles[E.active].cases).length ? '' : 'Bienvenue sur votre île ! Choisissez un bâtiment en bas, puis touchez une case.');
    $('.ile-plan', racine).addEventListener('click', (e) => {
      const c = e.target.closest('.case');
      if (c) toucherCase(Number(c.dataset.i));
    });
    $('.boutique', racine).addEventListener('click', (e) => {
      const b = e.target.closest('.carte-bat');
      if (b && !b.disabled) choisir(b.dataset.type);
    });
    $('.ile-nav', racine).addEventListener('click', (e) => {
      const b = e.target.closest('[data-ile]');
      if (b) changerIle(Number(b.dataset.ile));
    });
    $('#ile-annuler', racine).addEventListener('click', () => { enPose = null; dessiner(); dire(''); });
    surRedimension = () => { if (racine) dessiner(); };
    window.addEventListener('resize', surRedimension);
  },

  demonter() {
    window.removeEventListener('resize', surRedimension);
    racine = null;
  },
};
