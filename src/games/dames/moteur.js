// Moteur des Dames (règles internationales, plateau 8 × 8 ou 10 × 10).
// Aucune dépendance au navigateur : testable avec Node (tests/dames.test.js).
//
// Plateau : tableau de N × N cases, lu ligne par ligne (case = ligne * N + colonne).
//   0 = vide, 1 = pion blanc, 2 = dame blanche, -1 = pion rouge, -2 = dame rouge.
// Les blancs (le joueur) sont en bas et montent ; les rouges (l'ordinateur) descendent.
// Seules les cases foncées ((ligne + colonne) impaire) sont utilisées.
//
// Un coup : { from, path: [cases d'arrivée successives], caps: [cases des pièces prises, dans l'ordre] }
//
// Règles appliquées :
//   - la prise est obligatoire, et il faut prendre le plus grand nombre de pièces (prise majoritaire) ;
//   - les pions prennent aussi en arrière, mais n'avancent que vers l'avant ;
//   - la dame est volante : elle se déplace et prend à distance sur ses diagonales ;
//   - rafle : on ne saute pas deux fois la même pièce, et les pièces prises ne sont retirées qu'à la fin ;
//   - un pion devient dame s'il termine son coup sur la dernière rangée (pas s'il ne fait qu'y passer).

export const BLANC = 1;
export const ROUGE = -1;
const DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const dedans = (r, c, N) => r >= 0 && r < N && c >= 0 && c < N;
export const estFoncee = (i, N) => (Math.floor(i / N) + (i % N)) % 2 === 1;

/** Position de départ : 3 rangées de pions par camp en 8 × 8, 4 rangées en 10 × 10. */
export function plateauInitial(N) {
  const b = new Array(N * N).fill(0);
  const rangees = N === 10 ? 4 : 3;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < rangees) b[r * N + c] = ROUGE;
      else if (r >= N - rangees) b[r * N + c] = BLANC;
    }
  }
  return b;
}

/** Toutes les rafles complètes possibles pour la pièce en `from`. */
export function prisesDepuis(b, from, N) {
  const piece = b[from], camp = Math.sign(piece), dame = Math.abs(piece) === 2;
  const bb = b.slice();
  bb[from] = 0; // la pièce qui joue libère sa case de départ
  const out = [];
  (function chercher(r, c, path, caps) {
    let prolongee = false;
    for (const [dr, dc] of DIRECTIONS) {
      if (!dame) {
        const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
        if (!dedans(lr, lc, N)) continue;
        const mi = mr * N + mc, li = lr * N + lc;
        if (Math.sign(bb[mi]) === -camp && !caps.includes(mi) && bb[li] === 0) {
          prolongee = true;
          chercher(lr, lc, path.concat(li), caps.concat(mi));
        }
      } else {
        let mr = r + dr, mc = c + dc;
        while (dedans(mr, mc, N) && bb[mr * N + mc] === 0) { mr += dr; mc += dc; }
        if (!dedans(mr, mc, N)) continue;
        const mi = mr * N + mc;
        if (Math.sign(bb[mi]) !== -camp || caps.includes(mi)) continue; // propre pièce ou pièce déjà prise : bloqué
        let lr = mr + dr, lc = mc + dc;
        while (dedans(lr, lc, N) && bb[lr * N + lc] === 0) {
          prolongee = true;
          chercher(lr, lc, path.concat(lr * N + lc), caps.concat(mi));
          lr += dr; lc += dc;
        }
      }
    }
    if (!prolongee && caps.length) out.push({ from, path, caps });
  })(Math.floor(from / N), from % N, [], []);
  return out;
}

/** Coups permis pour un camp, en appliquant prise obligatoire et prise majoritaire. */
export function coupsPermis(b, camp, N) {
  const prises = [];
  for (let i = 0; i < N * N; i++) {
    if (Math.sign(b[i]) === camp) prises.push(...prisesDepuis(b, i, N));
  }
  if (prises.length) {
    const max = Math.max(...prises.map((m) => m.caps.length));
    return prises.filter((m) => m.caps.length === max);
  }
  const out = [];
  for (let i = 0; i < N * N; i++) {
    const v = b[i];
    if (Math.sign(v) !== camp) continue;
    const r = Math.floor(i / N), c = i % N;
    if (Math.abs(v) === 1) {
      const dr = camp === BLANC ? -1 : 1;
      for (const dc of [-1, 1]) {
        const nr = r + dr, nc = c + dc;
        if (dedans(nr, nc, N) && b[nr * N + nc] === 0) out.push({ from: i, path: [nr * N + nc], caps: [] });
      }
    } else {
      for (const [dr, dc] of DIRECTIONS) {
        let nr = r + dr, nc = c + dc;
        while (dedans(nr, nc, N) && b[nr * N + nc] === 0) {
          out.push({ from: i, path: [nr * N + nc], caps: [] });
          nr += dr; nc += dc;
        }
      }
    }
  }
  return out;
}

/** Nouveau plateau après le coup m (le plateau d'origine n'est pas modifié). */
export function jouerCoup(b, m, N) {
  const nb = b.slice();
  const p = nb[m.from];
  nb[m.from] = 0;
  for (const ci of m.caps) nb[ci] = 0;
  const arrivee = m.path[m.path.length - 1], ligne = Math.floor(arrivee / N);
  let np = p;
  if (p === BLANC && ligne === 0) np = 2;
  else if (p === ROUGE && ligne === N - 1) np = -2;
  nb[arrivee] = np;
  return nb;
}

export const memeCoup = (a, b) =>
  a.from === b.from && a.path.length === b.path.length && a.path.every((p, k) => p === b.path[k]);

export const compter = (b, camp) => b.filter((v) => Math.sign(v) === camp).length;
