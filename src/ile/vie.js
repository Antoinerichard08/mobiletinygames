// La vie sur l'île : villageois qui vont travailler, animaux, fumée des cheminées, mouettes.
// Purement décoratif : la production se calcule dans regles.js, avec l'heure.
// Les déplacements utilisent les Web Animations ; tout s'arrête si l'on demande moins d'animations,
// et se met en pause quand l'écran n'est pas visible.
import { mouvementReduit } from '../core/mouvement.js';
import { cle, coord, terrainDe, estTerre, habitants } from './regles.js';

const MAX_HABITANTS = 12;
const VITESSE = 0.0016; // cases par milliseconde (environ une case toutes les 0,6 s)
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const hasard = (a, b) => a + Math.random() * (b - a);
const choisir = (liste) => liste[Math.floor(Math.random() * liste.length)];

/**
 * @param {HTMLElement} couche  calque posé sur la grille de l'île
 * @param {() => { ile, ts, origine: {x0, y0} }} contexte  l'île affichée et la taille des cases
 */
export function creerVie(couche, contexte) {
  let actif = true;
  let jeton = 0; // change à chaque reconstruction : les anciennes boucles s'arrêtent d'elles-mêmes
  const minuteries = new Set();

  const centre = (x, y) => {
    const { ts, origine } = contexte();
    return { px: (x - origine.x0 + 1.5) * ts, py: (y - origine.y0 + 1.5) * ts };
  };

  async function pause() {
    while (actif && document.hidden) await attendre(1000);
  }

  /** Crée un personnage (sprite animé) dans le calque. */
  function creer(classe, variante, x, y) {
    const { ts } = contexte();
    const el = document.createElement('span');
    el.className = `etre ${classe}`;
    el.style.setProperty('--ts', `${ts}px`);
    el.style.setProperty('--v', variante);
    el.innerHTML = '<i></i>';
    const { px, py } = centre(x, y);
    el.style.transform = `translate(${px - ts / 2}px, ${py - ts / 2}px)`;
    el.dataset.x = x; el.dataset.y = y;
    el.style.zIndex = String(10 + y * 2);
    couche.append(el);
    return el;
  }

  /** Marche de case en case jusqu'à (x, y), en ligne brisée (d'abord en largeur, puis en hauteur). */
  async function marcher(el, x, y, mon) {
    const { ts } = contexte();
    let cx = Number(el.dataset.x), cy = Number(el.dataset.y);
    const etapes = [];
    while (cx !== x) { cx += Math.sign(x - cx); etapes.push([cx, cy]); }
    while (cy !== y) { cy += Math.sign(y - cy); etapes.push([cx, cy]); }
    el.classList.add('marche');
    for (const [nx, ny] of etapes) {
      if (!actif || mon !== jeton) return false;
      await pause();
      const de = centre(Number(el.dataset.x), Number(el.dataset.y)), vers = centre(nx, ny);
      el.classList.toggle('gauche', vers.px < de.px);
      const anim = el.animate([
        { transform: `translate(${de.px - ts / 2}px, ${de.py - ts / 2}px)` },
        { transform: `translate(${vers.px - ts / 2}px, ${vers.py - ts / 2}px)` },
      ], { duration: 1 / VITESSE, easing: 'linear', fill: 'forwards' });
      try { await anim.finished; } catch { return false; }
      el.style.transform = `translate(${vers.px - ts / 2}px, ${vers.py - ts / 2}px)`;
      anim.cancel();
      el.dataset.x = nx; el.dataset.y = ny;
      el.style.zIndex = String(10 + ny * 2);
    }
    el.classList.remove('marche');
    return true;
  }

  async function action(el, classe, ms, mon) {
    el.classList.add(classe);
    await attendre(ms);
    el.classList.remove(classe);
    return actif && mon === jeton;
  }

  // ---------- Ce que fait chaque villageois ----------

  function lieux() {
    const { ile } = contexte();
    const out = { terre: [], forets: [], chantiers: [], champs: [], maisons: [], cabanes: [] };
    for (let y = ile.ext.y0; y <= ile.ext.y1; y++) for (let x = ile.ext.x0; x <= ile.ext.x1; x++) {
      const c = ile.cases[cle(x, y)], t = terrainDe(ile, x, y);
      out.terre.push([x, y]);
      if (t === 'foret' && !c) out.forets.push([x, y]);
      if (c?.chantier || ile.travaux[cle(x, y)]) out.chantiers.push([x, y]);
      if (c && c.niveau > 0) {
        if (c.type === 'champ' || c.type === 'ferme') out.champs.push([x, y]);
        if (c.type === 'maison' || c.type === 'village' || c.type === 'hameau' || c.type === 'chateau') out.maisons.push([x, y]);
        if (c.type === 'hameau') out.cabanes.push([x, y]);
      }
    }
    return out;
  }
  const plusProche = (liste, x, y) => liste.reduce((m, p) => (!m || Math.abs(p[0] - x) + Math.abs(p[1] - y) < Math.abs(m[0] - x) + Math.abs(m[1] - y) ? p : m), null);
  /** Une case de terre à côté de (x, y), pour se tenir près d'un arbre ou d'un chantier. */
  function aCote(x, y) {
    const { ile } = contexte();
    const options = [[x - 1, y], [x + 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => estTerre(ile, a, b));
    return options.length ? choisir(options) : [x, y];
  }

  async function vivre(el, metier, mon) {
    await attendre(hasard(200, 2500));
    while (actif && mon === jeton) {
      await pause();
      const L = lieux();
      const x = Number(el.dataset.x), y = Number(el.dataset.y);
      let fait = false;
      if (L.chantiers.length && (metier === 'macon' || Math.random() < 0.25)) {
        const cible = plusProche(L.chantiers, x, y);
        if (await marcher(el, ...aCote(...cible), mon)) await action(el, 'travaille', hasard(3000, 6000), mon);
        fait = true;
      } else if (metier === 'bucheron' && L.forets.length) {
        const arbre = plusProche(L.forets, x, y);
        if (await marcher(el, ...aCote(...arbre), mon) && await action(el, 'travaille', hasard(2500, 4000), mon)) {
          el.classList.add('porte');
          const maison = plusProche(L.cabanes.length ? L.cabanes : L.maisons, x, y) || [x, y];
          await marcher(el, ...maison, mon);
          el.classList.remove('porte');
        }
        fait = true;
      } else if (metier === 'paysanne' && L.champs.length) {
        const champ = choisir(L.champs);
        if (await marcher(el, ...champ, mon)) await action(el, 'travaille', hasard(2500, 5000), mon);
        fait = true;
      }
      if (!fait) {
        const but = Math.random() < 0.4 && L.maisons.length ? choisir(L.maisons) : choisir(L.terre);
        await marcher(el, ...but, mon);
      }
      await attendre(hasard(800, 3000));
    }
  }

  async function brouter(el, centreX, centreY, mon) {
    while (actif && mon === jeton) {
      await pause();
      const [x, y] = aCote(centreX, centreY);
      await marcher(el, x, y, mon);
      await action(el, 'travaille', hasard(1500, 4000), mon);
    }
  }

  // ---------- Fumée et mouettes ----------

  function fumee(x, y, mon) {
    const tic = async () => {
      if (!actif || mon !== jeton) return;
      if (!document.hidden) {
        const { ts } = contexte();
        const { px, py } = centre(x, y);
        const f = document.createElement('span');
        f.className = 'fumee';
        f.style.left = `${px + ts * 0.18}px`;
        f.style.top = `${py - ts * 0.45}px`;
        couche.append(f);
        f.animate([
          { transform: 'translate(0, 0) scale(.5)', opacity: 0.8 },
          { transform: `translate(${hasard(-6, 6)}px, -${ts * 0.9}px) scale(1.6)`, opacity: 0 },
        ], { duration: 2600, easing: 'ease-out' }).finished.then(() => f.remove(), () => f.remove());
      }
      const m = setTimeout(tic, hasard(1800, 4200));
      minuteries.add(m);
    };
    const m = setTimeout(tic, hasard(300, 2500));
    minuteries.add(m);
  }

  function mouettes(mon) {
    const vol = () => {
      if (!actif || mon !== jeton) return;
      if (!document.hidden) {
        const { ts } = contexte();
        const largeur = couche.clientWidth || 300, hauteur = couche.clientHeight || 200;
        const el = document.createElement('span');
        el.className = 'etre mouette';
        el.style.setProperty('--ts', `${ts * 0.8}px`);
        el.innerHTML = '<i></i>';
        couche.append(el);
        const y = hasard(0, hauteur * 0.6), versDroite = Math.random() < 0.5;
        if (!versDroite) el.classList.add('gauche');
        el.animate([
          { transform: `translate(${versDroite ? -ts : largeur}px, ${y}px)` },
          { transform: `translate(${(versDroite ? largeur : -ts) / 2}px, ${y + hasard(-20, 20)}px)`, offset: 0.5 },
          { transform: `translate(${versDroite ? largeur : -ts}px, ${y + hasard(-30, 10)}px)` },
        ], { duration: hasard(7000, 11000), easing: 'linear' }).finished.then(() => el.remove(), () => el.remove());
      }
      const m = setTimeout(vol, hasard(9000, 20000));
      minuteries.add(m);
    };
    const m = setTimeout(vol, hasard(2000, 6000));
    minuteries.add(m);
  }

  // ---------- (Re)peupler l'île ----------

  function peupler() {
    jeton++;
    const mon = jeton;
    for (const m of minuteries) clearTimeout(m);
    minuteries.clear();
    couche.querySelectorAll('.etre, .fumee').forEach((e) => e.remove());
    if (!actif) return;
    const { ile } = contexte();
    const reduit = mouvementReduit();
    const L = lieux();
    const depart = (liste) => (liste.length ? choisir(liste) : choisir(L.terre));
    // villageois : un métier selon ce qui existe sur l'île
    const nb = Math.min(MAX_HABITANTS, Math.max(1, habitants({ iles: [ile] })));
    const metiers = [];
    if (L.cabanes.length) metiers.push('bucheron');
    if (L.champs.length) metiers.push('paysanne');
    metiers.push('macon', 'promeneur', 'promeneuse');
    const VARIANTE = { bucheron: 1, paysanne: 2, macon: 3, promeneur: 0, promeneuse: 4 };
    for (let k = 0; k < nb; k++) {
      const metier = metiers[k % metiers.length];
      const el = creer('habitant', VARIANTE[metier], ...depart(L.maisons));
      if (!reduit) vivre(el, metier, mon);
    }
    // animaux
    for (const [k, c] of Object.entries(ile.cases)) {
      if (c.niveau === 0) continue;
      const [x, y] = coord(k);
      if (c.type === 'ferme') for (let i = 0; i < Math.min(3, c.niveau + 1); i++) {
        const el = creer('mouton', 0, x, y);
        if (!reduit) brouter(el, x, y, mon);
      }
      if ((c.type === 'maison' || c.type === 'hameau') && Math.random() < 0.6) {
        const el = creer('poule', 0, x, y);
        if (!reduit) brouter(el, x, y, mon);
      }
      if (!reduit && (c.type === 'maison' || c.type === 'village' || c.type === 'hameau' || c.type === 'chateau')) fumee(x, y, mon);
    }
    if (!reduit) mouettes(mon);
  }

  return {
    peupler,
    arreter() {
      actif = false;
      jeton++;
      for (const m of minuteries) clearTimeout(m);
      couche.querySelectorAll('.etre, .fumee').forEach((e) => e.remove());
    },
  };
}

