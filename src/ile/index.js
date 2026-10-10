// Écran « Mon île » : construire, aménager, décorer et agrandir son île ; les habitants récoltent bois,
// pierre et blé en temps réel (règles dans regles.js, vie du village dans vie.js).
// Graphismes : « Tiny Islands » (Majadroid, CC0), « Tiny Town » (Kenney, CC0), habitants dessinés pour l'appli.
import { $, $$, chargerStyle, pluriel } from '../core/outils.js';
import { lire, ecrire } from '../core/stockage.js';
import { solde, depenserEtoiles, ajouterEtoiles } from '../core/etoiles.js';
import { demander } from '../core/dialogue.js';
import { animer, attendre, pop, secouer, mouvementReduit, COURBE_REBOND } from '../core/mouvement.js';
import { T, S, tuile, sprite, tuileBatiment } from '../core/tuiles.js';
import {
  ILES, BATIMENTS, DECORS, AMENAGEMENTS, ORDRE_BATIMENTS, ORDRE_DECORS, ORDRE_AMENAGEMENTS, NOMS_DIRECTIONS, RESSOURCES,
  MINUTE, migrer, cle, coord, estTerre, terrainDe, construire, ameliorer, accelerer, prixAcceleration,
  decorer, retirer, produit, stock, plafond, periode, ramasser, toutRamasser, peutAmenager, amenager, agrandir,
  coutAgrandir, obstacleAgrandir, actualiser, beauteIle, beauteTotale, ilesOuvertes, estDebloque, prochainPalier,
  apercu, habitants, peutPayer, manque, niveauMax, pointsCase,
} from './regles.js';
import { creerVie } from './vie.js';

chargerStyle(new URL('./ile.css', import.meta.url));

const CLE = 'ile';
const ICONES = { bois: T.icones.bois, pierre: T.icones.pierre, ble: T.icones.ble };
const OUTILS = { abattre: S.outils.hache, casser: S.outils.pioche, planter: S.pousse, creuser: S.outils.pelle, combler: S.outils.seau };
const ONGLETS = { construire: 'Construire', amenager: 'Aménager', decorer: 'Décorer', agrandir: 'Agrandir' };
const NOM_RES = { bois: 'bois', pierre: 'pierre', ble: 'blé' };

let E = null;
let racine = null;
let onglet = 'construire';
let choix = null; // bâtiment, décor ou aménagement choisi, en attente d'une case
let vie = null;
let ticker = null;
let surRedimension = null;
let signature = '';
let ts = 40;

const maintenant = () => Date.now();
const ile = () => E.iles[E.active];
function charger() {
  E = migrer(lire(CLE, null), maintenant());
}
const sauver = () => ecrire(CLE, E);
const dire = (t) => { const el = $('#ile-status', racine); if (el) el.innerHTML = t || ''; };
const payerEtoiles = (n) => depenserEtoiles(n);

// ---------- Petits morceaux d'affichage ----------

