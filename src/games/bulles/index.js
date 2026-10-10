// Bulles : jeu de tir de bulles. Règles dans moteur.js, niveaux générés (et vérifiés) par generateur.js.
// Visée simple : on pose le doigt où l'on veut envoyer la bulle (la trajectoire s'affiche), on lève le doigt : elle part.
// Dessin sur canvas ; l'animation ne tourne que lorsque quelque chose bouge.
import { $, chargerStyle, pluriel } from '../../core/outils.js';
import { lire, ecrire } from '../../core/stockage.js';
import { demander } from '../../core/dialogue.js';
import { finirPartie } from '../../core/partie.js';
import { revenir } from '../../core/navigation.js';
import { creerTravailleur } from '../../core/travail.js';
import { animer, mouvementReduit } from '../../core/mouvement.js';
import {
  LARGEUR, SQ, RANGEES_MAX, DEPART, ANGLE_MIN, ANGLE_MAX, centre, cloner, cases, trajectoire, resoudre, reussi,
  debordement, couleursPresentes, nbPoussins, points, charge, SEUIL_BONUS,
} from './moteur.js';
import { genererNiveau, meilleurCoup, etoilesNiveau, niveauPourDefi } from './generateur.js';
import { PALETTE, dessinerBulle, dessinerPoussin } from './rendu.js';

chargerStyle(new URL('./bulles.css', import.meta.url));

const usine = creerTravailleur(new URL('./generateur-worker.js', import.meta.url), (d) => (d.genre === 'niveau'
  ? { niveau: genererNiveau(d.n) }
  : { coup: meilleurCoup(d.plateau, d.courante, d.suivante, d.objectif) }));

const HAUTEUR = DEPART.y + 2.6; // hauteur du terrain, en unités
const VITESSE = 0.05; // unités par milliseconde
const TIRS_OFFERTS = 5;
const OBJECTIFS = { vider: 'Videz le plateau', liberer: 'Libérez tous les poussins' };

let racine = null;
let options = {};
let S = null; // partie en cours (sauvegardée)
let N = null; // niveau (plateau de départ, tirs, seuils)
let profil = null; // { niveauMax, etoiles: {n: meilleures} } en partie libre
let toile = null, ctx = null, echelle = 20, dpr = 1;
let enCours = false; // une bulle vole ou des effets se jouent
let visee = null; // { angle } pendant que le doigt est posé
let conseil = null; // { angle, jusqua }
let effets = []; // particules, chutes, textes
let volante = null; // { points, i, x, y, b }
let anim = null, dernier = 0;
let prochain = null; // niveau suivant préparé à l'avance
let surRedim = null;

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
const cleProfil = () => 'bulles';
const clePartie = () => (options.defi ? `bulles.defi.${options.defi.id}` : 'bulles.partie');
function charger() {
  profil = lire(cleProfil(), null) || { niveauMax: 1, etoiles: {} };
  const p = lire(clePartie(), null);
  S = p && p.plateau ? p : null;
}
const sauver = () => { ecrire(cleProfil(), profil); if (S) ecrire(clePartie(), S); };
const dire = (t) => { const el = $('#bl-status', racine); if (el) el.innerHTML = t || ''; };

// ---------- Niveaux ----------

const numeroDuDefi = () => niveauPourDefi(options.defi.niveau, options.defi.numero);

function preparer(n) {
  if (prochain?.n === n) return prochain.promesse;
  const promesse = usine.calculer({ genre: 'niveau', n }).then((r) => r.niveau);
  prochain = { n, promesse };
  return promesse;
}

async function commencer(n) {
  enCours = true;
  effets = [];
  volante = null;
  dire('Je prépare le niveau…');
  $('#bl-chargement', racine).hidden = false;
  const niveau = await preparer(n);
  prochain = null;
  if (!racine) return;
  $('#bl-chargement', racine).hidden = true;
  N = niveau;
  S = {
    n, plateau: cloner(niveau.plateau), objectif: niveau.objectif, tirs: niveau.tirs, parfait: niveau.parfait, bien: niveau.bien,
    utilises: 0, score: 0, jauge: 0, bonus: 0, offerts: false, graine: (n * 2654435761) >>> 0, historique: [],
    indices: 0, annulations: 0, poussinsDepart: nbPoussins(niveau.plateau),
  };
  S.courante = nouvelleCouleur();
  S.suivante = nouvelleCouleur();
  sauver();
  enCours = false;
  dessinerHud();
  dessiner();
  if (!options.defi) preparer(n + 1); // le suivant se prépare pendant qu'on joue
  const premier = n === 1 && !options.defi;
  await demander({
    titre: options.defi ? `Niveau ${options.defi.numero} de l’Aventure` : `Niveau ${n}`,
    texte: `${OBJECTIFS[S.objectif]}${S.objectif === 'liberer' ? ` (${pluriel(S.poussinsDepart, 'poussin')})` : ''} avec ${pluriel(S.tirs, 'bulle')}.`
      + (premier ? '\n\nPosez le doigt là où vous voulez envoyer la bulle : la ligne montre son chemin. Levez le doigt pour tirer. Trois bulles de la même couleur éclatent !' : ''),
    oui: 'C’est parti !',
  });
  dire(premier ? 'Posez le doigt sur le jeu pour viser.' : '');
}

