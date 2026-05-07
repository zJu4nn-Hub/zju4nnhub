// library.js — Biblioteca: launch de jogos + tracking de playtime
//
// Funções principais:
//   - launchAppDownload({id, exePath}) → spawna exe direto, captura PID, agenda poll
//   - launchSteamTools({appid}) → abre steam://run/{appid} (sem PID — usa appmanifest)
//   - readSteamLastPlayed(appid) → lê LastPlayed do appmanifest_{appid}.acf
//   - getPlaytime(key) → {totalMinutes, lastPlayed, isActive}
//   - listSessions() → array de sessões ativas
//
// Persistência: userData/playtime.json
//   { [key]: { totalMinutes, lastPlayed, activeSession?: {startedAt, exePath, pid} } }
// Keys: st_{appid} (Steam Tools) | dl_{id} (App download)

const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, exec } = require('node:child_process');

const POLL_INTERVAL_MS = 15_000; // checa PID a cada 15s
const MIN_SESSION_MINUTES = 1;   // sessões < 1min são descartadas (crash inicial)

// Auto-detect Steam game (após clicar Jogar):
// - Espera 8s pra Steam abrir
// - Procura por processos em steamapps/common/{installdir}/ a cada 5s, até 2min
// - Quando achar, monitora a cada 60s; quando todos PIDs morrem → finalize
const STEAM_DETECT_DELAY_MS = 8_000;
const STEAM_DETECT_TIMEOUT_MS = 120_000;
const STEAM_DETECT_INTERVAL_MS = 5_000;
const STEAM_MONITOR_INTERVAL_MS = 15_000;

let mainWindow = null;
let stateFile = null;
let state = {};                  // { key: { totalMinutes, lastPlayed, activeSession } }
const pollTimers = new Map();    // key → setInterval handle

// ============================================================
// PERSISTÊNCIA
// ============================================================
function loadState() {
  try {
    if (fs.existsSync(stateFile)) {
      const raw = fs.readFileSync(stateFile, 'utf8');
      state = JSON.parse(raw) || {};
    }
  } catch (err) {
    console.warn('[library] loadState falhou:', err.message);
    state = {};
  }
}

function saveState() {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[library] saveState falhou:', err.message);
  }
}

function ensureKey(key) {
  if (!state[key]) {
    state[key] = { totalMinutes: 0, lastPlayed: null, activeSession: null };
  }
  return state[key];
}

function broadcast(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('library:state', payload);
  }
}

// ============================================================
// PID POLLING (Windows)
// ============================================================
function isPidAlive(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve(false);
    // tasklist /FI "PID eq XXX" /FO CSV /NH → retorna 1 linha se existe, "INFO: ..." se não
    exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(false);
      const out = (stdout || '').trim();
      // Output esperado: '"image.exe","12345","Console","1","12,345 K"'
      // Se PID não existe: 'INFO: No tasks are running which match the specified criteria.'
      resolve(out.length > 0 && !/^INFO:/i.test(out));
    });
  });
}

// ============================================================
// STEAM AUTO-DETECT (procura processos em steamapps/common/{installdir}/)
// ============================================================
function readSteamInstallPath(appid, steamPath) {
  if (!appid) return null;
  const candidates = getAppmanifestCandidates(appid, steamPath);
  console.log(`[lib] readSteamInstallPath(${appid}) — testando ${candidates.length} candidatos`);
  for (const file of candidates) {
    try {
      const exists = fs.existsSync(file);
      if (!exists) {
        console.log(`  ✗ não existe: ${file}`);
        continue;
      }
      console.log(`  ✓ achou: ${file}`);
      const content = fs.readFileSync(file, 'utf8');
      const m = content.match(/"installdir"\s+"([^"]+)"/);
      if (!m) {
        console.log(`    mas sem "installdir" no acf`);
        continue;
      }
      const steamappsDir = path.dirname(file);
      const full = path.join(steamappsDir, 'common', m[1]);
      console.log(`    installdir="${m[1]}" → full="${full}" (existe? ${fs.existsSync(full)})`);
      return full;
    } catch (err) {
      console.log(`  err ao ler ${file}: ${err.message}`);
    }
  }
  return null;
}

