// Icônes de l'interface de l'île (SVG en ligne, 24 × 24, couleur du texte). Dessinées pour l'appli.
const svg = (corps, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${extra}>${corps}</svg>`;

export const ICONE = {
  maison: svg('<path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10.5V20h5v-5.5h3V20h5v-9.5" fill="currentColor"/>'),
  marteau: svg('<path d="M13.2 3.5 20.5 8l-2 3-2.4-1.5-7.9 11.2a1.8 1.8 0 0 1-2.5.5l-.4-.3a1.8 1.8 0 0 1-.5-2.5l7.9-11.2-1.8-1.2z" fill="currentColor"/>'),
  info: svg('<circle cx="12" cy="5.5" r="2.3" fill="currentColor"/><path d="M9 10h4.5v8.5H16V21H8.5v-2.5H11v-6H9z" fill="currentColor"/>'),
  monter: svg('<path d="M12 3 3.5 12H9v9h6v-9h5.5z" fill="currentColor"/>'),
  deplacer: svg('<path d="M12 2 8.5 5.5h2.3v5.3H5.5V8.5L2 12l3.5 3.5v-2.3h5.3v5.3H8.5L12 22l3.5-3.5h-2.3v-5.3h5.3v2.3L22 12l-3.5-3.5v2.3h-5.3V5.5h2.3z" fill="currentColor"/>'),
  poubelle: svg('<path d="M9 3h6l1 2h4v2.5H4V5h4zM5.5 9h13l-1.2 11.2a2 2 0 0 1-2 1.8H8.7a2 2 0 0 1-2-1.8z" fill="currentColor"/>'),
  panier: svg('<path d="M3 9h18l-2 11H5z" fill="currentColor"/><path d="M7.5 9 11 3.5M16.5 9 13 3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>'),
  eclair: svg('<path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" fill="currentColor"/>'),
  ampoule: svg('<path d="M12 2.5a7 7 0 0 0-4.2 12.6c.7.5 1.2 1.4 1.2 2.3V18h6v-.6c0-.9.5-1.8 1.2-2.3A7 7 0 0 0 12 2.5z" fill="currentColor"/><rect x="9" y="19.2" width="6" height="2.6" rx="1" fill="currentColor"/>'),
  etoile: svg('<path d="m12 2 2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9l-6.1 3.5 1.5-6.8L2.2 9l6.9-.7z" fill="currentColor"/>'),
  croix: svg('<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>'),
  coche: svg('<path d="m4.5 12.5 5 5L20 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  gauche: svg('<path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  droite: svg('<path d="m9 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  cadenas: svg('<path d="M7.5 10V8a4.5 4.5 0 0 1 9 0v2" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="currentColor"/>'),
  horloge: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 7v5.5l3.5 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
  agrandir: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="currentColor"/>'),
  personne: svg('<circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M4 21a8 8 0 0 1 16 0z" fill="currentColor"/>'),
};
