// Calculs lourds en arrière-plan (Web Worker), pour que l'écran ne se fige jamais.
// Si le navigateur ne sait pas lancer le worker, on calcule sur place (un peu moins fluide, mais ça marche).

/**
 * @param {URL} url        module du worker (il reçoit {id, ...donnees} et répond {id, ...resultat})
 * @param {Function} repli (donnees) => resultat, utilisé si le worker est indisponible
 */
export function creerTravailleur(url, repli) {
  let w = null;
  let enPanne = false;
  let prochain = 0;
  const attente = new Map();

  function demarrer() {
    if (w || enPanne) return;
    try {
      w = new Worker(url, { type: 'module' });
      w.onmessage = (e) => {
        const fin = attente.get(e.data.id);
        attente.delete(e.data.id);
        if (fin) fin.ok(e.data);
      };
      w.onerror = () => {
        enPanne = true;
        w = null;
        for (const [, fin] of attente) fin.repli();
        attente.clear();
      };
    } catch {
      enPanne = true;
    }
  }

  return {
    /** Lance un calcul ; renvoie une promesse du résultat. */
    calculer(donnees) {
      demarrer();
      return new Promise((resoudre) => {
        const surPlace = () => setTimeout(() => resoudre(repli(donnees)), 20);
        if (enPanne || !w) return surPlace();
        const id = ++prochain;
        attente.set(id, { ok: resoudre, repli: surPlace });
        w.postMessage({ id, ...donnees });
      });
    },
  };
}