// Lista todos os processos com path em uma pasta — via PowerShell Get-Process
function findProcessesInPath(rootPath) {
  return new Promise((resolve) => {
    if (!rootPath) return resolve([]);
    // Escape pra string PS single-quoted
    const safe = rootPath.replace(/'/g, "''").toLowerCase();
    const ps = `Get-Process | Where-Object { $_.Path -and $_.Path.ToLower().StartsWith('${safe}') } | Select-Object -ExpandProperty Id`;
    exec(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const pids = (stdout || '').split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10)).filter(Boolean);
      resolve(pids);
    });
  });
}

async function startSteamSearch(key, appid, installPath) {
  stopPolling(key);
  const startedAt = Date.now();
  const timer = setInterval(async () => {
    if (!state[key]?.activeSession) {
      stopPolling(key);
      return;
    }
    if (Date.now() - startedAt > STEAM_DETECT_TIMEOUT_MS) {
      stopPolling(key);
      console.log('[library] timeout auto-detect appid', appid, '— sessão fica manual');
      return;
    }
    const pids = await findProcessesInPath(installPath);
    if (pids.length > 0) {
      stopPolling(key);
      state[key].activeSession.pids = pids;
      state[key].activeSession.installPath = installPath;
      saveState();
      console.log('[library] detectou pids', pids, 'pro appid', appid);
      startSteamMonitor(key, installPath);
    }
  }, STEAM_DETECT_INTERVAL_MS);
  pollTimers.set(key, timer);
}

function startSteamMonitor(key, installPath) {
  stopPolling(key);
  const timer = setInterval(async () => {
    if (!state[key]?.activeSession) {
      stopPolling(key);
      return;
    }
    // Tick do watcher de achievements (junto com o monitor de processo)
    try { require('./achievements').tickWatcher(key); } catch {}
    const pids = await findProcessesInPath(installPath);
    if (pids.length === 0) {
      const totalMinutesBefore = state[key].totalMinutes || 0;
      finalizeSession(key);
      console.log('[library] auto-finalize:', key, 'minutos antes:', totalMinutesBefore, 'depois:', state[key].totalMinutes);
    } else {
      state[key].activeSession.pids = pids;
    }
  }, STEAM_MONITOR_INTERVAL_MS);
  pollTimers.set(key, timer);
}

function startPolling(key) {
  if (pollTimers.has(key)) return;
  const timer = setInterval(async () => {
    const entry = state[key];
    if (!entry?.activeSession?.pid) {
      stopPolling(key);
      return;
    }
    // Tick do watcher de achievements (lazy require pra evitar dep circular)
    try { require('./achievements').tickWatcher(key); } catch {}
    const alive = await isPidAlive(entry.activeSession.pid);
    if (alive) return;

    // PID original morreu — mas o jogo pode ter spawned outro processo (launcher → game.exe).
    // Varre a pasta do .exe pra ver se ainda tem algum processo do jogo rodando.
    const exePath = entry.activeSession.exePath;
    if (exePath) {
      try {
        const folder = path.dirname(exePath);
        const pids = await findProcessesInPath(folder);
        if (pids.length > 0) {
          // Re-aponta o tracking pro novo PID (mantém sessão ativa)
          entry.activeSession.pid = pids[0];
          entry.activeSession.pids = pids;
          console.log(`[library] PID original morreu; child detectado em ${folder}: ${pids.join(',')}`);
          return;
        }
      } catch {}
    }

    // Nenhum processo do jogo rodando → finaliza
    finalizeSession(key);
  }, POLL_INTERVAL_MS);
  pollTimers.set(key, timer);
}

function stopPolling(key) {
  const t = pollTimers.get(key);
  if (t) {
    clearInterval(t);
    pollTimers.delete(key);
  }
}

function finalizeSession(key) {
  const entry = state[key];
  if (!entry?.activeSession) return;
  const { startedAt } = entry.activeSession;
  const minutes = Math.max(0, (Date.now() - startedAt) / 60_000);
  if (minutes >= MIN_SESSION_MINUTES) {
    entry.totalMinutes = (entry.totalMinutes || 0) + Math.round(minutes);
  }
  entry.lastPlayed = Date.now();
  entry.activeSession = null;
  saveState();
  stopPolling(key);
  // Tick final + para o watcher de achievements
  try { require('./achievements').tickWatcher(key).catch(() => {}); } catch {}
  try { require('./achievements').stopWatcher(key); } catch {}
  broadcast({ key, kind: 'finalized', totalMinutes: entry.totalMinutes, lastPlayed: entry.lastPlayed });
}

