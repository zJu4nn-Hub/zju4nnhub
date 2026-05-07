// renderer/views/inicio.js — Dashboard inicial.
// Popula 4 seções: Downloads ativos, Populares Steam BR, Sua biblioteca Steam Tools,
// Recém-adicionados ao catálogo.

(() => {
  'use strict';

  if (typeof window.zhub === 'undefined') {
    console.warn('[inicio] window.zhub indisponível.');
    return;
  }

  // ============================================================
  // ELEMENTS
  // ============================================================
  const $dlSection = document.getElementById('home-downloads-section');
  const $dlList = document.getElementById('home-downloads-list');

  const $discoverSection = document.getElementById('home-discover-section');
  const $discoverGrid = document.getElementById('home-discover-grid');
  const $discoverTabs = document.querySelectorAll('.home-tab');

  let currentTab = 'popular';

  // ============================================================
  // HELPERS
  // ============================================================
  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function fmtBytes(b) {
    if (!b || b < 0) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
  }

  // Normaliza nome pra match (lowercase, sem diacríticos, sem pontuação)
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Acha um jogo no catálogo pelo nome (match exato → prefix)
  function findGreenGame(name) {
    const arr = window.GREEN_GAMES_DATA;
    if (!arr || !arr.length) return null;
    const target = normalize(name);
    let prefixMatch = null;
    for (const g of arr) {
      const gn = normalize(g.n);
      if (gn === target) return g;
      if (!prefixMatch && (gn.startsWith(target + ' ') || target.startsWith(gn + ' '))) {
        prefixMatch = g;
      }
    }
    return prefixMatch;
  }

  // Click num mini card → abre o modal de detalhes (catalogo.js expõe via window)
  function openGameModal(game) {
    if (typeof window.zhubOpenGameModal === 'function') {
      window.zhubOpenGameModal(game);
    }
  }

  // Extrai appid de uma URL Steam (apps/{id}/)
  function extractAppid(url) {
    const m = String(url || '').match(/\/apps\/(\d+)\//);
    return m ? parseInt(m[1], 10) : null;
  }

  // Detecta nomes "Deluxe Edition", "Premium Edition", etc.
  const EDITION_RE = /\b(deluxe|premium|ultimate|gold|complete|definitive|enhanced|anniversary|game of the year|goty|digital|collectors?|legendary|royal|imperial)\s*(edition|bundle|pack|version)?\b|\bedition\b|\b\+\s*\d+\s*dlcs?\b/gi;

  function hasEditionKeywords(name) {
    return EDITION_RE.test(String(name || ''));
  }
  function stripEditionKeywords(name) {
    return String(name || '')
      .replace(EDITION_RE, '')
      .replace(/\s*[-–—:]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Cache de buscas por nome (qualquer nome) → appid
  const searchAppidCache = new Map();

  async function findAppidViaSearch(name) {
    if (!name) return null;
    if (searchAppidCache.has(name)) return searchAppidCache.get(name);
    try {
      const results = await window.zhub.steam.search(name);
      // Primeiro resultado costuma ser o jogo principal (não DLC/edition)
      const appid = Array.isArray(results) && results[0]?.appid ? results[0].appid : null;
      searchAppidCache.set(name, appid);
      return appid;
    } catch {
      searchAppidCache.set(name, null);
      return null;
    }
  }

  async function findBaseAppidViaSearch(name) {
    const stripped = stripEditionKeywords(name);
    if (!stripped || stripped === name) return null;
    return findAppidViaSearch(stripped);
  }

  // ============================================================
  // IMAGE FALLBACK — header.jpg → cloudflare → appdetails → base game (se for Edition) → placeholder
  // ============================================================
  async function handleMiniCoverError(e) {
    const img = e.target;
    const attempt = parseInt(img.dataset.attempt || '0', 10);
    const appid = img.dataset.appid;
    const card = img.closest('.home-mini-card');
    const name = card?.dataset.gameName || '';

    // 1: Cloudflare CDN com mesmo appid
    if (attempt === 0 && appid) {
      img.dataset.attempt = '1';
      img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
      return;
    }
    // 2: appdetails canônica (com ?t=)
    if (attempt === 1 && appid) {
      img.dataset.attempt = '2';
      try {
        const data = await window.zhub.steam.details(appid);
        if (data?.headerImage && !data.error) {
          img.src = data.headerImage;
          return;
        }
      } catch {}
    }
    // 3: Steam search pelo NOME COMPLETO — pega appid do primeiro resultado
    // (resolve casos onde o appid do catálogo é uma variant sem capa)
    if (attempt < 3 && name) {
      img.dataset.attempt = '3';
      const altAppid = await findAppidViaSearch(name);
      if (altAppid && String(altAppid) !== String(appid)) {
        img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${altAppid}/header.jpg`;
        return;
      }
    }
    // 4: Steam search pelo nome STRIPPED (sem "Deluxe Edition/Premium/etc")
    if (attempt < 4 && hasEditionKeywords(name)) {
      img.dataset.attempt = '4';
      const baseAppid = await findBaseAppidViaSearch(name);
      if (baseAppid) {
        img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${baseAppid}/header.jpg`;
        return;
      }
    }
    // Tudo falhou
    img.style.display = 'none';
    img.parentElement?.classList.add('cover-fallback');
  }

  function setupCoverFallbacks(container) {
    container.querySelectorAll('.home-mini-cover').forEach((img) => {
      if (img.dataset.fbWired === '1') return;
      img.dataset.fbWired = '1';
      img.addEventListener('error', handleMiniCoverError);
      if (img.complete && img.naturalWidth === 0) {
        handleMiniCoverError({ target: img });
      }
    });
  }

  // ============================================================
  // RENDER: MINI CARD genérico (jogo)
  // ============================================================
  // Detecta nome amigável da fonte por URL (igual catalogo.js)
  function detectSourceName(url) {
    if (!url) return null;
    if (url.startsWith('magnet:')) return 'Torrent';
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      if (host.includes('pixeldrain')) return 'Pixeldrain';
      if (host.includes('gofile')) return 'Gofile';
      if (host.includes('mediafire')) return 'MediaFire';
      if (host.includes('mega.nz') || host.includes('mega.io')) return 'MEGA';
      if (host.includes('1fichier')) return '1Fichier';
      if (host.includes('buzzheavier')) return 'BuzzHeavier';
      if (host.includes('akirabox')) return 'AkiraBox';
      if (host.includes('drive.google')) return 'GDrive';
      return host.split('.')[0];
    } catch { return null; }
  }

  // Extrai badges de fontes únicas a partir do array de links do jogo
  function extractSourceBadges(game) {
    const links = Array.isArray(game?.l) ? game.l : [];
    if (!links.length) return [];
    const seen = new Set();
    const badges = [];
    for (const L of links) {
      const src = L.s || detectSourceName(L.u) || 'Servidor';
      const key = src.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        badges.push(src);
      }
    }
    return badges;
  }

  function renderMiniCard(game, opts = {}) {
    const { rank, isNew } = opts;
    const id = `mini-${++miniCardCounter}`;
    miniCardGames.set(id, game);
    const rankBadge = rank ? `<span class="home-mini-rank">#${rank}</span>` : '';
    const newBadge = isNew ? '<span class="home-mini-badge-new">NOVO</span>' : '';
    const cover = escapeHTML(game.i || '');
    const name = escapeHTML(game.n || '—');
    const appid = extractAppid(game.i);

    // Source badges (estilo Hydra: KaOsKrew, FitGirl, DODI, +N)
    const sources = extractSourceBadges(game);
    const visibleSources = sources.slice(0, 3);
    const extraCount = sources.length - visibleSources.length;
    const sourceBadgesHtml = visibleSources
      .map((s) => `<span class="home-source-badge">${escapeHTML(s)}</span>`)
      .join('') + (extraCount > 0
        ? `<span class="home-source-badge home-source-badge-more">+${extraCount} Disponíveis</span>`
        : '');

    return `
      <article class="home-mini-card" data-mini-id="${id}" data-game-name="${name}" data-appid="${appid || ''}">
        ${rankBadge}
        ${newBadge}
        <img class="home-mini-cover" src="${cover}" alt="${name}" loading="lazy" data-appid="${appid || ''}" />
        <div class="home-mini-info">
          <p class="home-mini-name" title="${name}">⛁ ${name}</p>
          ${sourceBadgesHtml ? `<div class="home-source-badges">${sourceBadgesHtml}</div>` : ''}
        </div>
      </article>
    `;
  }

  // Map mini-id → game object (pra que sintéticos cliquem e abram o modal também)
  const miniCardGames = new Map();
  let miniCardCounter = 0;

  // Click delegation: qualquer mini card no view inicio abre o modal do jogo
  document.getElementById('view-inicio')?.addEventListener('click', (e) => {
    const card = e.target.closest('.home-mini-card');
    if (!card) return;
    const id = card.dataset.miniId;
    const game = id ? miniCardGames.get(id) : null;
    // Fallback: tenta achar pelo nome (caso seja card antigo)
    const fallback = !game && card.dataset.gameName
      ? findGreenGame(card.dataset.gameName)
      : null;
    if (game || fallback) openGameModal(game || fallback);
  });

  // ============================================================
  // SEÇÃO 1: DOWNLOADS ATIVOS
  // ============================================================
  async function renderDownloads() {
    if (!$dlList) return;
    try {
      const [tList, hList] = await Promise.all([
        window.zhub.torrent.list().catch(() => []),
        window.zhub.http.list().catch(() => []),
      ]);

      const active = [];
      for (const dl of tList || []) {
        if (dl.status !== 'completed' && dl.status !== 'failed') {
          active.push({ ...dl, _kind: 'torrent' });
        }
      }
      for (const dl of hList || []) {
        if (dl.status !== 'done' && dl.status !== 'failed') {
          active.push({
            id: dl.id,
            name: dl.name,
            status: dl.status === 'done' ? 'completed' : dl.status,
            progress: dl.progress,
            downloadedSize: dl.downloaded,
            totalSize: dl.totalSize,
            _kind: 'http',
          });
        }
      }

      if (!active.length) {
        $dlSection.hidden = true;
        return;
      }

      $dlSection.hidden = false;
      $dlList.innerHTML = active.slice(0, 4).map((dl) => {
        const pct = ((dl.progress || 0) * 100).toFixed(0);
        const size = `${fmtBytes(dl.downloadedSize)} / ${fmtBytes(dl.totalSize)}`;
        const statusKey = dl.status === 'paused' ? 'paused' : 'downloading';
        const statusLabel = dl.status === 'paused' ? 'PAUSADO' :
                            dl.status === 'resolving' ? 'RESOLVENDO' :
                            'BAIXANDO';
        return `
          <div class="home-dl-mini" data-goto="downloads">
            <div class="home-dl-mini-icon">${dl._kind === 'http' ? '🌐' : '🌊'}</div>
            <div class="home-dl-mini-info">
              <p class="home-dl-mini-name">${escapeHTML(dl.name)}</p>
              <div class="home-dl-mini-progress-wrap">
                <div class="home-dl-mini-progress-bar" style="width: ${pct}%"></div>
              </div>
              <div class="home-dl-mini-meta">
                <span>${size}</span>
                <span>${pct}%</span>
              </div>
            </div>
            <span class="home-dl-mini-status ${statusKey}">${statusLabel}</span>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('[inicio] renderDownloads:', err);
      $dlSection.hidden = true;
    }
  }

  // ============================================================
  // SEÇÃO 2: DESCOBRIR (tabs: Populares / Recém-adicionados)
  // ============================================================
  function getPopularGames() {
    const tops = window.STEAM_TOPS;
    const games = window.GREEN_GAMES_DATA;
    if (!Array.isArray(tops) || !Array.isArray(games)) return [];
    const matched = [];
    for (let rank = 0; rank < tops.length && matched.length < 24; rank++) {
      const name = tops[rank];
      const g = findGreenGame(name);
      if (g && !matched.find(m => m.game === g)) {
        matched.push({ game: g, rank: rank + 1 });
      }
    }
    return matched;
  }

  function getRecentGames() {
    const games = window.GREEN_GAMES_DATA;
    if (!Array.isArray(games) || !games.length) return [];
    return games.slice(-24).reverse();
  }

  function renderDiscover() {
    if (!$discoverGrid) return;
    if (currentTab === 'popular') {
      const matched = getPopularGames();
      if (!matched.length) {
        $discoverSection.hidden = true;
        return;
      }
      $discoverSection.hidden = false;
      $discoverGrid.innerHTML = matched.map(({ game }, i) =>
        renderMiniCard(game, { rank: i + 1 })
      ).join('');
    } else if (currentTab === 'recent') {
      const recent = getRecentGames();
      if (!recent.length) {
        $discoverSection.hidden = true;
        return;
      }
      $discoverSection.hidden = false;
      $discoverGrid.innerHTML = recent.map((g) =>
        renderMiniCard(g, { isNew: true })
      ).join('');
    }
    setupCoverFallbacks($discoverGrid);
  }

  // Tab switching
  $discoverTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const newTab = tab.dataset.tab;
      if (!newTab || newTab === currentTab) return;
      currentTab = newTab;
      $discoverTabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === currentTab));
      renderDiscover();
    });
  });

  // ============================================================
  // RENDER ALL
  // ============================================================
  async function renderAll() {
    await Promise.all([
      renderDownloads(),
      Promise.resolve(renderDiscover()),
    ]);
  }

  // ============================================================
  // TRIGGERS
  // ============================================================
  // Render inicial (com delay pra esperar GREEN_GAMES_DATA carregar)
  function tryInitialRender(retries = 10) {
    if (window.GREEN_GAMES_DATA && Array.isArray(window.GREEN_GAMES_DATA)) {
      renderAll();
    } else if (retries > 0) {
      setTimeout(() => tryInitialRender(retries - 1), 200);
    }
  }
  tryInitialRender();

  // Re-render quando o user volta pra view inicio
  document.querySelectorAll('.sidebar-link[data-view="inicio"]').forEach((el) => {
    el.addEventListener('click', () => setTimeout(renderAll, 50));
  });

  // Listeners pra atualizar Downloads em tempo real
  if (window.zhub.torrent?.onProgress) {
    window.zhub.torrent.onProgress(() => {
      // Só re-renderiza se a view inicio está ativa
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
    window.zhub.torrent.onState?.(() => {
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
    window.zhub.torrent.onAdded?.(() => {
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
    window.zhub.torrent.onDone?.(() => {
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
    window.zhub.torrent.onRemoved?.(() => {
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
  }
  if (window.zhub.http?.onProgress) {
    window.zhub.http.onProgress(() => {
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
    window.zhub.http.onAdded?.(() => {
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
    window.zhub.http.onDone?.(() => {
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
    window.zhub.http.onRemoved?.(() => {
      if (!document.getElementById('view-inicio')?.hidden) renderDownloads();
    });
  }

  console.log('[inicio] view inicializada (Dashboard polish).');
})();
