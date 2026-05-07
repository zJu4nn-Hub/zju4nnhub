// steam-tools.js — Integração com Steam + Steam Tools (Millennium) + Lua import
//
// Replica a lógica do plugin Lua Tools direto no nosso app:
//   1. Detecta path de instalação da Steam (Windows registry)
//   2. Detecta se Steam Tools (Millennium) tá instalada
//   3. Instala Steam Tools se necessário (PowerShell UAC)
//   4. Baixa zip {appid}.zip via fontes configuradas em sources-config.json
//   5. Extrai e instala .lua + .manifest nos diretórios certos da Steam
//   6. Reinicia Steam pra carregar o jogo

const { app, BrowserWindow, net, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, exec } = require('node:child_process');
const crypto = require('node:crypto');

// ============================================================
// FONTES — carregadas de sources-config.json (gitignored).
// Faça uma cópia de sources-config.example.json pra criar a sua.
// Cada entry vira: { name, url ({appid} placeholder), successCode, unavailableCode,
//                    requiresAuth?, getHeaders? }
// ============================================================
function loadSourcesConfig() {
  const candidatePaths = [
    path.join(__dirname, 'sources-config.json'),
    path.join(__dirname, 'sources-config.example.json'),
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const cfg = JSON.parse(raw);
        if (Array.isArray(cfg.luaApis) && cfg.luaApis.length) return cfg;
      }
    } catch (err) {
      console.warn(`[sources] falha lendo ${path.basename(p)}: ${err.message}`);
    }
  }
  console.warn('[sources] nenhum sources-config.json encontrado — Steam Tools desabilitado');
  return { luaApis: [], installScript: '' };
}

const SOURCES_CFG = loadSourcesConfig();
// Materializa getHeaders pra entries que dependem de uma settings key
const LUA_APIS = SOURCES_CFG.luaApis.map((s) => ({
  ...s,
  getHeaders: s.requiresAuth && s.authSettingKey
    ? () => {
        try {
          const settings = require('./settings');
          const key = settings.get(s.authSettingKey);
          return key ? { Authorization: `Bearer ${key}` } : null;
        } catch { return null; }
      }
    : undefined,
}));

const SCRIPT_INSTALL_STEAM_TOOLS = SOURCES_CFG.installScript || '';

// ============================================================
// STEAM PATH DETECTION
// ============================================================

// Paths padrão onde Steam costuma estar instalado no Windows
const COMMON_STEAM_PATHS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
  'D:\\Steam',
  'D:\\Program Files (x86)\\Steam',
  'D:\\Program Files\\Steam',
  'D:\\Games\\Steam',
  'E:\\Steam',
  'E:\\Games\\Steam',
];

/**
 * Verifica se um path é uma pasta de instalação Steam válida
 * (deve ter steam.exe e a pasta config/)
 */
function isValidSteamPath(p) {
  if (!p || typeof p !== 'string') return false;
  try {
    return fs.existsSync(path.join(p, 'steam.exe')) && fs.existsSync(path.join(p, 'config'));
  } catch {
    return false;
  }
}

/**
 * Detecta o path da Steam tentando, em ordem:
 *   1. Setting custom (`steamPath` em settings.json) — usuário escolheu manualmente
 *   2. Registry do Windows (HKLM/HKCU Valve\Steam)
 *   3. Paths padrão (C:\Program Files (x86)\Steam, etc)
 *
 * Retorna null se Steam realmente não tiver instalada em lugar nenhum.
 */
async function detectSteamPath() {
  if (process.platform !== 'win32') return null;

  // 1. Tenta o path custom dos settings
  try {
    const settings = require('./settings');
    const custom = settings.get('steamPath');
    if (custom && isValidSteamPath(custom)) {
      return custom;
    }
  } catch {}

  // 2. Tenta o registry
  const fromRegistry = await detectSteamFromRegistry();
  if (fromRegistry && isValidSteamPath(fromRegistry)) {
    return fromRegistry;
  }

  // 3. Fallback: tenta os paths padrão
  for (const p of COMMON_STEAM_PATHS) {
    if (isValidSteamPath(p)) return p;
  }

  return null;
}