// ============================================================
// LAUNCH: APP DOWNLOAD (game.exe direto, com PID)
// ============================================================
async function launchAppDownload({ id, exePath }) {
  if (!id || !exePath) {
    return { error: 'id ou exePath ausente' };
  }
  if (!fs.existsSync(exePath)) {
    return { error: 'Executável não encontrado: ' + exePath };
  }

  // Se id já tem prefix (st_, dl_, lib_) usa direto; senão monta dl_{id}
  const key = /^(st|dl|lib)_/.test(id) ? id : `dl_${id}`;
  const entry = ensureKey(key);

  // Se já tem sessão ativa, encerra antes
  if (entry.activeSession?.pid) {
    finalizeSession(key);
  }

  const cwd = path.dirname(exePath);
  let pid = null;
  try {
    // detached + ignore stdio → o processo roda independente, e nós só seguramos o PID
    const child = spawn(exePath, [], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    pid = child.pid;
    child.unref(); // não trava o app principal
    // Se o spawn falhou logo de cara (exit imediato), o erro vai vir aqui
    child.on('error', (err) => {
      console.warn('[library] spawn error:', err.message);
    });
  } catch (err) {
    return { error: 'Falha ao spawnar: ' + err.message };
  }

  if (!pid) {
    return { error: 'PID não capturado' };
  }

  entry.activeSession = { startedAt: Date.now(), exePath, pid };
  entry.lastPlayed = Date.now();
  saveState();
  startPolling(key);
  broadcast({ key, kind: 'started', pid, lastPlayed: entry.lastPlayed });
  // Inicia watcher de achievements se conseguirmos extrair o appid da key
  try {
    const m = key.match(/^(?:st|lib)_(\d+)/);
    if (m) {
      require('./achievements').startWatcher({ key, appid: parseInt(m[1], 10), exePath });
    }
  } catch {}
  return { ok: true, pid, key };
}

// ============================================================
// LAUNCH: STEAM TOOLS (steam://run/{appid})
// ============================================================
async function launchSteamTools({ appid, steamPath }) {
  if (!appid) return { error: 'appid ausente' };

  const key = `st_${appid}`;
  const entry = ensureKey(key);

  // Se já tinha sessão ativa do MESMO jogo, encerra (toggle)
  if (entry.activeSession) {
    finalizeSession(key);
    broadcast({ key, kind: 'finalized', totalMinutes: entry.totalMinutes, lastPlayed: entry.lastPlayed });
    return { ok: true, key, ended: true };
  }

  // Encerra qualquer sessão ativa de OUTRO jogo Steam Tools (assume 1 jogo por vez)
  for (const k of Object.keys(state)) {
    if (k !== key && k.startsWith('st_') && state[k]?.activeSession) {
      finalizeSession(k);
    }
  }

  const url = `steam://run/${appid}`;
  try {
    await shell.openExternal(url);
  } catch (err) {
    return { error: 'Falha ao abrir Steam: ' + err.message };
  }

  // Inicia sessão (auto-detect via processo se possível)
  entry.activeSession = { startedAt: Date.now() };
  entry.lastPlayed = Date.now();
  saveState();
  broadcast({ key, kind: 'started', lastPlayed: entry.lastPlayed });
  // Inicia watcher de achievements pra esse appid (Steam Tools sempre tem appid)
  try { require('./achievements').startWatcher({ key, appid, exePath: null }); } catch {}

  // Tenta resolver installPath e agendar busca por processo
  const installPath = readSteamInstallPath(appid, steamPath);
  if (installPath) {
    setTimeout(() => {
      if (state[key]?.activeSession && !state[key].activeSession.pids) {
        startSteamSearch(key, appid, installPath).catch((err) =>
          console.warn('[library] startSteamSearch falhou:', err.message));
      }
    }, STEAM_DETECT_DELAY_MS);
  } else {
    console.log('[library] sem installdir pro appid', appid, '— sessão manual (precisa Encerrar manualmente)');
  }

  return { ok: true, key, started: true };
}

// ============================================================
// READ STEAM appmanifest_{appid}.acf
// ============================================================
function getAppmanifestCandidates(appid, steamPath) {
  const candidates = [];
  const tryAdd = (root) => {
    if (!root) return;
    candidates.push(path.join(root, 'steamapps', `appmanifest_${appid}.acf`));
    // Lê libraryfolders.vdf pra cobrir bibliotecas em outros HDs
    const lf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    try {
      if (fs.existsSync(lf)) {
        const content = fs.readFileSync(lf, 'utf8');
        const pathRe = /"path"\s+"([^"]+)"/g;
        let m;
        while ((m = pathRe.exec(content)) !== null) {
          const lib = m[1].replace(/\\\\/g, '\\');
          candidates.push(path.join(lib, 'steamapps', `appmanifest_${appid}.acf`));
        }
      }
    } catch {}
  };
  if (steamPath && typeof steamPath === 'string') tryAdd(steamPath);
  for (const p of [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'D:\\Program Files (x86)\\Steam',
  ]) tryAdd(p);
  return candidates;
}

