// Rendu du monde de l'île sur un <canvas> : la mer animée, l'archipel en pixel art, les habitants,
// les chantiers et leurs minuteurs, les récoltes à ramasser, le bâtiment qu'on est en train de poser…
// Tout est dessiné à chaque image, à partir de l'état du jeu (regles.js), de la caméra et de la vie (vie.js).
// Graphismes : « Tiny Islands » (Majadroid, CC0), « Tiny Town » (Kenney, CC0), le reste dessiné pour l'appli.
import { T, S, tuileBatiment } from '../core/tuiles.js';
import { BATIMENTS, DECORS, ILES, cle, coord, terrainDe, estTerre, stock, plafond, coutAgrandir, obstacleAgrandir } from './regles.js';
import { origine, rectIle, panneauxAgrandir } from './plan.js';

const POLICE = '"Atkinson Hyperlegible", system-ui, sans-serif';
const ICONES = { bois: T.icones.bois, pierre: T.icones.pierre, ble: T.icones.ble };
const DUREES = { pose: 0.5, fini: 0.7, retire: 0.35, terre: 0.6, choisi: 0.35 };

/** Image d'une case : { f: 't' (Tiny Islands) | 's' (sprites), c: [col, rang], echafaudage? }. */
export function imageCase(ile, x, y, t) {
  const k = cle(x, y), c = ile.cases[k], w = ile.travaux[k], terrain = terrainDe(ile, x, y);
  if (c) {
    if (c.niveau === 0 && c.chantier) {
      if (BATIMENTS[c.type]?.cote) return { f: 't', c: tuileBatiment(c.type, 1), echafaudage: true };
      const p = (t - c.chantier.debut) / (c.chantier.fin - c.chantier.debut);
      return { f: 's', c: S.chantier[Math.min(2, Math.max(0, Math.floor(p * 3)))] };
    }
    const niveau = Math.max(1, c.niveau);
    let img;
    if (DECORS[c.type]) img = { f: 's', c: S.decor[c.type] || S.fleurs };
    else if (c.type === 'carriere') img = { f: 's', c: S.carriere[niveau - 1] };
    else img = { f: 't', c: tuileBatiment(c.type, niveau) };
    if (c.chantier) img.echafaudage = true;
    return img;
  }
  if (w) return { f: 's', c: { abattre: S.souche, casser: S.gravats, planter: S.pousse, creuser: S.chantier[0], combler: S.chantier[0], debroussailler: S.souche, cailloux: S.chantier[0] }[w.action] };
  if (terrain === 'foret') return { f: 't', c: T.foret };
  if (terrain === 'montagne') return { f: 't', c: T.montagne };
  if (terrain === 'etang') return { f: 's', c: S.etang };
  if (terrain === 'buisson') return { f: 's', c: S.broussailles };
  if (terrain === 'caillou') return { f: 's', c: S.gravats };
  if (terrain === 'herbe') return { f: 't', c: T.herbe };
  const { x0, y0, x1, y1 } = ile.ext;
  if (y < y0) return { f: 't', c: x < x0 ? T.coinNO : x > x1 ? T.coinNE : T.bordN };
  if (y > y1) return { f: 't', c: x < x0 ? T.coinSO : x > x1 ? T.coinSE : T.bordS };
  return { f: 't', c: x < x0 ? T.bordO : T.bordE };
}

/** Image d'un type de bâtiment ou de décor (pour les fantômes et la boutique). */
export function imageType(type, niveau = 1) {
  if (DECORS[type]) return { f: 's', c: S.decor[type] || S.fleurs };
  if (type === 'carriere') return { f: 's', c: S.carriere[Math.min(3, niveau) - 1] };
  return { f: 't', c: tuileBatiment(type, niveau) };
}

