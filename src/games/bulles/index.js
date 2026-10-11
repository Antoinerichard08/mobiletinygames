// Bulles : jeu de tir de bonbons. Règles dans moteur.js, niveaux générés (et vérifiés) par generateur.js,
// dessin des bonbons dans rendu.js.
// Visée simple : on pose le doigt où l'on veut envoyer la bulle (la trajectoire s'affiche), on lève le doigt : elle part.
// L'animation ne tourne que lorsque quelque chose bouge.
import { $, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire } from '../../core/stockage.js';
import { demander } from '../../core/dialogue.js';
import { recompenser } from '../../core/partie.js';
import { revenir } from '../../core/navigation.js';
import { creerTravailleur } from '../../core/travail.js';
import { animer, attendre, mouvementReduit, COURBE_REBOND } from '../../core/mouvement.js';
import { solde, depenserEtoiles } from '../../core/etoiles.js';
import { modeDev } from '../../core/config.js';
import {
  LARGEUR, SQ, RANGEES_MAX, DEPART, ANGLE_MIN, ANGLE_MAX, centre, cloner, cases, trajectoire, resoudre, reussi,
  debordement, couleursPresentes, nbPoussins, points, charge, SEUIL_BONUS, reussite, multiplicateur, BONUS_RESTE,
} from './moteur.js';
import { genererNiveau, meilleurCoup, etoilesNiveau, niveauPourDefi } from './generateur.js';
import { PALETTE, dessinerBulle, dessinerPoussin, fabriquerFond, reglerSymboles } from './rendu.js';

chargerStyle(new URL('./bulles.css', import.meta.url));

const usine = creerTravailleur(new URL('./generateur-worker.js', import.meta.url), (d) => (d.genre === 'niveau'
  ? { niveau: genererNiveau(d.n) }
  : { coup: meilleurCoup(d.plateau, d.courante, d.suivante, d.objectif) }));

const HAUTEUR = DEPART.y + 2.6; // hauteur du terrain, en unités
const VITESSE = 0.05; // unités par milliseconde
const TIRS_OFFERTS = 5;
const OBJECTIFS = { vider: 'Videz le plateau', liberer: 'Libérez les poussins' };
const BONUS = {
  bombe: { nom: 'Bombe', prix: 3, aide: 'Elle fait sauter tout ce qui l’entoure.' },
  arc: { nom: 'Arc-en-ciel', prix: 3, aide: 'Elle prend la couleur du plus grand groupe touché.' },
  feu: { nom: 'Boule de feu', prix: 4, aide: 'Elle traverse tout jusqu’en haut.' },
};
const ETOILE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.9 6.2 20.1l1.4-6.4L2.7 9.3l6.5-.7z"/></svg>';

let racine = null;
let options = {};
let S = null; // partie en cours (sauvegardée)
let profil = null; // { niveauMax, etoiles: {n}, scores: {n}, symboles }
let toile = null, ctx = null, echelle = 20, dpr = 1, fond = null;
let enCours = false; // une bulle vole ou des effets se jouent
let visee = null;
let conseil = null;
let effets = [];
let volante = null;
let anim = null, dernier = 0;
let prochain = null;
let dejaFabrique = null; // le dernier niveau fabriqué, pour rejouer sans attendre
let surRedim = null;
let observateur = null; // surveille la hauteur du score et des commandes (styles chargés, message plus long…)