function detectSteamFromRegistry() {
  return new Promise((resolve) => {
    const psCmd = `
      $paths = @(
        'HKLM:\\Software\\WOW6432Node\\Valve\\Steam',
        'HKLM:\\Software\\Valve\\Steam',
        'HKCU:\\Software\\Valve\\Steam'
      )
      foreach ($p in $paths) {
        try {
          $val = (Get-ItemProperty -Path $p -ErrorAction Stop).InstallPath
          if (-not $val) { $val = (Get-ItemProperty -Path $p -ErrorAction Stop).SteamPath }
          if ($val -and (Test-Path $val)) {
            Write-Output $val
            exit 0
          }
        } catch { continue }
      }
      exit 1
    `;

    exec(`powershell -NoProfile -Command "${psCmd.replace(/\n\s*/g, '; ')}"`,
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const out = (stdout || '').trim().split('\n')[0]?.trim();
        resolve(out || null);
      }
    );
  });
}

// ============================================================
// STEAM TOOLS DETECTION
// ============================================================

/**
 * Detecta se Steam Tools/Millennium tá instalado.
 * Checks:
 *   - {SteamPath}/millennium.dll OU {SteamPath}/python311.dll → Millennium framework
 *   - {SteamPath}/config/stplug-in/ → diretório onde os .lua vivem
 *   - {SteamPath}/depotcache/ → diretório onde .manifest vivem
 */
async function detectSteamTools(steamPath) {
  if (!steamPath) {
    steamPath = await detectSteamPath();
    if (!steamPath) return { steamPath: null, installed: false, hasMillennium: false, hasStplugin: false };
  }

  const millenniumDll = path.join(steamPath, 'millennium.dll');
  const python311 = path.join(steamPath, 'python311.dll');
  const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
  const depotcacheDir = path.join(steamPath, 'depotcache');

  const hasMillennium = fs.existsSync(millenniumDll) || fs.existsSync(python311);
  const hasStplugin = fs.existsSync(stpluginDir);
  const hasDepotcache = fs.existsSync(depotcacheDir);

  return {
    steamPath,
    installed: hasMillennium && hasStplugin,
    hasMillennium,
    hasStplugin,
    hasDepotcache,
    paths: {
      millennium: millenniumDll,
      stplugin: stpluginDir,
      depotcache: depotcacheDir,
    },
  };
}

/**
 * Conta quantos jogos já foram adicionados via Lua Tools (arquivos no stplug-in)
 */
async function countInstalledLuaApps(steamPath) {
  if (!steamPath) {
    steamPath = await detectSteamPath();
    if (!steamPath) return 0;
  }
  const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
  if (!fs.existsSync(stpluginDir)) return 0;
  try {
    const files = fs.readdirSync(stpluginDir);
    return files.filter((f) => /^\d+\.lua$/i.test(f)).length;
  } catch {
    return 0;
  }
}

/**
 * Lista TODOS os jogos adicionados via Lua Tools/Steam Tools (.lua files).
 * Retorna [{ appid, name?, filename, disabled, modifiedAt, sizeBytes }, ...].
 * Os nomes vêm do loaded_apps.txt se existir.
 */
async function listInstalledLuaApps(steamPath) {
  if (!steamPath) {
    steamPath = await detectSteamPath();
    if (!steamPath) return [];
  }
  const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
  if (!fs.existsSync(stpluginDir)) return [];

  const apps = [];
  try {
    const files = fs.readdirSync(stpluginDir);
    for (const f of files) {
      const m = /^(\d+)\.lua(\.disabled)?$/i.exec(f);
      if (!m) continue;
      const fullPath = path.join(stpluginDir, f);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      apps.push({
        appid: parseInt(m[1], 10),
        filename: f,
        disabled: !!m[2],
        modifiedAt: stat.mtimeMs,
        sizeBytes: stat.size,
        path: fullPath,
        name: null, // vai ser preenchido abaixo
      });
    }
  } catch {
    return [];
  }

  // Cruza com loaded_apps.txt pra pegar nomes
  const loadedAppsPath = path.join(stpluginDir, 'loaded_apps.txt');
  if (fs.existsSync(loadedAppsPath)) {
    try {
      const lines = fs.readFileSync(loadedAppsPath, 'utf8').split(/\r?\n/);
      const names = {};
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        const id = line.slice(0, idx).trim();
        const name = line.slice(idx + 1).trim();
        if (id && name) names[id] = name;
      }
      apps.forEach((a) => {
        if (names[String(a.appid)]) a.name = names[String(a.appid)];
      });
    } catch {}
  }

  // Ordena por mais recente primeiro
  apps.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return apps;
}