function icone(res, taille = 20) {
  return res === 'etoiles' ? `<b class="etoile-ic" style="font-size:${taille * 0.9}px">★</b>` : tuile(ICONES[res], taille);
}
/** Coût sous forme de pastilles ; ce qui manque est en rouge. */
function coutHtml(cout) {
  const m = manque(E, solde(), cout);
  return Object.entries(cout).filter(([, v]) => v).map(([r, v]) => `<span class="prix ${m[r] ? 'manque' : ''}">${icone(r, 18)}${v}</span>`).join('');
}
function texteManque(m) {
  return Object.entries(m).map(([r, v]) => (r === 'etoiles' ? pluriel(v, 'étoile') : `${v} ${NOM_RES[r]}`)).join(', ');
}
const duree = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s} s`;
};

// ---------- Ce qu'on voit sur chaque case ----------

/** Image d'une case : { feuille: 't' (Tiny Islands) ou 's' (sprites), c: [col, rang], etape }. */
function imageCase(x, y, t) {
  const I = ile(), k = cle(x, y), c = I.cases[k], w = I.travaux[k], terrain = terrainDe(I, x, y);
  if (c) {
    if (c.niveau === 0 && c.chantier && !BATIMENTS[c.type]?.cote) {
      const p = (t - c.chantier.debut) / (c.chantier.fin - c.chantier.debut);
      const etape = Math.min(2, Math.max(0, Math.floor(p * 3)));
      return { feuille: 's', c: S.chantier[etape], etape };
    }
    const niveau = Math.max(1, c.niveau);
    if (DECORS[c.type]) return { feuille: 's', c: S.decor[c.type] || S.fleurs };
    if (c.type === 'carriere') return { feuille: 's', c: S.carriere[niveau - 1] };
    return { feuille: 't', c: tuileBatiment(c.type, niveau) };
  }
  if (w) {
    const vue = { abattre: S.souche, casser: S.gravats, planter: S.pousse, creuser: S.chantier[0], combler: S.chantier[0] }[w.action];
    return { feuille: 's', c: vue };
  }
  if (terrain === 'foret') return { feuille: 't', c: T.foret };
  if (terrain === 'montagne') return { feuille: 't', c: T.montagne };
  if (terrain === 'etang') return { feuille: 's', c: S.etang };
  if (terrain === 'herbe') return { feuille: 't', c: T.herbe };
  // la mer autour de l'île : côte selon la position
  const { x0, y0, x1, y1 } = I.ext;
  if (y < y0) return { feuille: 't', c: x < x0 ? T.coinNO : x > x1 ? T.coinNE : T.bordN };
  if (y > y1) return { feuille: 't', c: x < x0 ? T.coinSO : x > x1 ? T.coinSE : T.bordS };
  return { feuille: 't', c: x < x0 ? T.bordO : T.bordE };
}
const imageHtml = (img, taille) => (img.feuille === 's' ? sprite(img.c, taille) : tuile(img.c, taille));

function tailleCase() {
  const I = ile();
  const L = I.ext.x1 - I.ext.x0 + 3, H = I.ext.y1 - I.ext.y0 + 3;
  const largeur = Math.min(($('.ile-mer', racine)?.clientWidth || 340) - 20, 640);
  const hauteur = matchMedia('(orientation: landscape) and (max-height: 560px)').matches ? window.innerHeight - 40 : 9999;
  const brut = Math.floor(Math.min(largeur / L, hauteur / H));
  return Math.max(24, brut >= 32 ? Math.floor(brut / 8) * 8 : brut);
}

/** Les cases à proposer quand un bâtiment, un décor ou un aménagement est choisi (avec la beauté gagnée). */
function propositions() {
  const I = ile(), res = new Map();
  if (!choix) return res;
  for (let y = I.ext.y0 - 1; y <= I.ext.y1 + 1; y++) for (let x = I.ext.x0 - 1; x <= I.ext.x1 + 1; x++) {
    if (choix.genre === 'amenager') { if (peutAmenager(I, x, y, choix.type)) res.set(cle(x, y), null); continue; }
    const a = apercu(I, x, y, choix.type);
    if (a !== null) res.set(cle(x, y), a);
  }
  return res;
}

function nomCase(x, y) {
  const I = ile(), c = I.cases[cle(x, y)];
  if (c) {
    const def = BATIMENTS[c.type] || DECORS[c.type];
    return `${def.nom}${BATIMENTS[c.type] ? `, niveau ${c.niveau}` : ''}${c.chantier ? ', en chantier' : ''}`;
  }
  return { herbe: 'Herbe libre', foret: 'Forêt', montagne: 'Rochers', etang: 'Étang', eau: 'Mer' }[terrainDe(I, x, y)];
}

function dessinerGrille() {
  if (!racine) return;
  const I = ile(), t = maintenant();
  ts = tailleCase();
  const props = propositions();
  const meilleur = props.size && choix?.genre !== 'amenager' ? Math.max(...props.values()) : null;
  const { x0, y0, x1, y1 } = I.ext;
  let h = '';
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    const k = cle(x, y), img = imageCase(x, y, t), p = props.get(k);
    const c = I.cases[k];
    const classes = ['case', estTerre(I, x, y) ? 'terre' : 'mer', props.has(k) ? 'possible' : '',
      p !== undefined && p !== null && p === meilleur ? 'meilleur' : '', c?.chantier && c.niveau > 0 ? 'travaux-haut' : ''].join(' ');
    h += `<button class="${classes}" data-k="${k}" data-etape="${img.etape ?? ''}" style="grid-column:${x - x0 + 2};grid-row:${y - y0 + 2}" aria-label="${nomCase(x, y)}">`
      + `<span class="fond">${imageHtml(img, ts)}</span>`
      + (p !== undefined && p !== null ? `<span class="gain">+${p}</span>` : '')
      + '<span class="minuteur" hidden><b></b></span><span class="recolte" hidden></span></button>';
  }
  const grille = $('.ile-grille', racine);
  grille.style.setProperty('--ts', `${ts}px`);
  grille.style.gridTemplateColumns = `repeat(${x1 - x0 + 3}, ${ts}px)`;
  grille.style.gridTemplateRows = `repeat(${y1 - y0 + 3}, ${ts}px)`;
  grille.innerHTML = h;
  const plan = $('.ile-plan', racine);
  plan.style.width = `${(x1 - x0 + 3) * ts}px`;
  plan.style.height = `${(y1 - y0 + 3) * ts}px`;
  majDynamique();
  // on ne repeuple l'île que si ses bâtiments ont changé (sinon les habitants restent où ils sont)
  const sig = `${E.active}|${ts}|${JSON.stringify(I.ext)}|${Object.entries(I.cases).map(([k2, c2]) => `${k2}:${c2.type}:${c2.niveau}`).join(';')}|${JSON.stringify(I.terrain)}`;
  if (sig !== signature) {
    signature = sig;
    vie?.peupler();
  }
}

/** Ce qui bouge chaque seconde : minuteurs des chantiers, bulles de récolte, bouton « Tout ramasser ». */
function majDynamique() {
  if (!racine) return;
  const I = ile(), t = maintenant();
  let total = 0;
  for (const el of $$('.ile-grille .case', racine)) {
    const k = el.dataset.k, [x, y] = coord(k), c = I.cases[k], w = I.travaux[k];
    const travail = c?.chantier || w;
    const minuteur = el.querySelector('.minuteur');
    if (travail) {
      const p = Math.min(1, (t - travail.debut) / (travail.fin - travail.debut));
      minuteur.hidden = false;
      minuteur.style.setProperty('--p', p.toFixed(3));
      minuteur.querySelector('b').textContent = duree(travail.fin - t);
      // l'étape du chantier change (fondations → échafaudage → charpente)
      if (c && c.niveau === 0) {
        const img = imageCase(x, y, t);
        if (String(img.etape) !== el.dataset.etape) {
          el.dataset.etape = img.etape;
          el.querySelector('.fond').innerHTML = imageHtml(img, ts);
          pop(el.querySelector('.fond'), 1.12);
        }
      }
    } else minuteur.hidden = true;
    const bulle = el.querySelector('.recolte');
    const q = c ? stock(I, x, y, t) : 0;
    total += q;
    if (q > 0) {
      const res = BATIMENTS[c.type].prod.res;
      const html = `${icone(res, Math.max(14, Math.round(ts * 0.42)))}<b>${q}</b>`;
      if (bulle.innerHTML !== html) bulle.innerHTML = html;
      const etaitCache = bulle.hidden;
      bulle.hidden = false;
      bulle.classList.toggle('plein', q >= plafond(c));
      if (etaitCache) animer(bulle, [{ transform: 'translate(-50%, 8px) scale(0)' }, { transform: 'translate(-50%, 0) scale(1)' }], { duration: 300, easing: COURBE_REBOND });
    } else bulle.hidden = true;
  }
  // toutes les îles comptent pour « Tout ramasser »
  let partout = 0;
  E.iles.forEach((autre, n) => { if (n !== E.active) for (const k of Object.keys(autre.cases)) partout += stock(autre, ...coord(k), t); });
  const b = $('#ile-ramasser', racine);
  b.hidden = total + partout === 0;
  b.textContent = `Tout ramasser (${total + partout})`;
}

function dessinerEntete() {
  if (!racine) return;
  const r = E.ressources;
  $('#ile-res', racine).innerHTML = `
    <span class="res-puce" data-res="etoiles" aria-label="${solde()} étoiles">${icone('etoiles', 22)}<b>${solde()}</b></span>
    ${RESSOURCES.map((x) => `<span class="res-puce" data-res="${x}" aria-label="${r[x]} ${NOM_RES[x]}">${icone(x, 22)}<b>${r[x]}</b></span>`).join('')}
    <span class="res-puce" aria-label="${habitants(E)} habitants">${sprite(S.habitant(0, 0), 26)}<b>${habitants(E)}</b></span>`;
  const total = beauteTotale(E), palier = prochainPalier(E);
  const seuils = [0, ...ORDRE_BATIMENTS.map((k) => BATIMENTS[k].debloque), ...ORDRE_DECORS.map((k) => DECORS[k].debloque || 0), ...ILES.map((x) => x.seuil)];
  const precedent = seuils.filter((s) => s <= total).sort((a, b) => b - a)[0] || 0;
  const pourcent = palier ? Math.round(((total - precedent) / (palier.seuil - precedent)) * 100) : 100;
  $('#ile-beaute', racine).innerHTML = `
    <p><b>Beauté : ${total}</b>${palier ? ` <small>· encore ${palier.seuil - total} pour : ${palier.texte}</small>` : ' <small>· tout est débloqué !</small>'}</p>
    <span class="barre"><i style="width:${pourcent}%"></i></span>`;
  const ouvertes = ilesOuvertes(E), n = E.active;
  $('.ile-nav', racine).innerHTML = ouvertes > 1
    ? `<button class="btn" data-ile="-1" ${n === 0 ? 'disabled' : ''} aria-label="Île précédente">◀</button>
       <p><b>${ILES[n].nom}</b><small>Île ${n + 1} sur ${ouvertes} · beauté ${beauteIle(ile())}</small></p>
       <button class="btn" data-ile="1" ${n >= ouvertes - 1 ? 'disabled' : ''} aria-label="Île suivante">▶</button>`
    : `<p><b>${ILES[n].nom}</b></p>`;
}

function carte(genre, type, img, nom, cout, desc, ouvert, verrou) {
  const choisi = choix && choix.genre === genre && choix.type === type;
  return `<button class="carte-bat ${choisi ? 'choisi' : ''}" data-genre="${genre}" data-type="${type}" ${ouvert ? '' : 'disabled'}>
    ${img}<span class="cb-nom">${nom}</span>
    <span class="cb-prix">${ouvert ? coutHtml(cout) || '<span class="prix">Gratuit</span>' : verrou}</span>
    <span class="cb-desc">${desc}</span></button>`;
}

function dessinerBoutique() {
  if (!racine) return;
  $$('.onglets button', racine).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.onglet === onglet)));
  let h = '';
  if (onglet === 'construire') {
    for (const type of ORDRE_BATIMENTS) {
      const def = BATIMENTS[type], ouvert = estDebloque(E, type);
      const img = type === 'carriere' ? sprite(S.carriere[0], 48) : tuile(tuileBatiment(type, 1), 48);
      h += carte('construire', type, img, def.nom, def.cout[0], def.desc, ouvert, `Dès ${def.debloque} de beauté`);
    }
  } else if (onglet === 'amenager') {
    for (const type of ORDRE_AMENAGEMENTS) {
      const a = AMENAGEMENTS[type];
      const gain = Object.entries(a.gain).map(([r, v]) => `+${v} ${NOM_RES[r]}`).join(', ');
      h += carte('amenager', type, sprite(OUTILS[type], 48), a.nom, a.cout, `${a.desc}${gain ? ` (${gain})` : ''}`, true, '');
    }
  } else if (onglet === 'decorer') {
    for (const type of ORDRE_DECORS) {
      const def = DECORS[type], ouvert = estDebloque(E, type);
      h += carte('decorer', type, sprite(S.decor[type] || S.fleurs, 48), def.nom, def.cout, def.desc, ouvert, `Dès ${def.debloque} de beauté`);
    }
  } else {
    const I = ile();
    h += '<p class="note agrandir-note">Agrandir ajoute une rangée de terre au bord de l’île. Il faut de la pierre : cassez des rochers ou construisez une carrière.</p>';
    for (const dir of ['nord', 'sud', 'ouest', 'est']) {
      const obstacle = obstacleAgrandir(I, dir);
      const desc = obstacle === 'max' ? 'L’île est déjà au plus grand de ce côté' : obstacle === 'port' ? 'Un port est construit de ce côté' : 'Une nouvelle rangée de terre';
      h += carte('agrandir', dir, `<span class="fleche fleche-${dir}" aria-hidden="true">➜</span>`, `Agrandir ${NOMS_DIRECTIONS[dir]}`, coutAgrandir(I, dir), desc, !obstacle, 'Impossible');
    }
  }
  $('#ile-boutique', racine).innerHTML = h;
  $('#ile-fin', racine).hidden = !choix;
}

function toutDessiner() {
  dessinerEntete();
  dessinerGrille();
  dessinerBoutique();
}

// ---------- Effets ----------

/** Un petit texte qui s'envole au-dessus d'une case. */
function envol(k, html) {
  const el = $(`.case[data-k="${k}"]`, racine);
  if (!el || mouvementReduit()) return;
  const b = document.createElement('span');
  b.className = 'envol';
  b.innerHTML = html;
  el.append(b);
  animer(b, [{ transform: 'translate(-50%, 0)', opacity: 0 }, { transform: 'translate(-50%, -18px)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%, -64px)', opacity: 0 }],
    { duration: 1400, easing: 'ease-out' }).then(() => b.remove());
}

/** Des icônes de ressource volent de la case vers le compteur en haut. */
async function voler(k, res, q) {
  const depart = $(`.case[data-k="${k}"]`, racine)?.getBoundingClientRect();
  const arrivee = $(`.res-puce[data-res="${res}"]`, racine)?.getBoundingClientRect();
  if (!depart || !arrivee || mouvementReduit()) return;
  const vols = [];
  for (let i = 0; i < Math.min(q, 5); i++) {
    const el = document.createElement('span');
    el.className = 'vol-ressource';
    el.innerHTML = icone(res, 24);
    el.style.left = `${depart.left + depart.width / 2 - 12}px`;
    el.style.top = `${depart.top + depart.height / 2 - 12}px`;
    document.body.append(el);
    const dx = arrivee.left + 12 - (depart.left + depart.width / 2), dy = arrivee.top + 4 - (depart.top + depart.height / 2);
    vols.push(animer(el, [
      { transform: 'translate(0, 0) scale(.6)', opacity: 0 },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 40}px) scale(1.2)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(.8)`, opacity: 1 },
    ], { duration: 750, delay: i * 90, easing: 'ease-in', fill: 'backwards' }).then(() => el.remove()));
  }
  await Promise.all(vols);
}

