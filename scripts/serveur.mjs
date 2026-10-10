// Petit serveur local sans dépendance pour essayer l'appli : npm start → http://localhost:8080
// (Les modules JavaScript ne marchent pas en ouvrant index.html directement depuis le disque.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { RACINE } from './fichiers-appli.mjs';

const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const fichier = normalize(join(RACINE, chemin.endsWith('/') ? chemin + 'index.html' : chemin));
  if (!fichier.startsWith(normalize(RACINE)) || /[\\/](node_modules|\.git|android)[\\/]/.test(fichier)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const contenu = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contenu);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
}).listen(PORT, () => {
  console.log(`Mom's games : http://localhost:${PORT}`);
  for (const ifs of Object.values(networkInterfaces())) {
    for (const i of ifs) if (i.family === 'IPv4' && !i.internal) console.log(`Sur le même Wi-Fi : http://${i.address}:${PORT}`);
  }
});
