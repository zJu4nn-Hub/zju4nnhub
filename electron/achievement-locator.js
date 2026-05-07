// achievement-locator.js — Localização de arquivos de unlock dos emuladores (Fase 9.x)
//
// Cobertura inspirada na implementação do Hydra (find-achivement-files.ts):
// Goldberg, CODEX, OnlineFix, EMPRESS, SKIDROW, RLD!, CreamAPI, Razor1911,
// 3DM, RLE, UserStats, SmartSteamEmu, FLT.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Paths base do Windows (lê via process.env)
function getEnvPaths() {
  return {
    APPDATA: process.env.APPDATA || '',
    LOCALAPPDATA: process.env.LOCALAPPDATA || '',
    PUBLIC: process.env.PUBLIC || 'C:\\Users\\Public',
    PROGRAMDATA: process.env.PROGRAMDATA || 'C:\\ProgramData',
    DOCUMENTS: path.join(process.env.USERPROFILE || '', 'Documents'),
    PROGRAMFILES_X86: process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  };
}

// Lista exaustiva de candidatos. Cada entry: { emulator, format, path }
// format: 'json' | 'ini' | 'rld' | 'flt'
// Path string — pode ser arquivo OU pasta (FLT é pasta)
function getCandidatePaths(appid, exePath) {
  const env = getEnvPaths();
  const A = appid;
  const exeFolder = exePath ? path.dirname(exePath) : '';
  const candidates = [];

  // Goldberg
  if (env.APPDATA) {
    candidates.push({ emulator: 'goldberg', format: 'json', path: path.join(env.APPDATA, 'Goldberg SteamEmu Saves', String(A), 'achievements.json') });
    candidates.push({ emulator: 'goldberg', format: 'json', path: path.join(env.APPDATA, 'GSE Saves', String(A), 'achievements.json') });
    candidates.push({ emulator: 'goldberg', format: 'json', path: path.join(env.APPDATA, 'Goldberg SteamEmu Saves', String(A), 'achievements.ini') });
  }

  // CODEX
  if (env.APPDATA) {
    candidates.push({ emulator: 'codex', format: 'ini', path: path.join(env.APPDATA, 'Steam', 'CODEX', String(A), 'achievements.ini') });
  }
  candidates.push({ emulator: 'codex', format: 'ini', path: path.join(env.PUBLIC, 'Documents', 'Steam', 'CODEX', String(A), 'achievements.ini') });

  // OnlineFix (variante de case)
  candidates.push({ emulator: 'onlinefix', format: 'ini', path: path.join(env.PUBLIC, 'Documents', 'OnlineFix', String(A), 'Achievements.ini') });
  candidates.push({ emulator: 'onlinefix', format: 'ini', path: path.join(env.PUBLIC, 'Documents', 'OnlineFix', String(A), 'achievements.ini') });
  candidates.push({ emulator: 'onlinefix', format: 'ini', path: path.join(env.PUBLIC, 'Documents', 'OnlineFix', String(A), 'Stats', 'Achievements.ini') });
  candidates.push({ emulator: 'onlinefix', format: 'ini', path: path.join(env.PUBLIC, 'Documents', 'OnlineFix', String(A), 'Stats', 'achievements.ini') });

  // EMPRESS
  if (env.APPDATA) {
    candidates.push({ emulator: 'empress', format: 'json', path: path.join(env.APPDATA, 'EMPRESS', 'remote', String(A), 'achievements.json') });
  }

  // SKIDROW
  if (env.DOCUMENTS) {
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(env.DOCUMENTS, 'SKIDROW', String(A), 'SteamEmu', 'stats', 'achievements.ini') });
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(env.DOCUMENTS, 'SKIDROW', String(A), 'achievements.ini') });
  }
  if (env.LOCALAPPDATA) {
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(env.LOCALAPPDATA, 'SKIDROW', String(A), 'SteamEmu', 'stats', 'achievements.ini') });
  }

  // RLD!
  candidates.push({ emulator: 'rld', format: 'ini', path: path.join(env.PROGRAMDATA, 'RLD!', String(A), 'achievements.ini') });
  if (env.APPDATA) {
    candidates.push({ emulator: 'rld', format: 'ini', path: path.join(env.APPDATA, 'Steam', 'Player', String(A), 'stats', 'achievements.ini') });
    candidates.push({ emulator: 'rld', format: 'ini', path: path.join(env.APPDATA, 'Steam', 'RLD!', String(A), 'stats', 'achievements.ini') });
    candidates.push({ emulator: 'rld', format: 'ini', path: path.join(env.APPDATA, 'Steam', 'dodi', String(A), 'stats', 'achievements.ini') });
  }

  // 3DM
  if (env.DOCUMENTS) {
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(env.DOCUMENTS, '3DMGAME', 'Saves', String(A), 'achievements.ini') });
  }

  // RLE
  if (env.DOCUMENTS) {
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(env.DOCUMENTS, 'RLE', String(A), 'achievements.ini') });
  }

  // SmartSteamEmu
  if (env.APPDATA) {
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(env.APPDATA, 'SmartSteamEmu', String(A), 'stats.bin') });
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(env.APPDATA, 'SmartSteamEmu', String(A), 'achievements.ini') });
  }

  // CreamAPI / Razor1911 / UserStats / FLT — relativos à pasta do .exe
  if (exeFolder) {
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(exeFolder, 'cream_api.ini') });
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(exeFolder, 'SteamData', 'user_stats.ini') });
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(exeFolder, 'Razor1911 Profile', String(A), 'achievements.ini') });
    candidates.push({ emulator: 'generic', format: 'ini', path: path.join(exeFolder, 'profile', String(A), 'achievements.ini') });
    // FLT — pasta com 1 arquivo por unlock
    candidates.push({ emulator: 'flt', format: 'flt', path: path.join(exeFolder, 'FLT', String(A)) });
    candidates.push({ emulator: 'flt', format: 'flt', path: path.join(exeFolder, 'FLT') });
  }

  // Steam cache binário (best-effort, parser básico)
  if (env.PROGRAMFILES_X86) {
    candidates.push({
      emulator: 'generic',
      format: 'ini',
      path: path.join(env.PROGRAMFILES_X86, 'Steam', 'appcache', 'stats', `UserGameStats_0_${A}.bin`),
    });
  }

  return candidates;
}

// Filtra candidatos pra retornar só os que existem em disco.
// Pra FLT: existe se a pasta existe E tem ao menos 1 arquivo dentro.
function findAchievementFiles({ appid, exePath }) {
  if (!appid) return [];
  const candidates = getCandidatePaths(appid, exePath);
  const out = [];
  for (const c of candidates) {
    try {
      if (!fs.existsSync(c.path)) continue;
      const stat = fs.statSync(c.path);
      if (c.format === 'flt') {
        if (!stat.isDirectory()) continue;
        // verifica que tem ao menos 1 arquivo
        const entries = fs.readdirSync(c.path);
        if (!entries.length) continue;
      } else {
        if (!stat.isFile()) continue;
        if (stat.size === 0) continue;
      }
      out.push({ ...c, mtime: stat.mtimeMs, size: stat.size });
    } catch {}
  }
  return out;
}

module.exports = { getCandidatePaths, findAchievementFiles };