function deblocages() {
  return { ouvertes: ilesOuvertes(E), debloques: [...ORDRE_BATIMENTS, ...ORDRE_DECORS].filter((t) => estDebloque(E, t)) };
}
async function annoncerDeblocages(avant) {
  const nouveaux = [...ORDRE_BATIMENTS, ...ORDRE_DECORS].filter((t) => estDebloque(E, t) && !avant.debloques.includes(t));
  for (const t of nouveaux) {
    const def = BATIMENTS[t] || DECORS[t];
    await demander({ titre: 'Nouveau !', texte: `Votre île est de plus en plus belle : « ${def.nom} » est maintenant disponible. ${def.desc}.`, oui: 'Super !' });
  }
  if (ilesOuvertes(E) > avant.ouvertes) {
    const nouvelle = ilesOuvertes(E) - 1;
    if (await demander({ titre: 'Une nouvelle île !', texte: `${ILES[nouvelle].nom} est apparue au large. Vous pourrez y construire encore plus.`, oui: 'Aller la voir', non: 'Plus tard' })) {
      changerIle(nouvelle - E.active);
    }
  }
  if (nouveaux.length) dessinerBoutique();
}

// ---------- Le temps passe ----------

async function tic() {
  if (!racine || document.hidden) return;
  const avant = deblocages();
  const evenements = actualiser(E, maintenant());
  if (!evenements.length) return majDynamique();
  sauver();
  dessinerEntete();
  dessinerGrille();
  for (const ev of evenements) {
    if (ev.n !== E.active) continue;
    const el = $(`.case[data-k="${ev.cle}"] .fond`, racine);
    if (el) animer(el, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.3)', filter: 'brightness(1.5)', offset: 0.4 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 650, easing: COURBE_REBOND });
    if (ev.genre === 'construit' || ev.genre === 'agrandi') {
      envol(ev.cle, `+${ev.gain} beauté`);
      const nom = BATIMENTS[ev.type].nom;
      dire(ev.genre === 'construit' ? `${nom} : c’est construit ! +${ev.gain} de beauté.` : `${nom} : niveau ${ev.niveau} ! +${ev.gain} de beauté.`);
    } else {
      const gain = Object.entries(ev.gain).map(([r, q]) => `+${q} ${icone(r, 18)}`).join(' ');
      if (gain) envol(ev.cle, gain);
      dire(`${AMENAGEMENTS[ev.action].nom} : c’est fait !`);
    }
  }
  await annoncerDeblocages(avant);
}

