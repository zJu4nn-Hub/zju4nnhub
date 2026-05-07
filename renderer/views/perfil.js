// perfil.js — View Perfil (Fase 8 redesign Hydra-style)
//
// Estrutura:
//   - Hero banner (uploadable) + avatar grande + nome + botões Editar/Sair
//   - Stats (jogos Steam Tools, tempo, downloads)
//   - "Em breve" — features futuras
//   - Modal Editar: troca avatar/banner/username com upload pra Supabase Storage
//   - Modal Logout: substitui o confirm() nativo

(() => {
  'use strict';
  if (typeof window.zhub === 'undefined') return;

  // ============================================================
  // ELEMENTOS
  // ============================================================
  const $view = document.getElementById('view-perfil');
  if (!$view) return;
  const $loggedOut = document.getElementById('perfil-logged-out');
  const $loading = document.getElementById('perfil-loading');
  const $hero = document.getElementById('perfil-dashboard');
  const $content = document.getElementById('perfil-content');

  const $banner = document.getElementById('perfil-banner');
  const $avatar = document.getElementById('perfil-avatar');
  const $username = document.getElementById('perfil-username');
  const $tier = document.getElementById('perfil-tier');
  const $since = document.getElementById('perfil-since');
  const $copyId = document.getElementById('perfil-copy-id');
  const $editBtn = document.getElementById('perfil-edit-btn');
  const $logoutBtn = document.getElementById('perfil-logout-btn');
  const $loginBtn = document.getElementById('perfil-discord-btn');

  // Stats
  const $statST = document.getElementById('stat-steamtools');
  const $statTime = document.getElementById('stat-playtime');
  const $statDownloads = document.getElementById('stat-downloads');
  const $statActive = document.getElementById('stat-active');
  const $statAchievements = document.getElementById('stat-achievements');

  // Library grid
  const $libGrid = document.getElementById('perfil-lib-grid');
  const $libEmpty = document.getElementById('perfil-lib-empty');
  const $libCount = document.getElementById('perfil-lib-count');

  // Pinned section
  const $pinnedSection = document.getElementById('perfil-pinned-section');
  const $pinnedGrid = document.getElementById('perfil-pinned-grid');
  const $pinnedCount = document.getElementById('perfil-pinned-count');

  // Toolbar
  const $libToolbar = document.getElementById('perfil-lib-toolbar');
  const $sortBtns = document.querySelectorAll('.perfil-sort-btn');

  // Atividades recentes
  const $activitiesList = document.getElementById('perfil-activities-list');

  // Edit modal
  const $editModal = document.getElementById('perfil-edit-modal');
  const $editClose = document.getElementById('perfil-edit-close');
  const $editCancel = document.getElementById('perfil-edit-cancel');
  const $editSave = document.getElementById('perfil-edit-save');
  const $editBannerPreview = document.getElementById('perfil-edit-banner-preview');
  const $editBannerBtn = document.getElementById('perfil-edit-banner-btn');
  const $editAvatarPreview = document.getElementById('perfil-edit-avatar-preview');
  const $editAvatarBtn = document.getElementById('perfil-edit-avatar-btn');
  const $editUsername = document.getElementById('perfil-edit-username');
  const $editHandle = document.getElementById('perfil-edit-handle');
  const $editHandleStatus = document.getElementById('perfil-edit-handle-status');
  const $editBio = document.getElementById('perfil-edit-bio');
  const $editPrivate = document.getElementById('perfil-edit-private');
  const $editProgress = document.getElementById('perfil-edit-progress');
  const $editProgressText = document.getElementById('perfil-edit-progress-text');

  // Logout modal
  const $logoutModal = document.getElementById('perfil-logout-modal');
  const $logoutClose = document.getElementById('perfil-logout-close');
  const $logoutCancel = document.getElementById('perfil-logout-cancel');
  const $logoutConfirm = document.getElementById('perfil-logout-confirm');

  // Sidebar
  const $sidebarPerfilIcon = document.getElementById('sidebar-perfil-icon');
  const $sidebarPerfilLabel = document.getElementById('sidebar-perfil-label');

  // ============================================================
  // STATE
  // ============================================================
  let currentSession = null;
  let currentProfile = null;
  let editDraft = null; // { avatar_url, banner_url, username }

  // ============================================================
  // DEFAULTS
  // ============================================================
  function defaultAvatar() {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="%23a04bff"/><text x="50%" y="58%" font-size="50" text-anchor="middle" fill="white">👤</text></svg>'
    );
  }
  function defaultBanner() {
    return ''; // gradient via CSS
  }

  // ============================================================
  // RENDER
  // ============================================================
  function setState(state) {
    if ($loggedOut) $loggedOut.hidden = state !== 'logged-out';
    if ($loading) $loading.hidden = state !== 'loading';
    if ($hero) $hero.hidden = state !== 'logged-in';
    if ($content) $content.hidden = state !== 'logged-in';
  }

  function renderProfile() {
    if (!currentSession) {
      setState('logged-out');
      updateSidebar(null);
      return;
    }
    setState('logged-in');

    const meta = currentSession.user?.metadata || {};
    const profile = currentProfile || {};
    const name = profile.username || meta.full_name || meta.name || meta.user_name || 'Usuário';
    const avatar = profile.avatar_url || meta.avatar_url || defaultAvatar();
    const banner = profile.banner_url || '';
    const discordId = profile.discord_id || meta.provider_id || '';
    const premium = !!profile.premium;
    const since = profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '';

    // Banner
    if ($banner) {
      if (banner) {
        $banner.style.backgroundImage = `url("${banner}")`;
        $banner.classList.add('perfil-banner-custom');
      } else {
        $banner.style.backgroundImage = '';
        $banner.classList.remove('perfil-banner-custom');
      }
    }

    if ($avatar) {
      $avatar.src = avatar;
      $avatar.onerror = () => { $avatar.src = defaultAvatar(); };
    }
    if ($username) $username.textContent = name;
    if ($copyId) $copyId.dataset.id = discordId;
    if ($tier) {
      $tier.textContent = premium ? '👑 Premium' : 'Gratuito';
      $tier.classList.toggle('perfil-tier-premium', premium);
    }
    if ($since) $since.textContent = since ? `Membro desde ${since}` : '';

    updateSidebar({ avatar, name });
    refreshStats();
  }

  function updateSidebar(payload) {
    if (!$sidebarPerfilIcon || !$sidebarPerfilLabel) return;
    if (payload?.avatar) {
      $sidebarPerfilIcon.innerHTML = `<img class="sidebar-avatar" src="${payload.avatar}" alt="" />`;
      // Fallback do img
      const img = $sidebarPerfilIcon.querySelector('img');
      if (img) img.onerror = () => { $sidebarPerfilIcon.textContent = '👤'; };
      $sidebarPerfilLabel.textContent = payload.name || 'Perfil';
    } else {
      $sidebarPerfilIcon.textContent = '👤';
      $sidebarPerfilLabel.textContent = 'Perfil';
    }
  }

  // ============================================================
  // STATS
  // ============================================================
  function formatTime(mins) {
    if (!mins || mins < 60) return `${mins || 0}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h${m}m`;
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
    return new Date(ts).toLocaleDateString('pt-BR');
  }

  async function refreshStats() {
    try {
      const lua = await window.zhub.steamTools.listLua().catch(() => []);
      if ($statST) $statST.textContent = String(Array.isArray(lua) ? lua.length : 0);

      const sessions = await window.zhub.library.listSessions().catch(() => []);
      if ($statActive) $statActive.textContent = String(Array.isArray(sessions) ? sessions.length : 0);

      let totalMins = 0;
      if (Array.isArray(lua)) {
        for (const it of lua) {
          if (!it.appid) continue;
          const pt = await window.zhub.library.getPlaytime(`st_${it.appid}`).catch(() => null);
          if (pt?.totalMinutes) totalMins += pt.totalMinutes;
        }
      }
      const torrents = await window.zhub.torrent.list().catch(() => []);
      const httpDls = await window.zhub.http.list().catch(() => []);
      const manualEntries = await window.zhub.manualLibrary.list().catch(() => []);
      const completedT = (torrents || []).filter((t) => t?.status === 'completed');
      const completedH = (httpDls || []).filter((h) => h?.status === 'done');

      for (const dl of [...completedT, ...completedH]) {
        const pt = await window.zhub.library.getPlaytime(`dl_${dl.id}`).catch(() => null);
        if (pt?.totalMinutes) totalMins += pt.totalMinutes;
      }
      for (const m of manualEntries) {
        const pt = await window.zhub.library.getPlaytime(`lib_${m.appid}`).catch(() => null);
        if (pt?.totalMinutes) totalMins += pt.totalMinutes;
      }

      if ($statTime) $statTime.textContent = formatTime(totalMins);
      if ($statDownloads) $statDownloads.textContent = String(completedT.length + completedH.length + manualEntries.length);

      // Stats de achievements (agregadas de todos os jogos)
      try {
        const stats = await window.zhub.achievements.getStats();
        if ($statAchievements && stats) {
          $statAchievements.textContent = `${stats.totalUnlocked}/${stats.totalAvailable}`;
        }
      } catch {}

      // Renderiza grid de biblioteca
      await refreshLibrary({ lua, completedT, completedH, manualEntries });
    } catch (err) {
      console.warn('[perfil] refreshStats falhou:', err);
    }
  }

  // ============================================================
  // BIBLIOTECA — grid de jogos (Steam Tools + downloads)
  // ============================================================
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  // Cache de nomes resolvidos (evita repetir Steam catalog/search)
  const nameCache = new Map();
  async function resolveAppidName(appid, currentName) {
    if (currentName && !/^App \d+$/i.test(currentName)) return currentName;
    if (nameCache.has(appid)) return nameCache.get(appid);
    let name = currentName || null;
    try {
      const fromCatalog = await window.zhub.steamCatalog.getGameName(appid);
      if (fromCatalog) name = fromCatalog;
    } catch {}
    if (!name) {
      try {
        const data = await window.zhub.steam.details(appid);
        if (data?.name) name = data.name;
      } catch {}
    }
    if (!name) name = `App ${appid}`;
    nameCache.set(appid, name);
    return name;
  }

  // Strip de keywords de edition pra melhorar match no Steam search
  const EDITION_RE = /\b(deluxe|premium|ultimate|gold|complete|definitive|enhanced|anniversary|game of the year|goty|digital|collectors?|legendary|royal|imperial|champion)\b\s*(edition|bundle|pack|version)?|\bedition\b|\b\+\s*\d+\s*dlcs?\b/gi;
  function stripEditionKeywords(s) {
    if (!s) return '';
    return s.replace(EDITION_RE, '').replace(/\s+/g, ' ').trim();
  }

  // Cache de appid resolvidos por nome (evita repetir Steam search)
  const downloadAppidCache = new Map();
  async function resolveAppidForDownload(name) {
    if (!name) return null;
    if (downloadAppidCache.has(name)) return downloadAppidCache.get(name);
    let appid = null;
    try {
      const stripped = stripEditionKeywords(name) || name;
      const results = await window.zhub.steam.search(stripped);
      if (Array.isArray(results) && results[0]?.appid) {
        appid = results[0].appid;
      }
    } catch {}
    downloadAppidCache.set(name, appid);
    return appid;
  }

  async function refreshLibrary({ lua, completedT, completedH, manualEntries }) {
    if (!$libGrid) return;

    // Render cache anterior IMEDIATAMENTE (se tiver) pra não dar tela em branco
    if (window.__perfilLibCache?.length) {
      renderLibraryGrid(window.__perfilLibCache);
    }

    // Paraleliza TODAS as chamadas IPC (resolveName + getPlaytime)
    const tasks = [];
    if (Array.isArray(lua)) {
      for (const it of lua) {
        if (!it.appid) continue;
        tasks.push((async () => {
          const [name, pt] = await Promise.all([
            resolveAppidName(it.appid, it.name),
            window.zhub.library.getPlaytime(`st_${it.appid}`).catch(() => null),
          ]);
          return {
            kind: 'steamtools',
            appid: it.appid,
            name,
            cover: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${it.appid}/header.jpg`,
            totalMinutes: pt?.totalMinutes || 0,
            lastPlayed: pt?.lastPlayed || 0,
            addedAt: it.modifiedAt || 0, // mtime do .lua = "adicionado em"
          };
        })());
      }
    }
    for (const dl of [...(completedT || []), ...(completedH || [])]) {
      tasks.push((async () => {
        const [pt, appid] = await Promise.all([
          window.zhub.library.getPlaytime(`dl_${dl.id}`).catch(() => null),
          resolveAppidForDownload(dl.name).catch(() => null),
        ]);
        return {
          kind: 'download',
          id: dl.id,
          appid: appid || '',
          name: dl.name,
          cover: appid
            ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`
            : '',
          totalMinutes: pt?.totalMinutes || 0,
          lastPlayed: pt?.lastPlayed || 0,
          addedAt: dl.completedAt || dl.finishedAt || 0,
        };
      })());
    }

    // Entries da biblioteca manual (adicionadas sem download via app)
    for (const m of (manualEntries || [])) {
      tasks.push((async () => {
        const [pt, name] = await Promise.all([
          window.zhub.library.getPlaytime(`lib_${m.appid}`).catch(() => null),
          resolveAppidName(m.appid, m.name),
        ]);
        return {
          kind: 'manual',
          id: `lib_${m.appid}`,
          appid: m.appid,
          name,
          cover: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${m.appid}/header.jpg`,
          totalMinutes: pt?.totalMinutes || 0,
          lastPlayed: pt?.lastPlayed || 0,
          addedAt: m.addedAt || 0,
        };
      })());
    }

    const items = await Promise.all(tasks);

    // Ordenação inicial só pra cache: recentes primeiro (sortItems é chamado em renderLibraryGrid com pref atual)
    items.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (a.name || '').localeCompare(b.name || ''));

    // Atualiza cache
    window.__perfilLibCache = items;

    renderLibraryGrid(items);
    renderActivities(items);
  }

  let lastActivitiesHash = null;
  function renderActivities(items) {
    if (!$activitiesList) return;
    // Filtra só jogos que foram jogados (lastPlayed > 0) e ordena
    const recent = (items || [])
      .filter((it) => it.lastPlayed && it.lastPlayed > 0)
      .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
      .slice(0, 5);

    if (recent.length === 0) {
      if (lastActivitiesHash !== '') {
        $activitiesList.innerHTML = '<div class="perfil-activities-empty">Nenhum jogo aberto ainda.</div>';
        lastActivitiesHash = '';
      }
      return;
    }

    // Anti-flash: pula re-render se hash não mudou
    const newHash = recent.map((it) => `${it.appid || it.id}:${it.totalMinutes}:${it.lastPlayed}`).join('|');
    if (newHash === lastActivitiesHash) return;
    lastActivitiesHash = newHash;

    $activitiesList.innerHTML = recent.map((it) => {
      const safeName = escapeHtml(it.name);
      const cover = it.cover || '';
      const ago = formatRelativeTime(it.lastPlayed);
      const mins = formatTime(it.totalMinutes);
      const appid = it.appid || '';
      return `
        <div class="perfil-activity-row" data-appid="${appid}" data-game-name="${safeName}">
          <div class="perfil-activity-cover-wrap">
            ${cover ? `<img class="perfil-activity-cover" src="${cover}" alt="${safeName}" loading="eager" decoding="async" />` : ''}
          </div>
          <div class="perfil-activity-info">
            <div class="perfil-activity-name" title="${safeName}">${safeName}</div>
            <div class="perfil-activity-meta">
              <span title="Tempo total">⏱ ${mins}</span>
              <span title="Último acesso">🕒 ${ago}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Cascata de fallback: header → cloudflare → library_hero → appdetails → placeholder
    $activitiesList.querySelectorAll('img.perfil-activity-cover').forEach((img) => {
      img.addEventListener('error', async () => {
        const attempt = parseInt(img.dataset.attempt || '0', 10);
        const card = img.closest('.perfil-activity-row');
        const appid = card?.dataset.appid;
        if (!appid) {
          img.style.display = 'none';
          img.parentElement?.classList.add('perfil-activity-cover-fallback');
          return;
        }
        if (attempt === 0) {
          img.dataset.attempt = '1';
          img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
          return;
        }
        if (attempt === 1) {
          img.dataset.attempt = '2';
          img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`;
          return;
        }
        if (attempt === 2) {
          img.dataset.attempt = '3';
          try {
            const data = await window.zhub.steam.details(appid);
            if (data?.headerImage && !data.error) {
              img.src = data.headerImage;
              return;
            }
          } catch {}
        }
        img.style.display = 'none';
        img.parentElement?.classList.add('perfil-activity-cover-fallback');
      });
    });

    // Click numa atividade abre o modal do jogo
    $activitiesList.querySelectorAll('.perfil-activity-row').forEach((row) => {
      row.addEventListener('click', () => {
        const appid = parseInt(row.dataset.appid, 10);
        const name = row.dataset.gameName;
        const greenGame = findGameInGreen(appid, name);
        if (greenGame && typeof window.zhubOpenGameModal === 'function') {
          window.zhubOpenGameModal(greenGame);
          return;
        }
        if (typeof window.zhubOpenGameModal === 'function' && appid) {
          window.zhubOpenGameModal({
            i: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
            n: name,
            l: [],
          });
        }
      });
    });
  }

  // ============================================================
  // PINNED GAMES + SORT (Fase 9.x)
  // ============================================================
  const PIN_KEY = 'zhub_pinned_v1';
  const SORT_KEY = 'zhub_perfil_sort_v1';
  let pinnedSet = new Set();
  let sortBy = 'lastPlayed'; // 'lastPlayed' | 'totalMinutes' | 'addedAt'
  try {
    const raw = JSON.parse(localStorage.getItem(PIN_KEY) || '[]');
    if (Array.isArray(raw)) pinnedSet = new Set(raw);
  } catch {}
  try {
    const s = localStorage.getItem(SORT_KEY);
    if (s === 'lastPlayed' || s === 'totalMinutes' || s === 'addedAt') sortBy = s;
  } catch {}

  function getItemKey(it) {
    if (it.kind === 'steamtools') return `st_${it.appid}`;
    if (it.kind === 'manual') return `lib_${it.appid}`;
    return `dl_${it.id}`;
  }
  function isPinned(it) { return pinnedSet.has(getItemKey(it)); }
  function togglePin(it) {
    const k = getItemKey(it);
    if (pinnedSet.has(k)) pinnedSet.delete(k);
    else pinnedSet.add(k);
    try { localStorage.setItem(PIN_KEY, JSON.stringify([...pinnedSet])); } catch {}
  }
  function saveSortPref() {
    try { localStorage.setItem(SORT_KEY, sortBy); } catch {}
  }

  // Aplica sort preference (igual em fixados + biblioteca)
  function sortItems(items) {
    const arr = items.slice();
    arr.sort((a, b) => {
      if (sortBy === 'totalMinutes') {
        return (b.totalMinutes || 0) - (a.totalMinutes || 0)
          || (b.lastPlayed || 0) - (a.lastPlayed || 0)
          || (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'addedAt') {
        // Pra Steam Tools: modifiedAt do .lua; pra download: completedAt; pra manual: addedAt; senão lastPlayed
        const aT = a.addedAt || a.completedAt || a.lastPlayed || 0;
        const bT = b.addedAt || b.completedAt || b.lastPlayed || 0;
        return bT - aT || (a.name || '').localeCompare(b.name || '');
      }
      // default = lastPlayed
      return (b.lastPlayed || 0) - (a.lastPlayed || 0) || (a.name || '').localeCompare(b.name || '');
    });
    return arr;
  }

  // Atualiza estado visual dos botões de sort
  function applySortBtnsState() {
    $sortBtns.forEach((b) => b.classList.toggle('active', b.dataset.sort === sortBy));
  }
  applySortBtnsState();
  $sortBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const newSort = btn.dataset.sort;
      if (!newSort || newSort === sortBy) return;
      sortBy = newSort;
      saveSortPref();
      applySortBtnsState();
      // Re-render forçado
      const cache = window.__perfilLibCache;
      if (cache) {
        lastGridHash = null;
        renderLibraryGrid(cache);
      }
    });
  });

  let lastGridHash = null;
  function hashItems(items) {
    return (items || []).slice(0, 24).map((it) => `${it.kind}:${it.appid || it.id}:${it.totalMinutes}:${it.lastPlayed}:${isPinned(it) ? 1 : 0}`).join('|') + `|sort:${sortBy}`;
  }

  // Gera o HTML de um card do perfil (compartilhado entre Fixado + Biblioteca)
  function renderPerfilCard(it) {
    const appid = it.appid || '';
    const minsLabel = it.totalMinutes > 0 ? formatTime(it.totalMinutes) : '0 min';
    const safeName = escapeHtml(it.name);
    const pinned = isPinned(it);
    const pinnedCls = pinned ? ' perfil-lib-card-pinned' : '';
    const coverHtml = it.cover
      ? `<img class="perfil-lib-cover" src="${it.cover}" alt="${safeName}" loading="eager" decoding="async" />`
      : '';
    const wrapCls = it.cover ? 'perfil-lib-cover-wrap' : 'perfil-lib-cover-wrap perfil-lib-cover-fallback';
    return `
      <article class="perfil-lib-card${pinnedCls}" data-kind="${it.kind}" data-appid="${appid}" data-id="${it.id || ''}" data-game-name="${safeName}">
        <button class="perfil-lib-pin${pinned ? ' active' : ''}" data-action="pin" title="${pinned ? 'Desafixar' : 'Fixar no topo'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
        </button>
        <div class="${wrapCls}" data-game-name="${safeName}">
          ${coverHtml}
          <div class="perfil-lib-time"><span>⏱</span> ${minsLabel}</div>
        </div>
        <div class="perfil-lib-name" title="${safeName}">${safeName}</div>
      </article>
    `;
  }

  // Cache de elementos de card por key — pra mover entre grids sem re-criar (evita flicker da img)
  const cardElCache = new Map();

  function buildCardElement(it) {
    const tpl = document.createElement('template');
    tpl.innerHTML = renderPerfilCard(it).trim();
    const el = tpl.content.firstElementChild;
    wireCardCoverFallback(el.querySelector('img.perfil-lib-cover'));
    return el;
  }

  function wireCardCoverFallback(img) {
    if (!img || img.dataset.fbWired === '1') return;
    img.dataset.fbWired = '1';
    img.addEventListener('error', async () => {
      const attempt = parseInt(img.dataset.attempt || '0', 10);
      const card = img.closest('.perfil-lib-card');
      const appid = card?.dataset.appid;
      if (!appid) {
        img.style.display = 'none';
        img.parentElement?.classList.add('perfil-lib-cover-fallback');
        return;
      }
      if (attempt === 0) {
        img.dataset.attempt = '1';
        img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
        return;
      }
      if (attempt === 1) {
        img.dataset.attempt = '2';
        img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`;
        return;
      }
      if (attempt === 2) {
        img.dataset.attempt = '3';
        try {
          const data = await window.zhub.steam.details(appid);
          if (data?.headerImage && !data.error) {
            img.src = data.headerImage;
            return;
          }
        } catch {}
      }
      img.style.display = 'none';
      img.parentElement?.classList.add('perfil-lib-cover-fallback');
    });
  }

  // Atualiza visual de um card existente sem recriar (preserva img carregada)
  function updateCardElement(el, it) {
    const wantPinned = isPinned(it);
    el.classList.toggle('perfil-lib-card-pinned', wantPinned);
    const $pinBtn = el.querySelector('.perfil-lib-pin');
    if ($pinBtn) {
      $pinBtn.classList.toggle('active', wantPinned);
      $pinBtn.title = wantPinned ? 'Desafixar' : 'Fixar no topo';
      const $svg = $pinBtn.querySelector('svg');
      if ($svg) $svg.setAttribute('fill', wantPinned ? 'currentColor' : 'none');
    }
    const $time = el.querySelector('.perfil-lib-time');
    if ($time) {
      const minsLabel = it.totalMinutes > 0 ? formatTime(it.totalMinutes) : '0 min';
      $time.innerHTML = `<span>⏱</span> ${minsLabel}`;
    }
  }

  function syncGridChildren(gridEl, list) {
    if (!gridEl) return;
    // Remove todos children atuais (sem destruir os nodes — voltam pro cache)
    while (gridEl.firstChild) gridEl.removeChild(gridEl.firstChild);
    // Re-adiciona na ordem certa (move existentes ou cria novos)
    list.forEach((it) => {
      const key = getItemKey(it);
      let el = cardElCache.get(key);
      if (!el) {
        el = buildCardElement(it);
        cardElCache.set(key, el);
      } else {
        updateCardElement(el, it);
      }
      gridEl.appendChild(el);
    });
  }

  function renderLibraryGrid(items) {
    const total = (items || []).length;
    if ($libToolbar) $libToolbar.hidden = total === 0;

    if (!items || total === 0) {
      while ($libGrid?.firstChild) $libGrid.removeChild($libGrid.firstChild);
      if ($pinnedGrid) while ($pinnedGrid.firstChild) $pinnedGrid.removeChild($pinnedGrid.firstChild);
      if ($pinnedSection) $pinnedSection.hidden = true;
      if ($libCount) $libCount.textContent = '0';
      if ($pinnedCount) $pinnedCount.textContent = '0';
      lastGridHash = '';
      if ($libEmpty) $libEmpty.hidden = false;
      return;
    }
    if ($libEmpty) $libEmpty.hidden = true;

    const newHash = hashItems(items);
    if (newHash === lastGridHash) return;
    lastGridHash = newHash;

    // Limpa cache de keys que não existem mais (jogos removidos)
    const validKeys = new Set(items.map(getItemKey));
    for (const k of cardElCache.keys()) {
      if (!validKeys.has(k)) cardElCache.delete(k);
    }

    // Separa em fixados x não-fixados; aplica sort em cada
    const pinned = sortItems(items.filter(isPinned));
    const others = sortItems(items.filter((it) => !isPinned(it)));

    if ($pinnedCount) $pinnedCount.textContent = String(pinned.length);
    if ($libCount) $libCount.textContent = String(others.length);

    if ($pinnedSection) $pinnedSection.hidden = pinned.length === 0;
    syncGridChildren($pinnedGrid, pinned);
    syncGridChildren($libGrid, others.slice(0, 12));
  }

  function wireCoverFallbacks(gridEl) {
    if (!gridEl) return;
    gridEl.querySelectorAll('img.perfil-lib-cover').forEach((img) => {
      img.addEventListener('error', async () => {
        const attempt = parseInt(img.dataset.attempt || '0', 10);
        const card = img.closest('.perfil-lib-card');
        const appid = card?.dataset.appid;
        if (!appid) {
          img.style.display = 'none';
          img.parentElement?.classList.add('perfil-lib-cover-fallback');
          return;
        }
        if (attempt === 0) {
          img.dataset.attempt = '1';
          img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
          return;
        }
        if (attempt === 1) {
          img.dataset.attempt = '2';
          img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`;
          return;
        }
        if (attempt === 2) {
          img.dataset.attempt = '3';
          try {
            const data = await window.zhub.steam.details(appid);
            if (data?.headerImage && !data.error) {
              img.src = data.headerImage;
              return;
            }
          } catch {}
        }
        img.style.display = 'none';
        img.parentElement?.classList.add('perfil-lib-cover-fallback');
      });
    });
  }

  // Handler unificado de click nos cards (Fixado + Biblioteca)
  function handleCardGridClick(e) {
    // Click no botão de pin → toggle pin (não abre modal)
    const pinBtn = e.target.closest('[data-action="pin"]');
    if (pinBtn) {
      e.stopPropagation();
      const card = pinBtn.closest('.perfil-lib-card');
      if (!card) return;
      const cache = window.__perfilLibCache || [];
      const kind = card.dataset.kind;
      const appid = parseInt(card.dataset.appid, 10);
      const id = card.dataset.id;
      const item = cache.find((it) => {
        if (kind === 'steamtools') return it.kind === 'steamtools' && Number(it.appid) === appid;
        if (kind === 'manual') return it.kind === 'manual' && Number(it.appid) === appid;
        return it.kind === 'download' && String(it.id) === id;
      });
      if (item) {
        togglePin(item);
        lastGridHash = null;
        renderLibraryGrid(cache);
      }
      return;
    }
    const card = e.target.closest('.perfil-lib-card');
    if (!card) return;
    const appid = parseInt(card.dataset.appid, 10);
    const name = card.dataset.gameName;

    // Procura no catálogo de jogos verdes primeiro (modal renderiza completo)
    const greenGame = findGameInGreen(appid, name);
    if (greenGame && typeof window.zhubOpenGameModal === 'function') {
      window.zhubOpenGameModal(greenGame);
      return;
    }
    // Sintético: jogo Steam Tools ou download não no catálogo
    // URL precisa conter /apps/{id}/ (regex do modal: /apps\/(\d+)\//)
    if (typeof window.zhubOpenGameModal === 'function' && appid) {
      const synthetic = {
        i: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
        n: name,
        l: [],
      };
      window.zhubOpenGameModal(synthetic);
      return;
    }
    toast('🚧 Detalhes em breve');
  }
  $libGrid?.addEventListener('click', handleCardGridClick);
  $pinnedGrid?.addEventListener('click', handleCardGridClick);

  // ============================================================
  // ACTIONS — login fallback (caso não tenha gate)
  // ============================================================
  $loginBtn?.addEventListener('click', async () => {
    setState('loading');
    try {
      const r = await window.zhub.auth.signInDiscord();
      if (r?.error) toast('❌ ' + r.error);
    } catch (err) {
      toast('❌ ' + err.message);
    }
  });

  // Copy Discord ID
  $copyId?.addEventListener('click', () => {
    const id = $copyId.dataset.id;
    if (!id) return;
    try {
      navigator.clipboard.writeText(id);
      toast('✓ Discord ID copiado');
    } catch {
      toast('Falha ao copiar');
    }
  });

  // ============================================================
  // EDIT MODAL
  // ============================================================
  function openEditModal() {
    const p = currentProfile || {};
    const meta = currentSession?.user?.metadata || {};
    editDraft = {
      avatar_url: p.avatar_url || meta.avatar_url || null,
      banner_url: p.banner_url || null,
      username: p.username || meta.full_name || meta.name || '',
      handle: p.handle || '',
      bio: p.bio || '',
      is_private: !!p.is_private,
    };
    if ($editAvatarPreview) {
      $editAvatarPreview.src = editDraft.avatar_url || defaultAvatar();
    }
    if ($editBannerPreview) {
      if (editDraft.banner_url) {
        $editBannerPreview.style.backgroundImage = `url("${editDraft.banner_url}")`;
        $editBannerPreview.classList.add('perfil-banner-custom');
      } else {
        $editBannerPreview.style.backgroundImage = '';
        $editBannerPreview.classList.remove('perfil-banner-custom');
      }
    }
    if ($editUsername) $editUsername.value = editDraft.username || '';
    if ($editHandle) $editHandle.value = editDraft.handle || '';
    if ($editHandleStatus) $editHandleStatus.textContent = '';
    if ($editBio) $editBio.value = editDraft.bio || '';
    if ($editPrivate) $editPrivate.checked = !!editDraft.is_private;
    if ($editProgress) $editProgress.hidden = true;
    if ($editModal) $editModal.hidden = false;
  }

  // Validação de handle ao digitar (visual)
  $editHandle?.addEventListener('input', () => {
    if (!$editHandleStatus) return;
    const v = ($editHandle.value || '').trim();
    if (!v) {
      $editHandleStatus.textContent = '';
      $editHandleStatus.style.color = '';
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(v)) {
      $editHandleStatus.textContent = 'inválido (3-20 chars)';
      $editHandleStatus.style.color = '#ff7a7a';
      return;
    }
    $editHandleStatus.textContent = 'OK';
    $editHandleStatus.style.color = '#74de80';
  });

  function closeEditModal() {
    if ($editModal) $editModal.hidden = true;
    editDraft = null;
  }

  async function pickAndUpload(kind) {
    const filePath = await window.zhub.auth.pickImage();
    if (!filePath) return;
    if ($editProgress) {
      $editProgress.hidden = false;
      $editProgressText.textContent = `Enviando ${kind}…`;
    }
    try {
      const r = await window.zhub.auth.uploadImage({ kind, filePath });
      if (r?.error) {
        toast('❌ Upload falhou: ' + r.error);
        return;
      }
      if (kind === 'avatar') {
        editDraft.avatar_url = r.url;
        if ($editAvatarPreview) $editAvatarPreview.src = r.url;
      } else {
        editDraft.banner_url = r.url;
        if ($editBannerPreview) {
          $editBannerPreview.style.backgroundImage = `url("${r.url}")`;
          $editBannerPreview.classList.add('perfil-banner-custom');
        }
      }
      // Atualiza profile cache local
      currentProfile = { ...currentProfile, ...(kind === 'avatar' ? { avatar_url: r.url } : { banner_url: r.url }) };
      renderProfile(); // atualiza hero + sidebar imediatamente
      toast('✓ Imagem enviada');
    } catch (err) {
      toast('❌ ' + err.message);
    } finally {
      if ($editProgress) $editProgress.hidden = true;
    }
  }

  $editBtn?.addEventListener('click', openEditModal);
  $editClose?.addEventListener('click', closeEditModal);
  $editCancel?.addEventListener('click', closeEditModal);
  $editAvatarBtn?.addEventListener('click', () => pickAndUpload('avatar'));
  $editBannerBtn?.addEventListener('click', () => pickAndUpload('banner'));

  $editSave?.addEventListener('click', async () => {
    if (!editDraft) return;
    const newUsername = ($editUsername?.value || '').trim();
    const newHandle = ($editHandle?.value || '').trim();
    const newBio = ($editBio?.value || '').trim();
    const newPrivate = !!($editPrivate?.checked);

    if (!newUsername) {
      toast('❌ Nome não pode ficar vazio');
      return;
    }
    if (newHandle && !/^[a-zA-Z0-9_]{3,20}$/.test(newHandle)) {
      toast('❌ Handle inválido (3-20 chars: letras, números ou _)');
      return;
    }
    if ($editProgress) {
      $editProgress.hidden = false;
      $editProgressText.textContent = 'Salvando…';
    }
    try {
      const patch = { username: newUsername };
      if (newHandle !== (currentProfile?.handle || '')) patch.handle = newHandle || null;
      if (newBio !== (currentProfile?.bio || '')) patch.bio = newBio || null;
      if (newPrivate !== !!currentProfile?.is_private) patch.is_private = newPrivate;
      const r = await window.zhub.auth.updateProfile(patch);
      if (r?.error) {
        // Detect erro de handle duplicado
        if (String(r.error).includes('duplicate') || String(r.error).includes('23505')) {
          toast('❌ Handle já está em uso');
        } else {
          toast('❌ ' + r.error);
        }
        return;
      }
      currentProfile = r;
      renderProfile();
      toast('✓ Perfil atualizado');
      closeEditModal();
    } catch (err) {
      toast('❌ ' + err.message);
    } finally {
      if ($editProgress) $editProgress.hidden = true;
    }
  });

  // Click fora fecha
  $editModal?.addEventListener('click', (e) => {
    if (e.target === $editModal) closeEditModal();
  });

  // ============================================================
  // LOGOUT MODAL
  // ============================================================
  function openLogoutModal() { if ($logoutModal) $logoutModal.hidden = false; }
  function closeLogoutModal() { if ($logoutModal) $logoutModal.hidden = true; }

  $logoutBtn?.addEventListener('click', openLogoutModal);
  $logoutClose?.addEventListener('click', closeLogoutModal);
  $logoutCancel?.addEventListener('click', closeLogoutModal);
  $logoutModal?.addEventListener('click', (e) => {
    if (e.target === $logoutModal) closeLogoutModal();
  });
  $logoutConfirm?.addEventListener('click', async () => {
    closeLogoutModal();
    try {
      await window.zhub.auth.signOut();
      // SIGNED_OUT → auth-gate.js reabre a tela de login
    } catch (err) {
      toast('❌ ' + err.message);
    }
  });

  // ============================================================
  // AUTH STATE LISTENER
  // ============================================================
  window.zhub.auth.onState(async ({ event, payload }) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
      currentSession = payload;
      if (currentSession) {
        currentProfile = await window.zhub.auth.getProfile().catch(() => null);
        renderProfile();
      } else {
        currentSession = null;
        currentProfile = null;
        renderProfile();
      }
    } else if (event === 'SIGNED_OUT') {
      currentSession = null;
      currentProfile = null;
      renderProfile();
    } else if (event === 'USER_UPDATED') {
      currentProfile = await window.zhub.auth.getProfile().catch(() => null);
      renderProfile();
    }
  });

  function toast(msg) {
    if (typeof window.zhubToast === 'function') window.zhubToast(msg);
    else console.log('[perfil]', msg);
  }

  // ============================================================
  // INIT — carrega 1x na sessão. Subsequentes navegações usam cache.
  // ============================================================
  let didInit = false;
  async function init() {
    if (didInit) return;
    didInit = true;
    try {
      const session = await window.zhub.auth.getSession();
      if (session) {
        currentSession = session;
        currentProfile = await window.zhub.auth.getProfile().catch(() => null);
        renderProfile();
      } else {
        setState('logged-out');
      }
    } catch (err) {
      console.warn('[perfil] init falhou:', err);
      setState('logged-out');
    }
  }
  init();

  window.zhubPerfilRefresh = () => { if (currentSession) refreshStats(); };

  // Auto-refresh quando download completa ou é removido
  try {
    window.zhub.torrent.onDone?.(() => { if (currentSession) refreshStats(); });
    window.zhub.torrent.onRemoved?.(() => { if (currentSession) refreshStats(); });
  } catch {}
  try {
    window.zhub.http.onDone?.(() => { if (currentSession) refreshStats(); });
    window.zhub.http.onRemoved?.(() => { if (currentSession) refreshStats(); });
  } catch {}

  // Listener de achievements — atualiza stat em tempo real
  async function refreshAchStat() {
    if (!currentSession) return;
    try {
      const stats = await window.zhub.achievements.getStats();
      if ($statAchievements && stats) {
        $statAchievements.textContent = `${stats.totalUnlocked}/${stats.totalAvailable}`;
      }
    } catch {}
  }
  try {
    window.zhub.achievements.onState?.((_payload) => { refreshAchStat(); });
    window.zhub.achievements.onUnlocked?.((_payload) => { refreshAchStat(); });
  } catch {}

  // Listener: jogo iniciou / finalizou / atualizou playtime
  // Atualiza Atividades recentes em tempo real (sem precisar refresh manual)
  try {
    window.zhub.library.onState?.((payload) => {
      if (!currentSession) return;
      const { key, kind, totalMinutes, lastPlayed } = payload || {};
      if (!key) return;
      const cache = window.__perfilLibCache;
      // Identifica o item no cache pelo key
      // st_{appid} → match pela kind=steamtools + appid
      // dl_{id} → match pela kind=download + id
      const matcher = (it) => {
        if (key.startsWith('st_')) {
          const appid = parseInt(key.slice(3), 10);
          return it.kind === 'steamtools' && Number(it.appid) === appid;
        }
        if (key.startsWith('dl_')) {
          const id = key.slice(3);
          return it.kind === 'download' && String(it.id) === id;
        }
        if (key.startsWith('lib_')) {
          const appid = parseInt(key.slice(4), 10);
          return it.kind === 'manual' && Number(it.appid) === appid;
        }
        return false;
      };
      const item = Array.isArray(cache) ? cache.find(matcher) : null;
      if (!item) {
        // Item não está no cache — é provável que seja um download recém-aberto
        // que ainda não foi pra Sua biblioteca. Faz refresh completo.
        refreshStats();
        return;
      }
      if (totalMinutes != null) item.totalMinutes = totalMinutes;
      if (lastPlayed != null) item.lastPlayed = lastPlayed;
      // Re-ordena cache por lastPlayed pra atividades pegarem ordem certa
      cache.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (a.name || '').localeCompare(b.name || ''));
      // Re-render só atividades (lib grid pula via hash se nada visual mudou)
      renderActivities(cache);
      renderLibraryGrid(cache);
    });
  } catch {}
})();