/**
 * Verifica se um appid específico já foi adicionado
 */
async function hasLuaForApp(appid, steamPath) {
  if (!steamPath) {
    steamPath = await detectSteamPath();
    if (!steamPath) return false;
  }
  const luaPath = path.join(steamPath, 'config', 'stplug-in', `${appid}.lua`);
  const disabledPath = path.join(steamPath, 'config', 'stplug-in', `${appid}.lua.disabled`);
  return fs.existsSync(luaPath) || fs.existsSync(disabledPath);
}

// ============================================================
// INSTALL STEAM TOOLS (PowerShell UAC)
// ============================================================

/**
 * Instala Steam Tools rodando o script PS1 oficial com UAC.
 * Retorna uma Promise que resolve quando o user aceita/recusa o UAC.
 * (Não dá pra saber se o install completou — Steam vai reiniciar e a gente
 * detecta da próxima vez via detectSteamTools)
 */
async function installSteamTools() {
  if (process.platform !== 'win32') {
    throw new Error('Steam Tools só funciona no Windows');
  }

  // Comando: PowerShell roda `irm <url> | iex` com elevação
  const innerCmd = `irm '${SCRIPT_INSTALL_STEAM_TOOLS}' | iex`;
  const escapedInner = innerCmd.replace(/'/g, "''");

  // Outer: Start-Process powershell -Verb RunAs com o script inner
  const outerCmd = `Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','${escapedInner}' -Verb RunAs -WindowStyle Normal`;

  return new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', outerCmd], {
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ ok: true, message: 'Steam Tools sendo instalada — aguarde o terminal terminar.' });
      } else {
        const err = stderr.trim() || `Exit code ${code}`;
        if (/canceled by the user/i.test(err)) {
          resolve({ error: 'UAC cancelado pelo usuário' });
        } else {
          resolve({ error: err });
        }
      }
    });

    child.on('error', (err) => resolve({ error: err.message }));
  });
}

// ============================================================
// HTTP DOWNLOAD HELPER (com progresso)
// ============================================================

function downloadToFile(url, destPath, onProgress, headers = null) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' });
    request.setHeader('User-Agent', 'Mozilla/5.0 zJu4nn-Hub/1.0');
    if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        if (v != null) request.setHeader(k, String(v));
      }
    }

    let totalBytes = 0;
    let received = 0;
    let writeStream = null;

    const cleanup = () => {
      if (writeStream && !writeStream.closed) {
        try { writeStream.end(); } catch {}
      }
    };

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        request.abort();
        cleanup();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      totalBytes = parseInt(response.headers['content-length'] || '0', 10) || 0;
      writeStream = fs.createWriteStream(destPath);

      response.on('data', (chunk) => {
        writeStream.write(chunk);
        received += chunk.length;
        if (onProgress) {
          onProgress({ received, total: totalBytes });
        }
      });

      response.on('end', () => {
        writeStream.end(() => {
          // Verifica se é um zip válido (magic number PK\x03\x04)
          try {
            const fd = fs.openSync(destPath, 'r');
            const buf = Buffer.alloc(4);
            fs.readSync(fd, buf, 0, 4, 0);
            fs.closeSync(fd);
            const isPK = buf[0] === 0x50 && buf[1] === 0x4b;
            if (!isPK) {
              try { fs.unlinkSync(destPath); } catch {}
              reject(new Error('Arquivo retornado não é um zip válido'));
              return;
            }
          } catch (err) {
            reject(err);
            return;
          }
          resolve({ size: received });
        });
      });

      response.on('error', (err) => {
        cleanup();
        reject(err);
      });
    });

    request.on('error', (err) => {
      cleanup();
      reject(err);
    });

    setTimeout(() => {
      request.abort();
      cleanup();
      reject(new Error('Timeout (60s)'));
    }, 60000);

    request.end();
  });
}

