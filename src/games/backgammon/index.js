// Backgammon contre l'ordinateur : affichage, animations, déroulement des manches.
// Règles dans moteur.js, ordinateur dans ia.js (calculé en arrière-plan).
// On touche un pion, puis sa destination (ou deux fois le pion pour qu'il avance tout seul avec le plus grand dé).
// Chaque pion a une identité : il glisse d'une flèche à l'autre, un pion frappé part visiblement sur la barre.
import { $, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire } from '../../core/stockage.js';
import { demander } from '../../core/dialogue.js';
import { finirPartie } from '../../core/partie.js';
import { creerTravailleur } from '../../core/travail.js';
import { animer, attendre, secouer, mouvementReduit, COURBE_DOUCE, COURBE_REBOND } from '../../core/mouvement.js';
import {
  BLANC, NOIR, positionInitiale, cloner, coupsAutorises, jouerSimple, desAJouer, retirerDe,
  gagnant, pointsVictoire, pips,
} from './moteur.js';
import { NOMS_NIVEAUX, choisirAvecDes } from './ia.js';
import { geometrie, positionDansPile } from './plateau.js';

chargerStyle(new URL('./backgammon.css', import.meta.url));

const cerveau = creerTravailleur(
  new URL('./ia-worker.js', import.meta.url),
  ({ pos, camp, des, niveau }) => ({ coups: choisirAvecDes(pos, camp, des, { niveau }) }),
);

const LONGUEURS = { 1: 'Une seule manche', 3: 'Match en 3 points', 5: 'Match en 5 points' };

let B = null; // état sauvegardé
let racine = null;
let options = {};
let G = null; // géométrie du plateau
let sel = null; // flèche (ou 'barre') choisie par le joueur
let conseil = null;
let occupe = false;
let jeton = 0;
let surRedimension = null;

const cleSauvegarde = () => (options.defi ? `backgammon.defi.${options.defi.id}` : 'backgammon');

// ---------- Piles de pions (identités) ----------

function pilesInitiales(pos) {
  const piles = { pts: Array.from({ length: 24 }, () => []), barre: { 1: [], '-1': [] }, sortis: { 1: [], '-1': [] } };
  let b = 0, n = 0;
  pos.p.forEach((v, i) => {
    for (let k = 0; k < Math.abs(v); k++) piles.pts[i].push(v > 0 ? `b${b++}` : `n${n++}`);
  });
  return piles;
}

/** Déplace les identités comme le coup m ; renvoie { id, frappe } (identités du pion joué et du pion frappé). */
function bougerPiles(piles, camp, m) {
  const src = m.from === 'barre' ? piles.barre[camp] : piles.pts[m.from];
  const id = src.pop();
  let frappe = null;
  if (m.to === 'sortie') piles.sortis[camp].push(id);
  else {
    const dst = piles.pts[m.to];
    if (m.frappe) {
      frappe = dst.pop();
      piles.barre[-camp].push(frappe);
    }
    dst.push(id);
  }
  return { id, frappe };
}
const clonerPiles = (p) => JSON.parse(JSON.stringify(p));

// ---------- État ----------

function charger() {
  const s = lire(cleSauvegarde(), null);
  B = s && s.pos && s.piles ? s : null;
}
function sauver() {
  if (B) ecrire(cleSauvegarde(), B);
}
const matchEnCours = () => Boolean(B) && B.phase !== 'match';

function nouveauMatch(niveau, longueur) {
  jeton++;
  B = {
    niveau: options.defi?.niveau || niveau || B?.niveau || 'facile',
    longueur: options.defi?.longueur || longueur || B?.longueur || 1,
    score: { 1: 0, '-1': 0 }, manche: 0, indices: 0, annulations: 0,
  };
  nouvelleManche();
}

function nouvelleManche() {
  const pos = positionInitiale();
  Object.assign(B, {
    pos, piles: pilesInitiales(pos), tour: BLANC, phase: 'debut', des: null, restants: [],
    debutTour: null, historique: [], manche: B.manche + 1,
  });
  sel = null;
  conseil = null;
  sauver();
  dessiner();
  lancerDeDepart();
}

// ---------- Dés ----------

const tirer = () => 1 + Math.floor(Math.random() * 6);

function faceDe(v) {
  // positions des points sur une grille 3 × 3
  const motifs = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  return Array.from({ length: 9 }, (_, k) => `<i class="${motifs[v]?.includes(k + 1) ? 'on' : ''}"></i>`).join('');
}