/** Une beauté gagnée ou perdue, écrite pour être lue d'un coup d'œil : +2, −1, 0. */
const signe = (g) => (g > 0 ? `+${g}` : g < 0 ? `−${-g}` : '0');
const hash = (i, j) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const duree = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`;
};

export function creerRendu(toile) {
  const ctx = toile.getContext('2d');
  const images = { t: new Image(), s: new Image() };
  images.t.src = new URL('../../assets/ile/tuiles.png', import.meta.url).href;
  images.s.src = new URL('../../assets/ile/sprites.png', import.meta.url).href;
  const pret = Promise.all(Object.values(images).map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
  let mer = '#639bff';
  pret.then(() => {
    try { // la couleur exacte de la mer de Tiny Islands
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const g = c.getContext('2d');
      g.drawImage(images.t, T.eau[0] * 16 + 8, T.eau[1] * 16 + 8, 1, 1, 0, 0, 1, 1);
      const [r, v, b] = g.getImageData(0, 0, 1, 1).data;
      mer = `rgb(${r}, ${v}, ${b})`;
    } catch { /* garde la couleur par défaut */ }
  });

  let dpr = 1, L = 0, H = 0;
  const effets = { pops: new Map(), textes: [], particules: [], devoiles: new Map() };
  /** Zones touchables dessinées par-dessus les cases (bulles de récolte, bouteille, panneaux). En pixels CSS. */
  let cibles = [];

  function dimensionner(l, h, ratio) {
    L = l; H = h; dpr = ratio;
    toile.width = Math.round(l * dpr);
    toile.height = Math.round(h * dpr);
    toile.style.width = `${l}px`;
    toile.style.height = `${h}px`;
  }

  // ---------- Petits outils de dessin (en pixels de l'écran physique) ----------

  let cam = null;
  const X = (wx) => Math.round(((wx - cam.x) * cam.z + cam.l / 2) * dpr);
  const Y = (wy) => Math.round(((wy - cam.y) * cam.z + cam.h / 2) * dpr);
  const Z = () => cam.z * dpr;

  function image(img, x0, y0, x1, y1, alpha = 1) {
    const src = img.f === 's' ? images.s : images.t;
    if (!src.complete || !src.naturalWidth) return;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(src, img.c[0] * 16, img.c[1] * 16, 16, 16, x0, y0, x1 - x0, y1 - y0);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
  /** Une case du monde (wx, wy = coin haut gauche), avec un éventuel agrandissement autour de son centre. */
  function caseMonde(img, wx, wy, echelle = 1, alpha = 1, decalY = 0) {
    if (X(wx + 2) < 0 || Y(wy + 2) < 0 || X(wx - 1) > toile.width || Y(wy - 1) > toile.height) return; // hors de l'écran
    if (echelle === 1 && !decalY) return image(img, X(wx), Y(wy), X(wx + 1), Y(wy + 1), alpha);
    const cx = (X(wx) + X(wx + 1)) / 2, cy = (Y(wy) + Y(wy + 1)) / 2 + decalY * Z();
    const d = (Z() * echelle) / 2;
    image(img, Math.round(cx - d), Math.round(cy - d), Math.round(cx + d), Math.round(cy + d), alpha);
  }
  function rondRect(x, y, l, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, l, h, r) : ctx.rect(x, y, l, h);
  }
  /** Texte blanc cerclé de sombre, comme les jeux de construction (lisible sur tous les fonds). */
  function texte(t, x, y, taille, { couleur = '#fff', contour = '#1c2433', align = 'center', base = 'middle' } = {}) {
    ctx.font = `700 ${Math.round(taille)}px ${POLICE}`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, taille * 0.22);
    ctx.strokeStyle = contour;
    ctx.strokeText(t, x, y);
    ctx.fillStyle = couleur;
    ctx.fillText(t, x, y);
  }
  const taillePolice = (part, mini = 13) => Math.max(mini * dpr, Z() * part);

  // ---------- La mer ----------

  function dessinerMer(temps, rects) {
    ctx.fillStyle = mer;
    ctx.fillRect(0, 0, toile.width, toile.height);
    const a = { x: Math.floor(cam.x - cam.l / 2 / cam.z) - 1, y: Math.floor(cam.y - cam.h / 2 / cam.z) - 1 };
    const b = { x: Math.ceil(cam.x + cam.l / 2 / cam.z) + 1, y: Math.ceil(cam.y + cam.h / 2 / cam.z) + 1 };
    for (let j = a.y; j <= b.y; j++) for (let i = a.x; i <= b.x; i++) {
      const h = hash(i, j);
      if (h > 0.07) continue;
      if (rects.some((r) => i >= r.x0 - 1 && i < r.x1 + 1 && j >= r.y0 - 1 && j < r.y1 + 1)) continue;
      const image = Math.floor(temps * 1.6 + h * 997) % 7; // 5 images de vague, puis un peu de calme
      if (image < 5) caseMonde({ f: 't', c: T.vagues[image] }, i, j);
    }
  }

  // ---------- Une île ----------

  function echelleEffet(cleEffet, temps) {
    const e = effets.pops.get(cleEffet);
    if (!e) return { s: 1, dy: 0, a: 1 };
    const p = (temps - e.debut) / DUREES[e.genre];
    if (p < 0) return e.genre === 'terre' ? { s: 0, dy: 0, a: 0 } : { s: 1, dy: 0, a: 1 };
    if (p >= 1) { effets.pops.delete(cleEffet); return { s: 1, dy: 0, a: 1 }; }
    // tombe du ciel, dépasse un peu, puis se pose
    if (e.genre === 'pose') return { s: p < 0.6 ? 0.4 + (p / 0.6) * 0.75 : 1.15 - ((p - 0.6) / 0.4) * 0.15, dy: -((1 - p) ** 2) * 0.8, a: Math.min(1, p * 3) };
    if (e.genre === 'fini' || e.genre === 'choisi') return { s: 1 + Math.sin(p * Math.PI) * (e.genre === 'fini' ? 0.28 : 0.12), dy: -Math.sin(p * Math.PI) * 0.12, a: 1 };
    if (e.genre === 'terre') return { s: 0.3 + 0.7 * (1 - (1 - p) ** 3) + Math.sin(p * Math.PI) * 0.1, dy: (1 - p) * 0.4, a: Math.min(1, p * 2) };
    return { s: 1 - p * 0.8, dy: 0, a: 1 - p };
  }

  /** L'écume qui vient lécher la côte : des contours qui s'éloignent et s'effacent. */
  function ecume(ile, ox, oy, temps) {
    const { x0, y0, x1, y1 } = ile.ext;
    for (let i = 0; i < 2; i++) {
      const p = (temps / 3.2 + i * 0.5) % 1, ecart = 0.32 + p * 0.5;
      const a = X(ox + x0 - ecart), b = Y(oy + y0 - ecart), c = X(ox + x1 + 1 + ecart), d = Y(oy + y1 + 1 + ecart);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.42 * (1 - p)})`;
      ctx.lineWidth = Math.max(1.5, Z() * 0.045);
      rondRect(a, b, c - a, d - b, Z() * (0.25 + p * 0.3));
      ctx.stroke();
    }
  }
  /** Quelques touffes d'herbe et fleurs sur l'herbe libre (toujours les mêmes pour une case donnée). */
  function detailsHerbe(wx, wy) {
    const h = hash(wx * 7 + 3, wy * 13 + 5);
    if (h > 0.75) return;
    const p = Z() / 16, x0 = X(wx), y0 = Y(wy);
    const nb = 1 + Math.floor(h * 4);
    for (let i = 0; i < nb; i++) {
      const u = hash(wx * 31 + i, wy * 17 - i), v = hash(wx * 5 - i, wy * 29 + i);
      const px = x0 + Math.floor(2 + u * 12) * p, py = y0 + Math.floor(3 + v * 11) * p;
      if (i === 0 && h < 0.12) {
        // une petite fleur
        ctx.fillStyle = h < 0.06 ? '#fff6d0' : '#ffd2e6';
        ctx.fillRect(px - p, py, p * 3, p); ctx.fillRect(px, py - p, p, p * 3);
        ctx.fillStyle = '#f2c94c';
        ctx.fillRect(px, py, p, p);
        continue;
      }
      ctx.fillStyle = 'rgba(20, 70, 10, .32)';
      ctx.fillRect(px, py, p, p); ctx.fillRect(px + p, py - p, p, p); ctx.fillRect(px + 2 * p, py, p, p);
    }
  }

  function dessinerIle(s, n, ouverte) {
    const ile = s.E.iles[n], { ox, oy } = origine(ile, n), { x0, y0, x1, y1 } = ile.ext;
    // la mer de la côte d'abord (et son écume), puis la terre, pour que les cases qui « sortent de l'eau » passent par-dessus
    for (const passe of ['mer', 'terre']) {
      if (passe === 'terre' && ouverte && !s.reduit) ecume(ile, ox, oy, s.temps);
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        const terre = estTerre(ile, x, y);
        if ((passe === 'terre') !== terre) continue;
        const k = cle(x, y), wx = ox + x, wy = oy + y;
        const c = ile.cases[k];
        const img = imageCase(ile, x, y, s.t);
        const ef = echelleEffet(`${n}:${k}`, s.temps);
        // sous un bâtiment qui apparaît, l'herbe reste en place (une terre qui sort de l'eau, elle, part de la mer)
        if (terre && (ef.s !== 1 || ef.dy) && effets.pops.get(`${n}:${k}`)?.genre !== 'terre') caseMonde({ f: 't', c: T.herbe }, wx, wy);
        if (s.deplacement && s.deplacement.n === n && s.deplacement.de === k) {
          caseMonde({ f: 't', c: c && BATIMENTS[c.type]?.cote ? T.bordN : T.herbe }, wx, wy);
          continue;
        }
        caseMonde(img, wx, wy, ef.s, ef.a, ef.dy);
        if (img.echafaudage) echafaudage(wx, wy);
        if (terre && !c && !ile.travaux[k] && img.c === T.herbe && ef.s === 1) detailsHerbe(wx, wy);
      }
    }
    if (!ouverte) return;
    // la bouteille à la mer
    if (s.E.tresor && s.E.tresor.n === n) bouteille(s, ile, n);
  }

  function echafaudage(wx, wy) {
    const x0 = X(wx), y0 = Y(wy), z = Z();
    ctx.fillStyle = 'rgba(70, 40, 10, .18)';
    ctx.fillRect(x0, y0, z, z);
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = Math.max(2, z * 0.06);
    ctx.beginPath();
    for (const fx of [0.14, 0.86]) { ctx.moveTo(x0 + z * fx, y0 + z * 0.12); ctx.lineTo(x0 + z * fx, y0 + z * 0.96); }
    for (const fy of [0.38, 0.7]) { ctx.moveTo(x0 + z * 0.08, y0 + z * fy); ctx.lineTo(x0 + z * 0.92, y0 + z * fy); }
    ctx.stroke();
    ctx.strokeStyle = '#c8772c';
    ctx.beginPath();
    ctx.moveTo(x0 + z * 0.14, y0 + z * 0.7); ctx.lineTo(x0 + z * 0.86, y0 + z * 0.38);
    ctx.stroke();
  }

  function bouteille(s, ile, n) {
    const [x, y] = coord(s.E.tresor.cle), { ox, oy } = origine(ile, n);
    const wx = ox + x, wy = oy + y, z = Z(), cx = (X(wx) + X(wx + 1)) / 2, cy = (Y(wy) + Y(wy + 1)) / 2;
    const flotte = s.reduit ? 0 : Math.sin(s.temps * 2.2) * z * 0.05;
    // ronds dans l'eau
    for (let i = 0; i < 2; i++) {
      const p = s.reduit ? 0.5 : (s.temps * 0.6 + i * 0.5) % 1;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * (1 - p)})`;
      ctx.lineWidth = Math.max(1.5, z * 0.03);
      ctx.beginPath();
      ctx.ellipse(cx, cy + z * 0.18, z * (0.2 + p * 0.3), z * (0.08 + p * 0.12), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(cx, cy + flotte);
    ctx.rotate(s.reduit ? 0 : Math.sin(s.temps * 1.7) * 0.12);
    image({ f: 's', c: S.bouteille }, Math.round(-z * 0.55), Math.round(-z * 0.55), Math.round(z * 0.55), Math.round(z * 0.55));
    ctx.restore();
    etincelle(cx + z * 0.3, cy - z * 0.35, z * 0.14, s.temps * 3);
    cibles.push({ genre: 'tresor', n, cle: s.E.tresor.cle, ...rectCss(cx - z * 0.6, cy - z * 0.6, cx + z * 0.6, cy + z * 0.6) });
  }
  function etincelle(x, y, r, phase) {
    const a = 0.4 + 0.6 * Math.abs(Math.sin(phase));
    ctx.fillStyle = `rgba(255, 244, 170, ${a})`;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4, rr = i % 2 ? r * 0.35 : r * (0.8 + a * 0.4);
      ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  const rectCss = (a, b, c, d) => ({ x0: a / dpr, y0: b / dpr, x1: c / dpr, y1: d / dpr });

  // ---------- Les nuages qui cachent les îles pas encore découvertes ----------

  const nuagesIle = new Map();
  function nuages(n, r) {
    if (!nuagesIle.has(n)) {
      const liste = [];
      let graine = 7 + n * 31;
      const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
      const l = r.x1 - r.x0, h = r.y1 - r.y0;
      for (let i = 0; i < Math.round(l * h * 0.55); i++) liste.push({ x: r.x0 + 0.5 + alea() * (l - 1), y: r.y0 + 0.5 + alea() * (h - 1), r: 0.9 + alea() * 1.3, p: alea() * 6 });
      nuagesIle.set(n, liste);
    }
    return nuagesIle.get(n);
  }
  function dessinerNuages(s, n) {
    const ile = s.E.iles[n], r = rectIle(ile, n), devoile = effets.devoiles.get(n);
    const p = devoile === undefined ? 0 : Math.min(1, (s.temps - devoile) / 2.2);
    if (p >= 1) return;
    const z = Z(), cxIle = (r.x0 + r.x1) / 2, cyIle = (r.y0 + r.y1) / 2;
    ctx.globalAlpha = 1 - p;
    for (const passe of [0, 1]) {
      for (const nu of nuages(n, r)) {
        const fuite = p * 4;
        const dx = (nu.x - cxIle) * fuite * 0.4, dy = (nu.y - cyIle) * fuite * 0.4;
        const ondule = s.reduit ? 0 : Math.sin(s.temps * 0.4 + nu.p) * 0.12;
        const x = ((nu.x + dx + ondule - cam.x) * cam.z + cam.l / 2) * dpr, y = ((nu.y + dy - cam.y) * cam.z + cam.h / 2) * dpr;
        ctx.fillStyle = passe ? '#ffffff' : '#c9d6ea';
        ctx.beginPath();
        ctx.arc(x, y + (passe ? 0 : z * 0.12), nu.r * z * (passe ? 0.92 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (p > 0) return;
    // un écriteau : ce qu'il faut pour découvrir l'île
    const cx = ((cxIle - cam.x) * cam.z + cam.l / 2) * dpr, cy = ((cyIle - cam.y) * cam.z + cam.h / 2) * dpr;
    const taille = Math.max(15 * dpr, z * 0.36);
    cadenas(cx, cy - taille * 1.2, taille * 1.1);
    texte(ILES[n].nom, cx, cy + taille * 0.35, taille * 0.9, { couleur: '#2a3a5c', contour: '#ffffff' });
    texte(`Beauté ${ILES[n].seuil}`, cx, cy + taille * 1.45, taille * 0.8, { couleur: '#7a5200', contour: '#fff3c4' });
  }
  function cadenas(x, y, t) {
    ctx.lineWidth = t * 0.16;
    ctx.strokeStyle = '#6b7a99';
    ctx.beginPath();
    ctx.arc(x, y - t * 0.15, t * 0.28, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#f2b632';
    rondRect(x - t * 0.42, y - t * 0.15, t * 0.84, t * 0.62, t * 0.12);
    ctx.fill();
    ctx.lineWidth = Math.max(2, t * 0.06);
    ctx.strokeStyle = '#7a5200';
    ctx.stroke();
    ctx.fillStyle = '#7a5200';
    ctx.beginPath();
    ctx.arc(x, y + t * 0.1, t * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Les êtres ----------

  function dessinerEtres(s) {
    const liste = [];
    for (const a of s.vie.entites) {
      if (a.genre === 'bateau' || a.genre === 'mouette') { liste.push({ a, wx: a.x, wy: a.y }); continue; }
      if (a.n >= s.ouvertes) continue;
      const { ox, oy } = origine(s.E.iles[a.n], a.n);
      liste.push({ a, wx: ox + a.x, wy: oy + a.y });
    }
    liste.sort((p, q) => (p.a.genre === 'mouette') - (q.a.genre === 'mouette') || p.wy - q.wy);
    const z = Z(), t = s.reduit ? 0 : s.temps;
    for (const { a, wx, wy } of liste) {
      let img;
      if (a.genre === 'habitant') {
        const marche = a.etat === 'marche', pas = Math.floor(t * 7 + a.phase * 2) % 2;
        let col = 0;
        if (marche) col = a.charge ? 5 + pas : 1 + pas;
        else if (['travaille', 'coupe'].includes(a.etat)) col = 3 + (Math.floor(t * 4 + a.phase * 2) % 2);
        else if (a.charge) col = 5;
        img = { f: 's', c: S.habitant(a.variante, col) };
      } else if (a.genre === 'mouton') img = { f: 's', c: S.mouton[a.etat === 'attend' ? 0 : Math.floor(t * 3 + a.phase * 2) % 2] };
      else if (a.genre === 'poule') img = { f: 's', c: S.poule[Math.floor(t * (a.etat === 'marche' ? 6 : 1.5) + a.phase * 2) % 2] };
      else if (a.genre === 'mouette') img = { f: 's', c: S.mouette[Math.floor(t * 4 + a.phase * 2) % 2] };
      else img = { f: 't', c: T.bateaux[a.modele] };
      const x = ((wx - cam.x) * cam.z + cam.l / 2) * dpr, y = ((wy - cam.y) * cam.z + cam.h / 2) * dpr;
      if (x < -z || y < -z || x > toile.width + z || y > toile.height + z) continue;
      const taille = a.genre === 'bateau' ? z * 1.1 : a.genre === 'mouette' ? z * 0.8 : z;
      const balance = a.genre === 'bateau' && !s.reduit ? Math.sin(s.temps * 1.8 + a.p * 9) * z * 0.04 : 0;
      if (a.genre !== 'mouette' && a.genre !== 'bateau') {
        ctx.fillStyle = 'rgba(0, 0, 0, .22)';
        ctx.beginPath();
        ctx.ellipse(x, y, z * 0.17, z * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y + balance));
      if (a.gauche) ctx.scale(-1, 1);
      const haut = a.genre === 'bateau' ? -taille * 0.7 : a.genre === 'mouette' ? -taille / 2 : -taille * 0.95;
      image(img, Math.round(-taille / 2), Math.round(haut), Math.round(taille / 2), Math.round(haut + taille));
      ctx.restore();
    }
    // la fumée des cheminées
    for (const f of s.vie.fumees) {
      const p = f.age / 2.6;
      const x = ((f.x + f.derive * p - cam.x) * cam.z + cam.l / 2) * dpr, y = ((f.y - p * 0.9 - cam.y) * cam.z + cam.h / 2) * dpr;
      ctx.fillStyle = `rgba(245, 245, 245, ${0.75 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(x, y, z * (0.05 + p * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Au-dessus des cases : minuteurs, récoltes, choix ----------

  function barre(cx, haut, largeur, p, libelle) {
    const z = Z(), h = Math.max(7 * dpr, z * 0.14);
    rondRect(cx - largeur / 2, haut, largeur, h, h / 2);
    ctx.fillStyle = 'rgba(20, 28, 40, .78)';
    ctx.fill();
    rondRect(cx - largeur / 2 + 2 * dpr, haut + 2 * dpr, Math.max(h - 4 * dpr, (largeur - 4 * dpr) * p), h - 4 * dpr, (h - 4 * dpr) / 2);
    ctx.fillStyle = '#7bd93d';
    ctx.fill();
    texte(libelle, cx, haut - taillePolice(0.17, 12) * 0.62, taillePolice(0.26, 14));
  }

  function bulle(cx, bas, res, q, plein, temps, reduit) {
    const z = Z(), l = Math.max(48 * dpr, z * 0.78), h = Math.max(30 * dpr, z * 0.48);
    const flotte = reduit ? 0 : Math.sin(temps * (plein ? 5 : 2.5)) * z * 0.04;
    const y = bas - h + flotte;
    ctx.fillStyle = 'rgba(0, 0, 0, .25)';
    rondRect(cx - l / 2, y + 3 * dpr, l, h, h / 2);
    ctx.fill();
    ctx.fillStyle = plein ? '#ffd23f' : '#ffffff';
    rondRect(cx - l / 2, y, l, h, h / 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.18, y + h - 1); ctx.lineTo(cx, y + h + h * 0.24); ctx.lineTo(cx + h * 0.18, y + h - 1);
    ctx.fill();
    ctx.lineWidth = Math.max(2, dpr * 1.5);
    ctx.strokeStyle = plein ? '#b37b00' : '#3a4a5e';
    rondRect(cx - l / 2, y, l, h, h / 2);
    ctx.stroke();
    const ic = h * 0.82;
    image({ f: 't', c: ICONES[res] }, Math.round(cx - l / 2 + h * 0.12), Math.round(y + (h - ic) / 2), Math.round(cx - l / 2 + h * 0.12 + ic), Math.round(y + (h - ic) / 2 + ic));
    texte(String(q), cx + l * 0.2, y + h / 2 + dpr, h * 0.62, { couleur: '#1c2433', contour: plein ? '#ffd23f' : '#ffffff' });
    return rectCss(cx - l / 2, y, cx + l / 2, y + h);
  }

  function dessinerDessus(s) {
    const z = Z();
    for (let n = 0; n < s.ouvertes; n++) {
      const ile = s.E.iles[n], { ox, oy } = origine(ile, n);
      const travaux = [
        ...Object.entries(ile.cases).filter(([, c]) => c.chantier).map(([k, c]) => [k, c.chantier]),
        ...Object.entries(ile.travaux),
      ];
      for (const [k, w] of travaux) {
        if (s.deplacement?.n === n && s.deplacement.de === k) continue;
        const [x, y] = coord(k), cx = (X(ox + x) + X(ox + x + 1)) / 2;
        const p = Math.min(1, Math.max(0, (s.t - w.debut) / (w.fin - w.debut)));
        barre(cx, Y(oy + y) - Math.max(7 * dpr, z * 0.14) - 2 * dpr, z * 0.92, p, duree(w.fin - s.t));
      }
      for (const [k, c] of Object.entries(ile.cases)) {
        if (!BATIMENTS[c.type]?.prod || (s.deplacement?.n === n && s.deplacement.de === k)) continue;
        const [x, y] = coord(k), q = stock(ile, x, y, s.t);
        if (!q) continue;
        const cx = (X(ox + x) + X(ox + x + 1)) / 2;
        const bas = Y(oy + y) + z * 0.12 - (c.chantier ? z * 0.5 : 0);
        const r = bulle(cx, bas, BATIMENTS[c.type].prod.res, q, q >= plafond(c), s.temps, s.reduit);
        cibles.push({ genre: 'bulle', n, cle: k, ...r });
      }
    }
  }

  function contourCase(n, k, couleur, epaisseur, tirets = null, remplir = null) {
    const ile = s0.E.iles[n], { ox, oy } = origine(ile, n), [x, y] = coord(k);
    const x0 = X(ox + x), y0 = Y(oy + y), l = X(ox + x + 1) - x0, h = Y(oy + y + 1) - y0, r = Z() * 0.14;
    if (remplir) { ctx.fillStyle = remplir; rondRect(x0 + 1, y0 + 1, l - 2, h - 2, r); ctx.fill(); }
    ctx.setLineDash(tirets ? tirets.map((v) => v * dpr) : []);
    ctx.strokeStyle = couleur;
    ctx.lineWidth = epaisseur * dpr;
    rondRect(x0 + epaisseur * dpr / 2 + 1, y0 + epaisseur * dpr / 2 + 1, l - epaisseur * dpr - 2, h - epaisseur * dpr - 2, r);
    ctx.stroke();
    ctx.setLineDash([]);
    return { x0, y0, l, h };
  }
  function badge(textePastille, cx, cy, meilleur) {
    const t = taillePolice(0.3, 15);
    ctx.font = `700 ${Math.round(t)}px ${POLICE}`;
    const l = ctx.measureText(textePastille).width + t * 0.9, h = t * 1.35;
    ctx.fillStyle = meilleur ? '#ffd23f' : 'rgba(20, 28, 40, .82)';
    rondRect(cx - l / 2, cy - h / 2, l, h, h / 2);
    ctx.fill();
    if (meilleur) { ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#8a5a00'; ctx.stroke(); }
    ctx.fillStyle = meilleur ? '#3a2600' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(textePastille, cx, cy + dpr);
  }

  let s0 = null;
  function dessinerChoix(s) {
    const z = Z();
    // les cases proposées, avec la beauté qu'elles rapportent
    if (s.propositions) {
      const { n, gains, meilleur } = s.propositions;
      for (const [k, g] of gains) {
        if (s.fantome && s.fantome.cle === k) continue;
        const r = contourCase(n, k, 'rgba(255, 255, 255, .95)', 2.5, [6, 5], 'rgba(255, 255, 255, .16)');
        if (g !== null) badge(signe(g), r.x0 + r.l / 2, r.y0 + r.h / 2, g === meilleur && g > 0);
      }
    }
    // la case choisie : un contour blanc qui respire
    if (s.selection) {
      const a = s.reduit ? 1 : 0.65 + 0.35 * Math.sin(s.temps * 5);
      contourCase(s.selection.n, s.selection.cle, `rgba(255, 255, 255, ${a})`, 3.5);
    }
    // le bâtiment qu'on pose (ou qu'on déplace)
    if (s.fantome) {
      const f = s.fantome, ile = s.E.iles[f.n], { ox, oy } = origine(ile, f.n), [x, y] = coord(f.cle);
      contourCase(f.n, f.cle, f.valide ? '#7bd93d' : '#ff5a4f', 3.5, null, f.valide ? 'rgba(123, 217, 61, .35)' : 'rgba(255, 90, 79, .35)');
      const flotte = s.reduit ? 0 : -0.06 - Math.abs(Math.sin(s.temps * 3)) * 0.06;
      caseMonde(f.image, ox + x, oy + y, 1, 0.88, flotte);
      if (f.valide && f.gain !== null && f.gain !== undefined) {
        const cx = (X(ox + x) + X(ox + x + 1)) / 2;
        badge(f.gain ? `${signe(f.gain)} beauté` : 'même beauté', cx, Y(oy + y + 1), f.gain > 0);
      }
    }
    // les panneaux pour agrandir l'île
    if (s.agrandir !== null && s.agrandir !== undefined) {
      const n = s.agrandir, ile = s.E.iles[n];
      for (const p of panneauxAgrandir(ile, n)) {
        if (obstacleAgrandir(ile, p.dir)) continue;
        cibles.push({ genre: 'panneau', n, dir: p.dir, ...panneau(p, coutAgrandir(ile, p.dir), s) });
      }
    }
    // la flèche du guide
    if (s.guide) {
      const g = s.guide, ile = s.E.iles[g.n], { ox, oy } = origine(ile, g.n), [x, y] = coord(g.cle);
      const cx = (X(ox + x) + X(ox + x + 1)) / 2, haut = Y(oy + y);
      const saut = s.reduit ? 0 : Math.abs(Math.sin(s.temps * 4)) * z * 0.22;
      contourCase(g.n, g.cle, '#ffd23f', 3.5, [8, 6]);
      fleche(cx, haut - z * 0.15 - saut, Math.max(26 * dpr, z * 0.55));
    }
  }
  function fleche(cx, pointe, t) {
    ctx.beginPath();
    ctx.moveTo(cx, pointe);
    ctx.lineTo(cx - t * 0.45, pointe - t * 0.5);
    ctx.lineTo(cx - t * 0.18, pointe - t * 0.5);
    ctx.lineTo(cx - t * 0.18, pointe - t);
    ctx.lineTo(cx + t * 0.18, pointe - t);
    ctx.lineTo(cx + t * 0.18, pointe - t * 0.5);
    ctx.lineTo(cx + t * 0.45, pointe - t * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = Math.max(2, t * 0.08);
    ctx.strokeStyle = '#7a4a00';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  function panneau(p, cout, s) {
    const z = Z(), cx = ((p.x - cam.x) * cam.z + cam.l / 2) * dpr, cy = ((p.y - cam.y) * cam.z + cam.h / 2) * dpr;
    const l = Math.max(58 * dpr, z * 1.3), h = Math.max(42 * dpr, z * 0.86);
    const saut = s.reduit ? 0 : Math.sin(s.temps * 3 + p.x) * z * 0.04;
    const y = cy - h / 2 + saut;
    // piquet
    ctx.fillStyle = '#714114';
    ctx.fillRect(cx - z * 0.06, y + h - 2, z * 0.12, z * 0.35);
    ctx.fillStyle = 'rgba(0, 0, 0, .22)';
    rondRect(cx - l / 2, y + 4 * dpr, l, h, h * 0.2);
    ctx.fill();
    ctx.fillStyle = '#c8772c';
    rondRect(cx - l / 2, y, l, h, h * 0.2);
    ctx.fill();
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = '#593411';
    ctx.stroke();
    // flèche dans la direction
    const ang = { nord: -Math.PI / 2, sud: Math.PI / 2, ouest: Math.PI, est: 0 }[p.dir];
    ctx.save();
    ctx.translate(cx, y + h * 0.36);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    const a = h * 0.26;
    ctx.beginPath();
    ctx.moveTo(a, 0); ctx.lineTo(0, -a * 0.8); ctx.lineTo(0, -a * 0.35); ctx.lineTo(-a, -a * 0.35);
    ctx.lineTo(-a, a * 0.35); ctx.lineTo(0, a * 0.35); ctx.lineTo(0, a * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = '#593411';
    ctx.stroke();
    ctx.restore();
    const prix = [cout.etoiles ? `${cout.etoiles}★` : '', cout.pierre ? `${cout.pierre} pierre` : ''].filter(Boolean).join(' · ');
    texte(prix, cx, y + h * 0.78, Math.min(h * 0.3, taillePolice(0.24, 13)));
    return rectCss(cx - l / 2, y, cx + l / 2, y + h);
  }

  // ---------- Effets : textes qui s'envolent, particules ----------

  function dessinerEffets(s) {
    const z = Z();
    effets.particules = effets.particules.filter((p) => s.temps - p.debut < p.vie);
    for (const p of effets.particules) {
      const age = s.temps - p.debut, q = age / p.vie;
      const wx = p.x + p.vx * age, wy = p.y + p.vy * age + p.g * age * age;
      const x = ((wx - cam.x) * cam.z + cam.l / 2) * dpr, y = ((wy - cam.y) * cam.z + cam.h / 2) * dpr;
      ctx.globalAlpha = 1 - q * q;
      ctx.fillStyle = p.couleur;
      if (p.forme === 'etoile') etincelle(x, y, p.taille * z, age * 8);
      else { ctx.beginPath(); ctx.arc(x, y, p.taille * z * (p.grandit ? 0.6 + q : 1), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    effets.textes = effets.textes.filter((t) => s.temps - t.debut < 1.6);
    for (const t of effets.textes) {
      const q = (s.temps - t.debut) / 1.6;
      const x = ((t.x - cam.x) * cam.z + cam.l / 2) * dpr, y = ((t.y - q * 1.1 - cam.y) * cam.z + cam.h / 2) * dpr;
      ctx.globalAlpha = q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25;
      texte(t.texte, x, y, taillePolice(0.34, 17), { couleur: t.couleur });
      ctx.globalAlpha = 1;
    }
  }

  /** L'ombre de grands nuages qui passent lentement : le monde respire. */
  function ombresNuages(temps, rects) {
    const x0 = Math.min(...rects.map((r) => r.x0)) - 12, x1 = Math.max(...rects.map((r) => r.x1)) + 12;
    const y0 = Math.min(...rects.map((r) => r.y0)), y1 = Math.max(...rects.map((r) => r.y1));
    const z = Z();
    for (let i = 0; i < 3; i++) {
      const largeur = x1 - x0, wx = x0 + ((temps * 0.12 + i * largeur / 3 + i * 7.3) % largeur);
      const wy = y0 + ((i * 0.37 + 0.2) % 1) * (y1 - y0) + Math.sin(temps * 0.05 + i) * 1.5;
      const cx = ((wx - cam.x) * cam.z + cam.l / 2) * dpr, cy = ((wy - cam.y) * cam.z + cam.h / 2) * dpr;
      const r = z * (3.2 + i * 0.8);
      if (cx < -r || cy < -r || cx > toile.width + r || cy > toile.height + r) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1.5, 0.8); // une ombre allongée
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(10, 30, 60, .13)');
      g.addColorStop(0.6, 'rgba(10, 30, 60, .07)');
      g.addColorStop(1, 'rgba(10, 30, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- Une image complète ----------

  /**
   * @param s { E, cam, t (heure), temps (secondes, pour les animations), ouvertes, vie, reduit,
   *            selection {n, cle}, propositions {n, gains: Map, meilleur}, fantome {n, cle, image, valide, gain},
   *            deplacement {n, de}, agrandir (n | null), guide {n, cle} }
   */
  function dessiner(s) {
    s0 = s;
    cam = s.cam;
    cibles = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const rects = s.E.iles.map((ile, n) => rectIle(ile, n));
    dessinerMer(s.reduit ? 0 : s.temps, rects);
    s.E.iles.forEach((_, n) => dessinerIle(s, n, n < s.ouvertes));
    dessinerEtres(s);
    dessinerDessus(s);
    dessinerChoix(s);
    dessinerEffets(s);
    if (!s.reduit) ombresNuages(s.temps, rects);
    for (let n = s.ouvertes; n < s.E.iles.length; n++) dessinerNuages(s, n);
    for (const [n, debut] of effets.devoiles) { if (s.temps - debut < 2.2) dessinerNuages(s, n); else effets.devoiles.delete(n); }
  }

  return {
    pret,
    dimensionner,
    dessiner,
    get cibles() { return cibles; },
    /** Fait « sauter » une case : 'pose', 'fini', 'retire', 'terre', 'choisi'. */
    pop(n, k, genre, temps, delai = 0) { effets.pops.set(`${n}:${k}`, { genre, debut: temps + delai }); },
    texte(x, y, t, temps, couleur = '#ffffff') { effets.textes.push({ x, y, texte: t, debut: temps, couleur }); },
    /** Une gerbe de particules au centre d'une case (coordonnées du monde). */
    gerbe(x, y, genre, temps) {
      const presets = {
        poussiere: { n: 14, couleurs: ['#e8d8b8', '#c9b48c', '#ffffff'], v: 1.2, g: -0.2, taille: 0.09, vie: 0.9, grandit: true },
        feuilles: { n: 12, couleurs: ['#3fa34d', '#7bd93d', '#2a6e2a'], v: 1.6, g: 1.4, taille: 0.06, vie: 1 },
        cailloux: { n: 10, couleurs: ['#8a8f86', '#b7bcae', '#6f7468'], v: 1.6, g: 2.2, taille: 0.06, vie: 0.8 },
        eau: { n: 16, couleurs: ['#ffffff', '#a9c8ff', '#dbe8ff'], v: 1.8, g: 2.4, taille: 0.06, vie: 0.8 },
        etoiles: { n: 10, couleurs: ['#ffe066', '#fff3b0'], v: 1.4, g: 0.4, taille: 0.16, vie: 1.1, forme: 'etoile' },
        confettis: { n: 30, couleurs: ['#ff5a4f', '#ffd23f', '#7bd93d', '#4fa3ff', '#d36bff'], v: 2.6, g: 2.4, taille: 0.06, vie: 1.6 },
      };
      const p = presets[genre];
      for (let i = 0; i < p.n; i++) {
        const ang = Math.random() * Math.PI * 2, v = p.v * (0.4 + Math.random() * 0.6);
        effets.particules.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - p.v * 0.6, g: p.g, couleur: p.couleurs[i % p.couleurs.length], taille: p.taille * (0.6 + Math.random() * 0.8), vie: p.vie * (0.7 + Math.random() * 0.5), debut: temps, forme: p.forme, grandit: p.grandit });
      }
    },
    /** Les nuages d'une île nouvellement découverte s'écartent. */
    devoiler(n, temps) { effets.devoiles.set(n, temps); },
  };
}