// ============================================================
// ADD GAME TO STEAM (LUA DOWNLOAD + EXTRACT + INSTALL)
// ============================================================

const downloadStates = new Map(); // appid → { status, currentApi, percent, error }

function setState(appid, update) {
  const cur = downloadStates.get(appid) || {};
  const newState = { ...cur, ...update };
  downloadStates.set(appid, newState);
  // Broadcast aos renderers
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('steam-tools:state', { appid, state: newState });
    }
  }
  return newState;
}

function getState(appid) {
  return downloadStates.get(appid) || { status: 'idle' };
}

/**
 * Processa o conteúdo de um .lua igual o plugin original faz:
 * comenta linhas `setManifestid(...)` (não-comentadas) pra evitar problemas
 * de versão do depot.
 */
function processLuaContent(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      // Comenta setManifestid se ainda não tiver --
      if (/^\s*setManifestid\(/.test(line) && !/^\s*--/.test(line)) {
        return line.replace(/^(\s*)/, '$1--');
      }
      return line;
    })
    .join('\n');
}

/**
 * Extrai um zip pra instalar .lua + .manifest na Steam.
 * Usa o módulo nativo de zip do Electron via JS (vamos usar adm-zip ou yauzl).
 */
async function extractAndInstallLua(zipPath, appid, steamPath) {
  // Lazy import yauzl (vai precisar instalar)
  let yauzl;
  try {
    yauzl = require('yauzl');
  } catch {
    throw new Error('Módulo yauzl não instalado (npm install yauzl)');
  }

  const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
  const depotcacheDir = path.join(steamPath, 'depotcache');

  fs.mkdirSync(stpluginDir, { recursive: true });
  fs.mkdirSync(depotcacheDir, { recursive: true });

  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      const manifestsExtracted = [];
      let luaName = null;
      let luaContent = null;

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        const baseName = path.basename(entry.fileName);

        // Pula diretórios
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        // .manifest → vai pra depotcache (lê + escreve)
        if (/\.manifest$/i.test(baseName)) {
          zipfile.openReadStream(entry, (err2, readStream) => {
            if (err2) {
              zipfile.readEntry();
              return;
            }
            const out = path.join(depotcacheDir, baseName);
            const ws = fs.createWriteStream(out);
            readStream.pipe(ws);
            ws.on('close', () => {
              manifestsExtracted.push(baseName);
              zipfile.readEntry();
            });
            ws.on('error', () => zipfile.readEntry());
          });
          return;
        }

        // .lua: pega o que tem o nome do appid OU o primeiro numérico
        if (/^\d+\.lua$/i.test(baseName)) {
          const matchesAppid = baseName === `${appid}.lua`;
          if (matchesAppid || !luaName) {
            zipfile.openReadStream(entry, (err2, readStream) => {
              if (err2) {
                zipfile.readEntry();
                return;
              }
              const chunks = [];
              readStream.on('data', (chunk) => chunks.push(chunk));
              readStream.on('end', () => {
                if (matchesAppid || !luaName) {
                  luaName = baseName;
                  luaContent = Buffer.concat(chunks).toString('utf8');
                }
                zipfile.readEntry();
              });
              readStream.on('error', () => zipfile.readEntry());
            });
            return;
          }
        }

        // Outros arquivos: pula
        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        if (!luaContent) {
          return reject(new Error('Nenhum arquivo .lua numérico achado no zip'));
        }
        // Processa o lua (comenta setManifestid)
        const processed = processLuaContent(luaContent);
        const luaPath = path.join(stpluginDir, `${appid}.lua`);
        try {
          fs.writeFileSync(luaPath, processed, 'utf8');
        } catch (err2) {
          return reject(new Error(`Falha ao gravar lua: ${err2.message}`));
        }
        resolve({
          luaPath,
          manifestsCount: manifestsExtracted.length,
          manifests: manifestsExtracted,
        });
      });

      zipfile.on('error', (err2) => reject(err2));
    });
  });
}

