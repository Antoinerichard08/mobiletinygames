// Dessin « bonbons » du jeu de bulles, sur canvas : bonbons à spirales et à rayures, brillants.
// Chaque bonbon est dessiné une seule fois dans un petit canvas (cache), puis recopié : c'est rapide même
// sur un vieux téléphone. Un symbole par couleur (cœur, losange, triangle, étoile, rond, carré) aide à les distinguer.

export const PALETTE = [
  { nom: 'fraise', base: '#F2304A', clair: '#FF8A98', fonce: '#9A0C26', raie: '#FF8496', motif: 'rayures', symbole: 'coeur' },
  { nom: 'myrtille', base: '#2585F2', clair: '#8CCBFF', fonce: '#0E3E9E', raie: '#62C0FF', motif: 'spirale', symbole: 'losange' },
  { nom: 'pomme', base: '#3BBF26', clair: '#A6F06A', fonce: '#1A6E0E', raie: '#D6F248', motif: 'spirale', symbole: 'triangle' },
  { nom: 'citron', base: '#FFBE12', clair: '#FFE98A', fonce: '#C27400', raie: '#FF8417', motif: 'rayures', symbole: 'etoile' },
  { nom: 'raisin', base: '#9C3EEA', clair: '#DDA6FF', fonce: '#521694', raie: '#EE6FE2', motif: 'spirale', symbole: 'rond' },
  { nom: 'orange', base: '#FF7414', clair: '#FFC07A', fonce: '#A83E00', raie: '#FFD02E', motif: 'tourbillon', symbole: 'carre' },
];

const cache = new Map();
let avecSymboles = true;
export const reglerSymboles = (oui) => { avecSymboles = oui; cache.clear(); };
export const symbolesActifs = () => avecSymboles;

function nouveauCanvas(taille) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(taille, taille) : Object.assign(document.createElement('canvas'), { width: taille, height: taille });
  return c;
}

function symbole(ctx, nom, x, y, s, couleur) {
  ctx.beginPath();
  switch (nom) {
    case 'coeur':
      ctx.moveTo(x, y + s * 0.9);
      ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
      ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
      break;
    case 'losange': ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.75, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.75, y); break;
    case 'triangle': ctx.moveTo(x, y - s * 0.95); ctx.lineTo(x + s * 0.95, y + s * 0.7); ctx.lineTo(x - s * 0.95, y + s * 0.7); break;
    case 'etoile':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.45 : s;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      break;
    case 'rond': ctx.arc(x, y, s * 0.7, 0, Math.PI * 2); ctx.moveTo(x + s * 0.32, y); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2, true); break;
    default: ctx.rect(x - s * 0.65, y - s * 0.65, s * 1.3, s * 1.3);
  }
  ctx.closePath();
  ctx.fillStyle = couleur;
  ctx.fill('evenodd');
}

