// Fenêtre de dialogue en bas d'écran, grosse et lisible.
// demander() renvoie une promesse : true si l'on touche le bouton principal, false sinon.
import { animer } from './mouvement.js';

let fond = null;
let terminer = null;
let focusAvant = null;

function construire() {
  fond = document.createElement('div');
  fond.className = 'sheet';
  fond.hidden = true;
  fond.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <h3 id="sheet-title"></h3>
      <p id="sheet-text"></p>
      <div class="sheet-actions">
        <button class="btn" id="sheet-no"></button>
        <button class="btn primary" id="sheet-yes"></button>
      </div>
    </div>`;
  document.body.append(fond);
  fond.querySelector('#sheet-yes').addEventListener('click', () => fermerDialogue(true));
  fond.querySelector('#sheet-no').addEventListener('click', () => fermerDialogue(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !fond.hidden) fermerDialogue(false);
  });
}

/**
 * @param {{titre: string, texte?: string, oui?: string, non?: string}} o
 * @returns {Promise<boolean>}
 */
export function demander({ titre, texte = '', oui = 'OK', non = '' }) {
  if (!fond) construire();
  fermerDialogue(false);
  fond.querySelector('#sheet-title').textContent = titre;
  fond.querySelector('#sheet-text').textContent = texte;
  const btnOui = fond.querySelector('#sheet-yes');
  const btnNon = fond.querySelector('#sheet-no');
  btnOui.textContent = oui;
  btnNon.textContent = non;
  btnNon.hidden = !non;
  focusAvant = document.activeElement;
  fond.hidden = false;
  // la fenêtre monte du bas de l'écran
  animer(fond, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
  animer(fond.firstElementChild, [{ transform: 'translateY(60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320 });
  btnOui.focus();
  return new Promise((resoudre) => {
    terminer = resoudre;
  });
}

/** Confirmation avant une action qui efface quelque chose. */
export function confirmer(texte, oui) {
  return demander({ titre: 'Êtes-vous sûr ?', texte, oui, non: 'Non, continuer' });
}

export function fermerDialogue(reponse = false) {
  if (!fond || fond.hidden) return;
  fond.hidden = true;
  const fin = terminer;
  terminer = null;
  if (focusAvant && document.contains(focusAvant)) focusAvant.focus();
  if (fin) fin(reponse);
}
