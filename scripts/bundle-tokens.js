// bundle-tokens.js — Gera electron/token-bundle.json com tokens privados
// pra serem embutidos no .asar do build de produção.
//
// Origem dos tokens (em ordem de prioridade):
//   1. Env vars: STEAM_API_KEY, IMGBB_KEY, SOURCE_D_KEY
//   2. Arquivos .txt locais (gitignored): Site zJu4nnTools/Sobre mim (zJu4nn)/*.txt
//
// Uso:
//   node scripts/bundle-tokens.js   (rodado no `prebuild`)

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'electron', 'token-bundle.json');

// Lê de arquivo local
function readFile(rel) {
  const p = path.join(__dirname, '..', '..', 'Site zJu4nnTools', 'Sobre mim (zJu4nn)', rel);
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  } catch {}
  return null;
}

const bundle = {
  steamApiKey: process.env.STEAM_API_KEY || readFile('Token Steam.txt') || '',
  imgbbKey: process.env.IMGBB_KEY || readFile('Token imgbb.txt') || '',
  sourceDKey: process.env.SOURCE_D_KEY || readFile('Token HubcapDB.txt') || '',
};

const filled = Object.values(bundle).filter(Boolean).length;
console.log(`[bundle-tokens] ${filled}/3 tokens encontrados`);
fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2), 'utf8');
console.log(`[bundle-tokens] gravado em ${OUT}`);
