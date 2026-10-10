// Petits utilitaires partagés. Aucune dépendance au navigateur sauf chargerStyle et $/$$.

export const $ = (sel, racine = document) => racine.querySelector(sel);
export const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];

/** Mélange un tableau sur place (Fisher-Yates) et le renvoie. */
export function melanger(tab, alea = Math.random) {
  for (let i = tab.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [tab[i], tab[j]] = [tab[j], tab[i]];
  }
  return tab;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32), pratique pour les tests. */
export function aleaGraine(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ajoute une feuille de style une seule fois (url absolue ou objet URL). */
export function chargerStyle(url) {
  const href = String(url);
  if (document.querySelector(`link[data-style="${href}"]`)) return;
  const lien = document.createElement('link');
  lien.rel = 'stylesheet';
  lien.href = href;
  lien.dataset.style = href;
  document.head.append(lien);
}

/** Accord simple : pluriel(3, 'case') → « 3 cases ». */
export function pluriel(n, mot, motPluriel = mot + 's') {
  return `${n} ${n > 1 ? motPluriel : mot}`;
}