function readSteamLastPlayed(appid, steamPath) {
  if (!appid) return null;
  const candidates = getAppmanifestCandidates(appid, steamPath);
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const m = content.match(/"LastPlayed"\s+"(\d+)"/);
        if (m) {
          const ts = parseInt(m[1], 10);
          if (ts > 0) return ts * 1000; // ACF é Unix seconds → ms
        }
        return 0;
      }
    } catch {}
  }
  return null;
}

// Checa se o jogo está REALMENTE instalado: pasta existe E tem um .exe válido (não redist).
// Lua+manifest podem existir mesmo sem o jogo baixado — o que importa é se acha o executável.
function isSteamGameInstalled(appid, steamPath) {
  if (!appid) return false;
  const exe = autoDetectGameExe(appid, steamPath);
  return !!exe;
}

// Auto-detecta o .exe principal do jogo na pasta steamapps/common/{installdir}
const MIN_EXE_SIZE = 100 * 1024; // 100KB — alguns indies têm exe pequeno; só ignora stubs ínfimos

// Regex de "lixo" pra ignorar (redists, uninstallers, setups, anti-cheat, crash handlers)
const REDIST_RE = /(redist|vcredist|dotnet|directx|dxsetup|vc_redist|isscript|d3dcompiler|crashpad|crashreport|unitycrashhandler|prerequisite|easyanticheat|battleye|installer|setup_|setup\.|unins\d*|uninstall)/i;
const REDIST_DIR_RE = /^(redist|_redist|_commonredist|_dxsetup|directx|vcredist|easyanticheat|battleye)$/i;

// Scan recursivo numa pasta retornando .exe candidatos (já filtrados)
function scanForGameExes(rootDir, maxDepth = 3) {
  function scan(dir, depth) {
    if (depth > maxDepth) return [];
    const out = [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (REDIST_DIR_RE.test(e.name)) continue;
        out.push(...scan(full, depth + 1));
      } else if (e.isFile() && /\.exe$/i.test(e.name)) {
        if (REDIST_RE.test(e.name)) continue;
        try {
          const st = fs.statSync(full);
          if (st.size < MIN_EXE_SIZE) continue;
          out.push({ path: full, name: e.name, size: st.size });
        } catch {}
      }
    }
    return out;
  }
  return scan(rootDir, 0);
}

// Acha o melhor .exe (maior tamanho ignorando lixo) numa pasta arbitrária
function autoDetectExeInFolder(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    console.log(`[lib] autoDetectExeInFolder: pasta inválida →`, folderPath);
    return null;
  }
  const candidates = scanForGameExes(folderPath, 3);
  if (!candidates.length) {
    console.log(`[lib] autoDetectExeInFolder: nenhum .exe válido em`, folderPath);
    return null;
  }
  candidates.sort((a, b) => b.size - a.size);
  console.log(`[lib] autoDetectExeInFolder: achou`, candidates[0].path, `(${(candidates[0].size / 1024 / 1024).toFixed(1)}MB)`);
  return candidates[0].path;
}

