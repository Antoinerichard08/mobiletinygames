// Les gestes sur le monde de l'île : toucher, glisser (avec élan), pincer pour zoomer, molette.
// `versScene` convertit les coordonnées de l'écran en coordonnées de la scène (qui peut être tournée d'un quart de tour).

const SEUIL = 10; // pixels avant qu'un toucher devienne un glissé

/**
 * @param {HTMLElement} el
 * @param {(cx, cy) => {x, y}} versScene
 * @param {object} r  rappels : toucher(p), debutGlisse(p) → 'objet' | 'camera', glisse(p, dx, dy), finGlisse(vx, vy),
 *                    pince(centre, facteur), molette(p, facteur)
 */
export function suivreGestes(el, versScene, r) {
  const doigts = new Map();
  let glisse = null; // { genre, depart, dernier, vitesse }
  let pince = null; // { distance, centre }
  let historique = [];

  const centre = () => {
    const [a, b] = [...doigts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { el.setPointerCapture?.(e.pointerId); } catch { /* pointeur inconnu : on suit quand même */ }
    const p = versScene(e.clientX, e.clientY);
    doigts.set(e.pointerId, p);
    if (doigts.size === 1) {
      glisse = { genre: null, depart: p, dernier: p, temps: performance.now() };
      historique = [{ ...p, t: performance.now() }];
    } else if (doigts.size === 2) {
      if (glisse?.genre === 'objet') r.finGlisse(0, 0);
      glisse = null;
      const c = centre();
      pince = { distance: c.d, centre: c };
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!doigts.has(e.pointerId)) return;
    const p = versScene(e.clientX, e.clientY);
    doigts.set(e.pointerId, p);
    if (pince && doigts.size >= 2) {
      const c = centre();
      if (pince.distance > 0) r.pince(c, c.d / pince.distance, c.x - pince.centre.x, c.y - pince.centre.y);
      pince = { distance: c.d, centre: c };
      return;
    }
    if (!glisse) return;
    if (!glisse.genre) {
      if (Math.hypot(p.x - glisse.depart.x, p.y - glisse.depart.y) < SEUIL) return;
      glisse.genre = r.debutGlisse(glisse.depart) || 'camera';
    }
    r.glisse(p, p.x - glisse.dernier.x, p.y - glisse.dernier.y, glisse.genre);
    glisse.dernier = p;
    const t = performance.now();
    historique.push({ ...p, t });
    historique = historique.filter((h) => t - h.t < 120);
  });

  const fin = (e) => {
    if (!doigts.has(e.pointerId)) return;
    doigts.delete(e.pointerId);
    if (pince) {
      if (doigts.size < 2) pince = null;
      return;
    }
    if (!glisse) return;
    if (!glisse.genre && e.type === 'pointerup') r.toucher(glisse.depart);
    else if (glisse.genre) {
      const a = historique[0], b = historique[historique.length - 1];
      const dt = b && a ? (b.t - a.t) / 1000 : 0;
      r.finGlisse(dt > 0.01 ? (b.x - a.x) / dt : 0, dt > 0.01 ? (b.y - a.y) / dt : 0, glisse.genre);
    }
    glisse = null;
  };
  el.addEventListener('pointerup', fin);
  el.addEventListener('pointercancel', fin);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    r.molette(versScene(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
}