// ---------- Dessin ----------

const px = (u) => u * echelle;

function dimensionner() {
  const zone = $('.bl-zone', racine);
  const paysage = matchMedia('(orientation: landscape) and (max-height: 560px)').matches;
  let largeur = Math.min(zone.clientWidth || 340, 560);
  if (paysage) largeur = Math.min(largeur, ((window.innerHeight - 24) * LARGEUR) / HAUTEUR);
  else largeur = Math.min(largeur, ((window.innerHeight * 0.72) * LARGEUR) / HAUTEUR);
  echelle = largeur / LARGEUR;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  toile.style.width = `${largeur}px`;
  toile.style.height = `${HAUTEUR * echelle}px`;
  toile.width = Math.round(largeur * dpr);
  toile.height = Math.round(HAUTEUR * echelle * dpr);
}

function dessinerFond() {
  const W = toile.width / dpr, H = toile.height / dpr;
  const sombre = matchMedia('(prefers-color-scheme: dark)').matches;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sombre ? '#1B2B4A' : '#BFE3FF');
  g.addColorStop(1, sombre ? '#2A1E46' : '#F3E3FF');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // ligne à ne pas dépasser
  const yLimite = px(1 + (RANGEES_MAX - 1) * SQ - 1);
  ctx.setLineDash([px(0.5), px(0.5)]);
  ctx.strokeStyle = sombre ? 'rgba(255, 255, 255, .25)' : 'rgba(30, 40, 80, .2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, yLimite);
  ctx.lineTo(W, yLimite);
  ctx.stroke();
  ctx.setLineDash([]);
}