function dessinerDes() {
  const zone = $('#bg-des', racine);
  if (!zone) return;
  if (!B.des) { zone.innerHTML = ''; return; }
  const [a, b] = B.des;
  const liste = a === b ? [a, a, a, a] : [a, b];
  // quels dés sont déjà utilisés ?
  const restants = B.restants.slice();
  const html = liste.map((v) => {
    const k = restants.indexOf(v);
    const utilise = k < 0;
    if (!utilise) restants.splice(k, 1);
    return `<span class="de ${B.tour === NOIR ? 'rouge' : ''} ${utilise ? 'used' : ''} ${a === b ? 'petit' : ''}" aria-label="Dé ${v}${utilise ? ', déjà joué' : ''}">${faceDe(v)}</span>`;
  }).join('');
  zone.innerHTML = html;
}

/** Fait rouler les dés à l'écran puis affiche les valeurs finales. */
async function rouler(valeurs, camp) {
  const zone = $('#bg-des', racine);
  if (!zone) return;
  zone.innerHTML = valeurs.map(() => `<span class="de ${camp === NOIR ? 'rouge' : ''}">${faceDe(tirer())}</span>`).join('');
  if (!mouvementReduit()) {
    const des = [...zone.children];
    des.forEach((de, k) => animer(de, [
      { transform: `translateY(-30px) rotate(${k ? -200 : 160}deg)`, opacity: 0.4 },
      { transform: 'translateY(4px) rotate(12deg)', opacity: 1, offset: 0.75 },
      { transform: 'translateY(0) rotate(0)', opacity: 1 },
    ], { duration: 650, easing: COURBE_DOUCE }));
    for (let t = 0; t < 7; t++) {
      await attendre(80);
      des.forEach((de) => { de.innerHTML = faceDe(tirer()); });
    }
    await attendre(120);
    des.forEach((de, k) => { de.innerHTML = faceDe(valeurs[k]); });
    await attendre(150);
  }
}

// ---------- Affichage du plateau ----------

function mesurer() {
  const zone = $('.bg-zone-plateau', racine);
  const paysage = matchMedia('(orientation: landscape) and (max-height: 560px)').matches;
  const largeurDispo = zone.clientWidth || 360;
  let W, H, verticale;
  if (paysage) {
    verticale = false;
    H = Math.max(240, window.innerHeight - 24);
    W = Math.min(largeurDispo, H * 1.5);
    H = Math.min(H, W / 1.25);
  } else {
    verticale = largeurDispo < 640;
    W = largeurDispo;
    H = verticale ? Math.min(W * 1.45, Math.max(window.innerHeight * 0.66, 420)) : W / 1.35;
  }
  return { W: Math.floor(W), H: Math.floor(H), verticale };
}

function construirePlateau() {
  const { W, H, verticale } = mesurer();
  G = geometrie(W, H, verticale);
  const plateau = $('#bg-board', racine);
  plateau.style.width = `${W}px`;
  plateau.style.height = `${H}px`;
  plateau.style.setProperty('--d', `${G.d}px`);
  plateau.classList.toggle('vertical', verticale);
  const d = G.decor;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  svg += `<rect class="bg-feutre" x="0" y="0" width="${W}" height="${H}" rx="10"/>`;
  G.pointes.forEach((p, i) => { svg += `<polygon class="${i % 2 ? 'pt-a' : 'pt-b'}" points="${p.triangle}"/>`; });
  svg += `<rect class="bg-bande" x="${d.barre.x}" y="${d.barre.y}" width="${d.barre.w}" height="${d.barre.h}"/>`;
  svg += `<rect class="bg-bande" x="${d.sortie.x}" y="${d.sortie.y}" width="${d.sortie.w}" height="${d.sortie.h}"/>`;
  if (d.milieu) svg += `<rect class="bg-bande fine" x="${d.milieu.x}" y="${d.milieu.y}" width="${d.milieu.w}" height="${d.milieu.h}"/>`;
  // flèches discrètes qui rappellent le sens de marche de vos pions
  if (verticale) {
    svg += `<text class="bg-sens" x="${W * 0.25}" y="${d.barre.y + d.barre.h * 0.68}" text-anchor="middle">↑ vos pions montent</text>`;
    svg += `<text class="bg-sens" x="${W * 0.75}" y="${d.barre.y + d.barre.h * 0.68}" text-anchor="middle">puis descendent ↓</text>`;
    svg += `<text class="bg-sens" x="${W * 0.75}" y="${d.sortie.y + d.sortie.h * 0.66}" text-anchor="middle">Vos pions sortis</text>`;
  } else {
    svg += `<text class="bg-sens" x="${d.sortie.x + d.sortie.w / 2}" y="${H / 2 + 5}" text-anchor="middle">Sortie</text>`;
  }
  svg += '</svg>';
  // zones tactiles : une par flèche, plus la barre et la sortie
  let zones = '';
  const zoneHtml = (cle, z, nom) => `<button class="bg-zone" data-z="${cle}" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px" aria-label="${nom}"></button>`;
  G.pointes.forEach((p, i) => { zones += zoneHtml(i, p.zone, `Flèche ${i + 1}`); });
  zones += zoneHtml('barre', G.zones.barre, 'Barre');
  zones += zoneHtml('sortie', G.zones.sortie, 'Sortie de vos pions');
  plateau.innerHTML = `${svg}<div class="bg-zones">${zones}</div><div class="bg-marques"></div><div class="bg-pions"></div>`;
}

