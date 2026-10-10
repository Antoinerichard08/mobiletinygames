// Écran de fin de partie : titre, étoiles qui apparaissent une à une, bonus éventuels, gros boutons.
import { animer, apparaitre, attendre, COURBE_REBOND, mouvementReduit } from './mouvement.js';
import { solde } from './etoiles.js';

let fond = null;

const ETOILE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.9 6.2 20.1l1.4-6.4L2.7 9.3l6.5-.7z"/></svg>';

function fermer() {
  if (!fond) return;
  const f = fond;
  fond = null;
  animer(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).then(() => f.remove());
}

/** Ferme l'écran s'il est ouvert (changement d'écran). */
export function fermerResultat() {
  fermer();
}

/**
 * @param {object} o { titre, texte, etoiles (gagnées), etoilesNiveau (0-3, mode niveau) | null, gagne, bonus[], boutons[] }
 * @returns {Promise<string>} action du bouton touché
 */
export function afficherResultat({ titre, texte, etoiles, etoilesNiveau = null, gagne, bonus = [], boutons }) {
  fermer();
  fond = document.createElement('div');
  fond.className = 'sheet result-sheet';
  // En mode niveau : 3 étoiles dont certaines allumées ; sinon les étoiles gagnées.
  const nb = etoilesNiveau !== null ? 3 : Math.max(etoiles, 1);
  const allumees = etoilesNiveau !== null ? etoilesNiveau : etoiles;
  fond.innerHTML = `
    <div class="sheet-box result-box ${gagne ? 'win' : ''}" role="dialog" aria-modal="true" aria-labelledby="res-title">
      <div class="res-stars" aria-label="${allumees} étoile${allumees > 1 ? 's' : ''}">
        ${Array.from({ length: nb }, (_, i) => `<span class="res-star ${i < allumees ? 'on' : ''}">${ETOILE}</span>`).join('')}
      </div>
      <h3 id="res-title"></h3>
      <p class="res-text"></p>
      <p class="res-gain">${etoiles > 0 ? `+${etoiles} étoile${etoiles > 1 ? 's' : ''}` : ''}</p>
      <ul class="res-bonus">${bonus.map(() => '<li></li>').join('')}</ul>
      <p class="res-total">Vous avez maintenant <strong>${solde()}</strong> ★</p>
      <div class="sheet-actions">
        ${boutons.map((b, i) => `<button class="btn ${b.principal ? 'primary' : ''}" data-i="${i}"></button>`).join('')}
      </div>
    </div>`;
  fond.querySelector('h3').textContent = titre;
  fond.querySelector('.res-text').textContent = texte;
  fond.querySelectorAll('.res-bonus li').forEach((li, i) => {
    li.textContent = `${bonus[i].texte}${bonus[i].etoiles ? ` : +${bonus[i].etoiles} ★` : ''}`;
  });
  fond.querySelectorAll('.sheet-actions .btn').forEach((b) => {
    b.textContent = boutons[Number(b.dataset.i)].texte;
  });
  // bouton principal en haut (la colonne est inversée)
  const actions = fond.querySelector('.sheet-actions');
  [...actions.children].sort((a, b) => (boutons[a.dataset.i].principal ? 1 : 0) - (boutons[b.dataset.i].principal ? 1 : 0))
    .forEach((b) => actions.append(b));
  document.body.append(fond);

  const boite = fond.querySelector('.result-box');
  animer(fond, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  animer(boite, [{ transform: 'translateY(40px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380 });
  (async () => {
    if (mouvementReduit()) return;
    const stars = [...fond.querySelectorAll('.res-star')];
    stars.forEach((s) => (s.style.opacity = '0'));
    await attendre(250);
    for (const s of stars) {
      s.style.opacity = '';
      animer(s, [
        { transform: 'scale(0) rotate(-40deg)', opacity: 0 },
        { transform: 'scale(1.3) rotate(8deg)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1) rotate(0)', opacity: 1 },
      ], { duration: 420, easing: COURBE_REBOND });
      await attendre(s.classList.contains('on') ? 260 : 120);
    }
    for (const el of fond?.querySelectorAll('.res-gain, .res-bonus li, .res-total') || []) apparaitre(el, { delai: 0 });
  })();

  const premier = fond.querySelector('.btn.primary') || fond.querySelector('.btn');
  premier.focus();
  return new Promise((resoudre) => {
    fond.querySelectorAll('.sheet-actions .btn').forEach((b) => {
      b.addEventListener('click', () => {
        fermer();
        resoudre(boutons[Number(b.dataset.i)].action);
      });
    });
  });
}