function dessinerLanceur(t) {
  const x = px(DEPART.x), y = px(DEPART.y);
  // socle
  ctx.beginPath();
  ctx.ellipse(x, y + px(1.2), px(2.4), px(0.7), 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(29, 92, 72, .35)';
  ctx.fill();
  // flèche de visée
  const angle = visee?.angle ?? Math.PI / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle + Math.PI / 2);
  ctx.fillStyle = '#1D5C48';
  ctx.beginPath();
  ctx.moveTo(-px(0.55), -px(1.1)); ctx.lineTo(0, -px(2.3)); ctx.lineTo(px(0.55), -px(1.1));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // bulle prête (avec un halo si c'est une bulle spéciale)
  if (S && !volante) {
    if (S.courante.tir) {
      ctx.beginPath();
      ctx.arc(x, y, px(1.4 + 0.15 * Math.sin(t / 200)), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(242, 183, 5, .35)';
      ctx.fill();
    }
    dessinerBulle(ctx, x, y, px(1), S.courante, t);
  }
  // bulle suivante, à gauche, avec ses flèches d'échange
  if (S) {
    const sx = px(DEPART.x - 5), sy = px(DEPART.y + 0.6);
    dessinerBulle(ctx, sx, sy, px(0.75), S.suivante, t);
    ctx.strokeStyle = 'rgba(29, 92, 72, .7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx + px(2.4), sy - px(0.2), px(0.8), Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
}

function dessinerGuide(angle, t, couleur = 'rgba(255,255,255,.9)') {
  const { points: pts, cible } = trajectoire(S.plateau, angle);
  let reste = 0;
  ctx.fillStyle = couleur;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const long = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = reste; d < long; d += 1.1) {
      const f = d / long;
      ctx.beginPath();
      ctx.arc(px(a.x + (b.x - a.x) * f), px(a.y + (b.y - a.y) * f), px(0.18), 0, Math.PI * 2);
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
  if (!ctx || !S) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dessinerFond();
  for (const [r, c, b] of cases(S.plateau)) {
    const q = centre(r, c);
    dessinerBulle(ctx, px(q.x), px(q.y), px(1), b, t);
  }
  if (conseil && t < conseil.jusqua) dessinerGuide(conseil.angle, t, 'rgba(242, 183, 5, .95)');
  if (visee && !volante) dessinerGuide(visee.angle, t);
  if (volante) dessinerBulle(ctx, px(volante.x), px(volante.y), px(1), volante.b, t);
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
    const besoin = volante || effets.length || visee || (conseil && t < conseil.jusqua) || S?.courante.tir;
    anim = besoin && racine ? requestAnimationFrame(boucle) : null;
  };
  anim = requestAnimationFrame(boucle);
}

// ---------- Effets ----------

function particules(x, y, couleur, nb = 8) {
  if (mouvementReduit()) return;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + Math.random() * 0.5, v = 0.006 + Math.random() * 0.008;
    let px0 = x, py0 = y, vx = Math.cos(a) * v, vy = Math.sin(a) * v, vie = 500 + Math.random() * 250;
    const total = vie, taille = 0.18 + Math.random() * 0.22;
    effets.push({
      avancer(dt) { px0 += vx * dt; py0 += vy * dt; vy += 0.00002 * dt; vie -= dt; return vie > 0; },
      dessiner() {
        ctx.globalAlpha = Math.max(0, vie / total);
        ctx.beginPath();
        ctx.arc(px(px0), px(py0), px(taille), 0, Math.PI * 2);
        ctx.fillStyle = couleur;
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
      if (avant < 0 && t0 >= 0) particules(x, y, PALETTE[b.k]?.base || '#9AA0A6');
      return t0 < duree;
    },
    dessiner(t) {
      if (t0 < 0) { dessinerBulle(ctx, px(x), px(y), px(1), b, t); return; }
      const f = t0 / duree;
      ctx.globalAlpha = 1 - f;
      dessinerBulle(ctx, px(x), px(y), px(1 + f * 0.5), b, t);
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
      if (yy > HAUTEUR + 2) { particules(xx, HAUTEUR - 0.5, PALETTE[b.k]?.base || '#9AA0A6', 4); return false; }
      return true;
    },
    dessiner(t) { dessinerBulle(ctx, px(xx), px(yy), px(1), b, t); },
  });
}

function texteVolant(x, y, texte, couleur = '#ffffff', taille = 1.3) {
  let t0 = 0;
  effets.push({
    avancer(dt) { t0 += dt; return t0 < 1100; },
    dessiner() {
      const f = t0 / 1100;
      ctx.globalAlpha = 1 - f * f;
      ctx.font = `700 ${px(taille)}px "Atkinson Hyperlegible", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20, 30, 50, .65)';
      ctx.strokeText(texte, px(x), px(y - f * 2.5));
      ctx.fillStyle = couleur;
      ctx.fillText(texte, px(x), px(y - f * 2.5));
      ctx.globalAlpha = 1;
    },
  });
}

function onde(x, y) {
  let t0 = 0;
  effets.push({
    avancer(dt) { t0 += dt; return t0 < 450; },
    dessiner() {
      const f = t0 / 450;
      ctx.beginPath();
      ctx.arc(px(x), px(y), px(1 + f * 4), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 190, 60, ${1 - f})`;
      ctx.lineWidth = px(0.5) * (1 - f);
      ctx.stroke();
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
  for (let i = 0; i < 60; i++) {
    let x = Math.random() * LARGEUR, y = -Math.random() * 6, vy = 0.006 + Math.random() * 0.01, rot = Math.random() * 6;
    const couleur = PALETTE[i % PALETTE.length].base, vr = (Math.random() - 0.5) * 0.02;
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

// ---------- Tir ----------

function angleVers(ev) {
  const r = toile.getBoundingClientRect();
  const x = (ev.clientX - r.left) / echelle, y = (ev.clientY - r.top) / echelle;
  if (y > DEPART.y - 0.8) return null; // trop bas : pas de tir
  const a = Math.atan2(DEPART.y - y, x - DEPART.x);
  return Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, a));
}
function surSuivante(ev) {
  const r = toile.getBoundingClientRect();
  const x = (ev.clientX - r.left) / echelle, y = (ev.clientY - r.top) / echelle;
  return Math.hypot(x - (DEPART.x - 5), y - (DEPART.y + 0.6)) < 1.8 || Math.hypot(x - DEPART.x, y - DEPART.y) < 1.4;
}

function tirer(angle) {
  if (enCours || !S) return;
  const { points: pts, cible } = trajectoire(S.plateau, angle);
  if (!cible) return;
  // on garde de quoi annuler ce tir
  S.historique.push(JSON.stringify({ ...S, historique: undefined }));
  if (S.historique.length > 8) S.historique.shift();
  enCours = true;
  conseil = null;
  visee = null;
  volante = { points: pts, i: 1, x: pts[0].x, y: pts[0].y, b: S.courante, cible };
  dire('');
  demarrer();
}

function avancer(dt) {
  let reste = dt * VITESSE;
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
  }
}

async function atterrir() {
  const { cible, b } = volante;
  volante = null;
  const ev = resoudre(S.plateau, cible, b);
  S.utilises++;
  // éclatements, de proche en proche
  const c0 = centre(cible.r, cible.c);
  ev.eclatees.forEach(({ r, c, b: v }) => {
    const q = centre(r, c);
    eclater(q.x, q.y, v, Math.hypot(q.x - c0.x, q.y - c0.y) * 25);
    if (v.poussin) poussinLibere(q.x, q.y, 200);
  });
  ev.tombees.forEach(({ r, c, b: v }, i) => {
    const q = centre(r, c);
    tomber(q.x, q.y, v, 120 + i * 18);
    if (v.poussin) poussinLibere(q.x, q.y, 300);
  });
  ev.explosions.forEach(({ r, c }) => { const q = centre(r, c); onde(q.x, q.y); });
  ev.glaces.forEach(({ r, c }) => { const q = centre(r, c); particules(q.x, q.y, '#D6F3FF', 6); });
  const combo = ev.tombees.length >= 3 ? 1 : 0;
  const gain = points(ev, combo);
  S.score += gain;
  if (gain) texteVolant(c0.x, c0.y, `+${gain}`, ev.tombees.length >= 5 ? '#FFD84A' : '#ffffff', ev.tombees.length >= 5 ? 1.7 : 1.3);
  if (ev.tombees.length >= 5) texteVolant(LARGEUR / 2, 10, 'Magnifique !', '#FFD84A', 2);
  else if (ev.eclatees.length >= 6) texteVolant(LARGEUR / 2, 10, 'Bravo !', '#ffffff', 1.8);
  if (ev.poussins) texteVolant(c0.x, c0.y - 2, ev.poussins > 1 ? `${ev.poussins} poussins libérés !` : 'Un poussin libéré !', '#FFE37A', 1.3);
  // jauge de bonus : une bulle spéciale arrive quand elle est pleine
  S.jauge += charge(ev);
  let bonusPret = false;
  if (S.jauge >= SEUIL_BONUS) { S.jauge = 0; bonusPret = true; }
  S.courante = S.suivante;
  S.suivante = nouvelleCouleur();
  if (bonusPret) {
    S.suivante = S.courante;
    S.courante = { tir: S.bonus++ % 2 ? 'arc' : 'bombe' };
    texteVolant(DEPART.x, DEPART.y - 3, S.courante.tir === 'bombe' ? 'Une bombe !' : 'Une bulle arc-en-ciel !', '#FFD84A', 1.3);
  }
  // une couleur qui n'existe plus sur le plateau est remplacée
  if (S.courante.k !== undefined && !couleursPresentes(S.plateau).includes(S.courante.k)) S.courante = nouvelleCouleur();
  if (S.suivante.k !== undefined && !couleursPresentes(S.plateau).includes(S.suivante.k)) S.suivante = nouvelleCouleur();
  sauver();
  dessinerHud();
  demarrer();
  enCours = false;
  if (reussi(S.plateau, S.objectif)) return victoire(ev);
  if (debordement(S.plateau)) return defaite('Les bulles sont descendues trop bas.');
  if (S.utilises >= S.tirs) return plusDeTirs();
  if (!ev.eclatees.length && !ev.tombees.length && S.tirs - S.utilises <= 3) dire(`Attention : plus que ${pluriel(S.tirs - S.utilises, 'bulle')} !`);
}

async function victoire() {
  enCours = true;
  // les bulles restantes (pierres…) tombent pour le plaisir des yeux
  for (const [r, c, b] of [...cases(S.plateau)]) { const q = centre(r, c); tomber(q.x, q.y, b, Math.random() * 300); S.plateau[r][c] = null; }
  confettis();
  demarrer();
  const etoiles = etoilesNiveau(S, S.utilises, S.offerts);
  const restantes = S.tirs - S.utilises;
  if (!options.defi) {
    profil.etoiles[S.n] = Math.max(profil.etoiles[S.n] || 0, etoiles);
    profil.niveauMax = Math.max(profil.niveauMax, S.n + 1);
  }
  const n = S.n;
  const details = { indices: S.indices, annulations: S.annulations, tirsRestants: restantes, score: S.score, etoiles };
  S = { ...S, fini: true };
  sauver();
  ecrire(clePartie(), null);
  await new Promise((r) => setTimeout(r, mouvementReduit() ? 100 : 1400));
  const choix = await finirPartie({
    jeu: 'bulles',
    gagne: true,
    // en partie libre, les étoiles gagnées suivent la réussite du niveau (1 à 3)
    difficulte: ['facile', 'moyen', 'difficile'][etoiles - 1],
    defi: options.defi,
    titre: etoiles === 3 ? 'Parfait !' : 'Niveau réussi !',
    texte: `${pluriel(S.utilises, 'bulle tirée', 'bulles tirées')}, ${S.score} points.${restantes > 0 ? ` Il vous restait ${pluriel(restantes, 'bulle')}.` : ''}`,
    libelleRejouer: options.defi ? undefined : 'Niveau suivant',
    details,
  });
  if (choix === 'rejouer') commencer(options.defi ? numeroDuDefi() : n + 1);
  else if (choix === 'carte') revenir('niveaux');
  else { S = null; dessinerHud(); }
}

async function plusDeTirs() {
  if (!S.offerts) {
    const encore = await demander({
      titre: 'Plus de bulles !',
      texte: `Il reste encore ${couleursPresentes(S.plateau).length ? 'des bulles à faire éclater' : 'des poussins à libérer'}. Voulez-vous ${TIRS_OFFERTS} bulles de plus ? (C’est offert, une fois par niveau.)`,
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

async function defaite(raison) {
  enCours = true;
  ecrire(clePartie(), null);
  const n = S.n;
  const choix = await finirPartie({
    jeu: 'bulles',
    gagne: false,
    difficulte: 'facile',
    defi: options.defi,
    titre: 'Pas cette fois',
    texte: `${raison} On recommence ?`,
    details: { indices: S.indices, annulations: S.annulations, tirsRestants: 0 },
  });
  if (choix === 'rejouer') commencer(n);
  else if (choix === 'carte') revenir('niveaux');
  else { S = null; enCours = false; dessinerHud(); }
}

// ---------- Commandes ----------

function echanger() {
  if (enCours || !S) return;
  [S.courante, S.suivante] = [S.suivante, S.courante];
  sauver();
  dessiner();
  dire('Bulles échangées.');
}

function annuler() {
  if (enCours || !S || !S.historique.length) return dire('Rien à annuler pour l’instant.');
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

async function choisirNiveau() {
  if (enCours) return;
  const max = profil.niveauMax;
  const liste = Array.from({ length: max }, (_, i) => i + 1).reverse();
  const fond = document.createElement('div');
  fond.className = 'sheet temp';
  fond.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true">
      <h3>Choisir un niveau</h3>
      <div class="bl-niveaux">
        ${liste.map((n) => `<button class="bl-niv ${n === max ? 'courant' : ''}" data-n="${n}"><b>${n}</b><small>${'★'.repeat(profil.etoiles[n] || 0)}${'☆'.repeat(3 - (profil.etoiles[n] || 0))}</small></button>`).join('')}
      </div>
      <div class="sheet-actions"><button class="btn" data-n="">Fermer</button></div>
    </div>`;
  document.body.append(fond);
  animer(fond.firstElementChild, [{ transform: 'translateY(50px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 });
  const n = await new Promise((ok) => fond.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-n]');
    if (!b && e.target !== fond) return;
    fond.remove();
    ok(b ? Number(b.dataset.n) || null : null);
  }));
  if (!n) return;
  if (S && !S.fini && S.utilises > 0 && !(await demander({ titre: 'Changer de niveau ?', texte: 'Le niveau en cours sera abandonné.', oui: 'Oui, changer', non: 'Non, continuer' }))) return;
  commencer(n);
}

function dessinerHud() {
  if (!racine) return;
  const hud = $('#bl-hud', racine);
  if (!S) {
    hud.innerHTML = `<p class="bl-titre">Niveau ${profil.niveauMax}</p>`;
    $('#bl-jouer', racine).hidden = false;
    return;
  }
  $('#bl-jouer', racine).hidden = true;
  const restantes = Math.max(0, S.tirs - S.utilises);
  const etoiles = etoilesNiveau(S, S.utilises + 1, S.offerts);
  const objectif = S.objectif === 'liberer'
    ? `Poussins : <b>${S.poussinsDepart - nbPoussins(S.plateau)} / ${S.poussinsDepart}</b>`
    : `${OBJECTIFS.vider}`;
  hud.innerHTML = `
    <div class="bl-ligne">
      <p class="bl-titre">${options.defi ? 'Aventure' : `Niveau ${S.n}`}</p>
      <p class="bl-etoiles" aria-label="Étoiles possibles : ${etoiles}">${'★'.repeat(etoiles)}<span>${'★'.repeat(3 - etoiles)}</span></p>
    </div>
    <div class="bl-ligne">
      <p class="bl-objectif">${objectif}</p>
      <p class="bl-tirs ${restantes <= 3 ? 'peu' : ''}" aria-label="${restantes} bulles restantes"><b>${restantes}</b> bulles</p>
    </div>
    <div class="bl-ligne">
      <p class="bl-score">${S.score} points</p>
      <span class="bl-jauge" aria-label="Bonus"><i style="width:${Math.min(100, (S.jauge / SEUIL_BONUS) * 100)}%"></i></span>
    </div>`;
  $('#bl-annuler', racine).disabled = !S.historique?.length;
}

function construire() {
  racine.innerHTML = `
    <div class="bl-body">
      <div class="bl-hud" id="bl-hud"></div>
      <div class="bl-zone">
        <canvas class="bl-toile" aria-label="Plateau de bulles. Posez le doigt pour viser, levez-le pour tirer."></canvas>
        <p class="bl-chargement" id="bl-chargement" hidden>Je prépare le niveau…</p>
        <button class="btn primary bl-jouer" id="bl-jouer" hidden>Jouer</button>
      </div>
      <div class="bl-side">
        <p class="status" id="bl-status" aria-live="polite"></p>
        <div class="tools">
          <button class="btn" id="bl-annuler">Annuler</button>
          <button class="btn" id="bl-indice">Indice</button>
          <button class="btn" id="bl-echanger">Échanger</button>
        </div>
        ${options.defi ? '' : '<button class="btn" id="bl-niveaux">Choisir un niveau</button>'}
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
    if (!visee && !toile.hasPointerCapture(e.pointerId)) return;
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
  $('#bl-niveaux', racine)?.addEventListener('click', choisirNiveau);
  $('#bl-jouer', racine).addEventListener('click', () => commencer(options.defi ? numeroDuDefi() : profil.niveauMax));
  surRedim = () => { if (racine) { dimensionner(); dessiner(); } };
  window.addEventListener('resize', surRedim);
}

// ---------- Module ----------

export default {
  id: 'bulles',
  nom: 'Bulles',
  description: 'Faites éclater les bulles, niveau après niveau',
  paysage: true,
  icone: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect class="ic-bg" x="4" y="4" width="56" height="56" rx="12"/>
    <circle cx="20" cy="18" r="8" fill="#E8504F"/><circle cx="36" cy="18" r="8" fill="#3B82F6"/><circle cx="28" cy="31" r="8" fill="#F5C531"/>
    <circle cx="44" cy="31" r="8" fill="#2DBB64"/><circle cx="32" cy="50" r="7" fill="#9B5DE5"/><path d="M32 43l-6 -10" stroke="#1D5C48" stroke-width="2.5" stroke-dasharray="2 3"/>
    <circle cx="17" cy="15" r="2.5" fill="#fff" opacity=".6"/><circle cx="33" cy="15" r="2.5" fill="#fff" opacity=".6"/></svg>`,

  resume() {
    options = {};
    charger();
    return S && !S.fini ? `Niveau ${S.n} en cours` : `Prochain niveau : ${profil.niveauMax}`;
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
    if (options.defi && (!S || S.fini)) S = null;
    if (S && !S.fini) {
      dessinerHud();
      dessiner();
      dire('Votre partie a été retrouvée.');
      if (!options.defi) preparer(S.n + 1);
    } else commencer(options.defi ? numeroDuDefi() : profil.niveauMax);
  },

  demonter() {
    if (anim) cancelAnimationFrame(anim);
    anim = null;
    window.removeEventListener('resize', surRedim);
    racine = null;
    ctx = null;
  },
};