// ---------- Hasard reproductible (pour qu'« Annuler » redonne les mêmes bulles) ----------
function hasard() {
  S.graine = (S.graine + 0x6d2b79f5) >>> 0;
  let t = S.graine;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function nouvelleCouleur() {
  const cs = couleursPresentes(S.plateau);
  return cs.length ? { k: cs[Math.floor(hasard() * cs.length)] } : { k: 0 };
}

// ---------- Sauvegarde ----------
const clePartie = () => (options.defi ? `bulles.defi.${options.defi.id}` : 'bulles.partie');
function charger() {
  profil = { niveauMax: 1, etoiles: {}, scores: {}, symboles: true, ...lire('bulles', {}) };
  profil.scores ||= {};
  reglerSymboles(profil.symboles !== false);
  const p = lire(clePartie(), null);
  S = p && p.plateau && !p.fini && p.paliers ? p : null; // (une partie de l'ancienne version est ignorée)
}
const sauver = () => { ecrire('bulles', profil); if (S) ecrire(clePartie(), S); };
const dire = (t) => { const el = $('#bl-status', racine); if (el) el.innerHTML = t || ''; };
const numeroDuDefi = () => niveauPourDefi(options.defi.niveau, options.defi.numero);

// ---------- Niveaux ----------

function preparer(n) {
  if (dejaFabrique?.n === n) return Promise.resolve(dejaFabrique.niveau);
  if (prochain?.n === n) return prochain.promesse;
  const promesse = usine.calculer({ genre: 'niveau', n }).then((r) => r.niveau);
  prochain = { n, promesse };
  return promesse;
}

async function commencer(n) {
  fermerPanneaux();
  enCours = true;
  effets = [];
  volante = null;
  dire('');
  $('#bl-chargement', racine).hidden = false;
  const niveau = await preparer(n);
  if (prochain?.n === n) prochain = null;
  dejaFabrique = { n, niveau };
  if (!racine) return;
  $('#bl-chargement', racine).hidden = true;
  S = {
    n, plateau: cloner(niveau.plateau), objectif: niveau.objectif, tirs: niveau.tirs, paliers: niveau.paliers,
    utilises: 0, score: 0, jauge: 0, bonus: 0, serie: 0, offerts: false, graine: (n * 2654435761) >>> 0, historique: [],
    indices: 0, annulations: 0, poussinsDepart: nbPoussins(niveau.plateau), reserve: null,
  };
  S.courante = nouvelleCouleur();
  S.suivante = nouvelleCouleur();
  sauver();
  enCours = false;
  dessinerHud();
  dessiner();
  if (!options.defi) preparer(n + 1); // le suivant se prépare pendant qu'on joue
  const premier = n === 1 && !options.defi && !profil.scores[1];
  await panneauDebut(premier);
  dire(premier ? 'Posez le doigt sur le jeu pour viser.' : '');
}

// ---------- Dessin ----------

const px = (u) => u * echelle;

/** La largeur du plateau pour que tout tienne dans l'écran : le score au-dessus, les commandes en dessous. */
function largeurIdeale() {
  const zone = $('.bl-zone', racine);
  const paysage = matchMedia('(orientation: landscape) and (max-height: 560px)').matches;
  const haut = zone.getBoundingClientRect().top + window.scrollY;
  // à la verticale, les bonus et les boutons sont sous le plateau ; à l'horizontale, à côté
  const cote = $('.bl-side', racine);
  const dessous = paysage ? 0 : cote.offsetHeight + 10;
  // et la marge de la page sous le dernier bouton (sinon l'écran défile de quelques pixels)
  let marge = 0;
  for (let n = zone.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    marge += (parseFloat(s.paddingBottom) || 0) + (parseFloat(s.marginBottom) || 0) + (parseFloat(s.borderBottomWidth) || 0);
  }
  const hauteurDispo = window.innerHeight - haut - dessous - marge - 4;
  return Math.min(zone.clientWidth || 340, 560, Math.max(200, (hauteurDispo * LARGEUR) / HAUTEUR));
}
/** Recalcule le plateau si la place a changé (score et commandes dessinés, message plus long…). */
function ajuster() {
  if (!racine || !toile) return;
  if (Math.abs(largeurIdeale() - parseFloat(toile.style.width || 0)) < 2) return;
  dimensionner();
  dessiner();
}

function dimensionner() {
  const largeur = largeurIdeale();
  echelle = largeur / LARGEUR;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  toile.style.width = `${largeur}px`;
  toile.style.height = `${HAUTEUR * echelle}px`;
  $('.bl-zone', racine).style.setProperty('--bl-l', `${largeur}px`);
  toile.width = Math.round(largeur * dpr);
  toile.height = Math.round(HAUTEUR * echelle * dpr);
  fond = fabriquerFond(largeur, HAUTEUR * echelle, dpr);
}

function dessinerLanceur(t) {
  const x = px(DEPART.x), y = px(DEPART.y);
  // socle en sucre d'orge
  ctx.beginPath();
  ctx.ellipse(x, y + px(1.25), px(2.6), px(0.75), 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(x - px(2.6), 0, x + px(2.6), 0);
  g.addColorStop(0, '#FFD84A'); g.addColorStop(0.5, '#FFF2A8'); g.addColorStop(1, '#F2A81D');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#B86E00';
  ctx.lineWidth = 2;
  ctx.stroke();
  // flèche de visée
  const angle = visee?.angle ?? Math.PI / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle + Math.PI / 2);
  ctx.fillStyle = '#FFF';
  ctx.strokeStyle = '#B86E00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-px(0.6), -px(1.15)); ctx.lineTo(0, -px(2.4)); ctx.lineTo(px(0.6), -px(1.15));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (S && !volante) {
    if (S.courante.tir) {
      ctx.beginPath();
      ctx.arc(x, y, px(1.45 + 0.15 * Math.sin(t / 200)), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 230, 90, .45)';
      ctx.fill();
    }
    dessinerBulle(ctx, x, y, px(1), S.courante, t, dpr);
  }
  if (S) {
    // bulle suivante, à gauche, et la petite flèche d'échange
    const sx = px(DEPART.x - 5), sy = px(DEPART.y + 0.6);
    ctx.beginPath();
    ctx.arc(sx, sy, px(0.95), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, .25)';
    ctx.fill();
    dessinerBulle(ctx, sx, sy, px(0.75), S.suivante, t, dpr);
    ctx.strokeStyle = 'rgba(255, 255, 255, .85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx + px(2.3), sy - px(0.2), px(0.8), Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
}

function dessinerGuide(angle, t, couleur = 'rgba(255,255,255,.95)') {
  const feu = S.courante.tir === 'feu' && !conseil;
  const { points: pts, cible } = trajectoire(S.plateau, angle, feu);
  let reste = 0;
  ctx.fillStyle = feu ? 'rgba(255, 160, 40, .95)' : couleur;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const long = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = reste; d < long; d += 1.1) {
      const f = d / long;
      ctx.beginPath();
      ctx.arc(px(a.x + (b.x - a.x) * f), px(a.y + (b.y - a.y) * f), px(0.2), 0, Math.PI * 2);
      ctx.fill();
    }
    reste = (reste + 1.1 - (long % 1.1)) % 1.1;
  }
  if (cible) {
    const c = centre(cible.r, cible.c);
    ctx.beginPath();
    ctx.arc(px(c.x), px(c.y), px(0.95), 0, Math.PI * 2);
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 3;
    ctx.setLineDash([px(0.35), px(0.25)]);
    ctx.lineDashOffset = -t / 40;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function dessiner(t = performance.now()) {
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fond) ctx.drawImage(fond, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!S) return;
  // ligne à ne pas dépasser
  const yLimite = px(1 + (RANGEES_MAX - 1) * SQ - 1);
  ctx.setLineDash([px(0.5), px(0.5)]);
  ctx.strokeStyle = 'rgba(255, 255, 255, .35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, yLimite);
  ctx.lineTo(px(LARGEUR), yLimite);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [r, c, b] of cases(S.plateau)) {
    const q = centre(r, c);
    dessinerBulle(ctx, px(q.x), px(q.y), px(1), b, t, dpr);
  }
  if (conseil && t < conseil.jusqua) dessinerGuide(conseil.angle, t, 'rgba(255, 220, 60, .95)');
  if (visee && !volante) dessinerGuide(visee.angle, t);
  if (volante) dessinerBulle(ctx, px(volante.x), px(volante.y), px(1), volante.b, t, dpr);
  dessinerLanceur(t);
  for (const e of effets) e.dessiner(t);
}

// ---------- Boucle d'animation (seulement quand ça bouge) ----------