/** Position (centre) de chaque pion, d'après les piles. */
function positions() {
  const out = new Map();
  B.piles.pts.forEach((pile, i) => {
    pile.forEach((id, k) => out.set(id, { ...positionDansPile(G.pointes[i], k, pile.length), k, n: pile.length, ou: i }));
  });
  for (const camp of [BLANC, NOIR]) {
    B.piles.barre[camp].forEach((id, k) => out.set(id, { ...positionDansPile(G.barre[camp], k, 1), k, ou: 'barre' }));
    B.piles.sortis[camp].forEach((id, k) => out.set(id, { ...positionDansPile(G.sortie[camp], k, 1), k, ou: 'sortie', plaquette: G.sortie[camp].plaquette }));
  }
  return out;
}

const transformePion = (p) => `translate(${p.x - G.d / 2}px, ${p.y - G.d / 2}px)`;

/**
 * Place les pions. `trajets` : Map id → { delai, duree, lever } pour animer certains déplacements ;
 * les autres pions qui changent de place glissent simplement.
 */
async function placerPions(trajets = new Map(), { glisser = true } = {}) {
  const couche = $('.bg-pions', racine);
  if (!couche) return;
  const pos = positions();
  const promesses = [];
  for (const [id, p] of pos) {
    let el = couche.querySelector(`[data-cle="${id}"]`);
    const neuf = !el;
    if (neuf) {
      el = document.createElement('div');
      el.dataset.cle = id;
      el.innerHTML = '<i></i><b></b>';
      couche.append(el);
    }
    const ancien = neuf ? null : { x: Number(el.dataset.x), y: Number(el.dataset.y) };
    el.className = `ck ${id[0] === 'b' ? 'w' : 'r'}${p.plaquette ? ` off ${p.plaquette}` : ''}`;
    el.style.transform = transformePion(p);
    el.style.zIndex = String(10 + (p.k || 0));
    el.dataset.x = p.x;
    el.dataset.y = p.y;
    // un nombre sur le dernier pion d'une pile resserrée
    el.querySelector('b').textContent = p.n > (G.pointes[p.ou]?.max || 99) && p.k === p.n - 1 ? p.n : '';
    if (ancien && glisser && (Math.abs(ancien.x - p.x) > 0.5 || Math.abs(ancien.y - p.y) > 0.5)) {
      const t = trajets.get(id) || { delai: 0, duree: 300, lever: false };
      const milieu = { x: (ancien.x + p.x) / 2, y: (ancien.y + p.y) / 2 };
      const distance = Math.hypot(p.x - ancien.x, p.y - ancien.y);
      const duree = t.duree ?? Math.min(700, 260 + distance * 0.9);
      el.style.zIndex = '60';
      promesses.push(animer(el, [
        { transform: `${transformePion(ancien)} scale(1)` },
        { transform: `${transformePion(milieu)} scale(${t.lever ? 1.22 : 1.06})`, offset: 0.5 },
        { transform: `${transformePion(p)} scale(1)` },
      ], { duration: duree, delay: t.delai || 0, easing: 'ease-in-out', fill: 'backwards' }).then(() => {
        el.style.zIndex = String(10 + (p.k || 0));
      }));
    }
  }
  await Promise.all(promesses);
}