/** Le corps d'un bonbon (sphère, motif, reliefs), centré dans un carré de côté 2r. */
function bonbon(ctx, r, p, cx = r, cy = r) {
  ctx.save();
  // sphère de base
  let g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r);
  g.addColorStop(0, p.clair);
  g.addColorStop(0.5, p.base);
  g.addColorStop(1, p.fonce);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.97, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // motif : rayures diagonales bombées, spirale ou tourbillon
  ctx.fillStyle = p.raie;
  ctx.strokeStyle = p.raie;
  ctx.globalAlpha = 0.85;
  if (p.motif === 'rayures') {
    ctx.translate(cx, cy);
    ctx.rotate(-0.7);
    for (let i = -3; i <= 3; i++) {
      const x = i * r * 0.62, l = r * 0.15;
      ctx.beginPath();
      ctx.moveTo(x - l, -r * 1.2);
      ctx.quadraticCurveTo(x - l + r * 0.35, 0, x - l, r * 1.2);
      ctx.lineTo(x + l, r * 1.2);
      ctx.quadraticCurveTo(x + l + r * 0.35, 0, x + l, -r * 1.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    const bras = p.motif === 'tourbillon' ? 5 : 3, tours = p.motif === 'tourbillon' ? 1.6 : 2.3;
    ctx.lineCap = 'round';
    for (let b = 0; b < bras; b++) {
      const a0 = (b / bras) * Math.PI * 2;
      let px = cx, py = cy;
      for (let t = 0.02; t <= 1.05; t += 0.02) {
        const a = a0 + t * tours * Math.PI, rr = t * r * 1.05;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        ctx.lineWidth = r * (0.05 + t * 0.22);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
        px = x; py = y;
      }
    }
  }
  ctx.globalAlpha = 1;
  // relief : bords plus sombres, reflet en haut à gauche
  g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.3, cx, cy, r * 1.02);
  g.addColorStop(0, 'rgba(255, 255, 255, 0)');
  g.addColorStop(0.75, 'rgba(0, 0, 0, .08)');
  g.addColorStop(1, 'rgba(0, 0, 0, .35)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.33, cy - r * 0.45, r * 0.36, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, .7)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + r * 0.42, cy + r * 0.4, r * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, .5)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.97, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(60, 10, 60, .35)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
}

function pastilleSymbole(ctx, r, p) {
  if (!avecSymboles) return;
  // un petit symbole blanc cerclé de la couleur foncée : lisible sans cacher le bonbon
  symbole(ctx, p.symbole, r, r + r * 0.06, r * 0.27, '#FFFFFF');
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = p.fonce;
  ctx.stroke();
}

export function dessinerPoussin(ctx, x, y, r, battement = 0) {
  ctx.fillStyle = '#F2B705';
  for (const sens of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + sens * r * 0.55, y + r * 0.15, r * 0.22, r * (0.32 + battement * 0.15), sens * (0.6 + battement), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = '#FFD84A';
  ctx.fill();
  ctx.strokeStyle = '#C98A00';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#2A1D0D';
  for (const sens of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sens * r * 0.2, y - r * 0.1, r * 0.08, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath();
  ctx.moveTo(x - r * 0.12, y + r * 0.05); ctx.lineTo(x + r * 0.12, y + r * 0.05); ctx.lineTo(x, y + r * 0.25); ctx.closePath();
  ctx.fillStyle = '#F28C28';
  ctx.fill();
}

/** Dessine une bulle « fixe » dans un canvas de cache. */
function fabriquer(b, taille) {
  const can = nouveauCanvas(taille), ctx = can.getContext('2d'), r = taille / 2;
  if (b.type === 'pierre') {
    bonbon(ctx, r, { base: '#9A97A8', clair: '#E4E1EE', fonce: '#55526A', raie: '#C9C5D9', motif: 'rayures' });
    ctx.strokeStyle = 'rgba(40, 36, 60, .5)';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.moveTo(r * 0.5, r * 0.85); ctx.lineTo(r * 0.95, r * 1.15); ctx.lineTo(r * 1.2, r * 0.6);
    ctx.moveTo(r * 0.95, r * 1.15); ctx.lineTo(r * 1.1, r * 1.6);
    ctx.stroke();
    return can;
  }
  if (b.type === 'eclair') {
    bonbon(ctx, r, { base: '#2B3FC7', clair: '#8EA2FF', fonce: '#141C66', raie: '#5D73F0', motif: 'tourbillon' });
    ctx.beginPath();
    const z = r;
    ctx.moveTo(z + z * 0.15, z - z * 0.7); ctx.lineTo(z - z * 0.35, z + z * 0.1); ctx.lineTo(z, z + z * 0.1);
    ctx.lineTo(z - z * 0.15, z + z * 0.7); ctx.lineTo(z + z * 0.35, z - z * 0.1); ctx.lineTo(z, z - z * 0.1); ctx.closePath();
    ctx.fillStyle = '#FFE14D';
    ctx.fill();
    ctx.strokeStyle = '#B27A00';
    ctx.lineWidth = r * 0.06;
    ctx.stroke();
    return can;
  }
  if (b.mystere) {
    bonbon(ctx, r, { base: '#6E5A8C', clair: '#C7B6E6', fonce: '#3A2B55', raie: '#8D79AD', motif: 'spirale' });
    ctx.font = `700 ${r * 1.1}px "Atkinson Hyperlegible", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('?', r, r * 1.08);
    return can;
  }
  const p = PALETTE[b.k] || PALETTE[0];
  if (b.k2 !== undefined) {
    // bicolore : une moitié de chaque couleur, séparées par un trait de sucre
    const p2 = PALETTE[b.k2] || PALETTE[1];
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(taille, 0); ctx.lineTo(0, taille); ctx.closePath(); ctx.clip();
    bonbon(ctx, r, p); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.moveTo(taille, 0); ctx.lineTo(taille, taille); ctx.lineTo(0, taille); ctx.closePath(); ctx.clip();
    bonbon(ctx, r, p2); ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(r, r, r * 0.95, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.12;
    ctx.beginPath(); ctx.moveTo(taille, 0); ctx.lineTo(0, taille); ctx.stroke();
    ctx.restore();
    if (avecSymboles) {
      symbole(ctx, p.symbole, r * 0.62, r * 0.62, r * 0.2, '#fff');
      symbole(ctx, p2.symbole, r * 1.38, r * 1.38, r * 0.2, '#fff');
    }
    return can;
  }
  bonbon(ctx, r, p);
  if (b.poussin) dessinerPoussin(ctx, r, r * 1.04, r * 0.82);
  else pastilleSymbole(ctx, r, p);
  if (b.plus) {
    ctx.beginPath();
    ctx.arc(r * 1.45, r * 1.45, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#21B04B';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.08;
    ctx.stroke();
    ctx.font = `700 ${r * 0.5}px "Atkinson Hyperlegible", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(`+${b.plus}`, r * 1.45, r * 1.48);
  }
  if (b.glace) {
    ctx.beginPath();
    ctx.arc(r, r, r * 0.97, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(205, 240, 255, .6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, .95)';
    ctx.lineWidth = r * 0.09;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.5, r * 0.7); ctx.lineTo(r * 0.9, r * 0.4);
    ctx.moveTo(r * 1.15, r * 1.55); ctx.lineTo(r * 1.55, r * 1.2);
    ctx.stroke();
  }
  return can;
}

const cle = (b, taille) => `${b.type}|${b.k}|${b.k2}|${b.glace ? 1 : 0}|${b.mystere ? 1 : 0}|${b.poussin ? 1 : 0}|${b.plus || 0}|${taille}`;

/**
 * Dessine une bulle (du plateau ou tirée), centrée en (x, y), de rayon r (pixels à l'écran).
 * @param {number} t  temps (ms) pour les petites animations (mèche, étoile, feu, arc-en-ciel)
 */
export function dessinerBulle(ctx, x, y, r, b, t = 0, dpr = 1) {
  // bulles animées : dessinées en direct
  if (b.tir === 'arc' || b.type === 'etoile') {
    ctx.save();
    const g = ctx.createConicGradient ? ctx.createConicGradient(t / 500, x, y) : null;
    if (g) { PALETTE.forEach((p, i) => g.addColorStop(i / PALETTE.length, p.base)); g.addColorStop(1, PALETTE[0].base); }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.97, 0, Math.PI * 2);
    ctx.fillStyle = g || PALETTE[3].base;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - r * 0.33, y - r * 0.45, r * 0.36, r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, .65)';
    ctx.fill();
    if (b.type === 'etoile') {
      const s = r * (0.55 + 0.05 * Math.sin(t / 200));
      symbole(ctx, 'etoile', x, y + r * 0.05, s, '#FFF6C2');
      ctx.strokeStyle = '#C98A00';
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (b.tir === 'feu') {
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t / 120, l = r * (1.05 + 0.2 * Math.sin(t / 60 + i));
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a - 0.35) * r * 0.7, y + Math.sin(a - 0.35) * r * 0.7);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.lineTo(x + Math.cos(a + 0.35) * r * 0.7, y + Math.sin(a + 0.35) * r * 0.7);
      ctx.fillStyle = '#FF8A1F';
      ctx.fill();
    }
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
    g.addColorStop(0, '#FFF7B0'); g.addColorStop(0.5, '#FFB21F'); g.addColorStop(1, '#E2321A');
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    return;
  }
  if (b.tir === 'bombe' || b.type === 'bombe') {
    ctx.save();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#8C7FBF'); g.addColorStop(0.55, '#3A2E66'); g.addColorStop(1, '#16102E');
    ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - r * 0.33, y - r * 0.42, r * 0.3, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, .5)'; ctx.fill();
    ctx.strokeStyle = '#E8C48A';
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.35, y - r * 0.7);
    ctx.quadraticCurveTo(x + r * 0.7, y - r * 1.05, x + r * 0.55, y - r * 1.25);
    ctx.stroke();
    const scintille = 0.6 + 0.4 * Math.sin(t / 90);
    ctx.beginPath();
    ctx.arc(x + r * 0.55, y - r * 1.25, r * 0.22 * scintille, 0, Math.PI * 2);
    ctx.fillStyle = '#FFE14D';
    ctx.fill();
    ctx.restore();
    return;
  }
  // bulles fixes : recopiées depuis le cache
  const taille = Math.max(8, Math.round(r * 2 * dpr));
  const k = cle(b, taille);
  let img = cache.get(k);
  if (!img) {
    img = fabriquer(b, taille);
    if (cache.size > 400) cache.clear();
    cache.set(k, img);
  }
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
}