function demarrer() {
  if (anim) return;
  dernier = performance.now();
  const boucle = (t) => {
    const dt = Math.min(50, t - dernier);
    dernier = t;
    if (volante) avancer(dt);
    effets = effets.filter((e) => e.avancer(dt, t));
    dessiner(t);
    const besoin = volante || effets.length || visee || (conseil && t < conseil.jusqua) || S?.courante.tir
      || (S && [...cases(S.plateau)].some(([, , b]) => b.type === 'etoile' || b.type === 'bombe'));
    anim = besoin && racine ? requestAnimationFrame(boucle) : null;
  };
  anim = requestAnimationFrame(boucle);
}

// ---------- Effets ----------

function particules(x, y, couleur, nb = 9, force = 1) {
  if (mouvementReduit()) return;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + Math.random() * 0.5, v = (0.006 + Math.random() * 0.009) * force;
    let px0 = x, py0 = y, vx = Math.cos(a) * v, vy = Math.sin(a) * v, vie = 500 + Math.random() * 300;
    const total = vie, taille = 0.18 + Math.random() * 0.25, etoile = i % 3 === 0;
    effets.push({
      avancer(dt) { px0 += vx * dt; py0 += vy * dt; vy += 0.00002 * dt; vie -= dt; return vie > 0; },
      dessiner() {
        ctx.globalAlpha = Math.max(0, vie / total);
        ctx.fillStyle = etoile ? '#FFF6B0' : couleur;
        ctx.beginPath();
        if (etoile) {
          const s = px(taille * 1.4);
          ctx.moveTo(px(px0), px(py0) - s); ctx.lineTo(px(px0) + s * 0.3, px(py0)); ctx.lineTo(px(px0), px(py0) + s); ctx.lineTo(px(px0) - s * 0.3, px(py0));
        } else ctx.arc(px(px0), px(py0), px(taille), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      },
    });
  }
}

function eclater(x, y, b, delai) {
  let t0 = -delai;
  const duree = 220;
  effets.push({
    avancer(dt) {
      const avant = t0;
      t0 += dt;
      if (avant < 0 && t0 >= 0) particules(x, y, PALETTE[b.k]?.base || '#C9C5D9');
      return t0 < duree;
    },
    dessiner(t) {
      if (t0 < 0) { dessinerBulle(ctx, px(x), px(y), px(1), b, t, dpr); return; }
      const f = t0 / duree;
      ctx.globalAlpha = 1 - f;
      dessinerBulle(ctx, px(x), px(y), px(1 + f * 0.55), b, t, dpr);
      ctx.globalAlpha = 1;
    },
  });
}

function tomber(x, y, b, delai) {
  let t0 = -delai, vy = -0.004 - Math.random() * 0.006, vx = (Math.random() - 0.5) * 0.008, yy = y, xx = x;
  effets.push({
    avancer(dt) {
      t0 += dt;
      if (t0 < 0) return true;
      vy += 0.00006 * dt; xx += vx * dt; yy += vy * dt;
      if (yy > HAUTEUR + 2) { particules(xx, HAUTEUR - 0.5, PALETTE[b.k]?.base || '#C9C5D9', 4); return false; }
      return true;
    },
    dessiner(t) { dessinerBulle(ctx, px(xx), px(yy), px(1), b, t, dpr); },
  });
}

function texteVolant(x, y, texte, couleur = '#ffffff', taille = 1.3) {
  let t0 = 0;
  effets.push({
    avancer(dt) { t0 += dt; return t0 < 1100; },
    dessiner() {
      const f = t0 / 1100, echelleTexte = f < 0.15 ? 0.6 + (f / 0.15) * 0.5 : 1.1 - Math.min(0.1, f * 0.1);
      ctx.globalAlpha = 1 - f * f;
      ctx.font = `700 ${px(taille * echelleTexte)}px "Atkinson Hyperlegible", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#4A1E7A';
      ctx.strokeText(texte, px(x), px(y - f * 2.5));
      ctx.fillStyle = couleur;
      ctx.fillText(texte, px(x), px(y - f * 2.5));
      ctx.globalAlpha = 1;
    },
  });
}

function onde(x, y, couleur = '255, 190, 60') {
  let t0 = 0;
  effets.push({
    avancer(dt) { t0 += dt; return t0 < 450; },
    dessiner() {
      const f = t0 / 450;
      ctx.beginPath();
      ctx.arc(px(x), px(y), px(1 + f * 4), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${couleur}, ${1 - f})`;
      ctx.lineWidth = px(0.5) * (1 - f);
      ctx.stroke();
    },
  });
  secouer();
}

