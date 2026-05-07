// biblioteca.js — Aba Biblioteca (Fase 7)
// Lista jogos do Steam Tools + jogos baixados via app, com tracking de playtime.

(() => {
  'use strict';
  if (typeof window.zhub === 'undefined') return; // só roda no Electron

  // ============================================================
  // ELEMENTOS
  // ============================================================
  const $view = document.getElementById('view-biblioteca');
  const $tabs = $view?.querySelectorAll('.lib-tabs .home-tab');
  const $gridSteamTools = document.getElementById('lib-grid-steamtools');
  const $gridDownloads = document.getElementById('lib-grid-downloads');
  const $emptyST = document.getElementById('lib-empty-steamtools');
  const $emptyDL = document.getElementById('lib-empty-downloads');
  const $noSteam = document.getElementById('lib-no-steam');
  const $countST = $view?.querySelector('.lib-tab-count[data-count="steamtools"]');
  const $countDL = $view?.querySelector('.lib-tab-count[data-count="downloads"]');

  if (!$view || !$gridSteamTools || !$gridDownloads) return;

  // ============================================================
  // STATE
  // ============================================================
  let activeTab = 'steamtools';
  let steamPath = null;
  const stItems = new Map();
  const dlItems = new Map();
  let uiTickerTimer = null;

  // Toolbar prefs (persistidas em localStorage)
  const FAV_KEY = 'zhub_favorites_v1';
  const PREFS_KEY = 'zhub_lib_prefs_v1';
  let favorites = new Set();
  let sortBy = 'title-asc';
  let viewStyle = 'cover'; // cover | compact | list
  let showFavOnly = false;

  function loadPrefs() {
    try {
      const fav = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      favorites = new Set(Array.isArray(fav) ? fav : []);
    } catch { favorites = new Set(); }
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (p.sortBy) sortBy = p.sortBy;
      if (p.viewStyle) viewStyle = p.viewStyle;
      if (typeof p.showFavOnly === 'boolean') showFavOnly = p.showFavOnly;
    } catch {}
  }
  function saveFavorites() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); } catch {}
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ sortBy, viewStyle, showFavOnly })); } catch {}
  }
  function isFav(key) { return favorites.has(key); }
  function toggleFav(key) {
    if (favorites.has(key)) favorites.delete(key);
    else favorites.add(key);
    saveFavorites();
    updateFavCount();
  }
  function updateFavCount() {
    const $count = document.getElementById('lib-fav-count');
    if ($count) $count.textContent = String(favorites.size);
  }
  loadPrefs();

  // ============================================================
  // EDITION KEYWORDS (mesma regex do inicio.js)
  // ============================================================
  const EDITION_RE = /\b(deluxe|premium|ultimate|gold|complete|definitive|enhanced|anniversary|game of the year|goty|digital|collectors?|legendary|royal|imperial|champion)\b\s*(edition|bundle|pack|version)?|\bedition\b|\b\+\s*\d+\s*dlcs?\b/gi;

  function stripEditionKeywords(name) {
    if (!name) return '';
    return name.replace(EDITION_RE, '').replace(/\s+/g, ' ').trim();
  }
  function hasEditionKeywords(name) {
    if (!name) return false;
    EDITION_RE.lastIndex = 0;
    return EDITION_RE.test(name);
  }

  // ============================================================
  // FORMATTERS
  // ============================================================
  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(n >= 100 || i < 2 ? 0 : 1)} ${units[i]}`;
  }

  function formatMinutes(mins) {
    if (!mins || mins < 1) return '—';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  function formatRelativeTime(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    if (diff < 0) return 'agora';
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min atrás`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h atrás`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d atrás`;
    const date = new Date(ts);
    return date.toLocaleDateString('pt-BR');
  }

  // ============================================================
  // ACHIEVEMENT PROGRESS CACHE (pra badges X/Y nos cards)
  // ============================================================
  const achProgressCache = new Map(); // key (st_*/dl_*/lib_*) → { unlocked, total, percent }

  function getAchPill(key) {
    const p = achProgressCache.get(key);
    if (!p || !p.total) return '';
    return `<div class="lib-ach-pill" title="${p.unlocked} de ${p.total} conquistas">🏆 ${p.unlocked}/${p.total}</div>`;
  }

  async function preloadAchievementProgress(keys) {
    if (!Array.isArray(keys) || !keys.length) return;
    await Promise.all(keys.map(async (key) => {
      try {
        const p = await window.zhub.achievements.getProgressSync(key);
        if (p && p.total > 0) achProgressCache.set(key, p);
      } catch {}
    }));
  }

  // ============================================================
  // COVER URL CACHE (pré-resolvido em userData/cover-urls.json)
  // ============================================================
  // Acesso síncrono no render. Carregado 1x do main process no init.
  const coverUrlCache = new Map();
  let coverCacheLoaded = false;

  async function loadCoverUrlCache() {
    if (coverCacheLoaded) return;
    try {
      const all = await window.zhub.coverCache.listAll();
      if (all && typeof all === 'object') {
        for (const [appid, url] of Object.entries(all)) {
          if (url) coverUrlCache.set(String(appid), url);
        }
      }
    } catch (err) {
      console.warn('[biblioteca] cover-cache load falhou:', err);
    } finally {
      coverCacheLoaded = true;
    }
  }

  function getCachedCover(appid) {
    if (!appid) return null;
    return coverUrlCache.get(String(appid)) || null;
  }

  function saveCoverUrl(appid, url) {
    if (!appid || !url) return;
    const key = String(appid);
    if (coverUrlCache.get(key) === url) return; // sem mudança
    coverUrlCache.set(key, url);
    // fire-and-forget: o main faz debounce do flush
    try { window.zhub.coverCache.set({ appid: key, url }); } catch {}
  }

  function invalidateCoverUrl(appid) {
    if (!appid) return;
    const key = String(appid);
    coverUrlCache.delete(key);
    try { window.zhub.coverCache.remove(key); } catch {}
  }

  // ============================================================
  // STEAM SEARCH CACHE (pra resolver capas/nomes que faltam)
  // ============================================================
  const searchAppidCache = new Map();
  async function findAppidViaSearch(name) {
    if (!name) return null;
    if (searchAppidCache.has(name)) return searchAppidCache.get(name);
    try {
      const results = await window.zhub.steam.search(name);
      const appid = Array.isArray(results) && results[0]?.appid ? results[0].appid : null;
      searchAppidCache.set(name, appid);
      return appid;
    } catch {
      searchAppidCache.set(name, null);
      return null;
    }
  }

  // ============================================================
  // IMAGE FALLBACK CHAIN — copiada/adaptada do inicio.js
  // ============================================================
  async function handleLibCoverError(e) {
    const img = e.target;
    const attempt = parseInt(img.dataset.attempt || '0', 10);
    const appid = img.dataset.appid;
    const card = img.closest('.lib-card');
    const name = card?.dataset.gameName || '';

    // Se a 1ª tentativa falhou e veio do cache → invalida (URL parou de funcionar)
    if (attempt === 0 && appid && coverUrlCache.has(String(appid))) {
      invalidateCoverUrl(appid);
    }

    // 1: Cloudflare CDN com mesmo appid
    if (attempt === 0 && appid) {
      img.dataset.attempt = '1';
      img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
      return;
    }
    // 2: library_hero (alta resolução, comum em pre-release)
    if (attempt === 1 && appid) {
      img.dataset.attempt = '2';
      img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`;
      return;
    }
    // 3: appdetails canônica
    if (attempt === 2 && appid) {
      img.dataset.attempt = '3';
      try {
        const data = await window.zhub.steam.details(appid);
        if (data?.headerImage && !data.error) {
          img.src = data.headerImage;
          return;
        }
      } catch {}
    }
    // 4: search pelo nome completo
    if (attempt < 4 && name) {
      img.dataset.attempt = '4';
      const altAppid = await findAppidViaSearch(name);
      if (altAppid && String(altAppid) !== String(appid)) {
        img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${altAppid}/header.jpg`;
        return;
      }
    }
    // 5: search pelo nome stripped (sem Edition keywords)
    if (attempt < 5 && hasEditionKeywords(name)) {
      img.dataset.attempt = '5';
      const stripped = stripEditionKeywords(name);
      const baseAppid = await findAppidViaSearch(stripped);
      if (baseAppid) {
        img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${baseAppid}/header.jpg`;
        return;
      }
    }
    // 6: Falhou tudo → placeholder com nome
    img.style.display = 'none';
    img.parentElement?.classList.add('cover-fallback');
  }

  function setupCoverFallbacks(container) {
    container.querySelectorAll('.lib-cover').forEach((img) => {
      if (img.dataset.fbWired === '1') return;
      img.dataset.fbWired = '1';
      img.addEventListener('error', handleLibCoverError);
      // Salva no cache toda vez que uma img carregar com sucesso
      img.addEventListener('load', () => {
        const appid = img.dataset.appid;
        if (appid && img.src && img.naturalWidth > 0) {
          saveCoverUrl(appid, img.src);
        }
      });
      if (img.complete && img.naturalWidth === 0) {
        handleLibCoverError({ target: img });
      } else if (img.complete && img.naturalWidth > 0) {
        // Já carregou antes do listener (cache do Chromium) — salva agora
        const appid = img.dataset.appid;
        if (appid && img.src) saveCoverUrl(appid, img.src);
      }
    });
  }

  // ============================================================
  // RENDERIZAÇÃO
  // ============================================================
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderSteamToolsCard(item) {
    // Se já temos uma URL cacheada que funcionou antes, usa direto e pula o cascade
    const cachedUrl = getCachedCover(item.appid);
    const cover = cachedUrl
      || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.appid}/header.jpg`;
    const playtime = formatMinutes(item.totalMinutes);
    const last = formatRelativeTime(item.lastPlayed);
    // Prefere SizeOnDisk real do appmanifest; fallback pro tamanho do .lua
    const sizeBytes = item.sizeOnDisk != null && item.sizeOnDisk > 0 ? item.sizeOnDisk : item.sizeBytes;
    const size = formatBytes(sizeBytes);
    const sizeTooltip = item.sizeOnDisk != null && item.sizeOnDisk > 0 ? 'Tamanho do jogo no disco' : 'Jogo não instalado pela Steam ainda';
    const activeCls = item.isActive ? ' lib-active' : '';
    const safeName = escapeHtml(item.name || `App ${item.appid}`);

    const actionBtn = item.isActive
      ? `<button class="lib-btn lib-btn-stop" data-action="stop">⏹ Encerrar sessão</button>`
      : `<button class="lib-btn lib-btn-play" data-action="play">▶ Jogar</button>`;
    const cfgBtn = `<button class="lib-btn lib-btn-cfg" data-action="config" title="Configurações"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>`;
    const favKey = `st_${item.appid}`;
    const favCls = isFav(favKey) ? ' lib-fav-active' : '';
    const heartFill = isFav(favKey) ? 'currentColor' : 'none';

    const achPill = getAchPill(favKey);
    return `
      <article class="lib-card${activeCls}" data-kind="steamtools" data-key="${favKey}" data-appid="${item.appid}" data-game-name="${safeName}">
        <button class="lib-fav-btn${favCls}" data-action="fav" title="Favoritar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${heartFill}" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <div class="lib-cover-wrap" data-game-name="${safeName}">
          <img class="lib-cover" src="${cover}" alt="${safeName}" loading="eager" decoding="async" data-appid="${item.appid}" data-attempt="0" />
          ${item.isActive ? '<div class="lib-active-pill">▶ Jogando</div>' : ''}
          ${achPill}
          <div class="lib-time-overlay"><span>⏱</span> ${playtime}</div>
        </div>
        <div class="lib-info">
          <div class="lib-name" title="${safeName}">${safeName}</div>
          <div class="lib-meta">
            <span title="Tempo de jogo">⏱ ${playtime}</span>
            <span title="Último acesso">🕒 ${last}</span>
            <span title="${sizeTooltip}">📦 ${size}</span>
          </div>
        </div>
        <div class="lib-actions">
          ${actionBtn}
          ${cfgBtn}
        </div>
      </article>
    `;
  }

  function renderDownloadCard(item) {
    const isManual = item.kind === 'manual';
    const playtime = formatMinutes(item.totalMinutes);
    const last = formatRelativeTime(item.lastPlayed);
    const size = item.totalSize > 0 ? formatBytes(item.totalSize) : null;
    const activeCls = item.isActive ? ' lib-active' : '';
    const safeName = escapeHtml(item.name);
    const det = item.det || {};
    // Prioriza overrideExe (extração automática ou config manual) sobre det.exe.
    // Se user limpou exePath explicitamente, respeita.
    const effectiveExe = item.overrideExe || (item.userClearedExe ? null : det.exe);
    const canPlay = !!item.overrideExe || (det.type === 'play' && !!effectiveExe);
    const canInstall = !item.overrideExe && det.type === 'install' && !!effectiveExe;
    // 1º tenta capa custom do item, 2º cache de URL pelo appid, 3º akamai default
    const cachedUrl = item.appid ? getCachedCover(item.appid) : null;
    const cover = item.cover
      || cachedUrl
      || (item.appid
        ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.appid}/header.jpg`
        : '');
    const appidAttr = item.appid ? ` data-appid="${item.appid}"` : '';

    let actionBtn;
    if (item.isActive) {
      actionBtn = `<button class="lib-btn lib-btn-stop" data-action="stop">⏹ Encerrar sessão</button>`;
    } else if (canPlay) {
      actionBtn = `<button class="lib-btn lib-btn-play" data-action="play">▶ Jogar</button>`;
    } else if (canInstall) {
      actionBtn = `<button class="lib-btn lib-btn-install" data-action="install">⚙ Instalar</button>`;
    } else if (isManual) {
      // Entry manual sem .exe → CTA pra abrir Configurações e setar
      actionBtn = `<button class="lib-btn lib-btn-cfg-cta" data-action="config">⚙ Configurar .exe</button>`;
    } else {
      actionBtn = `<button class="lib-btn lib-btn-folder" data-action="open-folder">📂 Abrir pasta</button>`;
    }
    const cfgBtnDl = `<button class="lib-btn lib-btn-cfg" data-action="config" title="Configurações"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>`;

    const wrapCls = cover ? 'lib-cover-wrap' : 'lib-cover-wrap cover-fallback';
    // Pra entries manuais o id já vem com prefix `lib_{appid}`; pra downloads usa `dl_{id}`
    const favKey = isManual ? item.id : `dl_${item.id}`;
    const favCls = isFav(favKey) ? ' lib-fav-active' : '';
    const heartFill = isFav(favKey) ? 'currentColor' : 'none';
    const repackerHtml = det.repacker && det.repacker !== 'unknown' && det.repacker !== 'manual'
      ? `<div class="lib-badge-repacker">${escapeHtml(det.repacker)}</div>`
      : '';
    const achPill = getAchPill(favKey);
    return `
      <article class="lib-card${activeCls}" data-kind="downloads" data-key="${favKey}" data-id="${item.id}" data-game-name="${safeName}"${item.appid ? ` data-appid="${item.appid}"` : ''}>
        <button class="lib-fav-btn${favCls}" data-action="fav" title="Favoritar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${heartFill}" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <div class="${wrapCls}" data-game-name="${safeName}">
          ${cover ? `<img class="lib-cover" src="${cover}" alt="${safeName}" loading="eager" decoding="async"${appidAttr} data-attempt="0" />` : ''}
          ${item.isActive ? '<div class="lib-active-pill">▶ Jogando</div>' : ''}
          ${achPill}
          <div class="lib-time-overlay"><span>⏱</span> ${playtime}</div>
        </div>
        <div class="lib-info">
          <div class="lib-name" title="${safeName}">${safeName}</div>
          <div class="lib-meta">
            <span title="Tempo de jogo">⏱ ${playtime}</span>
            <span title="Último acesso">🕒 ${last}</span>
            ${size ? `<span title="Tamanho em disco">📦 ${size}</span>` : ''}
            ${isManual ? '<span class="lib-badge-manual" title="Adicionado manualmente">📚 Manual</span>' : ''}
          </div>
          ${repackerHtml}
        </div>
        <div class="lib-actions">
          ${actionBtn}
          ${cfgBtnDl}
        </div>
      </article>
    `;
  }

  function applySortAndFilter(items, kindPrefix) {
    let arr = items.slice();
    if (showFavOnly) arr = arr.filter((it) => isFav(`${kindPrefix}_${it.appid || it.id}`));
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'title-asc': return (a.name || '').localeCompare(b.name || '');
        case 'title-desc': return (b.name || '').localeCompare(a.name || '');
        case 'recent': return (b.lastPlayed || 0) - (a.lastPlayed || 0);
        case 'most-played': return (b.totalMinutes || 0) - (a.totalMinutes || 0);
        case 'installed': return (b.modifiedAt || b.completedAt || 0) - (a.modifiedAt || a.completedAt || 0);
        default: return 0;
      }
    });
    return arr;
  }

  function renderSteamToolsGrid() {
    const all = Array.from(stItems.values());
    const items = applySortAndFilter(all, 'st');
    if ($countST) $countST.textContent = String(items.length);
    if (items.length === 0) {
      $gridSteamTools.innerHTML = '';
      $gridSteamTools.hidden = true;
      // Empty state diferenciado se Steam não detectada
      if (!steamPath) {
        $emptyST.hidden = true;
        $noSteam.hidden = (activeTab !== 'steamtools');
      } else {
        $noSteam.hidden = true;
        $emptyST.hidden = (activeTab !== 'steamtools');
      }
      return;
    }
    $emptyST.hidden = true;
    $noSteam.hidden = true;
    $gridSteamTools.innerHTML = items.map(renderSteamToolsCard).join('');
    $gridSteamTools.hidden = (activeTab !== 'steamtools');
    setupCoverFallbacks($gridSteamTools);
  }

  function renderDownloadsGrid() {
    const all = Array.from(dlItems.values());
    const items = applySortAndFilter(all, 'dl');
    if ($countDL) $countDL.textContent = String(items.length);
    if (items.length === 0) {
      $gridDownloads.innerHTML = '';
      $gridDownloads.hidden = true;
      $emptyDL.hidden = (activeTab !== 'downloads');
      return;
    }
    $emptyDL.hidden = true;
    $gridDownloads.innerHTML = items.map(renderDownloadCard).join('');
    $gridDownloads.hidden = (activeTab !== 'downloads');
    setupCoverFallbacks($gridDownloads);
  }

  function rerenderAll() {
    renderSteamToolsGrid();
    renderDownloadsGrid();
  }

  // ============================================================
  // CARREGAMENTO
  // ============================================================
  async function loadSteamPath() {
    try {
      steamPath = await window.zhub.steamTools.detectSteam();
    } catch {
      steamPath = null;
    }
  }

  async function loadSteamToolsGames() {
    let lua = [];
    try {
      lua = await window.zhub.steamTools.listLua();
    } catch (err) {
      console.warn('[biblioteca] listLua falhou:', err);
      lua = [];
    }
    if (!Array.isArray(lua)) lua = [];

    stItems.clear();
    // Paraleliza enriquecimento de TODOS os jogos
    await Promise.all(lua.map(async (it) => {
      const appid = it.appid;
      if (!appid) return;
      const [canonName, pt, steamLp, sizeOnDisk] = await Promise.all([
        it.name ? Promise.resolve(null) : window.zhub.steamCatalog.getGameName(appid).catch(() => null),
        window.zhub.library.getPlaytime(`st_${appid}`).catch(() => null),
        window.zhub.library.readSteamLastPlayed({ appid, steamPath }).catch(() => null),
        window.zhub.library.readSteamSizeOnDisk({ appid, steamPath }).catch(() => null),
      ]);
      const name = it.name || canonName || `App ${appid}`;
      let lastPlayed = pt?.lastPlayed || null;
      if (steamLp && (!lastPlayed || steamLp > lastPlayed)) lastPlayed = steamLp;
      stItems.set(appid, {
        appid,
        name,
        sizeBytes: it.sizeBytes || 0,
        sizeOnDisk,
        modifiedAt: it.modifiedAt || 0,
        totalMinutes: pt?.totalMinutes || 0,
        lastPlayed,
        isActive: !!pt?.isActive,
      });
    }));
  }

  async function loadDownloadedGames() {
    dlItems.clear();
    let torrents = [];
    let httpDls = [];
    let manualEntries = [];
    try {
      torrents = await window.zhub.torrent.list() || [];
    } catch {}
    try {
      httpDls = await window.zhub.http.list() || [];
    } catch {}
    try {
      manualEntries = await window.zhub.manualLibrary.list() || [];
    } catch {}

    // Filtra completos
    const completedTorrents = torrents.filter((t) => t?.status === 'completed');
    const completedHttp = httpDls.filter((h) => h?.status === 'done');

    // Detect installer pra cada e enrich com playtime — paralelizado
    const jobs = [
      ...completedTorrents.map((t) => enrichDownload({
        id: t.id, name: t.name, path: t.path, totalSize: t.totalSize, completedAt: t.completedAt,
      }).then((it) => it && dlItems.set(t.id, it))),
      ...completedHttp.map((h) => enrichDownload({
        id: h.id,
        name: h.name,
        path: h.downloadDir,
        totalSize: (h.files || []).reduce((s, f) => s + (f.size || 0), 0),
        completedAt: h.finishedAt,
      }).then((it) => it && dlItems.set(h.id, it))),
      // Entries adicionadas manualmente (sem download via app)
      ...manualEntries.map((m) => enrichManualEntry(m).then((it) => it && dlItems.set(`lib_${m.appid}`, it))),
    ];
    await Promise.all(jobs);
  }

  // Enriquece uma entry da manualLibrary pra render no grid de Baixados
  async function enrichManualEntry({ appid, name, addedAt }) {
    if (!appid) return null;
    const [pt, override] = await Promise.all([
      window.zhub.library.getPlaytime(`lib_${appid}`).catch(() => null),
      window.zhub.gameOverrides.get(`lib_${appid}`).catch(() => null),
    ]);
    const overrideExe = override?.exePath || null;
    return {
      // id usa formato `lib_{appid}` pra distinguir de downloads reais (que tem id UUID)
      id: `lib_${appid}`,
      kind: 'manual',
      appid,
      name,
      path: '', // sem pasta de download
      totalSize: 0,
      completedAt: addedAt,
      det: { type: overrideExe ? 'play' : 'unknown', exe: overrideExe, repacker: 'manual' },
      totalMinutes: pt?.totalMinutes || 0,
      lastPlayed: pt?.lastPlayed || null,
      isActive: !!pt?.isActive,
      cover: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
      overrideExe,
      userClearedExe: !!(override && !override.exePath),
    };
  }

  async function enrichDownload({ id, name, path, totalSize, completedAt }) {
    let det = { type: 'unknown', exe: null, repacker: 'unknown' };
    try {
      det = await window.zhub.installer.detect(path) || det;
    } catch {}
    let totalMinutes = 0;
    let lastPlayed = null;
    let isActive = false;
    try {
      const pt = await window.zhub.library.getPlaytime(`dl_${id}`);
      totalMinutes = pt?.totalMinutes || 0;
      lastPlayed = pt?.lastPlayed || null;
      isActive = !!pt?.isActive;
    } catch {}

    // Tenta pegar appid do nome via Steam search pra mostrar capa Steam
    let appid = null;
    let cover = '';
    try {
      const stripped = stripEditionKeywords(name);
      const altAppid = await findAppidViaSearch(stripped || name);
      if (altAppid) {
        appid = altAppid;
        cover = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${altAppid}/header.jpg`;
      }
    } catch {}

    // Lê override do user (exePath salvo automaticamente pós-extração ou manual)
    let overrideExe = null;
    let userClearedExe = false;
    try {
      const cfg = await window.zhub.gameOverrides.get(`dl_${id}`);
      if (cfg) {
        overrideExe = cfg.exePath || null;
        // Se user salvou config sem exePath = explicitamente limpou
        userClearedExe = !cfg.exePath;
      }
    } catch {}

    return {
      id,
      name,
      path,
      totalSize,
      completedAt,
      det,
      totalMinutes,
      lastPlayed,
      isActive,
      appid,
      cover,
      overrideExe,
      userClearedExe,
    };
  }

  // ============================================================
  // EVENT HANDLERS
  // ============================================================
  function switchTab(tab) {
    if (tab === activeTab) return;
    activeTab = tab;
    $tabs?.forEach((b) => {
      b.classList.toggle('active', b.dataset.libTab === tab);
    });
    rerenderAll();
  }

  $tabs?.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.libTab));
  });

  // ============================================================
  // TOOLBAR: sort + fav toggle + view style
  // ============================================================
  const $sortSelect = document.getElementById('lib-sort-select');
  const $favToggle = document.getElementById('lib-fav-toggle');
  const $viewBtns = document.querySelectorAll('.lib-view-btn');

  if ($sortSelect) {
    $sortSelect.value = sortBy;
    $sortSelect.addEventListener('change', () => {
      sortBy = $sortSelect.value;
      savePrefs();
      rerenderAll();
    });
  }

  function applyFavToggleState() {
    if (!$favToggle) return;
    $favToggle.classList.toggle('active', showFavOnly);
  }
  applyFavToggleState();
  updateFavCount();

  $favToggle?.addEventListener('click', () => {
    showFavOnly = !showFavOnly;
    savePrefs();
    applyFavToggleState();
    rerenderAll();
  });

  function applyViewStyle() {
    [$gridSteamTools, $gridDownloads].forEach(($g) => {
      if (!$g) return;
      $g.classList.remove('lib-view-cover', 'lib-view-compact', 'lib-view-list');
      $g.classList.add(`lib-view-${viewStyle}`);
    });
    $viewBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === viewStyle));
  }
  applyViewStyle();
  $viewBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      viewStyle = btn.dataset.view;
      savePrefs();
      applyViewStyle();
    });
  });

  async function handleCardAction(card, action) {
    const kind = card.dataset.kind;
    const key = card.dataset.key;
    if (action === 'config') {
      if (typeof window.zhubOpenGameConfig === 'function') {
        const appid = parseInt(card.dataset.appid, 10) || null;
        const name = card.dataset.gameName || '';
        window.zhubOpenGameConfig({ key, appid, name });
      }
      return;
    }
    if (action === 'fav') {
      toggleFav(key);
      // Atualiza só o card (sem re-render full pra preservar scroll)
      const isActive = isFav(key);
      const $btn = card.querySelector('.lib-fav-btn');
      const $svg = $btn?.querySelector('svg');
      if ($btn) $btn.classList.toggle('lib-fav-active', isActive);
      if ($svg) $svg.setAttribute('fill', isActive ? 'currentColor' : 'none');
      // Se filtrando só favoritos e desfavoritou, remove do grid
      if (showFavOnly && !isActive) {
        rerenderAll();
      }
      return;
    }
    if (action === 'stop' && kind === 'steamtools') {
      const appid = parseInt(card.dataset.appid, 10);
      if (!appid) return;
      const r = await window.zhub.library.endSession(`st_${appid}`);
      const it = stItems.get(appid);
      if (it) {
        it.totalMinutes = r?.totalMinutes || it.totalMinutes;
        it.lastPlayed = r?.lastPlayed || it.lastPlayed;
        it.isActive = false;
        renderSteamToolsGrid();
      }
      toast('⏹ Sessão encerrada');
      return;
    }
    if (action === 'stop' && kind === 'downloads') {
      const id = card.dataset.id;
      // Manual entries usam id `lib_{appid}` direto; downloads reais usam `dl_{id}`
      const sessionKey = id.startsWith('lib_') ? id : `dl_${id}`;
      const r = await window.zhub.library.endSession(sessionKey);
      const it = dlItems.get(id);
      if (it) {
        it.totalMinutes = r?.totalMinutes || it.totalMinutes;
        it.lastPlayed = r?.lastPlayed || it.lastPlayed;
        it.isActive = false;
        renderDownloadsGrid();
      }
      toast('⏹ Sessão encerrada');
      return;
    }
    if (action === 'play') {
      if (kind === 'steamtools') {
        const appid = parseInt(card.dataset.appid, 10);
        if (!appid) return;
        // Encerra sessão de OUTRO Steam Tools antes (UI espelha o que o main faz)
        for (const [otherAppid, otherIt] of stItems) {
          if (otherAppid !== appid && otherIt.isActive) {
            otherIt.isActive = false;
          }
        }
        // Se user definiu exePath manual, spawn direto (PID polling, mais confiável)
        let overrideExe = null;
        try {
          const cfg = await window.zhub.gameOverrides.get(`st_${appid}`);
          overrideExe = cfg?.exePath || null;
        } catch {}
        let r;
        if (overrideExe) {
          r = await window.zhub.library.launchAppDownload({ id: `st_${appid}`, exePath: overrideExe });
        } else {
          r = await window.zhub.library.launchSteamTools({ appid });
        }
        if (r?.error) {
          toast('❌ ' + r.error);
        } else {
          toast(overrideExe ? '▶ Iniciando…' : '▶ Abrindo na Steam…');
          const it = stItems.get(appid);
          if (it) {
            it.lastPlayed = Date.now();
            it.isActive = true;
            renderSteamToolsGrid();
            startUiTicker();
          }
        }
      } else if (kind === 'downloads') {
        const id = card.dataset.id;
        const item = dlItems.get(id);
        // Prioriza overrideExe sobre det.exe (override = extração automática ou config manual)
        const exePath = item?.overrideExe || item?.det?.exe;
        if (!exePath) {
          toast('❌ Executável não encontrado');
          return;
        }
        // Manual entries usam id `lib_{appid}` direto; downloads usam `dl_{id}`
        const launchId = id.startsWith('lib_') ? id : id;
        const r = await window.zhub.library.launchAppDownload({ id: launchId, exePath });
        if (r?.error) {
          toast('❌ ' + r.error);
        } else {
          toast('▶ Iniciando ' + (item.name || 'jogo') + '…');
          item.isActive = true;
          item.lastPlayed = Date.now();
          renderDownloadsGrid();
          startUiTicker();
        }
      }
      return;
    }
    if (action === 'install') {
      const id = card.dataset.id;
      const item = dlItems.get(id);
      if (!item?.det?.exe) return;
      const r = await window.zhub.installer.run({ exePath: item.det.exe, asAdmin: true });
      if (r?.error) toast('❌ ' + r.error);
      else toast('⚙ Iniciando instalador…');
      return;
    }
    if (action === 'open-folder') {
      const id = card.dataset.id;
      const item = dlItems.get(id);
      if (item?.path) {
        try {
          await window.zhub.system.showInFolder(item.path);
        } catch {}
      }
      return;
    }
  }

  function findGameInGreen(appid, name) {
    const data = window.GREEN_GAMES_DATA || window.GREEN_GAMES;
    if (!Array.isArray(data)) return null;
    if (appid) {
      const byAppid = data.find((g) => {
        const m = g.i?.match?.(/apps\/(\d+)\//);
        return m && parseInt(m[1], 10) === Number(appid);
      });
      if (byAppid) return byAppid;
    }
    if (name) {
      const lname = String(name).toLowerCase();
      const byName = data.find((g) => (g.n || '').toLowerCase() === lname);
      if (byName) return byName;
    }
    return null;
  }

  function openCardModal(card) {
    const appid = parseInt(card.dataset.appid, 10);
    const name = card.dataset.gameName;
    const greenGame = findGameInGreen(appid, name);
    if (greenGame && typeof window.zhubOpenGameModal === 'function') {
      window.zhubOpenGameModal(greenGame);
      return;
    }
    if (typeof window.zhubOpenGameModal === 'function' && appid) {
      const synthetic = {
        i: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
        n: name,
        l: [],
      };
      window.zhubOpenGameModal(synthetic);
    }
  }

  function attachGridListeners(grid) {
    grid?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      const card = e.target.closest('.lib-card');
      if (btn) {
        if (!card) return;
        handleCardAction(card, btn.dataset.action);
        return;
      }
      // Click em qualquer outra parte do card → abre modal de detalhes
      if (card) openCardModal(card);
    });
  }
  attachGridListeners($gridSteamTools);
  attachGridListeners($gridDownloads);

  // ============================================================
  // UI TICKER (atualiza tempo durante sessão ativa, a cada 30s)
  // ============================================================
  function hasActiveSession() {
    for (const it of stItems.values()) if (it.isActive) return true;
    for (const it of dlItems.values()) if (it.isActive) return true;
    return false;
  }
  function startUiTicker() {
    if (uiTickerTimer) return;
    if (!hasActiveSession()) return;
    uiTickerTimer = setInterval(refreshActiveItems, 30_000);
  }
  function stopUiTicker() {
    if (uiTickerTimer) {
      clearInterval(uiTickerTimer);
      uiTickerTimer = null;
    }
  }
  async function refreshActiveItems() {
    let changed = false;
    for (const it of stItems.values()) {
      if (it.isActive) {
        try {
          const pt = await window.zhub.library.getPlaytime(`st_${it.appid}`);
          it.totalMinutes = pt?.totalMinutes || it.totalMinutes;
          it.isActive = !!pt?.isActive;
          changed = true;
        } catch {}
      }
    }
    for (const it of dlItems.values()) {
      if (it.isActive) {
        try {
          const pt = await window.zhub.library.getPlaytime(`dl_${it.id}`);
          it.totalMinutes = pt?.totalMinutes || it.totalMinutes;
          it.isActive = !!pt?.isActive;
          changed = true;
        } catch {}
      }
    }
    if (changed) rerenderAll();
    if (!hasActiveSession()) stopUiTicker();
  }

  // ============================================================
  // DOWNLOAD COMPLETE LISTENERS — auto-refresh quando jogo completa
  // ============================================================
  function refreshDownloadsList() {
    // Recarrega só os baixados (sem invalidar Steam Tools)
    loadDownloadedGames().then(() => renderDownloadsGrid()).catch(() => {});
  }
  try {
    window.zhub.torrent.onDone?.(() => refreshDownloadsList());
    window.zhub.torrent.onRemoved?.(() => refreshDownloadsList());
  } catch {}
  try {
    window.zhub.http.onDone?.(() => refreshDownloadsList());
    window.zhub.http.onRemoved?.(() => refreshDownloadsList());
  } catch {}

  // Achievement state listener — atualiza pill X/Y quando muda
  try {
    window.zhub.achievements.onState?.((payload) => {
      const { key, total, unlocked } = payload || {};
      if (!key || !total) return;
      const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;
      achProgressCache.set(key, { unlocked, total, percent });
      // Atualiza só o pill no DOM (sem re-render full pra evitar piscadas)
      document.querySelectorAll(`.lib-card[data-key="${key}"]`).forEach((card) => {
        let pill = card.querySelector('.lib-ach-pill');
        const html = `🏆 ${unlocked}/${total}`;
        if (pill) pill.textContent = html;
        else {
          const wrap = card.querySelector('.lib-cover-wrap');
          if (wrap) {
            pill = document.createElement('div');
            pill.className = 'lib-ach-pill';
            pill.textContent = html;
            pill.title = `${unlocked} de ${total} conquistas`;
            wrap.appendChild(pill);
          }
        }
      });
    });
  } catch {}

  // ============================================================
  // LIBRARY STATE LISTENER (broadcasts do main quando session muda)
  // ============================================================
  window.zhub.library.onState((payload) => {
    const { key, kind, totalMinutes, lastPlayed } = payload || {};
    if (!key) return;
    if (key.startsWith('st_')) {
      const appid = parseInt(key.slice(3), 10);
      const it = stItems.get(appid);
      if (it) {
        if (totalMinutes != null) it.totalMinutes = totalMinutes;
        if (lastPlayed != null) it.lastPlayed = lastPlayed;
        if (kind === 'finalized') it.isActive = false;
        if (kind === 'started') it.isActive = true;
        renderSteamToolsGrid();
      }
    } else if (key.startsWith('dl_')) {
      const id = key.slice(3);
      const it = dlItems.get(id);
      if (it) {
        if (totalMinutes != null) it.totalMinutes = totalMinutes;
        if (lastPlayed != null) it.lastPlayed = lastPlayed;
        if (kind === 'finalized') it.isActive = false;
        if (kind === 'started') it.isActive = true;
        renderDownloadsGrid();
      }
    }
  });

  // ============================================================
  // TOAST (reutiliza window.zhubToast se existir)
  // ============================================================
  function toast(msg) {
    if (typeof window.zhubToast === 'function') {
      window.zhubToast(msg);
    } else {
      console.log('[biblioteca]', msg);
    }
  }

  // ============================================================
  // INIT — chamado quando user troca pra view biblioteca
  // ============================================================
  // Init: carrega 1x na sessão. Subsequentes usam cache (stItems / dlItems).
  let didInit = false;
  let isLoading = false;

  // Pre-carrega capa do jogo + cascata de fallbacks até alguma servir
  function preloadCover(appid) {
    return new Promise((resolve) => {
      if (!appid) return resolve();
      const cached = getCachedCover(appid);
      // Se temos URL cacheada, ela vai ser a 1ª da fila
      const urls = [
        ...(cached ? [cached] : []),
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
      ];
      // Dedup mantendo ordem (caso cache seja igual a uma das default)
      const seen = new Set();
      const uniqueUrls = urls.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
      let idx = 0;
      let resolved = false;
      const finish = () => { if (!resolved) { resolved = true; resolve(); } };
      function tryNext() {
        if (resolved) return;
        if (idx >= uniqueUrls.length) return finish(); // todas falharam (fallback ::before resolve)
        const img = new Image();
        const url = uniqueUrls[idx];
        img.onload = () => {
          // Salva qual URL deu certo (pra próxima abertura ir direto)
          saveCoverUrl(appid, url);
          finish();
        };
        img.onerror = () => {
          // Se a URL cacheada falhou, invalida pra forçar re-resolução
          if (idx === 0 && cached && url === cached) invalidateCoverUrl(appid);
          idx++;
          tryNext();
        };
        img.src = url;
      }
      tryNext();
      setTimeout(finish, 4500); // timeout duro
    });
  }
  async function preloadAllCovers() {
    const items = [...stItems.values(), ...dlItems.values()];
    const tasks = items.map((it) => preloadCover(it.appid));
    await Promise.all(tasks);
  }

  async function init() {
    if (didInit) {
      rerenderAll();
      return;
    }
    if (isLoading) return;
    isLoading = true;
    try {
      // Carrega cache de URLs ANTES de qualquer render (pra usar no src inicial)
      await loadCoverUrlCache();
      await loadSteamPath();
      await Promise.all([
        loadSteamToolsGames(),
        loadDownloadedGames(),
      ]);
      // Aguarda TODAS as capas estarem prontas antes de marcar como ready
      await preloadAllCovers();
      // Pre-carrega progresso de achievements (sync — só pega do que já foi cacheado)
      const allKeys = [
        ...Array.from(stItems.keys()).map((appid) => `st_${appid}`),
        ...Array.from(dlItems.keys()).map((id) => id.startsWith('lib_') ? id : `dl_${id}`),
      ];
      await preloadAchievementProgress(allKeys);

      // Background scan: pra cada jogo com appid, faz scanOnce em paralelo (não bloqueia o boot).
      // Após o scan, listener 'achievements:state' atualiza pill X/Y nos cards.
      setTimeout(() => {
        for (const [appid] of stItems) {
          if (!appid) continue;
          window.zhub.achievements.scanOnce({ key: `st_${appid}`, appid }).catch(() => {});
        }
        for (const [id, item] of dlItems) {
          const appid = item?.appid;
          if (!appid) continue;
          const key = id.startsWith('lib_') ? id : `dl_${id}`;
          window.zhub.achievements.scanOnce({ key, appid, exePath: item?.overrideExe || null }).catch(() => {});
        }
      }, 600); // espera UI estabilizar
      didInit = true;
      rerenderAll();
      window.__zhubBibliotecaReady = true;
      if (hasActiveSession()) startUiTicker();
    } catch (err) {
      console.error('[biblioteca] init falhou:', err);
      window.__zhubBibliotecaReady = true; // libera boot-loader mesmo em erro
    } finally {
      isLoading = false;
    }
  }

  // Detecta troca pra view-biblioteca via MutationObserver no atributo hidden
  const observer = new MutationObserver(() => {
    if (!$view.hidden) init();
  });
  observer.observe($view, { attributes: true, attributeFilter: ['hidden'] });

  // PRE-LOAD no boot do app — não espera o user clicar na aba pra começar a carregar.
  // Quando user navegar pra Biblioteca, dados já estarão prontos (ou quase).
  init();

  // Expõe pra outras views poderem forçar refresh manual
  window.zhubBibliotecaRefresh = () => {
    didInit = false; // força recarregar
    init();
  };
})();