// ---------- Actions ----------

const coutDe = (genre, type) => (genre === 'construire' ? BATIMENTS[type].cout[0] : genre === 'decorer' ? DECORS[type].cout : AMENAGEMENTS[type].cout);

function choisir(genre, type) {
  if (genre === 'agrandir') return agrandirVers(type);
  if (choix && choix.genre === genre && choix.type === type) { choix = null; dessinerGrille(); dessinerBoutique(); dire(''); return; }
  const cout = coutDe(genre, type);
  if (!peutPayer(E, solde(), cout)) {
    secouer($(`.carte-bat[data-type="${type}"]`, racine));
    return dire(`Il manque ${texteManque(manque(E, solde(), cout))}. ${cout.etoiles ? 'Jouez pour gagner des étoiles ; ' : ''}récoltez ou aménagez l’île pour avoir des ressources.`);
  }
  choix = { genre, type };
  dessinerGrille();
  dessinerBoutique();
  if (!$$('.case.possible', racine).length) {
    choix = null;
    dessinerGrille();
    dessinerBoutique();
    return dire(genre === 'amenager' ? 'Aucune case ne s’y prête pour l’instant.' : 'Plus de place libre : aménagez ou agrandissez l’île.');
  }
  const nom = { construire: BATIMENTS[type]?.nom, decorer: DECORS[type]?.nom, amenager: AMENAGEMENTS[type]?.nom }[genre];
  dire(genre === 'amenager'
    ? `<b>${nom}</b> : touchez une case entourée.`
    : `Touchez une case pour poser : <b>${nom}</b>. Les nombres montrent la beauté gagnée ; la meilleure case brille.`);
  $('.ile-mer', racine).scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'center' });
}