function dessinerMarques() {
  const couche = $('.bg-marques', racine);
  if (!couche) return;
  let h = '';
  const marque = (x, y, cls) => `<span class="bg-marque ${cls}" style="transform:translate(${x - G.d / 2}px, ${y - G.d / 2}px)"></span>`;
  const prochaine = (dest, camp = BLANC) => {
    if (dest === 'sortie') return positionDansPile(G.sortie[camp], B.piles.sortis[camp].length, 1);
    const pile = B.piles.pts[dest];
    const n = pile.length;
    // pion adverse seul : la marque se pose dessus (il sera frappé)
    const k = n && pile[0][0] !== (camp === BLANC ? 'b' : 'n') ? 0 : n;
    return positionDansPile(G.pointes[dest], k, Math.max(n, k + 1));
  };
  if (sel !== null && B.phase === 'jouer') {
    for (const [dest, coups] of destinations(sel)) {
      const p = prochaine(dest);
      h += marque(p.x, p.y, `cible${coups.length > 1 ? ' double' : ''}`);
    }
  }
  if (conseil) {
    const src = conseil.from === 'barre' ? positionDansPile(G.barre[BLANC], 0, 1)
      : positionDansPile(G.pointes[conseil.from], B.piles.pts[conseil.from].length - 1, B.piles.pts[conseil.from].length);
    const p = prochaine(conseil.to);
    h += marque(src.x, src.y, 'conseil') + marque(p.x, p.y, 'conseil');
  }
  couche.innerHTML = h;
}

function dessinerPionChoisi() {
  $('.bg-pions', racine)?.querySelectorAll('.ck.lifted').forEach((e) => e.classList.remove('lifted'));
  if (sel === null) return;
  const pile = sel === 'barre' ? B.piles.barre[BLANC] : B.piles.pts[sel];
  const id = pile[pile.length - 1];
  if (id) $(`.bg-pions [data-cle="${id}"]`, racine)?.classList.add('lifted');
}

function texteStatut() {
  switch (B.phase) {
    case 'debut': return 'Chacun lance un dé : le plus fort commence.';
    case 'lancer': return '<strong>À vous :</strong> touchez « Lancer les dés ».';
    case 'jouer':
      if (sel !== null) return 'Touchez une case marquée d’un rond jaune.';
      return B.piles.barre[BLANC].length
        ? '<strong>Votre pion sur la barre</strong> doit rentrer d’abord : touchez-le.'
        : '<strong>À vous :</strong> touchez le pion à déplacer.';
    case 'fin': return B.historique.length
      ? 'Tour terminé. Touchez « Terminer mon tour » (ou « Annuler » pour changer d’avis).'
      : '<strong>Aucun coup possible</strong> avec ce lancer. Touchez « Passer mon tour ».';
    case 'manche': return 'Touchez « Manche suivante » pour continuer le match.';
    case 'ordi': return 'L’ordinateur joue<span class="dots"><i>.</i><i>.</i><i>.</i></span>';
    default: return '';
  }
}

function dessiner(message) {
  if (!racine || !B) return;
  $('#bg-score', racine).innerHTML = `<span>Vous <b>${B.score[BLANC]}</b></span><span>${LONGUEURS[B.longueur] || `Match en ${B.longueur} points`}</span><span>Ordinateur <b>${B.score[NOIR]}</b></span>`;
  $('#bg-info', racine).textContent = B.manche
    ? `Manche ${B.manche} · niveau ${NOMS_NIVEAUX[B.niveau].toLowerCase()} · cases à parcourir : vous ${pips(B.pos, BLANC)}, ordinateur ${pips(B.pos, NOIR)}`
    : '';
  const nouveau = $('#bg-new', racine);
  nouveau.textContent = B.phase === 'manche' ? 'Manche suivante' : options.defi ? 'Recommencer' : 'Nouveau match';
  nouveau.classList.toggle('primary', B.phase === 'manche' || B.phase === 'match');
  $('#bg-status', racine).innerHTML = message || texteStatut();
  const action = $('#bg-action', racine);
  const textes = { lancer: 'Lancer les dés', fin: B.historique.length ? 'Terminer mon tour' : 'Passer mon tour' };
  action.hidden = !textes[B.phase];
  action.textContent = textes[B.phase] || '';
  $('#bg-undo', racine).disabled = !B.historique.length || !['jouer', 'fin'].includes(B.phase) || occupe;
  $('#bg-hint', racine).disabled = B.phase !== 'jouer' || occupe;
  dessinerDes();
  dessinerMarques();
  dessinerPionChoisi();
}

// ---------- Coups du joueur ----------

