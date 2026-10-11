// Prépare les images du jeu Puzzle : télécharge (une seule fois, à la main) les tableaux choisis sur
// Wikimedia Commons, VÉRIFIE leur licence (CC0 uniquement) et écrit le catalogue data/catalogue-puzzles.json.
//   node scripts/telecharger-puzzles.mjs
// Les images (960 px de large, JPEG) vont dans assets/puzzles/ : l'appli les demande à NOTRE site, au moment
// où l'on en a besoin, puis les garde sur le téléphone (voir src/games/puzzle/images.js).
// Chaque entrée garde une minuscule vignette (20 px) en base64 : le puzzle s'affiche flou tout de suite, même sans réseau.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia demande un « User-Agent » qui dit qui télécharge et comment nous joindre
const ENTETES = { 'User-Agent': "MomsGames/1.8 (jeux pour seniors, sans publicité ; https://github.com/Antoinerichard08/mobiletinygames)" };
const LICENCES_ACCEPTEES = ['CC0'];

/** [identifiant, fichier sur Commons, titre en français, taille du puzzle] */
const CHOIX = [
  ['tournesols-van-gogh', 'Sunflowers MET DP229743.jpg', 'Tournesols', 'petit'],
  ['bouquet-tournesols-monet', 'Bouquet of Sunflowers MET DP130800.jpg', 'Bouquet de tournesols', 'petit'],
  ['chrysanthemes-monet', 'Chrysanthemums MET DT1887.jpg', 'Chrysanthèmes', 'petit'],
  ['pommes-raisins-monet', 'Apples and Grapes MET DT1561.jpg', 'Pommes et raisins', 'petit'],
  ['pommes-primeveres-cezanne', 'Still Life with Apples and a Pot of Primroses MET DT47.jpg', 'Nature morte aux pommes et aux primevères', 'petit'],
  ['peches-renoir', 'Still Life with Peaches MET DT1140.jpg', 'Nature morte aux pêches', 'petit'],
  ['fleurs-figues-renoir', 'Still Life with Flowers and Prickly Pears MET DP257756.jpg', 'Fleurs et figues de Barbarie', 'petit'],
  ['grande-vague-hokusai', '冨嶽三十六景 神奈川沖浪裏-Under the Wave off Kanagawa (Kanagawa oki nami ura), also known as The Great Wave, from the series Thirty-six Views of Mount Fuji (Fugaku sanjūrokkei) MET DP141063.jpg', 'La Grande Vague de Kanagawa', 'petit'],
  ['quatre-arbres-monet', 'The Four Trees MET DT832.jpg', 'Les Quatre Arbres', 'petit'],
  ['cabane-douanier-monet', 'Cabin of the Customs Watch MET DT1905.jpg', 'La Cabane du douanier', 'petit'],
  ['champ-ble-cypres-van-gogh', 'Wheat Field with Cypresses MET DT1567.jpg', 'Champ de blé avec cyprès', 'moyen'],
  ['pont-nympheas-monet', 'Bridge over a Pond of Water Lilies MET DT1854.jpg', 'Le Pont sur le bassin aux nymphéas', 'moyen'],
  ['grenouillere-monet', 'La Grenouillère MET DT833.jpg', 'La Grenouillère', 'moyen'],
  ['seine-giverny-monet', 'Morning on the Seine near Giverny MET DT1903.jpg', 'Matinée sur la Seine près de Giverny', 'moyen'],
  ['parc-monceau-monet', 'Landscape- The Parc Monceau MET DT1891.jpg', 'Le Parc Monceau', 'moyen'],
  ['chemin-iris-monet', 'The Path through the Irises, 1917 - Claude Monet, MET DT1890.jpg', 'Le Chemin aux iris', 'moyen'],
  ['camille-argenteuil-monet', 'Camille Monet (1847–1879) in the Garden at Argenteuil MET DT1884.jpg', 'Camille Monet au jardin, à Argenteuil', 'moyen'],
  ['allee-chataigniers-sisley', 'Allée of Chestnut Trees MET DT3139.jpg', 'Allée de châtaigniers', 'moyen'],
  ['prairies-sahurs-sisley', 'Sahurs Meadows in Morning Sun MET DT1870.jpg', 'Prairies de Sahurs au soleil du matin', 'moyen'],
  ['route-louveciennes-sisley', 'The Road from Versailles to Louveciennes MET DT1871.jpg', 'La Route de Versailles à Louveciennes', 'moyen'],
  ['kanagawa-hiroshige', '東海道五十三次 神奈川-Kanagawa MET DP122827.jpg', 'Kanagawa, sur la route du Tōkaidō', 'moyen'],
  ['jardin-sainte-adresse-monet', 'Garden at Sainte-Adresse MET DT48.jpg', 'Jardin à Sainte-Adresse', 'grand'],
  ['boulevard-montmartre-pissarro', 'The Boulevard Montmartre on a Winter Morning MET DT1906.jpg', 'Le Boulevard Montmartre, matin d’hiver', 'grand'],
  ['marche-chevaux-bonheur', 'The Horse Fair MET DT44.jpg', 'Le Marché aux chevaux', 'grand'],
  ['marly-le-roi-sisley', 'View of Marly-le-Roi from Coeur-Volant MET DP130325.jpg', 'Vue de Marly-le-Roi depuis Cœur-Volant', 'grand'],
  ['moret-saint-mammes-sisley', 'The Road from Moret to Saint-Mammès MET DP323408.jpg', 'La Route de Moret à Saint-Mammès', 'grand'],
  ['glacons-monet', 'Ice Floes MET DT2158.jpg', 'Les Glaçons', 'grand'],
];

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const texte = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
// les dates de Commons portent parfois une étiquette Wikidata cachée (« 1887date QS:P571,… ») : on la retire
const dateLisible = (html) => texte(html).replace(/date QS:.*$/, '').trim()
  .replace(/^between (.+) and (.+)$/, 'entre $1 et $2').replace(/circa /g, 'vers ').replace(/^probably /, 'probablement ')
  .replace(/^entre vers (\d+) et vers (\d+)$/, 'vers $1–$2');

