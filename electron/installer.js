// installer.js — Detecta o tipo de repack baixado e executa o instalador correto
// Lida com: FitGirl, DODI, GOG, EMPRESS, KaOsKrew, SteamRip/Kazumi (pré-inst), OnlineFix

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Padrões de exes a IGNORAR ao buscar o exe principal de jogo pré-instalado
const REDIST_RE = /(redist|vcredist|dotnet|directx|dxsetup|vc_redist|isscript|d3dcompiler|crashpad|crashreport|unitycrashhandler|prerequisite)/i;
const UNINSTALL_RE = /(unins\d*|uninstall|setup_uninstall)/i;

function safeStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function safeReaddir(p) {
  try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; }
}

function findGameExe(dir) {
  // Procura o .exe MAIOR que parece ser um jogo (ignora redist/uninstall).
  // NÃO recursivo — só olha na pasta atual. A descida em subpastas é feita
  // explicitamente em detect() pra evitar matar a detecção do repacker certo.
  let best = null;
  const entries = safeReaddir(dir);

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
      if (REDIST_RE.test(entry.name) || UNINSTALL_RE.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const st = safeStat(full);
      if (!st) continue;
      if (!best || st.size > best.size) best = { path: full, name: entry.name, size: st.size };
    }
  }

  return best;
}

function listFlatFiles(dir) {
  const entries = safeReaddir(dir);
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  return { entries, files, lcFiles: files.map((f) => f.toLowerCase()) };
}

/**
 * Detecta o tipo de repack na pasta e devolve qual exe rodar.
 * @returns {{
 *   type: 'install' | 'play' | 'patch' | 'unknown',
 *   exe: string | null,
 *   exeName: string | null,
 *   repacker: string,
 *   folderPath: string,
 *   instructions: string | null
 * }}
 */