function eclair(rangee) {
  let t0 = 0;
  const y = 1 + rangee * SQ;
  effets.push({
    avancer(dt) { t0 += dt; return t0 < 500; },
    dessiner() {
      const f = t0 / 500;
      ctx.globalAlpha = 1 - f;
      ctx.strokeStyle = '#FFF27A';
      ctx.lineWidth = px(0.35);
      ctx.beginPath();
      for (let x = 0; x <= LARGEUR; x += 1) ctx.lineTo(px(x), px(y + (Math.random() - 0.5) * 0.9));
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  });
  secouer();
}

function secouer() {
  if (mouvementReduit()) return;
  animer(toile, [{ transform: 'translate(0,0)' }, { transform: 'translate(-4px, 2px)' }, { transform: 'translate(4px, -2px)' }, { transform: 'translate(0,0)' }], { duration: 260 });
}

function poussinLibere(x, y, delai) {
  let t0 = -delai, yy = y;
  effets.push({
    avancer(dt) { t0 += dt; if (t0 > 0) yy -= dt * 0.012; return yy > -3; },
    dessiner(t) { if (t0 >= 0) dessinerPoussin(ctx, px(x + Math.sin(t0 / 150) * 0.6), px(yy), px(1.1), Math.sin(t / 60) * 0.5); },
  });
}

function confettis() {
  if (mouvementReduit()) return;
  for (let i = 0; i < 70; i++) {
    let x = Math.random() * LARGEUR, y = -Math.random() * 6, rot = Math.random() * 6;
    const vy = 0.006 + Math.random() * 0.01, couleur = PALETTE[i % PALETTE.length].base, vr = (Math.random() - 0.5) * 0.02;
    effets.push({
      avancer(dt) { y += vy * dt; x += Math.sin(y) * 0.02; rot += vr * dt; return y < HAUTEUR + 1; },
      dessiner() {
        ctx.save();
        ctx.translate(px(x), px(y));
        ctx.rotate(rot);
        ctx.fillStyle = couleur;
        ctx.fillRect(-px(0.3), -px(0.15), px(0.6), px(0.3));
        ctx.restore();
      },
    });
  }
}

/** Une bulle restante s'envole du lanceur et éclate en rapportant le bonus de fin. */
function bulleBonus(delai) {
  let t0 = -delai, y = DEPART.y;
  const x = DEPART.x + (Math.random() - 0.5) * 6, b = { k: Math.floor(Math.random() * 6), type: 'bulle' };
  return new Promise((fini) => {
    effets.push({
      avancer(dt) {
        t0 += dt;
        if (t0 < 0) return true;
        y -= dt * 0.03;
        if (y < 8 + Math.random()) {
          particules(x, y, PALETTE[b.k].base, 8, 1.2);
          texteVolant(x, y, `+${BONUS_RESTE}`, '#FFE14D', 1.1);
          fini();
          return false;
        }
        return true;
      },
      dessiner(t) { if (t0 >= 0) dessinerBulle(ctx, px(x), px(y), px(0.85), b, t, dpr); },
    });
  });
}

// ---------- Tir ----------

function angleVers(ev) {
  const r = toile.getBoundingClientRect();
  const x = (ev.clientX - r.left) / echelle, y = (ev.clientY - r.top) / echelle;
  if (y > DEPART.y - 0.8) return null; // trop bas : pas de tir
  return Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, Math.atan2(DEPART.y - y, x - DEPART.x)));
}
function surSuivante(ev) {
  const r = toile.getBoundingClientRect();
  const x = (ev.clientX - r.left) / echelle, y = (ev.clientY - r.top) / echelle;
  return Math.hypot(x - (DEPART.x - 5), y - (DEPART.y + 0.6)) < 1.8 || Math.hypot(x - DEPART.x, y - DEPART.y) < 1.4;
}

function tirer(angle) {
  if (enCours || !S) return;
  const feu = S.courante.tir === 'feu';
  const { points: pts, cible, touchees } = trajectoire(S.plateau, angle, feu);
  if (!cible && !feu) return;
  S.historique.push(JSON.stringify({ ...S, historique: undefined }));
  if (S.historique.length > 8) S.historique.shift();
  enCours = true;
  conseil = null;
  visee = null;
  volante = { points: pts, i: 1, x: pts[0].x, y: pts[0].y, b: S.courante, cible, touchees };
  dire('');
  demarrer();
}

function avancer(dt) {
  let reste = dt * VITESSE * (volante.b.tir === 'feu' ? 1.2 : 1);
  while (reste > 0 && volante) {
    const but = volante.points[volante.i];
    const d = Math.hypot(but.x - volante.x, but.y - volante.y);
    if (d <= reste) {
      volante.x = but.x; volante.y = but.y; reste -= d; volante.i++;
      if (volante.i >= volante.points.length) { atterrir(); return; }
    } else {
      volante.x += ((but.x - volante.x) / d) * reste;
      volante.y += ((but.y - volante.y) / d) * reste;
      reste = 0;
    }
    if (volante?.b.tir === 'feu') particules(volante.x, volante.y + 0.6, '#FF8A1F', 1, 0.4);
  }
}

async function atterrir() {
  const { cible, b, touchees } = volante;
  volante = null;
  const ev = resoudre(S.plateau, cible, b, touchees);
  const estBonus = Boolean(b.tir) && S.bonusEnCours;
  if (!estBonus) S.utilises++;
  S.bonusEnCours = false;
  S.achete = false;
  const c0 = cible ? centre(cible.r, cible.c) : { x: LARGEUR / 2, y: 3 };
  ev.eclatees.forEach(({ r, c, b: v }) => {
    const q = centre(r, c);
    eclater(q.x, q.y, v, Math.hypot(q.x - c0.x, q.y - c0.y) * 22);
    if (v.poussin) poussinLibere(q.x, q.y, 200);
  });
  ev.tombees.forEach(({ r, c, b: v }, i) => {
    const q = centre(r, c);
    tomber(q.x, q.y, v, 120 + i * 18);
    if (v.poussin) poussinLibere(q.x, q.y, 300);
  });
  ev.explosions.forEach(({ r, c }) => { const q = centre(r, c); onde(q.x, q.y); });
  ev.etoiles.forEach(({ r, c }) => { const q = centre(r, c); onde(q.x, q.y, '255, 255, 255'); texteVolant(q.x, q.y, 'Toute la couleur !', '#FFF6B0', 1.2); });
  ev.eclairs.forEach(({ r }) => eclair(r));
  ev.glaces.forEach(({ r, c }) => { const q = centre(r, c); particules(q.x, q.y, '#D6F3FF', 6); });
  ev.reveles.forEach(({ r, c }) => { const q = centre(r, c); particules(q.x, q.y, '#FFFFFF', 6); });
  // série : chaque tir réussi d'affilée rapporte un peu plus
  S.serie = reussite(ev) ? (S.serie || 0) + 1 : 0;
  const gain = points(ev, S.serie);
  S.score += gain;
  if (gain) texteVolant(c0.x, c0.y, `+${gain}`, ev.tombees.length >= 5 ? '#FFE14D' : '#ffffff', ev.tombees.length >= 5 ? 1.7 : 1.3);
  if (multiplicateur(S.serie) > 1) texteVolant(LARGEUR / 2, 13.5, `Série × ${multiplicateur(S.serie).toLocaleString('fr-FR')}`, '#9BFFB0', 1.4);
  if (ev.tombees.length >= 5) texteVolant(LARGEUR / 2, 10, 'Délicieux !', '#FFE14D', 2);
  else if (ev.eclatees.length >= 6) texteVolant(LARGEUR / 2, 10, 'Bravo !', '#ffffff', 1.8);
  if (ev.poussins) texteVolant(c0.x, c0.y - 2, ev.poussins > 1 ? `${ev.poussins} poussins libérés !` : 'Un poussin libéré !', '#FFE37A', 1.3);
  if (ev.tirsBonus) { S.tirs += ev.tirsBonus; texteVolant(DEPART.x + 4, DEPART.y - 2, `+${ev.tirsBonus} bulles !`, '#9BFFB0', 1.3); }
  // jauge : une bulle spéciale offerte quand elle est pleine
  S.jauge += charge(ev);
  let bonusPret = false;
  if (S.jauge >= SEUIL_BONUS) { S.jauge = 0; bonusPret = true; }
  if (S.reserve) { S.courante = S.reserve; S.reserve = null; }
  else { S.courante = S.suivante; S.suivante = nouvelleCouleur(); }
  if (bonusPret) {
    S.reserve = S.courante;
    S.courante = { tir: S.bonus++ % 2 ? 'arc' : 'bombe' };
    S.bonusEnCours = true;
    texteVolant(DEPART.x, DEPART.y - 3, S.courante.tir === 'bombe' ? 'Une bombe offerte !' : 'Un arc-en-ciel offert !', '#FFE14D', 1.3);
  }
  // une couleur qui n'existe plus sur le plateau est remplacée
  if (S.courante.k !== undefined && !couleursPresentes(S.plateau).includes(S.courante.k)) S.courante = nouvelleCouleur();
  if (S.suivante.k !== undefined && !couleursPresentes(S.plateau).includes(S.suivante.k)) S.suivante = nouvelleCouleur();
  if (S.reserve?.k !== undefined && !couleursPresentes(S.plateau).includes(S.reserve.k)) S.reserve = nouvelleCouleur();
  sauver();
  dessinerHud();
  demarrer();
  enCours = false;
  if (reussi(S.plateau, S.objectif)) return victoire();
  if (debordement(S.plateau)) return defaite('Les bonbons sont descendus trop bas.');
  if (S.utilises >= S.tirs) return plusDeTirs();
  if (!reussite(ev) && S.tirs - S.utilises <= 3) dire(`Attention : plus que ${pluriel(S.tirs - S.utilises, 'bulle')} !`);
}

