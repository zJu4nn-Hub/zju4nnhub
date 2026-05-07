// extractor.js — Extração automática de jogos baixados (Fase 9.x)
//
// Detecta arquivos .zip, .rar, .7z na pasta do download e extrai pra mesma pasta.
// - .zip: extrai com yauzl (puro Node, sem dependência externa)
// - .rar / .7z: tenta usar 7-Zip do PATH (7z.exe). Se não tiver, falha graciosamente.
//
// Hook chamado pelo torrent-engine + http-downloader quando o download completa,
// se settings.autoExtract estiver true.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, exec } = require('node:child_process');

// Cache do path do 7z.exe (procura 1x por sessão)
let cached7zPath = null;
let cached7zChecked = false;

function find7zPath() {
  if (cached7zChecked) return cached7zPath;
  cached7zChecked = true;
  const candidates = [
    process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], '7-Zip', '7z.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], '7-Zip', '7z.exe'),
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { cached7zPath = p; break; } } catch {}
  }
  // Fallback: tenta `where 7z`
  if (!cached7zPath) {
    try {
      const out = require('node:child_process').execSync('where 7z', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      const first = out.split(/\r?\n/)[0];
      if (first && fs.existsSync(first)) cached7zPath = first;
    } catch {}
  }
  if (cached7zPath) console.log('[extractor] 7-Zip encontrado:', cached7zPath);
  else console.log('[extractor] 7-Zip não encontrado — .rar/.7z não serão extraídos automaticamente');
  return cached7zPath;
}

// Lista archives na pasta (recursivo 1 nível pra pegar zips dentro de subpastas comuns)
function findArchives(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) return [];
  const result = [];
  const exts = /\.(zip|rar|7z)$/i;
  // Não pega .part2.rar etc; só o "primeiro" volume (.rar sem .partN ou .part01.rar / .part1.rar)
  const isMultiPartButNotFirst = (name) => {
    const m = name.match(/\.part(\d+)\.rar$/i);
    if (!m) return false;
    return parseInt(m[1], 10) !== 1;
  };

  function scan(dir, depth) {
    if (depth > 1) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        scan(full, depth + 1);
      } else if (e.isFile() && exts.test(e.name) && !isMultiPartButNotFirst(e.name)) {
        result.push(full);
      }
    }
  }
  scan(folderPath, 0);
  return result;
}

// Extrai .zip com yauzl
function extractZip(zipPath, outputDir) {
  return new Promise((resolve, reject) => {
    let yauzl;
    try { yauzl = require('yauzl'); }
    catch (err) { return reject(new Error('yauzl não instalado')); }

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      let entryCount = 0;
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        entryCount++;
        const entryPath = path.join(outputDir, entry.fileName);
        // Proteção contra zip-slip (entries com ../ que escapam)
        if (!entryPath.startsWith(path.resolve(outputDir))) {
          zipfile.readEntry();
          return;
        }
        if (/\/$/.test(entry.fileName)) {
          // diretório
          fs.mkdirSync(entryPath, { recursive: true });
          zipfile.readEntry();
        } else {
          fs.mkdirSync(path.dirname(entryPath), { recursive: true });
          zipfile.openReadStream(entry, (err2, readStream) => {
            if (err2) return reject(err2);
            const writeStream = fs.createWriteStream(entryPath);
            readStream.pipe(writeStream);
            writeStream.on('finish', () => zipfile.readEntry());
            writeStream.on('error', reject);
          });
        }
      });
      zipfile.on('end', () => resolve({ entries: entryCount }));
      zipfile.on('error', reject);
    });
  });
}

// Extrai .rar / .7z com 7z.exe
function extract7z(archivePath, outputDir) {
  return new Promise((resolve, reject) => {
    const exe = find7zPath();
    if (!exe) return reject(new Error('7-Zip não encontrado no sistema'));
    // x = extract com paths, -y = yes, -o = output
    const args = ['x', archivePath, `-o${outputDir}`, '-y'];
    const proc = spawn(exe, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({});
      else reject(new Error(`7z saiu com código ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

// Extrai um archive baseado na extensão
async function extractArchive(archivePath, outputDir) {
  if (!fs.existsSync(archivePath)) throw new Error(`Archive não existe: ${archivePath}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const ext = path.extname(archivePath).toLowerCase();
  if (ext === '.zip') return extractZip(archivePath, outputDir);
  if (ext === '.rar' || ext === '.7z') return extract7z(archivePath, outputDir);
  throw new Error(`Extensão não suportada: ${ext}`);
}

// Extrai TODOS os archives na pasta (sequencial — múltiplos zips simultâneos seriam pesado)
// Retorna { extracted: [{archive, output}], skipped: [...], errors: [...] }
async function extractAllInFolder(folderPath, opts = {}) {
  const archives = findArchives(folderPath);
  const result = { extracted: [], skipped: [], errors: [] };
  if (!archives.length) {
    console.log('[extractor] nenhum archive encontrado em', folderPath);
    return result;
  }
  console.log(`[extractor] ${archives.length} archive(s) em`, folderPath);
  for (const archive of archives) {
    try {
      // Output: mesma pasta do archive (Hydra-style — extrai junto, não cria subpasta)
      const outputDir = path.dirname(archive);
      console.log('[extractor] extraindo:', archive, '→', outputDir);
      await extractArchive(archive, outputDir);
      result.extracted.push({ archive, output: outputDir });
      // Opcionalmente apaga o archive original após sucesso
      if (opts.deleteAfter) {
        try { fs.unlinkSync(archive); console.log('[extractor] apagado:', archive); } catch {}
      }
    } catch (err) {
      console.warn('[extractor] falha em', archive, ':', err.message);
      result.errors.push({ archive, error: err.message });
    }
  }
  return result;
}

module.exports = {
  findArchives,
  extractArchive,
  extractAllInFolder,
  find7zPath,
};
