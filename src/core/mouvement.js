// Animations communes. Principe « FLIP » : on note où sont les éléments, on redessine, puis on anime
// chaque élément depuis son ancienne place vers la nouvelle. Ainsi rien ne se téléporte.
// Tout respecte prefers-reduced-motion : les animations deviennent instantanées.

const requete = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const mouvementReduit = () => Boolean(requete && requete.matches);

export const attendre = (ms) => new Promise((r) => setTimeout(r, mouvementReduit() ? 0 : ms));

export const COURBE_DOUCE = 'cubic-bezier(.2, .8, .2, 1)'; // départ vif, arrivée en douceur
export const COURBE_REBOND = 'cubic-bezier(.34, 1.56, .64, 1)'; // léger dépassement

/** Lance une animation Web Animations et renvoie une promesse (immédiate si mouvements réduits). */
export function animer(el, images, options = {}) {
  if (!el || mouvementReduit() || typeof el.animate !== 'function') return Promise.resolve();
  const a = el.animate(images, { duration: 300, easing: COURBE_DOUCE, fill: 'none', ...options });
  return a.finished.catch(() => {});
}

/** Positions actuelles des éléments qui portent l'attribut data-cle, dans le conteneur. */
export function noterPositions(conteneur, selecteur = '[data-cle]') {
  const pos = new Map();
  if (!conteneur) return pos;
  for (const el of conteneur.querySelectorAll(selecteur)) pos.set(el.dataset.cle, el.getBoundingClientRect());
  return pos;
}

/**
 * Anime les éléments redessinés depuis leurs anciennes positions.
 * @param {Map} avant  résultat de noterPositions() avant le nouveau rendu
 * @param {object} o   { duree, decalage (ms entre deux éléments), ordre: (cle) => rang, auDebut: Set de clés nouvelles }
 */
export function animerDepuis(conteneur, avant, { duree = 320, decalage = 0, ordre = null, selecteur = '[data-cle]' } = {}) {
  if (!conteneur || mouvementReduit()) return Promise.resolve();
  const promesses = [];
  const bouges = [];
  for (const el of conteneur.querySelectorAll(selecteur)) {
    const ancien = avant.get(el.dataset.cle);
    if (!ancien) continue;
    const nouveau = el.getBoundingClientRect();
    const dx = ancien.left - nouveau.left, dy = ancien.top - nouveau.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    bouges.push({ el, dx, dy, rang: ordre ? ordre(el.dataset.cle) : 0 });
  }
  bouges.sort((a, b) => a.rang - b.rang);
  bouges.forEach(({ el, dx, dy }, n) => {
    el.style.zIndex = String(50 + n); // ce qui bouge passe au-dessus du reste pendant le trajet
    const distance = Math.hypot(dx, dy);
    const p = animer(el, [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: 'translate(0, 0)' },
    ], { duration: Math.min(duree + distance * 0.25, duree * 1.8), delay: n * decalage, fill: 'backwards' })
      .then(() => { el.style.zIndex = ''; });
    promesses.push(p);
  });
  return Promise.all(promesses);
}

/** Petit « pop » pour attirer l'œil sur un élément (chiffre posé, bouton actif…). */
export function pop(el, echelle = 1.18) {
  return animer(el, [{ transform: 'scale(1)' }, { transform: `scale(${echelle})` }, { transform: 'scale(1)' }], {
    duration: 260,
    easing: 'ease-out',
  });
}

/** Secousse horizontale douce pour dire « pas possible ». */
export function secouer(el) {
  return animer(el, [
    { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' },
    { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' },
  ], { duration: 320, easing: 'ease-in-out' });
}

/** Fait apparaître un élément (fondu + léger glissement vers le haut). */
export function apparaitre(el, { delai = 0, distance = 12 } = {}) {
  return animer(el, [
    { opacity: 0, transform: `translateY(${distance}px)` },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 360, delay: delai, fill: 'backwards' });
}
