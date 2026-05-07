// achievement-parsers.js — Parsers de arquivos de unlock dos emuladores (Fase 9.x)
//
// Cobertura completa estilo Hydra: Goldberg, CODEX, OnlineFix, EMPRESS, SKIDROW,
// RLD!, CreamAPI, Razor1911, 3DM, RLE, UserStats, SmartSteamEmu, FLT.
//
// Output uniforme: [{ name: string, unlockTime: number (unix seconds) }, ...]
// O nome é case-insensitive ao matchar com o Steam schema (apiname).

'use strict';

// ============================================================
// HELPERS
// ============================================================

function safeParseInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function isTruthyString(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase().replace(/['"]/g, '');
  return s === '1' || s === 'true' || s === 'yes';
}

// Parser INI genérico: retorna { sections: { [name]: { [key]: value } } }
function parseIni(content) {
  const sections = {};
  if (!content) return sections;
  // Strip BOM
  const lines = String(content).replace(/^\uFEFF/, '').split(/\r?\n/);
  let current = '_root';
  sections[current] = {};
  for (let raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('//')) continue;
    const m = line.match(/^\[(.+)\]$/);
    if (m) {
      current = m[1].trim();
      if (!sections[current]) sections[current] = {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    sections[current][key] = val;
  }
  return sections;
}

// ============================================================
// GOLDBERG (JSON object ou array)
// Format: { "ACH_NAME": { "earned": true, "earned_time": 1730000000 }, ... }
// Variante array: [{ "name": "ACH_NAME", "earned": true, "earned_time": 1730000000 }]
// ============================================================
function parseGoldbergJson(content) {
  let data;
  // Strip BOM (EF BB BF) caso o arquivo tenha sido salvo em UTF-8 com BOM
  const cleaned = String(content || '').replace(/^\uFEFF/, '').trim();
  try { data = JSON.parse(cleaned); } catch { return []; }
  const out = [];
  if (Array.isArray(data)) {
    for (const a of data) {
      if (!a) continue;
      const earned = a.earned === true || a.earned === 1 || a.earned === 'true';
      if (!earned) continue;
      const name = a.name || a.apiname || a.id;
      if (!name) continue;
      out.push({ name: String(name), unlockTime: safeParseInt(a.earned_time || a.earnedTime || a.unlock_time) });
    }
  } else if (data && typeof data === 'object') {
    for (const [name, entry] of Object.entries(data)) {
      if (!entry || typeof entry !== 'object') continue;
      const earned = entry.earned === true || entry.earned === 1 || entry.earned === 'true';
      const progressValue = entry.progress != null ? safeParseInt(entry.progress) : null;
      const progressMax = entry.progress_max != null ? safeParseInt(entry.progress_max)
                       : entry.max_progress != null ? safeParseInt(entry.max_progress) : null;
      // Inclui mesmo se NÃO unlocked, desde que tenha progresso
      if (!earned && (progressValue == null || progressValue <= 0)) continue;
      out.push({
        name: String(name),
        unlockTime: safeParseInt(entry.earned_time || entry.earnedTime || entry.unlock_time),
        unlocked: earned,
        progressValue,
        progressMax,
      });
    }
  }
  return out;
}

// ============================================================
// EMPRESS (JSON, mesmo shape do Goldberg)
// ============================================================
function parseEmpressJson(content) {
  return parseGoldbergJson(content);
}

// ============================================================
// CODEX / RUN — INI
// [ACH_NAME]
// State=01 00 00 00       (ou Achieved=1)
// Time=...                (ou UnlockTime=unix)
// ============================================================
function parseCodexIni(content) {
  const sections = parseIni(content);
  const out = [];
  for (const [name, kv] of Object.entries(sections)) {
    if (name === '_root') continue;
    const achieved = isTruthyString(kv.Achieved) || isTruthyString(kv.achieved)
      || /^[1-9]/.test((kv.State || '').trim());
    if (!achieved) continue;
    const time = safeParseInt(kv.UnlockTime || kv.unlocktime || kv.Time || kv.TIME);
    out.push({ name, unlockTime: time });
  }
  return out;
}

// ============================================================
// OnlineFix — INI variante
// [ACH_NAME]
// achieved="true" / Achieved="true"
// Timestamp=unix / UnlockTime=unix
// ============================================================
function parseOnlineFixIni(content) {
  const sections = parseIni(content);
  const out = [];
  for (const [name, kv] of Object.entries(sections)) {
    if (name === '_root') continue;
    const achieved = isTruthyString(kv.Achieved) || isTruthyString(kv.achieved);
    if (!achieved) continue;
    const time = safeParseInt(kv.Timestamp || kv.timestamp || kv.UnlockTime || kv.unlocktime || kv.Time);
    out.push({ name, unlockTime: time });
  }
  return out;
}

// ============================================================
// RLD! — formato específico com State binário
// Em alguns casos State é hexadecimal "01000000" ou similar
// ============================================================
function parseRldIni(content) {
  const sections = parseIni(content);
  const out = [];
  for (const [name, kv] of Object.entries(sections)) {
    if (name === '_root' || name.toLowerCase() === 'steam') continue;
    const stateRaw = (kv.State || kv.state || '').trim().replace(/\s+/g, '');
    if (!stateRaw) continue;
    // State não-zero = unlocked. Aceita hex "01000000", decimal "1", etc
    const isUnlocked = /^[0-9a-fA-F]+$/.test(stateRaw)
      ? parseInt(stateRaw, 16) > 0
      : safeParseInt(stateRaw) > 0;
    if (!isUnlocked) continue;
    // Time em hex little-endian "9C 4F E2 67" ou unix decimal
    let time = 0;
    const timeRaw = (kv.Time || kv.time || '').trim().replace(/\s+/g, '');
    if (timeRaw) {
      if (/^[0-9a-fA-F]{8}$/.test(timeRaw)) {
        // Little-endian hex bytes → unix
        const bytes = timeRaw.match(/.{2}/g).reverse().join('');
        time = parseInt(bytes, 16);
      } else {
        time = safeParseInt(timeRaw);
      }
    }
    out.push({ name, unlockTime: time });
  }
  return out;
}

// ============================================================
// SKIDROW / 3DM / RLE / UserStats / SmartSteamEmu / Razor1911 / CreamAPI
// Todos seguem variantes da estrutura "INI genérica".
// Tenta múltiplas combinações de campos.
// ============================================================
function parseGenericIni(content) {
  const sections = parseIni(content);
  const out = [];
  for (const [name, kv] of Object.entries(sections)) {
    if (name === '_root' || name.toLowerCase() === 'steam' || name.toLowerCase() === 'general') continue;
    // Múltiplos campos podem indicar unlock
    const achieved =
      isTruthyString(kv.Achieved) || isTruthyString(kv.achieved) ||
      isTruthyString(kv.HaveAchieved) || isTruthyString(kv.haveachieved) ||
      isTruthyString(kv.unlocked) || isTruthyString(kv.Unlocked) ||
      (kv.State && /^[1-9]/.test(String(kv.State).trim())) ||
      (kv.state && /^[1-9]/.test(String(kv.state).trim()));
    if (!achieved) continue;
    const time = safeParseInt(
      kv.UnlockTime || kv.unlocktime || kv.Time || kv.time ||
      kv.Timestamp || kv.timestamp || kv.HaveAchievedTime || kv.haveachievedtime
    );
    out.push({ name, unlockTime: time });
  }
  return out;
}

// ============================================================
// FLT (folder-based — 1 arquivo por achievement)
// fileNames recebido = lista de nomes de arquivo no diretório FLT
// ============================================================
function parseFltFolder(fileNames) {
  if (!Array.isArray(fileNames)) return [];
  return fileNames
    .filter((n) => n && !n.startsWith('.') && !/(\.tmp|\.bak)$/i.test(n))
    .map((name) => ({ name, unlockTime: 0 }));
}

// ============================================================
// DISPATCHER
// ============================================================
// emulator: 'goldberg' | 'codex' | 'onlinefix' | 'rld' | 'empress' | 'flt' | 'generic'
function parseAchievementContent(emulator, content) {
  switch ((emulator || '').toLowerCase()) {
    case 'goldberg': return parseGoldbergJson(content);
    case 'empress':  return parseEmpressJson(content);
    case 'codex':    return parseCodexIni(content);
    case 'onlinefix':return parseOnlineFixIni(content);
    case 'rld':      return parseRldIni(content);
    case 'generic':
    default:         return parseGenericIni(content);
  }
}

module.exports = {
  parseGoldbergJson,
  parseEmpressJson,
  parseCodexIni,
  parseOnlineFixIni,
  parseRldIni,
  parseGenericIni,
  parseFltFolder,
  parseAchievementContent,
};