/**
 * Fluxo completo: baixa lua de uma das APIs e instala.
 */
async function addGameToSteam({ appid, name }) {
  if (!appid) throw new Error('appid obrigatório');
  appid = parseInt(appid, 10);
  if (!appid || isNaN(appid)) throw new Error('appid inválido');

  // 1. Detecta Steam path
  setState(appid, { status: 'detecting', message: 'Detectando Steam…' });
  const steamPath = await detectSteamPath();
  if (!steamPath) {
    setState(appid, { status: 'failed', error: 'Steam não encontrada no PC' });
    throw new Error('Steam não encontrada no PC');
  }

  // 2. Detecta Steam Tools
  const tools = await detectSteamTools(steamPath);
  if (!tools.installed) {
    setState(appid, {
      status: 'needs-steam-tools',
      error: 'Steam Tools não instalada',
      steamPath,
    });
    throw new Error('Steam Tools não instalada — instale antes de adicionar jogos');
  }

  // 3. Verifica se já tem
  if (await hasLuaForApp(appid, steamPath)) {
    setState(appid, { status: 'already-installed', message: 'Jogo já tá adicionado' });
    return { ok: true, alreadyInstalled: true };
  }

  // 4. Tenta baixar das APIs em cascata
  const tempDir = path.join(app.getPath('temp'), 'zhub-lua');
  fs.mkdirSync(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, `${appid}.zip`);

  let lastError = null;
  let usedApi = null;

  for (const api of LUA_APIS) {
    const url = api.url.replace('{appid}', String(appid));
    let headers = null;
    if (typeof api.getHeaders === 'function') {
      headers = api.getHeaders();
      if (api.requiresAuth && (!headers || Object.keys(headers).length === 0)) {
        console.log(`[steam-tools] ${api.name} skip — sem chave configurada`);
        continue;
      }
    }
    setState(appid, {
      status: 'downloading',
      currentApi: api.name,
      message: `Baixando de ${api.name}…`,
      percent: 0,
    });

    try {
      await downloadToFile(url, zipPath, ({ received, total }) => {
        const percent = total > 0 ? Math.round((received / total) * 100) : 0;
        setState(appid, { percent, received, total });
      }, headers);
      usedApi = api.name;
      break; // sucesso
    } catch (err) {
      lastError = err.message;
      console.log(`[steam-tools] ${api.name} falhou: ${err.message}`);
      // Continua tentando próxima API
    }
  }

  if (!usedApi) {
    setState(appid, {
      status: 'failed',
      error: `Não achei o jogo em nenhuma API. Último erro: ${lastError}`,
    });
    throw new Error(`Lua não disponível em nenhuma API (${lastError})`);
  }

  // 5. Extrai e instala
  setState(appid, { status: 'extracting', message: 'Extraindo .lua e .manifest…' });

  let result;
  try {
    result = await extractAndInstallLua(zipPath, appid, steamPath);
  } catch (err) {
    setState(appid, { status: 'failed', error: `Extração falhou: ${err.message}` });
    throw err;
  }

  // 6. Cleanup do zip
  try { fs.unlinkSync(zipPath); } catch {}

  // 7. Salva nome no log de jogos adicionados
  try {
    const loadedAppsPath = path.join(steamPath, 'config', 'stplug-in', 'loaded_apps.txt');
    let lines = [];
    if (fs.existsSync(loadedAppsPath)) {
      lines = fs.readFileSync(loadedAppsPath, 'utf8').split(/\r?\n/);
    }
    lines = lines.filter((l) => !l.startsWith(`${appid}:`));
    lines.push(`${appid}:${name || `Game ${appid}`}`);
    fs.writeFileSync(loadedAppsPath, lines.filter(Boolean).join('\n') + '\n');
  } catch {}

  setState(appid, {
    status: 'done',
    message: `✓ Adicionado via ${usedApi}. Reinicie a Steam pra ver.`,
    api: usedApi,
    luaPath: result.luaPath,
    manifestsCount: result.manifestsCount,
  });

  return {
    ok: true,
    api: usedApi,
    luaPath: result.luaPath,
    manifestsCount: result.manifestsCount,
  };
}