async function victoire() {
  enCours = true;
  // les bonbons restants (pierres…) tombent, puis chaque bulle non utilisée rapporte un bonus
  for (const [r, c, b] of [...cases(S.plateau)]) { const q = centre(r, c); tomber(q.x, q.y, b, Math.random() * 300); S.plateau[r][c] = null; }
  demarrer();
  const restantes = Math.max(0, S.tirs - S.utilises);
  if (restantes) {
    texteVolant(LARGEUR / 2, 11, 'Bonus de fin !', '#FFE14D', 1.8);
    const montrees = Math.min(restantes, 12);
    const vols = [];
    for (let i = 0; i < montrees; i++) {
      vols.push(bulleBonus(300 + i * (mouvementReduit() ? 0 : 160)).then(() => {
        S.score += BONUS_RESTE * (i === montrees - 1 ? restantes - montrees + 1 : 1);
        dessinerHud();
      }));
    }
    demarrer();
    await Promise.all(vols);
  }
  confettis();
  demarrer();
  const etoiles = etoilesNiveau(S, S.score, S.offerts);
  const ancienMeilleur = profil.scores[S.n] || 0;
  if (!options.defi) {
    profil.etoiles[S.n] = Math.max(profil.etoiles[S.n] || 0, etoiles);
    profil.scores[S.n] = Math.max(ancienMeilleur, S.score);
    profil.niveauMax = Math.max(profil.niveauMax, S.n + 1);
  }
  const fin = { ...S, fini: true };
  S = fin;
  sauver();
  ecrire(clePartie(), null);
  const recompense = recompenser({
    jeu: 'bulles',
    gagne: true,
    // en partie libre, les étoiles gagnées suivent la réussite du niveau (1 à 3)
    difficulte: ['facile', 'moyen', 'difficile'][etoiles - 1],
    defi: options.defi,
    details: { indices: fin.indices, annulations: fin.annulations, tirsRestants: restantes, score: fin.score, etoiles },
  });
  await attendre(900);
  panneauFin({ gagne: true, etoiles: recompense.niveau ? recompense.niveau.etoilesNiveau : etoiles, score: fin.score, meilleur: Math.max(ancienMeilleur, fin.score), nouveauRecord: fin.score > ancienMeilleur && ancienMeilleur > 0, recompense });
}

async function plusDeTirs() {
  if (!S.offerts) {
    const encore = await demander({
      titre: 'Plus de bulles !',
      texte: `Il reste encore ${S.objectif === 'liberer' ? 'des poussins à libérer' : 'des bonbons'}. Voulez-vous ${TIRS_OFFERTS} bulles de plus ? (C’est offert, une fois par niveau.)`,
      oui: `Oui, ${TIRS_OFFERTS} bulles de plus`,
      non: 'Non, j’arrête',
    });
    if (encore) {
      S.offerts = true;
      S.tirs += TIRS_OFFERTS;
      sauver();
      dessinerHud();
      return;
    }
  }
  defaite('Toutes les bulles ont été tirées.');
}

function defaite(raison) {
  enCours = true;
  ecrire(clePartie(), null);
  const fin = { ...S, fini: true };
  S = fin;
  const recompense = recompenser({ jeu: 'bulles', gagne: false, difficulte: 'facile', defi: options.defi, details: { indices: fin.indices, annulations: fin.annulations, tirsRestants: 0 } });
  panneauFin({ gagne: false, etoiles: 0, score: fin.score, meilleur: profil.scores[fin.n] || 0, raison, recompense });
}

// ---------- Panneaux « bonbon » : début, fin, pause ----------

function fermerPanneaux() {
  document.querySelectorAll('.bl-panneau').forEach((p) => p.remove());
}