/** Destinations possibles depuis une source : Map dest → suite de coups (1 dé, ou 2 dés pour le même pion). */
function destinations(source) {
  const res = new Map();
  const premiers = coupsAutorises(B.pos, BLANC, B.restants).filter((m) => m.from === source);
  for (const m1 of premiers) if (!res.has(m1.to)) res.set(m1.to, [m1]);
  for (const m1 of premiers) {
    if (m1.to === 'sortie') continue;
    const apres = jouerSimple(B.pos, BLANC, m1);
    for (const m2 of coupsAutorises(apres, BLANC, retirerDe(B.restants, m1.de))) {
      if (m2.from === m1.to && !res.has(m2.to)) res.set(m2.to, [m1, m2]);
    }
  }
  return res;
}

async function jouerCoups(coups, camp) {
  for (const m of coups) {
    const avant = { pos: B.pos, piles: clonerPiles(B.piles), restants: B.restants.slice() };
    const { id, frappe } = bougerPiles(B.piles, camp, m);
    B.pos = jouerSimple(B.pos, camp, m);
    B.restants = retirerDe(B.restants, m.de);
    if (camp === BLANC) B.historique.push(avant);
    const trajets = new Map([[id, { lever: true }]]);
    const duree = camp === NOIR ? 560 : 420;
    trajets.get(id).duree = duree;
    if (frappe) trajets.set(frappe, { delai: duree * 0.85, duree: 480, lever: true });
    dessiner();
    await placerPions(trajets);
    if (frappe && racine) secouer($(`.bg-pions [data-cle="${frappe}"]`, racine));
    if (camp === NOIR) await attendre(160);
  }
}

async function toucherZone(z, bouton) {
  if (occupe || !B || B.phase !== 'jouer') return;
  conseil = null;
  const source = z === 'barre' || z === 'sortie' ? z : Number(z);
  if (sel !== null) {
    const dests = destinations(sel);
    if (dests.has(source)) {
      const coups = dests.get(source);
      sel = null;
      return executerTour(coups);
    }
    if (source === sel) {
      // deuxième toucher sur le même pion : il avance tout seul avec le plus grand dé possible
      const simples = [...dests.values()].filter((c) => c.length === 1).sort((a, b) => b[0].de - a[0].de);
      sel = null;
      if (simples.length) return executerTour(simples[0]);
      dessiner();
      return;
    }
  }
  // choisir un pion
  const possibles = new Set(coupsAutorises(B.pos, BLANC, B.restants).map((m) => m.from));
  if (possibles.has(source)) {
    sel = source;
    dessiner();
    return;
  }
  sel = null;
  const aMoi = source === 'barre' ? B.piles.barre[BLANC].length : typeof source === 'number' && B.pos.p[source] > 0;
  dessiner(aMoi
    ? (B.piles.barre[BLANC].length ? 'Il faut d’abord rentrer le pion qui est sur la barre.' : 'Ce pion ne peut pas avancer avec ces dés.')
    : 'Touchez un de vos pions (les blancs).');
  secouer(bouton);
}

async function executerTour(coups) {
  occupe = true;
  await jouerCoups(coups, BLANC);
  occupe = false;
  if (gagnant(B.pos)) return finManche(BLANC);
  if (!coupsAutorises(B.pos, BLANC, B.restants).length) B.phase = 'fin';
  sauver();
  dessiner();
}

async function lancer() {
  if (occupe || B.phase !== 'lancer') return;
  occupe = true;
  const a = tirer(), b = tirer();
  B.des = [a, b];
  B.restants = desAJouer(a, b);
  B.historique = [];
  dessiner('Les dés roulent…');
  await rouler([a, b], BLANC);
  occupe = false;
  const possibles = coupsAutorises(B.pos, BLANC, B.restants);
  B.phase = possibles.length ? 'jouer' : 'fin';
  sauver();
  dessiner(possibles.length ? (a === b ? `Double ${a} : vous jouez quatre fois ${a}.` : undefined) : '<strong>Aucun coup possible</strong> avec ce lancer. Touchez « Passer mon tour ».');
}

async function annulerTour() {
  if (occupe || !B.historique.length) return;
  const premier = B.historique[0];
  B.pos = premier.pos;
  B.piles = premier.piles;
  B.restants = premier.restants;
  B.historique = [];
  B.phase = 'jouer';
  B.annulations++;
  sel = null;
  conseil = null;
  occupe = true;
  dessiner('Vos coups de ce tour ont été annulés.');
  await placerPions();
  occupe = false;
  sauver();
  dessiner('Vos coups de ce tour ont été annulés.');
}