async function infos(fichier, largeur) {
  const p = new URLSearchParams({
    action: 'query', titles: `File:${fichier}`, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: String(largeur),
    iiextmetadatafilter: 'LicenseShortName|Artist|DateTimeOriginal|ObjectName|Credit', format: 'json', formatversion: '2',
  });
  const r = await fetch(`${API}?${p}`, { headers: ENTETES });
  if (!r.ok) throw new Error(`API ${r.status} pour ${fichier}`);
  const page = (await r.json()).query.pages[0];
  if (page.missing) throw new Error(`Fichier introuvable : ${fichier}`);
  return page.imageinfo[0];
}

async function telecharger(url) {
  for (let essai = 0; essai < 3; essai++) {
    const r = await fetch(url, { headers: ENTETES });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    await attendre(2000 * (essai + 1)); // le serveur demande d'attendre un peu
  }
  throw new Error(`Téléchargement impossible : ${url}`);
}

const dossier = join(racine, 'assets/puzzles');
mkdirSync(dossier, { recursive: true });
mkdirSync(join(racine, 'data'), { recursive: true });
const images = [];
for (const [id, fichier, titre, taille] of CHOIX) {
  const grande = await infos(fichier, 960);
  const m = grande.extmetadata;
  const licence = m.LicenseShortName?.value;
  if (!LICENCES_ACCEPTEES.includes(licence)) throw new Error(`${fichier} : licence « ${licence} » refusée (CC0 uniquement)`);
  // une image déjà téléchargée n'est pas redemandée
  const chemin = join(dossier, `${id}.jpg`);
  const jpeg = existsSync(chemin) ? null : await telecharger(grande.thumburl);
  if (jpeg) { writeFileSync(chemin, jpeg); await attendre(400); }
  const petite = await infos(fichier, 20);
  const vignette = await telecharger(petite.thumburl);
  images.push({
    id, titre, taille,
    artiste: texte(m.Artist?.value), date: dateLisible(m.DateTimeOriginal?.value),
    licence: 'CC0 1.0 (domaine public)', source: 'The Metropolitan Museum of Art, Open Access, via Wikimedia Commons',
    page: grande.descriptionurl, fichier: `assets/puzzles/${id}.jpg`,
    largeur: grande.thumbwidth, hauteur: grande.thumbheight,
    vignette: `data:image/jpeg;base64,${vignette.toString('base64')}`,
  });
  console.log(`✓ ${titre} (${texte(m.Artist?.value)}) : ${licence}, ${grande.thumbwidth}×${grande.thumbheight}${jpeg ? `, ${Math.round(jpeg.length / 1024)} ko` : ' (déjà là)'}`);
  await attendre(400);
}
const catalogue = { version: 1, note: 'Généré par scripts/telecharger-puzzles.mjs : ne pas modifier à la main.', images };
writeFileSync(join(racine, 'data/catalogue-puzzles.json'), `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`\n${images.length} images, catalogue écrit : data/catalogue-puzzles.json`);
