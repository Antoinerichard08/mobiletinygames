// Dessin des bulles sur le canvas : couleurs vives, reflet, et un symbole par couleur
// (cœur, losange, triangle, étoile, rond, carré) pour les distinguer même sans bien voir les couleurs.

export const PALETTE = [
  { nom: 'rouge', base: '#E8504F', clair: '#FF9C8F', fonce: '#A82A2E', symbole: 'coeur' },
  { nom: 'bleue', base: '#3B82F6', clair: '#9CC4FF', fonce: '#1E4FB0', symbole: 'losange' },
  { nom: 'verte', base: '#2DBB64', clair: '#8DEBB0', fonce: '#16753A', symbole: 'triangle' },
  { nom: 'jaune', base: '#F5C531', clair: '#FFE9A0', fonce: '#B98A06', symbole: 'etoile' },
  { nom: 'violette', base: '#9B5DE5', clair: '#D3B4FF', fonce: '#5E2CA5', symbole: 'rond' },
  { nom: 'orange', base: '#F28C28', clair: '#FFC48A', fonce: '#B05A0A', symbole: 'carre' },
];

function symbole(ctx, nom, x, y, r) {
  ctx.beginPath();
  const s = r * 0.42;
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
    case 'rond': ctx.arc(x, y, s * 0.62, 0, Math.PI * 2); ctx.moveTo(x + s * 0.3, y); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2, true); break;
    default: ctx.rect(x - s * 0.62, y - s * 0.62, s * 1.24, s * 1.24);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, .62)';
  ctx.fill('evenodd');
}

function boule(ctx, x, y, r, base, clair, fonce) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, clair);
  g.addColorStop(0.55, base);
  g.addColorStop(1, fonce);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.96, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // reflet
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.42, r * 0.32, r * 0.18, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, .55)';
  ctx.fill();
}

export function dessinerPoussin(ctx, x, y, r, battement = 0) {
  // ailes
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
  ctx.fillStyle = '#2A1D0D';
  for (const sens of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sens * r * 0.2, y - r * 0.1, r * 0.08, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath();
  ctx.moveTo(x - r * 0.12, y + r * 0.05); ctx.lineTo(x + r * 0.12, y + r * 0.05); ctx.lineTo(x, y + r * 0.25); ctx.closePath();
  ctx.fillStyle = '#F28C28';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.33, y + r * 0.08, r * 0.09, 0, Math.PI * 2);
  ctx.arc(x + r * 0.33, y + r * 0.08, r * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(242, 120, 120, .5)';
  ctx.fill();
}

/**
 * Dessine une bulle (du plateau ou tirée).
 * @param {object} b  { type, k, glace, poussin } ou { tir: 'bombe' | 'arc' }
 * @param {number} t  temps (ms) pour les petites animations (mèche, arc-en-ciel)
 */
export function dessinerBulle(ctx, x, y, r, b, t = 0) {
  ctx.save();
  if (b.tir === 'arc') {
    const g = ctx.createConicGradient ? ctx.createConicGradient(t / 600, x, y) : null;
    if (g) PALETTE.forEach((p, i) => g.addColorStop(i / PALETTE.length, p.base));
    if (g) g.addColorStop(1, PALETTE[0].base);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.96, 0, Math.PI * 2);
    ctx.fillStyle = g || PALETTE[3].base;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - r * 0.32, y - r * 0.42, r * 0.32, r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, .6)';
    ctx.fill();
    ctx.restore();
    return;
  }
  if (b.tir === 'bombe' || b.type === 'bombe') {
    boule(ctx, x, y, r, '#34405A', '#7D8BA8', '#141A26');
    ctx.strokeStyle = '#C8A06B';
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.35, y - r * 0.7);
    ctx.quadraticCurveTo(x + r * 0.7, y - r * 1.05, x + r * 0.55, y - r * 1.25);
    ctx.stroke();
    const scintille = 0.6 + 0.4 * Math.sin(t / 90);
    ctx.beginPath();
    ctx.arc(x + r * 0.55, y - r * 1.25, r * 0.2 * scintille, 0, Math.PI * 2);
    ctx.fillStyle = '#FFB020';
    ctx.fill();
    ctx.restore();
    return;
  }
  if (b.type === 'pierre') {
    boule(ctx, x, y, r, '#8E9188', '#C9CCC2', '#55584F');
    ctx.strokeStyle = 'rgba(40, 40, 36, .55)';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y - r * 0.1); ctx.lineTo(x - r * 0.05, y + r * 0.15); ctx.lineTo(x + r * 0.2, y - r * 0.4);
    ctx.moveTo(x - r * 0.05, y + r * 0.15); ctx.lineTo(x + r * 0.1, y + r * 0.6);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const p = PALETTE[b.k] || PALETTE[0];
  boule(ctx, x, y, r, p.base, p.clair, p.fonce);
  if (b.poussin) {
    dessinerPoussin(ctx, x, y + r * 0.05, r * 0.85);
  } else symbole(ctx, p.symbole, x, y + r * 0.05, r);
  if (b.glace) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(205, 240, 255, .62)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, .9)';
    ctx.lineWidth = r * 0.09;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y - r * 0.3); ctx.lineTo(x - r * 0.1, y - r * 0.6);
    ctx.moveTo(x + r * 0.15, y + r * 0.55); ctx.lineTo(x + r * 0.55, y + r * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}