async function montrerIndice() {
  if (occupe || B.phase !== 'jouer') return;
  sel = null;
  const monJeton = jeton;
  dessiner('Je cherche un bon coup…');
  const { coups } = await cerveau.calculer({ pos: B.pos, camp: BLANC, des: B.restants, niveau: 'moyen' });
  if (monJeton !== jeton || !racine || B.phase !== 'jouer' || !coups.length) return;
  conseil = coups[0];
  B.indices++;
  sauver();
  const ou = (x) => (x === 'barre' ? 'la barre' : x === 'sortie' ? 'la sortie' : `la flèche ${x + 1}`);
  dessiner(`Conseil : déplacez le pion de ${ou(conseil.from)} vers ${ou(conseil.to)} (ronds jaunes).`);
}

async function terminerTour() {
  if (occupe || B.phase !== 'fin') return;
  B.tour = NOIR;
  B.phase = 'ordi';
  B.historique = [];
  sel = null;
  conseil = null;
  sauver();
  tourOrdinateur();
}

// ---------- Tour de l'ordinateur ----------

async function tourOrdinateur(desImposes = null) {
  const monJeton = ++jeton;
  occupe = true;
  const [a, b] = desImposes || [tirer(), tirer()];
  B.des = [a, b];
  B.restants = desAJouer(a, b);
  dessiner();
  if (!desImposes) await rouler([a, b], NOIR);
  const debut = Date.now();
  const { coups } = await cerveau.calculer({ pos: B.pos, camp: NOIR, des: B.restants, niveau: B.niveau });
  await attendre(Math.max(0, 450 - (Date.now() - debut)));
  if (monJeton !== jeton || !racine) { occupe = false; return; }
  if (!coups.length) {
    dessiner('L’ordinateur ne peut pas jouer avec ce lancer.');
    await attendre(1300);
  } else {
    await jouerCoups(coups, NOIR);
  }
  if (monJeton !== jeton || !racine) { occupe = false; return; }
  occupe = false;
  if (gagnant(B.pos)) return finManche(NOIR);
  B.tour = BLANC;
  B.phase = 'lancer';
  B.des = null;
  B.restants = [];
  sauver();
  dessiner();
}

// ---------- Début et fin de manche ----------

async function lancerDeDepart() {
  occupe = true;
  let moi, lui;
  do {
    moi = tirer();
    lui = tirer();
    B.des = null;
    dessiner('Chacun lance un dé : le plus fort commence.');
    const zone = $('#bg-des', racine);
    if (zone) {
      await rouler([moi, lui], BLANC);
      zone.children[1]?.classList.add('rouge');
    }
    if (moi === lui) {
      dessiner(`Égalité (${moi} et ${lui}) : on relance.`);
      await attendre(1200);
    }
  } while (moi === lui);
  B.des = [moi, lui];
  B.restants = desAJouer(moi, lui);
  occupe = false;
  if (moi > lui) {
    B.tour = BLANC;
    B.phase = coupsAutorises(B.pos, BLANC, B.restants).length ? 'jouer' : 'fin';
    sauver();
    dessiner(`Votre dé : ${moi}, celui de l’ordinateur : ${lui}. <strong>Vous commencez</strong> en jouant ${moi} et ${lui}.`);
  } else {
    B.tour = NOIR;
    B.phase = 'ordi';
    sauver();
    dessiner(`Votre dé : ${moi}, celui de l’ordinateur : ${lui}. L’ordinateur commence.`);
    await attendre(1400);
    tourOrdinateur([moi, lui]);
  }
}

