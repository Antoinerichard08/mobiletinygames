// Petits sons du jeu de bulles, fabriqués à la volée (Web Audio) : aucun fichier à télécharger.
// Volume doux ; on peut les couper dans le menu Pause. Le navigateur n'autorise le son qu'après un toucher :
// reveillerSons() est appelé quand on pose le doigt sur le plateau.

let ctx = null;
let maitre = null;
let actif = true;
let dernierBocal = 0;

export const reglerSons = (oui) => { actif = oui; };

function audio() {
  if (!actif) return null;
  if (!ctx) {
    const Contexte = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Contexte) return null;
    try {
      ctx = new Contexte();
      maitre = ctx.createGain();
      maitre.gain.value = 0.22;
      maitre.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** À appeler pendant un geste (toucher) : débloque le son sur le téléphone. */
export const reveillerSons = () => { audio(); };

/** Une note courte : fréquence (Hz), début (s), durée (s), forme d'onde, volume, glissement de hauteur (facteur). */
function note(frequence, { debut = 0, duree = 0.12, forme = 'sine', volume = 1, glisse = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + debut;
  const o = a.createOscillator(), g = a.createGain();
  o.type = forme;
  o.frequency.setValueAtTime(frequence, t);
  if (glisse) o.frequency.exponentialRampToValueAtTime(Math.max(40, frequence * glisse), t + duree);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(maitre);
  o.start(t);
  o.stop(t + duree + 0.03);
}

// une gamme pentatonique (do, ré, mi, sol, la…) : les éclats en cascade sonnent toujours juste
const GAMME = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

export const son = {
  tir: () => note(330, { duree: 0.1, forme: 'triangle', volume: 0.3, glisse: 1.9 }),
  rebond: () => note(1200, { duree: 0.04, forme: 'square', volume: 0.08 }),
  pose: () => note(200, { duree: 0.09, volume: 0.45, glisse: 0.55 }),
  /** n bonbons qui éclatent : une petite cascade, plus aiguë quand la série monte. */
  eclats(n, serie = 0) {
    const depart = Math.min(3, Math.max(0, serie - 1));
    for (let i = 0; i < Math.min(n, 7); i++) {
      note(GAMME[Math.min(GAMME.length - 1, depart + i)], { debut: i * 0.045, duree: 0.11, volume: 0.42, glisse: 1.3 });
    }
  },
  /** Un bonbon tombe dans un bocal : plus aigu quand le bocal vaut plus. */
  bocal(multiplicateur) {
    const maintenant = performance.now();
    if (maintenant - dernierBocal < 40) return; // une pluie de bonbons ne fait pas un vacarme
    dernierBocal = maintenant;
    note(multiplicateur >= 3 ? 1975.5 : multiplicateur === 2 ? 1567.98 : 1318.51, { duree: 0.16, forme: 'triangle', volume: 0.28 });
  },
  explosion: () => {
    note(140, { duree: 0.32, forme: 'sawtooth', volume: 0.18, glisse: 0.35 });
    note(90, { debut: 0.02, duree: 0.28, volume: 0.35, glisse: 0.5 });
  },
  bonus: () => [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => note(f, { debut: i * 0.07, duree: 0.16, forme: 'triangle', volume: 0.32 })),
  or: () => [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => note(f, { debut: i * 0.06, duree: 0.2, forme: 'triangle', volume: 0.3 })),
  victoire: () => [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => note(f, { debut: i * 0.11, duree: 0.24, forme: 'triangle', volume: 0.38 })),
  defaite: () => [392, 349.23, 311.13].forEach((f, i) => note(f, { debut: i * 0.17, duree: 0.3, volume: 0.32 })),
};