function detect(folderPath, _isRecursion = false) {
  const result = {
    type: 'unknown',
    exe: null,
    exeName: null,
    repacker: 'unknown',
    folderPath,
    instructions: null,
  };

  if (!folderPath || !fs.existsSync(folderPath)) {
    if (!_isRecursion) console.log('[installer] detect: folder não existe →', folderPath);
    return result;
  }

  const folderName = path.basename(folderPath).toLowerCase();
  const { entries, files, lcFiles } = listFlatFiles(folderPath);

  // ===== ONLINE FIX =====
  // OnlineFix: pasta zipada com senha 'online-fix.me'. Vem como patch ou jogo completo.
  const isOnlineFix =
    folderName.includes('online-fix') ||
    folderName.includes('onlinefix') ||
    folderName.includes('online fix') ||
    lcFiles.some((n) => n.includes('online-fix') || n.includes('onlinefix'));

  if (isOnlineFix) {
    result.repacker = 'onlinefix';
    result.type = 'patch';
    result.instructions = 'Online Fix';
    // Tenta achar setup ou exe de jogo dentro
    const setup = files.find((n) => /^onlinefix-setup.*\.exe$/i.test(n) || /^setup\.exe$/i.test(n));
    if (setup) {
      result.exe = path.join(folderPath, setup);
      result.exeName = setup;
    } else {
      const game = findGameExe(folderPath);
      if (game) {
        result.exe = game.path;
        result.exeName = game.name;
      }
    }
    return result;
  }

  // ===== FITGIRL =====
  // Marca registrada: arquivos fg-XX.bin
  const hasFitGirlBins = lcFiles.some((n) => /^fg-\d+\.bin$/i.test(n));
  if (hasFitGirlBins) {
    result.repacker = 'fitgirl';
    result.type = 'install';
    const setup = files.find((n) => /^setup\.exe$/i.test(n));
    if (setup) {
      result.exe = path.join(folderPath, setup);
      result.exeName = setup;
    }
    console.log('[installer] detect → FitGirl em', folderPath, 'exe:', result.exe);
    return result;
  }

  // ===== DODI =====
  // Marca: dodi-XX.bin OU [DODI Repack] no nome
  const hasDodiBins = lcFiles.some((n) => /^dodi-\d+\.bin$/i.test(n));
  const isDodiByName = /\b(dodi)\b|\[dodi/i.test(folderName);
  if (hasDodiBins || isDodiByName) {
    result.repacker = 'dodi';
    result.type = 'install';
    const setup = files.find((n) => /^setup\.exe$/i.test(n));
    if (setup) {
      result.exe = path.join(folderPath, setup);
      result.exeName = setup;
    }
    return result;
  }

  // ===== GOG =====
  // Marca: filename setup_NAME_VERSION.exe ou arquivos goggame-*
  const gogSetup = files.find((n) => /^setup_.+\.exe$/i.test(n));
  if (gogSetup || lcFiles.some((n) => n.startsWith('goggame-'))) {
    result.repacker = 'gog';
    result.type = 'install';
    if (gogSetup) {
      result.exe = path.join(folderPath, gogSetup);
      result.exeName = gogSetup;
    }
    return result;
  }

  // ===== EMPRESS =====
  // Geralmente vem pré-instalado, com 'EMPRESS' no nome
  const isEmpress = folderName.includes('empress') ||
    lcFiles.includes('empress.dll');
  if (isEmpress) {
    result.repacker = 'empress';
    const game = findGameExe(folderPath);
    if (game) {
      result.type = 'play';
      result.exe = game.path;
      result.exeName = game.name;
    } else {
      const setup = files.find((n) => /^setup\.exe$/i.test(n));
      if (setup) {
        result.type = 'install';
        result.exe = path.join(folderPath, setup);
        result.exeName = setup;
      }
    }
    return result;
  }

  // ===== Generic setup.exe (KaOsKrew, repackers diversos) =====
  const setupGeneric = files.find((n) => /^setup\.exe$/i.test(n));
  if (setupGeneric) {
    result.repacker = 'kaoskrew'; // generic installer
    result.type = 'install';
    result.exe = path.join(folderPath, setupGeneric);
    result.exeName = setupGeneric;
    return result;
  }

  // ===== Pasta com 1 subpasta única → recursão pra detectar lá dentro =====
  // Importante: rodar ANTES do fallback de pré-instalado, porque WebTorrent
  // costuma criar uma subpasta com o nome do torrent (ex: 'Stardew Valley FitGirl/...')
  const subdirs = entries.filter((e) => e.isDirectory());
  const onlyOneSubdir = subdirs.length === 1;
  // Se o user passou uma pasta vazia (sem .exe nem .bin direto), tenta na subpasta
  const hasMeaningfulFiles = lcFiles.some((n) =>
    n.endsWith('.exe') || /\.bin$/i.test(n)
  );
  if (onlyOneSubdir && !hasMeaningfulFiles) {
    if (!_isRecursion) console.log('[installer] detect: descendo na subpasta', subdirs[0].name);
    return detect(path.join(folderPath, subdirs[0].name), true);
  }

  // ===== Pré-instalado (SteamRip, Kazumi [Pre-Instalado]) =====
  const game = findGameExe(folderPath);
  if (game) {
    result.repacker = 'steamrip';
    result.type = 'play';
    result.exe = game.path;
    result.exeName = game.name;
    return result;
  }

  return result;
}

/**
 * Roda o executável (setup.exe ou game.exe).
 * Sempre usa PowerShell Start-Process — passa pelo Windows ShellExecute,
 * que não trava com arquivos locked por outros processos (WebTorrent ainda
 * tá seedando o setup.exe quando o usuário aperta Instalar/Jogar).
 *
 * Se asAdmin=true, adiciona -Verb RunAs (UAC prompt).
 */
async function run({ exePath, asAdmin = false }) {
  if (!exePath || typeof exePath !== 'string') {
    return { error: 'Caminho do executável inválido' };
  }
  if (!fs.existsSync(exePath)) {
    return { error: 'Executável não encontrado: ' + exePath };
  }

  const cwd = path.dirname(exePath);

  // Escape pra string single-quoted do PowerShell + escape de wildcards
  // PowerShell trata [ ] como char class em -FilePath, então precisamos prefixar
  // com backtick. Ex: "D:\Game [FitGirl]\setup.exe" → "D:\Game `[FitGirl`]\setup.exe"
  const psEscape = (s) => s
    .replace(/`/g, '``')          // backtick existente (raro, mas seguro)
    .replace(/\[/g, '`[')          // wildcard [
    .replace(/\]/g, '`]')          // wildcard ]
    .replace(/'/g, "''");          // single-quote (delimiter da string PS)

  const escapedExe = psEscape(exePath);
  const escapedCwd = psEscape(cwd);
  const verbArg = asAdmin ? `-Verb RunAs` : '';
  const psCmd = `try { Start-Process -FilePath '${escapedExe}' -WorkingDirectory '${escapedCwd}' ${verbArg} -ErrorAction Stop } catch { Write-Error $_.Exception.Message; exit 1 }`;

  console.log('[installer] running:', { exePath, asAdmin, cwd });

  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', psCmd], {
      windowsHide: true,
    });

    let stderr = '';
    let stdout = '';
    let resolved = false;

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    // Timeout: se PowerShell não responder em 8s, considera "iniciado OK"
    // (Start-Process é fire-and-forget normalmente)
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.log('[installer] PowerShell timeout, assuming OK');
      resolve({ ok: true });
    }, 8000);

    child.on('exit', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      console.log('[installer] PowerShell exit:', { code, stdout, stderr });
      if (code === 0) {
        resolve({ ok: true });
      } else {
        const errMsg = (stderr || stdout || `PowerShell exit ${code}`).trim();
        // Erros comuns:
        //   "The operation was canceled by the user" → UAC negado
        //   "is not recognized" → PowerShell não encontrado
        let friendly = errMsg;
        if (/canceled by the user/i.test(errMsg)) {
          friendly = 'UAC cancelado pelo usuário';
        } else if (/cannot find/i.test(errMsg) || /not recognized/i.test(errMsg)) {
          friendly = 'PowerShell não encontrado ou caminho inválido';
        }
        resolve({ error: friendly, raw: errMsg });
      }
    });

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      console.log('[installer] PowerShell spawn error:', err);
      resolve({ error: err.message });
    });
  });
}

module.exports = { detect, run };