async function finManche(g) {
  const points = pointsVictoire(B.pos, g);
  B.score[g] += points;
  const finDuMatch = B.score[g] >= B.longueur;
  B.phase = finDuMatch ? 'match' : 'manche';
  B.des = null;
  sauver();
  dessiner();
  await attendre(500);
  const qui = g === BLANC ? 'Vous gagnez' : 'L’ordinateur gagne';
  const detail = points === 1 ? '1 point.'
    : points === 2 ? '2 points : c’est un « gammon » (le perdant n’avait sorti aucun pion).'
      : '3 points : c’est un « backgammon » (le perdant avait encore un pion chez le gagnant).';
  if (finDuMatch) {
    const gagne = g === BLANC;
    const choix = await finirPartie({
      jeu: 'backgammon',
      gagne,
      difficulte: B.niveau,
      defi: options.defi,
      titre: gagne ? 'Bravo, match gagné !' : 'L’ordinateur gagne le match',
      texte: `${qui} la dernière manche : ${detail} Score final : vous ${B.score[BLANC]}, ordinateur ${B.score[NOIR]}.`,
      details: { points, scoreJoueur: B.score[BLANC], scoreOrdi: B.score[NOIR], indices: B.indices, annulations: B.annulations, gammon: points >= 2 && gagne },
    });
    if (choix === 'rejouer') return choisirNouveauMatch(true);
    if (choix === 'carte') location.hash = '#/niveaux';
    return;
  }
  // écran entre deux manches : on sait où on en est avant de continuer
  const suite = await demander({
    titre: `Fin de la manche ${B.manche}`,
    texte: `${qui} ${detail}\nScore : vous ${B.score[BLANC]}, ordinateur ${B.score[NOIR]} (il faut ${pluriel(B.longueur, 'point')} pour gagner le match).`,
    oui: 'Manche suivante',
    non: 'Voir le plateau',
  });
  if (suite) nouvelleManche();
  else dessiner(`Score : vous ${B.score[BLANC]}, ordinateur ${B.score[NOIR]}. Touchez « Manche suivante » pour continuer.`);
}

// ---------- Fenêtres : nouveau match, règles ----------