/** Fond du plateau : dégradé violet-rose, reflets en diagonale et petites étincelles (dessiné une fois). */
export function fabriquerFond(largeur, hauteur, dpr) {
  const can = nouveauCanvas(1);
  can.width = Math.round(largeur * dpr);
  can.height = Math.round(hauteur * dpr);
  const ctx = can.getContext('2d');
  ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, largeur * 0.4, hauteur);
  g.addColorStop(0, '#4A2BA8');
  g.addColorStop(0.55, '#9B4FD6');
  g.addColorStop(1, '#F08BD8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, largeur, hauteur);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#fff';
  for (let i = -2; i < 6; i++) {
    ctx.beginPath();
    const x = i * largeur * 0.28;
    ctx.moveTo(x, 0); ctx.lineTo(x + largeur * 0.08, 0); ctx.lineTo(x + largeur * 0.08 + hauteur * 0.5, hauteur); ctx.lineTo(x + hauteur * 0.5, hauteur);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 26; i++) {
    const x = ((i * 97) % 100) / 100 * largeur, y = ((i * 61) % 100) / 100 * hauteur, s = 1.2 + (i % 3);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + (i % 4) * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.6, y - s * 0.6); ctx.lineTo(x + s * 2, y); ctx.lineTo(x + s * 0.6, y + s * 0.6);
    ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.6, y + s * 0.6); ctx.lineTo(x - s * 2, y); ctx.lineTo(x - s * 0.6, y - s * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  return can;
}