/**
 * Remove um jogo previamente adicionado (apaga o .lua)
 */
async function removeGameFromSteam(appid) {
  appid = parseInt(appid, 10);
  if (!appid) throw new Error('appid inválido');

  const steamPath = await detectSteamPath();
  if (!steamPath) throw new Error('Steam não encontrada');

  const stpluginDir = path.join(steamPath, 'config', 'stplug-in');
  const candidates = [
    path.join(stpluginDir, `${appid}.lua`),
    path.join(stpluginDir, `${appid}.lua.disabled`),
  ];

  const removed = [];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        removed.push(p);
      }
    } catch {}
  }

  return { ok: true, removed };
}

// ============================================================
// STEAM RESTART
// ============================================================

/**
 * Mata processo Steam e reinicia (pra carregar novo lua/manifest).
 * Usa /T (terminate child processes) + /F (force) e aguarda processo
 * realmente encerrar antes de relançar. Verifica via tasklist.
 */
async function restartSteam() {
  if (process.platform !== 'win32') {
    throw new Error('Restart Steam só implementado no Windows');
  }

  const steamPath = await detectSteamPath();
  if (!steamPath) throw new Error('Steam não encontrada');

  const steamExe = path.join(steamPath, 'steam.exe');
  if (!fs.existsSync(steamExe)) {
    throw new Error(`steam.exe não achado em ${steamPath}`);
  }

  // Helper pra checar se Steam ainda tá rodando
  const isSteamRunning = () => new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq steam.exe" /FO CSV /NH', { windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(false);
        resolve(/steam\.exe/i.test(stdout || ''));
      });
  });

  // 1. Tenta encerrar via steam.exe -shutdown (mais limpo, salva config)
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[steam-tools] tentando shutdown limpo da Steam...');
      try {
        await new Promise((res) => {
          spawn(steamExe, ['-shutdown'], { detached: true, stdio: 'ignore' })
            .on('exit', () => res())
            .on('error', () => res());
          setTimeout(res, 1000);
        });
      } catch {}

      // 2. Espera até 5s pelo Steam encerrar sozinho
      let stillRunning = true;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        stillRunning = await isSteamRunning();
        if (!stillRunning) break;
      }

      // 3. Se ainda tá rodando, força com taskkill
      if (stillRunning) {
        console.log('[steam-tools] Steam ainda rodando, forçando taskkill...');
        await new Promise((res) => {
          exec('taskkill /IM steam.exe /T /F', { windowsHide: true }, () => res());
        });
        await new Promise((r) => setTimeout(r, 1500));
      }

      // 4. Inicia Steam de novo
      console.log('[steam-tools] iniciando Steam novamente:', steamExe);
      const child = spawn(steamExe, ['-clearbeta'], {
        detached: true,
        stdio: 'ignore',
        cwd: steamPath,
      });
      child.unref();

      // 5. Verifica se realmente subiu (espera 2s e checa)
      await new Promise((r) => setTimeout(r, 2000));
      const nowRunning = await isSteamRunning();

      if (nowRunning) {
        resolve({ ok: true, message: 'Steam reiniciada' });
      } else {
        resolve({ ok: true, warning: 'Steam pode demorar pra subir — aguarde alguns segundos' });
      }
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  detectSteamPath,
  detectSteamTools,
  countInstalledLuaApps,
  listInstalledLuaApps,
  hasLuaForApp,
  installSteamTools,
  addGameToSteam,
  removeGameFromSteam,
  restartSteam,
  getState,
};