function panneau(html, classe = '') {
  fermerPanneaux();
  const el = document.createElement('div');
  el.className = `sheet temp bl-panneau ${classe}`;
  el.innerHTML = `<div class="bl-rayons" aria-hidden="true"></div><div class="bl-boite" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(el);
  animer(el.querySelector('.bl-boite'), [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.05)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 450, easing: COURBE_REBOND });
  return el;
}

function choixPanneau(el) {
  return new Promise((ok) => el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-r]');
    if (!b) return;
    el.remove();
    ok(b.dataset.r);
  }));
}

async function panneauDebut(premier) {
  const titre = options.defi ? `Aventure · niveau ${options.defi.numero}` : `Niveau ${S.n}`;
  const objectif = `${OBJECTIFS[S.objectif]}${S.objectif === 'liberer' ? ` (${pluriel(S.poussinsDepart, 'poussin')})` : ''}`;
  const speciales = new Set([...cases(S.plateau)].map(([, , b]) => (b.type !== 'bulle' ? b.type : b.k2 !== undefined ? 'bicolore' : b.mystere ? 'mystere' : b.glace ? 'glace' : b.plus ? 'plus' : '')).filter(Boolean));
  const AIDE = {
    etoile: 'Étoile : touchez-la et toute la couleur disparaît.', eclair: 'Éclair : quand il saute, sa rangée entière disparaît.',
    bombe: 'Bombe : elle explose quand ses voisines éclatent.', pierre: 'Pierre : elle n’éclate pas, faites-la tomber.',
    glace: 'Glace : faites éclater une voisine pour la libérer.', mystere: 'Mystère : sa couleur apparaît quand une voisine éclate.',
    bicolore: 'Bicolore : elle compte pour ses deux couleurs.', plus: '« +3 » : trois bulles de plus quand elle éclate.',
  };
  const el = panneau(`
    <h3 class="bl-titre-panneau">${titre}</h3>
    <p class="bl-objectif-panneau">${objectif}</p>
    <p class="bl-bulles-panneau"><b>${S.tirs}</b> bulles</p>
    ${[...speciales].filter((k) => AIDE[k]).map((k) => `<p class="bl-aide">${AIDE[k]}</p>`).join('')}
    ${premier ? '<p class="bl-aide">Posez le doigt là où vous voulez envoyer la bulle : la ligne montre son chemin. Levez le doigt pour tirer. Trois bonbons de la même couleur éclatent !</p>' : ''}
    <div class="bl-boutons"><button class="bl-rond grand" data-r="go"><span class="ic">▶</span><span>C’est parti !</span></button></div>`);
  await choixPanneau(el);
}

function panneauFin({ gagne, etoiles, score, meilleur, nouveauRecord, raison, recompense }) {
  const etoilesHtml = [0, 1, 2].map((i) => `<span class="bl-grande-etoile ${i < etoiles ? 'on' : ''} e${i}">${ETOILE_SVG}</span>`).join('');
  const gainEtoiles = recompense?.etoiles || 0;
  const bonus = recompense?.bonus || [];
  const titre = !gagne ? 'Presque !' : etoiles === 3 ? 'Parfait !' : etoiles === 2 ? 'Bravo !' : 'Gagné !';
  const boutons = options.defi
    ? `<button class="bl-rond" data-r="rejouer"><span class="ic">↻</span><span>Rejouer</span></button>
       <button class="bl-rond grand" data-r="carte"><span class="ic">▶</span><span>Retour à la carte</span></button>`
    : gagne
      ? `<button class="bl-rond" data-r="rejouer"><span class="ic">↻</span><span>Rejouer pour faire mieux</span></button>
         <button class="bl-rond grand" data-r="suivant"><span class="ic">▶</span><span>Niveau suivant</span></button>
         <button class="bl-rond" data-r="niveaux"><span class="ic">☰</span><span>Niveaux</span></button>`
      : `<button class="bl-rond grand" data-r="rejouer"><span class="ic">↻</span><span>Réessayer</span></button>
         <button class="bl-rond" data-r="niveaux"><span class="ic">☰</span><span>Niveaux</span></button>`;
  const el = panneau(`
    <div class="bl-etoiles-panneau">${etoilesHtml}</div>
    <h3 class="bl-titre-panneau">${titre}</h3>
    ${raison ? `<p class="bl-objectif-panneau">${raison}</p>` : ''}
    <p class="bl-label">Votre score</p>
    <p class="bl-score-panneau" id="bl-compteur">0</p>
    <p class="bl-detail">${nouveauRecord ? '<b>Nouveau record !</b> · ' : meilleur ? `Meilleur score : ${meilleur} · ` : ''}${gainEtoiles ? `+${gainEtoiles} ★ gagnée${gainEtoiles > 1 ? 's' : ''}` : ''}</p>
    ${bonus.length ? `<ul class="bl-bonus">${bonus.map((b) => `<li>${b.texte}${b.etoiles ? ` : +${b.etoiles} ★` : ''}</li>`).join('')}</ul>` : ''}
    <div class="bl-boutons">${boutons}</div>`, gagne ? 'gagne' : 'perdu');
  // le score défile, les étoiles apparaissent une à une
  const compteur = el.querySelector('#bl-compteur');
  if (mouvementReduit()) compteur.textContent = score;
  else {
    const debut = performance.now();
    const duree = Math.min(1600, 400 + score / 4);
    const tic = (t) => {
      const f = Math.min(1, (t - debut) / duree);
      compteur.textContent = Math.round(score * (1 - (1 - f) ** 3));
      if (f < 1 && document.contains(compteur)) requestAnimationFrame(tic);
    };
    requestAnimationFrame(tic);
    el.querySelectorAll('.bl-grande-etoile.on').forEach((s, i) => {
      animer(s, [{ transform: 'scale(0) rotate(-90deg)', opacity: 0 }, { transform: 'scale(1.35) rotate(10deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1) rotate(0)', opacity: 1 }],
        { duration: 520, delay: 350 + i * 300, easing: COURBE_REBOND, fill: 'backwards' });
    });
  }
  choixPanneau(el).then((r) => {
    const n = S.n;
    if (r === 'rejouer') commencer(options.defi ? numeroDuDefi() : n);
    else if (r === 'suivant') commencer(n + 1);
    else if (r === 'carte') revenir('niveaux');
    else if (r === 'niveaux') choisirNiveau(true);
  });
}

async function pause() {
  if (enCours || !S) return;
  const el = panneau(`
    <h3 class="bl-titre-panneau">Pause</h3>
    <div class="bl-menu">
      <button class="bl-ligne-menu primaire" data-r="reprendre">Reprendre</button>
      <button class="bl-ligne-menu" data-r="recommencer">Recommencer le niveau</button>
      ${options.defi ? '' : '<button class="bl-ligne-menu" data-r="niveaux">Choisir un niveau</button>'}
      <button class="bl-ligne-menu" data-r="symboles">Symboles sur les bonbons : ${profil.symboles !== false ? 'oui' : 'non'}</button>
      <button class="bl-ligne-menu" data-r="quitter">Quitter le jeu</button>
    </div>`, 'pause');
  const r = await choixPanneau(el);
  if (r === 'recommencer') {
    if (await demander({ titre: 'Recommencer ?', texte: 'Le niveau repart de zéro.', oui: 'Oui, recommencer', non: 'Non' })) commencer(S.n);
  } else if (r === 'niveaux') choisirNiveau();
  else if (r === 'symboles') {
    profil.symboles = profil.symboles === false;
    reglerSymboles(profil.symboles);
    sauver();
    dessiner();
  } else if (r === 'quitter') revenir(options.defi ? 'niveaux' : '');
}

// ---------- Commandes ----------

function echanger() {
  if (enCours || !S) return;
  if (S.courante.tir) return dire('Tirez d’abord votre bulle spéciale.');
  [S.courante, S.suivante] = [S.suivante, S.courante];
  sauver();
  dessiner();
}

function annuler() {
  if (enCours || !S || !S.historique.length) return dire('Rien à annuler pour l’instant.');
  if (S.achete) return dire('Tirez d’abord votre bulle spéciale : elle est déjà payée.');
  const historique = S.historique.slice(0, -1);
  const avant = JSON.parse(S.historique[S.historique.length - 1]);
  S = { ...avant, historique, annulations: (S.annulations || 0) + 1, indices: S.indices };
  effets = [];
  sauver();
  dessinerHud();
  dessiner();
  dire('Dernier tir annulé.');
}

async function indice() {
  if (enCours || !S) return;
  if (S.courante.tir === 'feu') return dire('La boule de feu traverse tout : visez là où il y a le plus de bonbons.');
  dire('Je cherche un bon tir…');
  const { coup } = await usine.calculer({ genre: 'conseil', plateau: S.plateau, courante: S.courante, suivante: S.suivante, objectif: S.objectif });
  if (!racine || !S || !coup) return;
  S.indices++;
  sauver();
  if (coup.echange) {
    echanger();
    dire('Conseil : j’ai échangé les bulles. Visez le long de la ligne dorée.');
  } else dire('Conseil : visez le long de la ligne dorée.');
  conseil = { angle: coup.angle, jusqua: performance.now() + 5000 };
  demarrer();
}

async function utiliserBonus(type) {
  if (enCours || !S) return;
  if (S.courante.tir) return dire('Une bulle spéciale est déjà prête : tirez-la d’abord.');
  const def = BONUS[type];
  if (!modeDev() && !(await demander({ titre: def.nom, texte: `${def.aide} Elle coûte ${pluriel(def.prix, 'étoile')} (vous en avez ${solde()}).`, oui: `Oui, ${def.prix} ★`, non: 'Non merci' }))) return;
  if (!depenserEtoiles(def.prix)) return dire(`Il faut ${pluriel(def.prix, 'étoile')} pour cette aide. Jouez pour en gagner !`);
  S.reserve = S.courante;
  S.courante = { tir: type };
  S.bonusEnCours = true;
  S.achete = true; // payée : « Annuler » ne doit pas la faire disparaître
  sauver();
  dessinerHud();
  dire(`${def.nom} prête ! ${def.aide}`);
  demarrer();
}

async function choisirNiveau(direct = false) {
  if (enCours && !direct) return;
  const max = modeDev() ? Math.max(profil.niveauMax, 99) : profil.niveauMax;
  const liste = Array.from({ length: max }, (_, i) => i + 1);
  const el = panneau(`
    <h3 class="bl-titre-panneau">Choisir un niveau</h3>
    <div class="bl-niveaux">
      ${liste.map((n) => `<button class="bl-niv ${n === profil.niveauMax ? 'courant' : ''}" data-r="${n}"><b>${n}</b><small>${'★'.repeat(profil.etoiles[n] || 0)}<span>${'★'.repeat(3 - (profil.etoiles[n] || 0))}</span></small></button>`).join('')}
    </div>
    <div class="bl-boutons"><button class="bl-rond" data-r="fermer"><span class="ic">✕</span><span>Fermer</span></button></div>`, 'niveaux');
  el.querySelector('.bl-niv.courant')?.scrollIntoView({ block: 'center' });
  const r = await choixPanneau(el);
  if (r === 'fermer') { if (!S || S.fini) commencer(profil.niveauMax); return; }
  commencer(Number(r));
}

function dessinerHud() {
  if (!racine) return;
  const hud = $('#bl-hud', racine);
  if (!S) { hud.innerHTML = ''; return; }
  const restantes = Math.max(0, S.tirs - S.utilises);
  const max = Math.max(S.paliers[2] * 1.15, S.score, 1);
  const pos = (v) => `${Math.min(100, (v / max) * 100)}%`;
  const etoiles = etoilesNiveau(S, S.score, S.offerts);
  const objectif = S.objectif === 'liberer'
    ? `Poussins : <b>${S.poussinsDepart - nbPoussins(S.plateau)} / ${S.poussinsDepart}</b>`
    : OBJECTIFS.vider;
  hud.innerHTML = `
    <div class="bl-barre">
      <span class="bl-pastille">${options.defi ? 'Aventure' : `Niveau ${S.n}`}</span>
      <span class="bl-progres" aria-label="Score ${S.score}, ${etoiles} étoile${etoiles > 1 ? 's' : ''}">
        <i style="width:${pos(S.score)}"></i>
        ${[S.paliers[1] * 0.5, S.paliers[1], S.paliers[2]].map((v, k) => `<span class="bl-repere ${S.score >= v && (k > 0 || S.score > 0) ? 'on' : ''}" style="left:${pos(v)}">${ETOILE_SVG}</span>`).join('')}
      </span>
      <button class="bl-pause" id="bl-pause" aria-label="Pause">II</button>
    </div>
    <div class="bl-infos">
      <p class="bl-objectif">${objectif}</p>
      <p class="bl-score"><b>${S.score}</b> pts${multiplicateur(S.serie || 0) > 1 ? ` <span class="bl-serie">× ${multiplicateur(S.serie).toLocaleString('fr-FR')}</span>` : ''}</p>
      <p class="bl-tirs ${restantes <= 3 ? 'peu' : ''}" aria-label="${restantes} bulles restantes"><b>${restantes}</b><span>bulles</span></p>
    </div>
    <span class="bl-jauge" aria-label="Bonus offert bientôt"><i style="width:${Math.min(100, (S.jauge / SEUIL_BONUS) * 100)}%"></i></span>`;
  $('#bl-pause', racine).addEventListener('click', pause);
  $('#bl-annuler', racine).disabled = !S.historique?.length;
  const prixTexte = (p) => (modeDev() ? '∞' : `${p} ★`);
  $('#bl-bonus', racine).innerHTML = Object.entries(BONUS).map(([k, b]) => `
    <button class="bl-booster" data-bonus="${k}" aria-label="${b.nom}, ${prixTexte(b.prix)}">
      <canvas width="64" height="64" data-dessin="${k}"></canvas><span>${b.nom}</span><small>${prixTexte(b.prix)}</small>
    </button>`).join('');
  $('#bl-bonus', racine).querySelectorAll('canvas').forEach((c) => {
    const k = c.dataset.dessin, g = c.getContext('2d');
    dessinerBulle(g, 32, 32, 26, { tir: k }, 0);
  });
}

function construire() {
  racine.innerHTML = `
    <div class="bl-body">
      <div class="bl-hud" id="bl-hud"></div>
      <div class="bl-zone">
        <canvas class="bl-toile" aria-label="Plateau de bonbons. Posez le doigt pour viser, levez-le pour tirer."></canvas>
        <p class="bl-chargement" id="bl-chargement" hidden>Je prépare les bonbons…</p>
        <p class="status" id="bl-status" aria-live="polite"></p>
      </div>
      <div class="bl-side">
        <div class="bl-boosters" id="bl-bonus"></div>
        <div class="tools">
          <button class="btn" id="bl-annuler">Annuler</button>
          <button class="btn" id="bl-indice">Indice</button>
          <button class="btn" id="bl-echanger">Échanger</button>
        </div>
        <p class="tip">Posez le doigt là où vous voulez envoyer la bulle, levez-le pour tirer. Touchez la petite bulle en bas à gauche pour l’échanger.</p>
      </div>
    </div>`;
  toile = $('.bl-toile', racine);
  ctx = toile.getContext('2d');
  dimensionner();
  toile.addEventListener('pointerdown', (e) => {
    if (enCours || !S) return;
    if (surSuivante(e)) { echanger(); return; }
    toile.setPointerCapture(e.pointerId);
    const a = angleVers(e);
    visee = a === null ? null : { angle: a };
    demarrer();
  });
  toile.addEventListener('pointermove', (e) => {
    if (!toile.hasPointerCapture(e.pointerId)) return;
    const a = angleVers(e);
    visee = a === null ? null : { angle: a };
  });
  toile.addEventListener('pointerup', (e) => {
    if (!toile.hasPointerCapture(e.pointerId)) return;
    const a = angleVers(e);
    visee = null;
    if (a !== null) tirer(a);
    else dessiner();
  });
  toile.addEventListener('pointercancel', () => { visee = null; dessiner(); });
  $('#bl-annuler', racine).addEventListener('click', annuler);
  $('#bl-indice', racine).addEventListener('click', indice);
  $('#bl-echanger', racine).addEventListener('click', echanger);
  $('#bl-bonus', racine).addEventListener('click', (e) => {
    const b = e.target.closest('[data-bonus]');
    if (b) utiliserBonus(b.dataset.bonus);
  });
  surRedim = () => { if (racine) { dimensionner(); dessiner(); } };
  observateur = new ResizeObserver(() => ajuster());
  observateur.observe($('#bl-hud', racine));
  observateur.observe($('.bl-side', racine));
  window.addEventListener('resize', surRedim);
}

// ---------- Module ----------

export default {
  id: 'bulles',
  nom: 'Bulles',
  description: 'Faites éclater les bonbons, niveau après niveau',
  paysage: true,
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="blfond" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A2BA8"/><stop offset="1" stop-color="#F08BD8"/></linearGradient></defs>
    <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#blfond)"/>
    <circle cx="20" cy="19" r="9" fill="#F0354B"/><path d="M13 15c5 1 9 5 12 10M15 24c4-1 8-5 9-11" stroke="#FFE1E6" stroke-width="2.5" fill="none"/>
    <circle cx="40" cy="19" r="9" fill="#2C8CF5"/><path d="M40 19m-5 0a5 5 0 1 0 10 0a3 3 0 1 0 -6 0" stroke="#D2F0FF" stroke-width="2.5" fill="none"/>
    <circle cx="30" cy="35" r="9" fill="#FFC21A"/><path d="M23 31l14 8M24 38l12-7" stroke="#FF8B1F" stroke-width="2.5"/>
    <circle cx="32" cy="52" r="7" fill="#4CC92E"/><circle cx="17" cy="16" r="2.5" fill="#fff" opacity=".7"/><circle cx="37" cy="16" r="2.5" fill="#fff" opacity=".7"/></svg>`,

  resume() {
    options = {};
    charger();
    return S ? `Niveau ${S.n} en cours` : `Prochain niveau : ${profil.niveauMax}`;
  },

  monter(conteneur, opts = {}) {
    racine = conteneur;
    options = opts;
    enCours = false;
    effets = [];
    volante = null;
    visee = null;
    conseil = null;
    charger();
    construire();
    if (S) {
      dessinerHud();
      dessiner();
      demarrer();
      dire('Votre partie a été retrouvée.');
      if (!options.defi) preparer(S.n + 1);
    } else commencer(options.defi ? numeroDuDefi() : profil.niveauMax);
  },

  demonter() {
    if (anim) cancelAnimationFrame(anim);
    anim = null;
    fermerPanneaux();
    window.removeEventListener('resize', surRedim);
    observateur?.disconnect();
    racine = null;
    ctx = null;
  },
};