async function toucherCase(k, el) {
  const I = ile(), [x, y] = coord(k), t = maintenant();
  if (choix) {
    if (!el.classList.contains('possible')) {
      secouer(el);
      return dire('Choisissez une case entourée.');
    }
    const avant = deblocages();
    let r;
    if (choix.genre === 'construire') r = construire(E, E.active, x, y, choix.type, solde(), payerEtoiles, t);
    else if (choix.genre === 'decorer') r = decorer(E, E.active, x, y, choix.type, solde(), payerEtoiles);
    else r = amenager(E, E.active, x, y, choix.type, solde(), payerEtoiles, t);
    if (!r.ok) return dire(r.manque ? `Il manque ${texteManque(r.manque)}.` : 'Ce n’est pas possible ici.');
    sauver();
    const fait = choix;
    if (!peutPayer(E, solde(), coutDe(fait.genre, fait.type))) choix = null; // on garde l'outil en main si l'on peut recommencer
    dessinerEntete();
    dessinerGrille();
    dessinerBoutique();
    animer($(`.case[data-k="${k}"] .fond`, racine), [{ transform: 'translateY(-40%) scale(.5)', opacity: 0 }, { transform: 'translateY(4%) scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: COURBE_REBOND });
    let texte;
    if (fait.genre === 'construire') texte = `Le chantier commence : fini dans ${duree(BATIMENTS[fait.type].duree * MINUTE)}. Les habitants s’en occupent.`;
    else if (fait.genre === 'decorer') { envol(k, `+${r.gain} beauté`); texte = `+${r.gain} de beauté !`; }
    else texte = `${AMENAGEMENTS[fait.type].nom} : c’est parti (${duree(AMENAGEMENTS[fait.type].minutes * MINUTE)}).`;
    dire(choix ? `${texte} Vous pouvez continuer, ou toucher « Terminer ».` : texte);
    await annoncerDeblocages(avant);
    return;
  }
  const c = I.cases[k];
  if (c && stock(I, x, y, t) > 0) {
    const { res, n } = ramasser(E, E.active, x, y, t);
    sauver();
    majDynamique();
    dire(`+${n} ${NOM_RES[res]} !`);
    await voler(k, res, n);
    dessinerEntete();
    pop($(`.res-puce[data-res="${res}"]`, racine), 1.3);
    return;
  }
  if (c) return ouvrirFiche(x, y);
  if (I.travaux[k]) return dire(`${AMENAGEMENTS[I.travaux[k].action].nom} : encore ${duree(I.travaux[k].fin - t)}.`);
  const infos = {
    herbe: 'De l’herbe libre : choisissez quoi construire en bas de l’écran.',
    foret: 'Une forêt : les cabanes de bûcheron y trouvent leur bois. Vous pouvez aussi l’abattre (onglet Aménager).',
    montagne: 'Des rochers : une carrière à côté donne de la pierre. Vous pouvez aussi les casser (onglet Aménager).',
    etang: 'Un étang : il embellit l’île et ses voisins.',
    eau: 'La mer. Le port se construit au bord de l’île.',
  };
  dire(infos[terrainDe(I, x, y)] || '');
}

async function ouvrirFiche(x, y) {
  const I = ile(), k = cle(x, y), c = I.cases[k], t = maintenant();
  const estDecor = Boolean(DECORS[c.type]);
  const def = BATIMENTS[c.type] || DECORS[c.type];
  let infos = '';
  if (!estDecor) {
    if (c.chantier) infos += `<p class="note">${c.niveau === 0 ? 'En construction' : `Agrandissement vers le niveau ${c.chantier.vers}`} : encore <b>${duree(c.chantier.fin - t)}</b>.</p>`;
    if (def.prod && c.niveau > 0) {
      infos += produit(I, x, y)
        ? `<p class="note">Produit 1 ${NOM_RES[def.prod.res]} toutes les ${duree(periode(c))}. Réserve : <b>${stock(I, x, y, t)} / ${plafond(c)}</b>.</p>`
        : `<p class="note manque-texte">Ne produit rien : il faut ${def.prod.besoin === 'foret' ? 'une forêt à deux cases au plus' : 'des rochers juste à côté'}.</p>`;
    }
    if (def.habitants && c.niveau > 0) infos += `<p class="note">${pluriel(def.habitants * c.niveau, 'habitant')} ${def.habitants * c.niveau > 1 ? 'vivent' : 'vit'} ici.</p>`;
  }
  const prochain = !estDecor && !c.chantier && c.niveau < niveauMax(c.type) ? def.cout[c.niveau] : null;
  const q = stock(I, x, y, t);
  const fond = document.createElement('div');
  fond.className = 'sheet temp';
  fond.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true">
      <div class="bat-tete">${imageHtml(imageCase(x, y, t), 64)}<div><h3>${def.nom}</h3><p>${estDecor ? '' : `Niveau ${c.niveau} sur ${niveauMax(c.type)} · `}<b>${pointsCase(I, x, y)} points</b> de beauté</p></div></div>
      <p class="note">${def.desc}.</p>
      ${infos}
      ${prochain && !peutPayer(E, solde(), prochain) ? `<p class="note manque-texte">Pour agrandir, il manque ${texteManque(manque(E, solde(), prochain))}.</p>` : ''}
      <div class="sheet-actions">
        <button class="btn" data-r="">Fermer</button>
        <button class="btn" data-r="retirer">Retirer (on récupère tout)</button>
        ${c.chantier ? `<button class="btn" data-r="accelerer" ${solde() < prixAcceleration(c, t) ? 'disabled' : ''}>Finir tout de suite (${prixAcceleration(c, t)} ★)</button>` : ''}
        ${q ? `<button class="btn" data-r="ramasser">Ramasser (${q})</button>` : ''}
        ${prochain ? `<button class="btn primary" data-r="ameliorer" ${peutPayer(E, solde(), prochain) ? '' : 'disabled'}>Agrandir : ${coutHtml(prochain)}</button>` : ''}
      </div>
    </div>`;
  document.body.append(fond);
  animer(fond.firstElementChild, [{ transform: 'translateY(50px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 });
  const r = await new Promise((ok) => fond.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-r]');
    if ((!b && e.target !== fond) || b?.disabled) return;
    fond.remove();
    ok(b ? b.dataset.r : '');
  }));
  const t2 = maintenant();
  if (r === 'ameliorer') {
    const res = ameliorer(E, E.active, x, y, solde(), payerEtoiles, t2);
    if (!res.ok) return dire(res.manque ? `Il manque ${texteManque(res.manque)}.` : 'Ce n’est pas possible pour l’instant.');
    sauver();
    toutDessiner();
    dire(`Les travaux commencent : niveau ${c.niveau + 1} dans ${duree(c.chantier.fin - t2)}.`);
  } else if (r === 'accelerer') {
    if (accelerer(E, E.active, x, y, payerEtoiles, t2).ok) { sauver(); await tic(); }
  } else if (r === 'ramasser') {
    await toucherCase(k, $(`.case[data-k="${k}"]`, racine));
  } else if (r === 'retirer') {
    if (!(await demander({ titre: `Retirer « ${def.nom} » ?`, texte: 'Vous récupérez ce qu’il a coûté.', oui: 'Oui, retirer', non: 'Non, garder' }))) return;
    await animer($(`.case[data-k="${k}"] .fond`, racine), [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.3)', opacity: 0 }], { duration: 260 });
    const rendu = retirer(E, E.active, x, y);
    if (rendu?.etoiles) ajouterEtoiles(rendu.etoiles, 'remboursement');
    sauver();
    toutDessiner();
    dire('C’est retiré, tout vous a été rendu.');
  }
}

async function agrandirVers(dir) {
  const I = ile(), cout = coutAgrandir(I, dir);
  if (!peutPayer(E, solde(), cout)) {
    secouer($(`.carte-bat[data-type="${dir}"]`, racine));
    return dire(`Il manque ${texteManque(manque(E, solde(), cout))}. Cassez des rochers ou construisez une carrière pour la pierre.`);
  }
  if (!(await demander({ titre: `Agrandir l’île ${NOMS_DIRECTIONS[dir]} ?`, texte: 'Une nouvelle rangée de terre va sortir de l’eau.', oui: 'Oui, agrandir', non: 'Non' }))) return;
  const r = agrandir(E, E.active, dir, solde(), payerEtoiles);
  if (!r.ok) return dire('Ce n’est pas possible pour l’instant.');
  sauver();
  toutDessiner();
  // la nouvelle terre sort de l'eau, case après case
  r.cases.forEach(([x, y], i) => {
    animer($(`.case[data-k="${cle(x, y)}"] .fond`, racine), [{ transform: 'scale(.2) translateY(30%)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }],
      { duration: 520, delay: i * 90, easing: COURBE_REBOND, fill: 'backwards' });
  });
  dire('L’île est plus grande !');
}

async function toutRamasserAction() {
  const t = maintenant();
  // l'île affichée d'abord, pour voir les icônes s'envoler
  const I = ile(), envols = [];
  for (const k of Object.keys(I.cases)) {
    const q = stock(I, ...coord(k), t);
    if (q) envols.push([k, BATIMENTS[I.cases[k].type].prod.res, q]);
  }
  const total = toutRamasser(E, t);
  sauver();
  majDynamique();
  dire(`Récolte : ${Object.entries(total).map(([r, q]) => `+${q} ${NOM_RES[r]}`).join(', ')} !`);
  await Promise.all(envols.slice(0, 6).map(([k, res, q], i) => attendre(i * 120).then(() => voler(k, res, q))));
  dessinerEntete();
}

function changerIle(sens) {
  const ouvertes = ilesOuvertes(E);
  const n = Math.max(0, Math.min(ouvertes - 1, E.active + sens));
  if (n === E.active) return;
  E.active = n;
  choix = null;
  sauver();
  toutDessiner();
  dire('');
  animer($('.ile-plan', racine), [{ transform: `translateX(${sens * 40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360 });
}

// ---------- Module ----------

export default {
  id: 'ile',
  nom: 'Mon île',

  monter(conteneur) {
    racine = conteneur;
    charger();
    actualiser(E, maintenant());
    sauver();
    choix = null;
    onglet = 'construire';
    signature = '';
    racine.innerHTML = `
      <div class="ile-body">
        <div class="ile-res" id="ile-res"></div>
        <div class="ile-beaute beaute" id="ile-beaute"></div>
        <div class="ile-nav"></div>
        <div class="ile-mer">
          <span class="navire n1">${tuile(T.bateaux[2], 32)}</span>
          <span class="navire n2">${tuile(T.bateaux[5], 32)}</span>
          <div class="ile-plan"><div class="ile-grille"></div><div class="ile-vie" aria-hidden="true"></div></div>
        </div>
        <button class="btn primary ramasser" id="ile-ramasser" hidden></button>
        <p class="status" id="ile-status" aria-live="polite"></p>
        <button class="btn" id="ile-fin" hidden>Terminer</button>
        <div class="onglets" role="tablist">
          ${Object.entries(ONGLETS).map(([k, v]) => `<button role="tab" data-onglet="${k}">${v}</button>`).join('')}
        </div>
        <div class="boutique" id="ile-boutique"></div>
        <p class="tip">Les habitants récoltent bois, pierre et blé tout seuls, même quand l’appli est fermée : revenez ramasser ! Les étoiles se gagnent en jouant.</p>
      </div>`;
    vie = creerVie($('.ile-vie', racine), () => ({ ile: ile(), ts, origine: { x0: ile().ext.x0, y0: ile().ext.y0 } }));
    toutDessiner();
    dire(Object.keys(ile().cases).length ? '' : 'Bienvenue sur votre île ! Commencez par une cabane de bûcheron près de la forêt, ou un champ de blé.');
    $('.ile-grille', racine).addEventListener('click', (e) => {
      const c = e.target.closest('.case');
      if (c) toucherCase(c.dataset.k, c);
    });
    $('#ile-boutique', racine).addEventListener('click', (e) => {
      const b = e.target.closest('.carte-bat');
      if (b && !b.disabled) choisir(b.dataset.genre, b.dataset.type);
    });
    $('.onglets', racine).addEventListener('click', (e) => {
      const b = e.target.closest('[data-onglet]');
      if (!b) return;
      onglet = b.dataset.onglet;
      choix = null;
      dessinerGrille();
      dessinerBoutique();
      dire('');
    });
    $('.ile-nav', racine).addEventListener('click', (e) => {
      const b = e.target.closest('[data-ile]');
      if (b) changerIle(Number(b.dataset.ile));
    });
    $('#ile-fin', racine).addEventListener('click', () => { choix = null; dessinerGrille(); dessinerBoutique(); dire(''); });
    $('#ile-ramasser', racine).addEventListener('click', toutRamasserAction);
    ticker = setInterval(tic, 1000);
    surRedimension = () => { if (racine) { signature = ''; dessinerGrille(); } };
    window.addEventListener('resize', surRedimension);
  },

  demonter() {
    clearInterval(ticker);
    window.removeEventListener('resize', surRedimension);
    vie?.arreter();
    vie = null;
    racine = null;
  },
};