function fenetre(contenu) {
  return new Promise((resoudre) => {
    const fond = document.createElement('div');
    fond.className = 'sheet temp';
    fond.innerHTML = `<div class="sheet-box" role="dialog" aria-modal="true">${contenu}</div>`;
    document.body.append(fond);
    animer(fond.firstElementChild, [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 });
    fond.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-r]');
      if (!b && e.target !== fond) return;
      const r = b ? b.dataset.r : '';
      if (r.startsWith('niveau:') || r.startsWith('longueur:')) {
        fond.querySelectorAll(`button[data-r^="${r.split(':')[0]}:"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        return;
      }
      const choisi = (k) => fond.querySelector(`button[data-r^="${k}:"][aria-pressed="true"]`)?.dataset.r.split(':')[1];
      fond.remove();
      resoudre({ r, niveau: choisi('niveau'), longueur: Number(choisi('longueur')) });
    });
  });
}

async function choisirNouveauMatch(direct = false) {
  if (options.defi) {
    if (!direct && matchEnCours() && !(await demander({ titre: 'Recommencer ?', texte: 'Le match en cours sera abandonné.', oui: 'Oui, recommencer', non: 'Non, continuer' }))) return;
    return nouveauMatch();
  }
  const niveau = B?.niveau || 'facile', longueur = B?.longueur || 1;
  const { r, niveau: n, longueur: l } = await fenetre(`
    <h3>Nouveau match</h3>
    ${matchEnCours() && !direct ? '<p>Le match en cours sera abandonné.</p>' : ''}
    <p class="bg-label">Niveau de l’ordinateur</p>
    <div class="seg">${Object.keys(NOMS_NIVEAUX).map((k) => `<button data-r="niveau:${k}" aria-pressed="${k === niveau}">${NOMS_NIVEAUX[k]}</button>`).join('')}</div>
    <p class="bg-label">Durée</p>
    <div class="seg vertical">${Object.keys(LONGUEURS).map((k) => `<button data-r="longueur:${k}" aria-pressed="${Number(k) === longueur}">${LONGUEURS[k]}</button>`).join('')}</div>
    <div class="sheet-actions"><button class="btn" data-r="">Annuler</button><button class="btn primary" data-r="ok">Commencer</button></div>`);
  if (r === 'ok') nouveauMatch(n, l);
}

function montrerRegles() {
  return fenetre(`
    <h3>Les règles en bref</h3>
    <ul class="bg-regles">
      <li><b>But :</b> sortir vos 15 pions blancs avant l’ordinateur.</li>
      <li>Vos pions font le tour du plateau ${G?.verticale ? 'en « U » : ils montent à gauche, puis descendent à droite' : 'en « U » : de droite à gauche en haut, puis de gauche à droite en bas'}, jusqu’à votre maison <b>en bas à droite</b>.</li>
      <li>Chaque dé fait avancer un pion d’autant de flèches. Un <b>double</b> se joue quatre fois.</li>
      <li>On ne peut pas s’arrêter là où l’ordinateur a <b>deux pions ou plus</b>.</li>
      <li>Un pion <b>seul</b> peut être frappé : il part sur la barre, au milieu, et doit rentrer avant tout autre coup.</li>
      <li>Quand tous vos pions sont dans votre maison, vous pouvez les <b>sortir</b>.</li>
      <li>Une manche gagnée vaut 1 point, 2 si l’adversaire n’a sorti aucun pion (« gammon »).</li>
    </ul>
    <div class="sheet-actions"><button class="btn primary" data-r="ok">J’ai compris</button></div>`);
}

// ---------- Construction de l'écran ----------

function construire() {
  racine.innerHTML = `
    <div class="bg-body">
      <div class="bg-zone-plateau"><div class="bg-board" id="bg-board"></div></div>
      <div class="bg-side">
        <div class="bg-score" id="bg-score"></div>
        <p class="status" id="bg-status" aria-live="polite"></p>
        <div class="bg-des" id="bg-des" aria-live="polite"></div>
        <button class="btn primary bg-action" id="bg-action" hidden></button>
        <div class="tools">
          <button class="btn" id="bg-undo">Annuler</button>
          <button class="btn" id="bg-hint">Indice</button>
          <button class="btn" id="bg-rules">Règles</button>
        </div>
        <button class="btn" id="bg-new">${options.defi ? 'Recommencer' : 'Nouveau match'}</button>
        <p class="bg-info" id="bg-info"></p>
      </div>
    </div>`;
  $('#bg-board', racine).addEventListener('click', (e) => {
    const z = e.target.closest('.bg-zone');
    if (z) toucherZone(z.dataset.z, z);
  });
  $('#bg-action', racine).addEventListener('click', () => (B.phase === 'lancer' ? lancer() : terminerTour()));
  $('#bg-undo', racine).addEventListener('click', annulerTour);
  $('#bg-hint', racine).addEventListener('click', montrerIndice);
  $('#bg-rules', racine).addEventListener('click', montrerRegles);
  $('#bg-new', racine).addEventListener('click', () => {
    if (B?.phase === 'manche') return nouvelleManche();
    choisirNouveauMatch();
  });
  surRedimension = () => {
    if (!racine || !B || occupe) return;
    construirePlateau();
    placerPions(new Map(), { glisser: false });
    dessiner();
  };
  window.addEventListener('resize', surRedimension);
}

function reprendre() {
  construirePlateau();
  placerPions(new Map(), { glisser: false });
  dessiner();
  if (B.phase === 'ordi') tourOrdinateur();
  else if (B.phase === 'debut') lancerDeDepart();
  else if (B.phase === 'manche') dessiner('Touchez « Manche suivante » pour continuer le match.');
}

// ---------- Module ----------

export default {
  id: 'backgammon',
  nom: 'Backgammon',
  description: 'Contre l’ordinateur, en une ou plusieurs manches',
  paysage: true,
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect class="ic-bg" x="4" y="8" width="56" height="48" rx="6"/><path class="ic-tri" d="M10 12l6 22 6-22zM26 12l6 22 6-22zM42 12l6 22 6-22z"/><path class="ic-tri" d="M10 52l6-22 6 22zM26 52l6-22 6 22zM42 52l6-22 6 22z" opacity=".55"/><circle class="ic-pw" cx="16" cy="45" r="5.5"/><circle class="ic-pr" cx="48" cy="19" r="5.5"/></svg>`,

  resume() {
    options = {};
    charger();
    return matchEnCours() ? `Match en cours : vous ${B.score[BLANC]}, ordinateur ${B.score[NOIR]}` : '';
  },

  monter(conteneur, opts = {}) {
    racine = conteneur;
    options = opts;
    occupe = false;
    sel = null;
    conseil = null;
    charger();
    if (B && options.defi && (B.phase === 'match' || B.niveau !== options.defi.niveau)) B = null;
    construire();
    if (B && B.phase !== 'match') return reprendre();
    if (options.defi) return nouveauMatch();
    // premier lancement : on choisit le niveau et la durée
    B = null;
    construirePlateau();
    const pos = positionInitiale();
    B = { pos, piles: pilesInitiales(pos), score: { 1: 0, '-1': 0 }, phase: 'match', manche: 0, niveau: 'facile', longueur: 1, restants: [], historique: [], des: null, indices: 0, annulations: 0 };
    placerPions(new Map(), { glisser: false });
    dessiner('Touchez « Nouveau match » pour commencer.');
    choisirNouveauMatch(true);
  },

  demonter() {
    jeton++;
    window.removeEventListener('resize', surRedimension);
    occupe = false;
    racine = null;
  },
};