function autoDetectGameExe(appid, steamPath) {
  if (!appid) return null;
  const installPath = readSteamInstallPath(appid, steamPath);
  if (!installPath) {
    console.log(`[lib] autoDetectGameExe(${appid}): readSteamInstallPath retornou null`);
    return null;
  }
  return autoDetectExeInFolder(installPath);
}

function readSteamSizeOnDisk(appid, steamPath) {
  if (!appid) return null;
  const candidates = getAppmanifestCandidates(appid, steamPath);
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const m = content.match(/"SizeOnDisk"\s+"(\d+)"/);
        if (m) {
          const bytes = parseInt(m[1], 10);
          if (bytes > 0) return bytes;
        }
        return 0;
      }
    } catch {}
  }
  return null;
}

// Encerra manualmente uma sessão (usado pra Steam Tools que não tem PID)
function endSession(key) {
  finalizeSession(key);
  return getPlaytime(key);
}

// Zera tempo de jogo + lastPlayed (mantém a entry, sem sessão ativa)
function resetPlaytime(key) {
  if (!key) return false;
  if (!state[key]) return false;
  // Encerra sessão ativa se houver, senão o zero ficaria sobrescrito no finalizeSession
  if (state[key].activeSession) finalizeSession(key);
  state[key].totalMinutes = 0;
  state[key].lastPlayed = null;
  saveState();
  return true;
}

// Remove totalmente a entry de playtime (usado ao remover jogo da biblioteca)
function removePlaytime(key) {
  if (!key) return false;
  if (!state[key]) return false;
  if (state[key].activeSession) finalizeSession(key);
  delete state[key];
  saveState();
  return true;
}

// ============================================================
// API PÚBLICA
// ============================================================
function getPlaytime(key) {
  const entry = state[key];
  if (!entry) return { totalMinutes: 0, lastPlayed: null, isActive: false };
  let activeMinutes = 0;
  if (entry.activeSession) {
    activeMinutes = Math.max(0, (Date.now() - entry.activeSession.startedAt) / 60_000);
  }
  return {
    totalMinutes: (entry.totalMinutes || 0) + Math.round(activeMinutes),
    lastPlayed: entry.lastPlayed || null,
    isActive: !!entry.activeSession,
  };
}

function listSessions() {
  const sessions = [];
  for (const [key, entry] of Object.entries(state)) {
    if (entry.activeSession) {
      sessions.push({
        key,
        startedAt: entry.activeSession.startedAt,
        pid: entry.activeSession.pid,
      });
    }
  }
  return sessions;
}

// ============================================================
// INIT
// ============================================================
async function init(window) {
  mainWindow = window;
  stateFile = path.join(app.getPath('userData'), 'playtime.json');
  loadState();

  // Limpeza: sessões órfãs (PID morreu enquanto app tava fechado)
  for (const key of Object.keys(state)) {
    const session = state[key]?.activeSession;
    if (!session) continue;

    // Sessão de app-download (PID único)
    if (session.pid) {
      const alive = await isPidAlive(session.pid);
      if (!alive) {
        finalizeSession(key);
      } else {
        startPolling(key);
      }
      continue;
    }

    // Sessão Steam Tools auto-detectada (com lista de PIDs + installPath)
    if (Array.isArray(session.pids) && session.pids.length && session.installPath) {
      const alives = await Promise.all(session.pids.map(isPidAlive));
      if (!alives.some(Boolean)) {
        finalizeSession(key);
      } else {
        startSteamMonitor(key, session.installPath);
      }
      continue;
    }

    // Sessão Steam Tools manual (sem PIDs ainda) — tenta reativar auto-detect
    if (key.startsWith('st_') && session.startedAt) {
      const appid = parseInt(key.slice(3), 10);
      if (appid) {
        const installPath = readSteamInstallPath(appid, null);
        if (installPath) {
          startSteamSearch(key, appid, installPath).catch(() => {});
        }
      }
    }
  }
  console.log('[library] init OK — playtime entries:', Object.keys(state).length);
}

module.exports = {
  init,
  launchAppDownload,
  launchSteamTools,
  readSteamLastPlayed,
  readSteamSizeOnDisk,
  isSteamGameInstalled,
  autoDetectGameExe,
  autoDetectExeInFolder,
  endSession,
  resetPlaytime,
  removePlaytime,
  getPlaytime,
  listSessions,
};
