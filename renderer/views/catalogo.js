// renderer/views/catalogo.js — View "Catálogo" (Jogos Verdes)
// Fase 5.3: intercepta clicks nos cards do catálogo e abre o modal de detalhes
// individual (página rica do jogo) com banner Steam + screenshots + picker de repacks.

(() => {
  'use strict';

  if (typeof window.zhub === 'undefined') {
    console.warn('[catalogo] window.zhub indisponível.');
    return;
  }

  // ============================================================
  // ELEMENTS
  // ============================================================
  const $modal = document.getElementById('game-detail-modal');
  const $modalClose = document.getElementById('game-detail-close');
  const $bg = document.getElementById('game-detail-bg');
  const $cover = document.getElementById('game-detail-cover');
  const $name = document.getElementById('game-detail-name');
  const $developer = document.getElementById('game-detail-developer');
  const $release = document.getElementById('game-detail-release');
  const $tags = document.getElementById('game-detail-tags');
  const $summary = document.getElementById('game-detail-summary');
  const $repacks = document.getElementById('game-detail-repacks');
  const $shotsTitle = document.getElementById('game-detail-shots-title');
  const $shots = document.getElementById('game-detail-screenshots');
  const $aboutTitle = document.getElementById('game-detail-about-title');
  const $about = document.getElementById('game-detail-about');

  // Steam actions (Adicionar à Steam / Loja)
  const $steamActions = document.getElementById('game-detail-steam-actions');
  const $btnSteamAdd = document.getElementById('game-detail-steam-add');
  const $btnSteamStore = document.getElementById('game-detail-steam-store');

  // Achievements (Fase 9.x)
  const $achSection = document.getElementById('game-detail-achievements');
  const $achCount = document.getElementById('game-detail-ach-count');
  const $achFill = document.getElementById('game-detail-ach-fill');
  const $achGrid = document.getElementById('game-detail-ach-grid');
  const $achRefresh = document.getElementById('game-detail-ach-refresh');

  if (!$modal) {
    console.warn('[catalogo] Modal #game-detail-modal não existe.');
    return;
  }

  const $grid = document.getElementById('green-grid');
  if (!$grid) {
    console.warn('[catalogo] #green-grid não existe.');
    return;
  }

  // ============================================================
  // STATE
  // ============================================================
  let currentGame = null;        // jogo do catálogo (greenGames data)
  let currentLinks = [];         // links normalizados
  let detailsToken = 0;          // pra cancelar fetches concorrentes

  // ============================================================
  // HELPERS
  // ============================================================
  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function extractAppid(url) {
    if (!url || typeof url !== 'string') return null;
    const m = url.match(/\/apps\/(\d+)\//);
    return m ? parseInt(m[1], 10) : null;
  }

  // Detecta nomes "Deluxe Edition", "Premium Edition", etc. (mesmo regex do inicio.js)
  const EDITION_RE = /\b(deluxe|premium|ultimate|gold|complete|definitive|enhanced|anniversary|game of the year|goty|digital|collectors?|legendary|royal|imperial|champion)\s*(edition|bundle|pack|version)?\b|\bedition\b|\b\+\s*\d+\s*dlcs?\b/gi;

  function stripEditionKeywords(name) {
    return String(name || '')
      .replace(EDITION_RE, '')
      .replace(/\s*[-–—:]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Busca appid base via Steam search com nome stripped (resolve standalone deluxe)
  async function findBaseAppidViaSearch(name) {
    const stripped = stripEditionKeywords(name);
    if (!stripped || stripped === name) return null;
    try {
      const results = await window.zhub.steam.search(stripped);
      return Array.isArray(results) && results[0]?.appid ? results[0].appid : null;
    } catch {
      return null;
    }
  }

  // Reaproveita getLinks do site-engine (formato multi-link)
  function getLinks(g) {
    if (!g) return [];
    if (Array.isArray(g.l)) return g.l.filter((L) => L && L.u);
    if (g.l && g.u) return [{ u: g.l, x: g.x || 0, s: g.s || '' }];
    return [];
  }

  // Formata bytes em GB/MB/KB
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  // Busca tamanho async pra um link (torrent via fetchMetadata, Pixeldrain via API)
  async function fetchLinkSize(link) {
    if (!link?.u) return null;
    const url = link.u;

    // Magnet: usa o engine de torrent (fetchMetadata adiciona temp e pega o size)
    if (url.startsWith('magnet:')) {
      try {
        const meta = await window.zhub.torrent.fetchMetadata(url);
        return formatBytes(meta?.size || meta?.length);
      } catch {
        return null;
      }
    }

    // Pixeldrain e Gofile: chama via IPC (main process — sem CORS, mais robusto)
    if (url.includes('pixeldrain.com/u/') || url.includes('gofile.io/d/')) {
      try {
        const size = await window.zhub.host.getSize(url);
        return formatBytes(size);
      } catch {
        return null;
      }
    }

    // Outros hosts (1Fichier, MediaFire, MEGA): scraping necessário, skip por ora
    return null;
  }

  // Tenta extrair tamanho do nome do torrent (dn= no magnet)
  // Funciona pra padrões "12.4 GB", "1.5 TB", "from 3 GB", "(800 MB)" etc.
  function parseMagnetSize(url) {
    if (!url || !url.startsWith('magnet:')) return null;
    try {
      const dn = new URLSearchParams(url.split('?')[1] || '').get('dn');
      if (!dn) return null;
      const decoded = decodeURIComponent(dn);
      // Pega o ÚLTIMO match (FitGirl às vezes tem "from X GB" antes do tamanho real)
      const matches = [...decoded.matchAll(/(\d+(?:[.,]\d+)?)[\s.]*(GB|MB|TB)\b/gi)];
      if (!matches.length) return null;
      const last = matches[matches.length - 1];
      const num = last[1].replace(',', '.');
      const unit = last[2].toUpperCase();
      return `${num} ${unit}`;
    } catch {
      return null;
    }
  }

  // Detecta nome da fonte por URL (mesmo do site-engine)
  function detectSource(url) {
    if (!url) return 'Servidor';
    if (url.startsWith('magnet:')) return 'Torrent';
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      if (host.includes('pixeldrain')) return 'Pixeldrain';
      if (host.includes('gofile')) return 'Gofile';
      if (host.includes('mediafire')) return 'MediaFire';
      if (host.includes('mega.nz') || host.includes('mega.io')) return 'MEGA';
      if (host.includes('1fichier')) return '1Fichier';
      if (host.includes('buzzheavier')) return 'BuzzHeavier';
      if (host.includes('akirabox')) return 'AkiraBox';
      if (host.includes('drive.google')) return 'Google Drive';
      return host.split('.')[0];
    } catch {
      return 'Servidor';
    }
  }

  // ============================================================
  // OPEN / CLOSE MODAL
  // ============================================================
  function openModal(game) {
    currentGame = game;
    currentLinks = getLinks(game);
    const myToken = ++detailsToken;

    // Setup loading state — preenche o que já temos (do catálogo)
    $name.textContent = game.n || '—';
    $developer.textContent = '—';
    $release.textContent = '—';
    $tags.innerHTML = '';
    $summary.textContent = '';
    $about.innerHTML = '';
    $bg.src = game.i || '';
    $cover.src = game.i || '';
    $shots.innerHTML = '';

    // Tags do catálogo (g.t = ['Ação', 'RPG', ...])
    if (Array.isArray(game.t) && game.t.length) {
      $tags.innerHTML = game.t.slice(0, 6).map((t) =>
        `<span class="steam-tag">${escapeHTML(t)}</span>`
      ).join('');
    }

    // Renderiza o picker de repacks IMEDIATAMENTE (não depende da Steam)
    renderRepacks(currentLinks);

    // Busca async de tamanhos pra links que não têm dn=size (não bloqueia o modal)
    loadMissingSizes(currentLinks, myToken);

    // Setup Steam actions (Adicionar à Steam) — só se tiver appid + Steam Tools
    setupSteamActions();

    // Achievements: carrega schema + progress (Fase 9.x)
    setupAchievements();

    // Esconde seções de Steam por padrão (até carregar)
    $shotsTitle.classList.add('game-section-hidden');
    $shots.classList.add('game-section-hidden');
    $aboutTitle.classList.add('game-section-hidden');
    $about.classList.add('game-section-hidden');

    // Abre o modal
    $modal.classList.add('open');
    $modal.setAttribute('aria-hidden', 'false');

    // Tenta enriquecer com Steam metadata (assíncrono)
    const appid = extractAppid(game.i);
    if (appid) {
      $summary.innerHTML = '<span class="game-detail-loading">Carregando dados da Steam…</span>';
      fetchSteamDetails(appid, myToken);
    } else {
      $summary.textContent = 'Sem dados da Steam disponíveis para este jogo.';
    }
  }

  function closeModal() {
    $modal.classList.remove('open');
    $modal.setAttribute('aria-hidden', 'true');
    if ($steamActions) $steamActions.hidden = true;
    currentGame = null;
    currentLinks = [];
    detailsToken++; // invalida fetches em voo
  }

  $modalClose?.addEventListener('click', closeModal);
  $modal?.addEventListener('click', (e) => {
    if (e.target === $modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $modal.classList.contains('open')) closeModal();
  });

  // ============================================================
  // FETCH STEAM DETAILS
  // ============================================================
  async function fetchSteamDetails(appid, myToken) {
    try {
      let data = await window.zhub.steam.details(appid);
      if (myToken !== detailsToken) return;

      // Se appid do catálogo falhou (variant/Deluxe sem Steam), busca pelo nome stripped
      if (data?.error && currentGame?.n) {
        const baseAppid = await findBaseAppidViaSearch(currentGame.n);
        if (myToken !== detailsToken) return;
        if (baseAppid && String(baseAppid) !== String(appid)) {
          try {
            const baseData = await window.zhub.steam.details(baseAppid);
            if (myToken !== detailsToken) return;
            if (baseData && !baseData.error) {
              data = baseData;
            }
          } catch {}
        }
      }

      if (data?.error) {
        $summary.textContent = 'Não foi possível carregar dados da Steam.';
        return;
      }
      renderSteamData(data);
    } catch (err) {
      if (myToken !== detailsToken) return;
      $summary.textContent = `Erro: ${err.message}`;
    }
  }

  // Tenta carregar URLs em ordem; só atualiza o img.src se UMA realmente carregar.
  // Se tudo falhar, deixa o src atual intacto (preserva fallback existente).
  function tryUpgradeImage($img, urls) {
    const candidates = urls.filter(Boolean);
    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) return; // tudo falhou — mantém src atual
      const url = candidates[i++];
      const test = new Image();
      test.onload = () => { $img.src = url; };
      test.onerror = tryNext;
      test.src = url;
    };
    tryNext();
  }

  // Testa se uma URL retorna imagem válida
  function imageLoads(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      const test = new Image();
      test.onload = () => resolve(true);
      test.onerror = () => resolve(false);
      test.src = url;
    });
  }

  // Constrói URLs verticais Steam pra um appid
  function verticalUrlsFor(appid) {
    if (!appid) return [];
    return [
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900_2x.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/portrait.jpg`,
    ];
  }

  // Carrega capa vertical com fallback inteligente.
  // Cadeia: appid atual (4 URLs) → Steam search por nome → object-fit:contain (sem zoom)
  async function loadVerticalCover($img, appid, name) {
    // Reseta object-fit pro padrão (cover) ao iniciar — pode ter sido contain antes
    $img.style.objectFit = 'cover';

    // 1ª rodada: appid do catálogo
    for (const url of verticalUrlsFor(appid)) {
      if (await imageLoads(url)) { $img.src = url; return; }
    }

    // 2ª rodada: Steam search pelo nome (resolve appid de variant→base)
    if (name) {
      try {
        const results = await window.zhub.steam.search(name);
        const altAppid = Array.isArray(results) && results[0]?.appid ? results[0].appid : null;
        if (altAppid && String(altAppid) !== String(appid)) {
          for (const url of verticalUrlsFor(altAppid)) {
            if (await imageLoads(url)) { $img.src = url; return; }
          }
        }
      } catch {}
    }

    // 3ª: nada vertical achado. Mantém imagem do catálogo (horizontal),
    // mas troca object-fit pra `contain` pra evitar o zoom/corte feio.
    $img.style.objectFit = 'contain';
    $img.style.background = 'rgba(0, 0, 0, 0.4)';
  }

  function renderSteamData(d) {
    // Hero banner: tenta library_hero (1920x620) → background raw → headerImage canônico
    const heroUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${d.appid}/library_hero.jpg`;
    tryUpgradeImage($bg, [heroUrl, d.background, d.headerImage]);

    // Capa vertical (600×900) — cadeia: appid atual → Steam search por nome → object-fit:contain
    loadVerticalCover($cover, d.appid, d.name || currentGame?.n);

    // Meta
    $developer.textContent = (d.developers || []).join(', ') || 'Desconhecido';
    $release.textContent = d.releaseDate?.date || (d.releaseDate?.comingSoon ? 'Em breve' : '—');

    // Tags = mistura tags do catálogo + gêneros oficiais Steam (dedup)
    const localTags = Array.isArray(currentGame?.t) ? currentGame.t : [];
    const steamTags = (d.genres || []);
    const combined = [...new Set([...localTags, ...steamTags])].slice(0, 6);
    $tags.innerHTML = combined.map((t) =>
      `<span class="steam-tag">${escapeHTML(t)}</span>`
    ).join('');

    // Descrição curta
    $summary.innerHTML = d.shortDescription || '<em>Sem descrição.</em>';

    // Screenshots
    const shots = (d.screenshots || []).slice(0, 6);
    if (shots.length) {
      $shots.innerHTML = shots.map((s) =>
        `<img src="${escapeHTML(s.thumb)}" alt="" loading="lazy" data-full="${escapeHTML(s.full)}" />`
      ).join('');
      $shotsTitle.classList.remove('game-section-hidden');
      $shots.classList.remove('game-section-hidden');
    }

    // Sobre
    if (d.aboutTheGame || d.detailedDescription) {
      $about.innerHTML = d.aboutTheGame || d.detailedDescription;
      $aboutTitle.classList.remove('game-section-hidden');
      $about.classList.remove('game-section-hidden');
    }
  }

  // ============================================================
  // RENDER REPACKS LIST (picker de servidores)
  // ============================================================
  function renderRepacks(links) {
    if (!links?.length) {
      $repacks.innerHTML = '<div class="game-repacks-empty">Nenhum servidor disponível.</div>';
      return;
    }

    const onlineFlag = currentGame?.o === 1;
    const editionTag = currentGame?.e || '';

    $repacks.innerHTML = links.map((L, i) => {
      const isTorrent = L.x === 1 || (L.u || '').startsWith('magnet:');
      const tipo = isTorrent ? 'TORRENT' : 'DIRETO';
      const tipoCls = isTorrent ? 'torrent' : 'direct';
      const sourceName = L.s || detectSource(L.u);
      const size = isTorrent ? parseMagnetSize(L.u) : null;

      // Badges extras: ONLINE (do jogo), EDIÇÃO (do jogo)
      const extraBadges = [];
      if (onlineFlag) {
        extraBadges.push('<span class="game-repack-badge online">🌐 ONLINE</span>');
      }
      if (editionTag) {
        extraBadges.push(`<span class="game-repack-badge edition">${escapeHTML(editionTag)}</span>`);
      }

      // Badge de tamanho (só pra torrents que conseguimos parsear do dn=)
      const sizeBadge = size
        ? `<span class="game-repack-badge size">💾 ${escapeHTML(size)}</span>`
        : '';

      return `
        <button class="game-repack-card" data-link-index="${i}">
          <span class="game-repack-num">${i + 1}</span>
          <span class="game-repack-info">
            <span class="game-repack-name">
              ${escapeHTML(sourceName)}
              ${extraBadges.join('')}
            </span>
            <span class="game-repack-meta">
              <span class="game-repack-badge ${tipoCls}">${tipo}</span>
              ${sizeBadge}
            </span>
          </span>
          <span class="game-repack-arrow">→</span>
        </button>
      `;
    }).join('');
  }

  // ============================================================
  // BACKGROUND: busca tamanhos faltantes (torrents sem dn=size, Pixeldrain, etc)
  // ============================================================
  async function loadMissingSizes(links, myToken) {
    for (let i = 0; i < links.length; i++) {
      // Aborta se o modal foi fechado ou abriu outro jogo
      if (myToken !== detailsToken) return;

      const card = $repacks.querySelector(`.game-repack-card[data-link-index="${i}"]`);
      if (!card) continue;
      const meta = card.querySelector('.game-repack-meta');
      if (!meta) continue;

      // Já tem badge de tamanho (parseado do dn=)? pula
      if (meta.querySelector('.game-repack-badge.size')) continue;

      // Só mostra "Calculando..." pra hosts que conseguimos resolver de verdade.
      // Gofile/1Fichier/MEGA/MediaFire = sem suporte → não polui a UI.
      const url = links[i]?.u || '';
      const canResolve = url.startsWith('magnet:') || /pixeldrain\.com\/u\//i.test(url);
      if (!canResolve) continue;

      // Adiciona badge "calculando..."
      const loadingBadge = document.createElement('span');
      loadingBadge.className = 'game-repack-badge size loading';
      loadingBadge.innerHTML = '<span class="size-spinner"></span> Calculando…';
      meta.appendChild(loadingBadge);

      try {
        const size = await fetchLinkSize(links[i]);
        if (myToken !== detailsToken) return; // modal fechado durante fetch

        if (size) {
          loadingBadge.className = 'game-repack-badge size';
          loadingBadge.textContent = `💾 ${size}`;
        } else {
          loadingBadge.remove();
        }
      } catch {
        loadingBadge.remove();
      }
    }
  }

  // ============================================================
  // STEAM ACTIONS — botões "Adicionar à Steam" / "Ver na Loja"
  // ============================================================
  // Estado do "jogo baixado pelo app" pro currentGame (preenchido em setupSteamActions)
  // Usado pelos handlers de Jogar / Configurar pra direcionar pra dl_{id} se aplicável.
  let currentDownloadInfo = null; // { id, key, exePath }
  // Estado do "jogo na biblioteca manual" — entry adicionada sem download via app
  let currentManualLibInfo = null; // { appid, key: 'lib_{appid}', exePath }

  // Procura download completo cujo appid resolvido bata com o do current game.
  // Retorna { id, key, exePath } ou null.
  async function findDownloadForCurrentGame(targetAppid) {
    if (!targetAppid) return null;
    let torrents = [];
    let httpDls = [];
    try { torrents = await window.zhub.torrent.list() || []; } catch {}
    try { httpDls = await window.zhub.http.list() || []; } catch {}
    const completed = [
      ...torrents.filter((t) => t?.status === 'completed').map((t) => ({ id: t.id, name: t.name })),
      ...httpDls.filter((h) => h?.status === 'done').map((h) => ({ id: h.id, name: h.name })),
    ];
    if (!completed.length) return null;

    for (const dl of completed) {
      // 1º — verifica se já tem override pro download (extração automática salva exePath)
      try {
        const cfg = await window.zhub.gameOverrides.get(`dl_${dl.id}`);
        if (cfg?.exePath) {
          // Download tem exe definido → checa se appid resolvido bate
          const resolved = await resolveDownloadAppid(dl.name);
          if (resolved && Number(resolved) === Number(targetAppid)) {
            return { id: dl.id, key: `dl_${dl.id}`, exePath: cfg.exePath };
          }
        }
      } catch {}
      // 2º — sem override, mas se appid bate, retorna sem exePath (mostra Configurar)
      try {
        const resolved = await resolveDownloadAppid(dl.name);
        if (resolved && Number(resolved) === Number(targetAppid)) {
          return { id: dl.id, key: `dl_${dl.id}`, exePath: null };
        }
      } catch {}
    }
    return null;
  }

  // Cache de appid resolvido por nome de download
  const _downloadAppidCache = new Map();
  async function resolveDownloadAppid(name) {
    if (!name) return null;
    if (_downloadAppidCache.has(name)) return _downloadAppidCache.get(name);
    let appid = null;
    try {
      const stripped = (name || '').replace(/\b(deluxe|premium|ultimate|gold|complete|definitive|enhanced|anniversary|game of the year|goty|digital|collectors?)\b/gi, '').trim();
      const results = await window.zhub.steam.search(stripped || name);
      if (Array.isArray(results) && results[0]?.appid) appid = results[0].appid;
    } catch {}
    _downloadAppidCache.set(name, appid);
    return appid;
  }

  async function setupSteamActions() {
    if (!$steamActions || !currentGame) return;
    const appid = extractAppid(currentGame.i);
    // Sem appid → esconde a seção inteira
    if (!appid) {
      $steamActions.hidden = true;
      return;
    }

    // Reseta estado de download / manual lib pro game atual
    currentDownloadInfo = null;
    currentManualLibInfo = null;

    // Esconde TODOS os botões dinâmicos imediatamente (evita flash do estado do jogo anterior)
    const $btnPlayPre = document.getElementById('game-detail-steam-play');
    const $btnInstallPre = document.getElementById('game-detail-steam-install');
    const $btnConfigPre = document.getElementById('game-detail-config');
    const $btnAddLibPre = document.getElementById('game-detail-add-library');
    if ($btnPlayPre) $btnPlayPre.hidden = true;
    if ($btnInstallPre) $btnInstallPre.hidden = true;
    if ($btnConfigPre) $btnConfigPre.hidden = true;
    if ($btnAddLibPre) $btnAddLibPre.hidden = true;
    $btnSteamAdd.hidden = true;

    // Verifica se Steam Tools tá disponível pra mostrar o botão Add
    let canAdd = false;
    try {
      const status = await window.zhub.steamTools.detectInstall();
      canAdd = !!(status?.installed && status?.steamPath);
    } catch {}

    $steamActions.hidden = false;

    // Verifica direto via IPC: lua existe + jogo realmente instalado pela Steam (appmanifest)
    let hasLua = false;
    let isInstalled = false;
    let hasOverrideExe = false;
    let userClearedExe = false;
    try { hasLua = await window.zhub.steamTools.hasLuaForApp(appid); } catch {}
    if (hasLua) {
      try { isInstalled = await window.zhub.library.isSteamGameInstalled({ appid }); } catch {}
    }
    // Override: cfg null = user nunca configurou; cfg sem exePath = user limpou explicitamente
    try {
      const cfg = await window.zhub.gameOverrides.get(`st_${appid}`);
      hasOverrideExe = !!cfg?.exePath;
      userClearedExe = cfg !== null && !cfg?.exePath; // user salvou mas sem exe
    } catch {}
    // canPlay:
    //   - hasOverrideExe → user definiu exe explícito = Jogar
    //   - userClearedExe → user limpou explícito = Instalar (mesmo se isInstalled)
    //   - senão → usa detecção automática
    const canPlay = hasOverrideExe || (!userClearedExe && isInstalled);

    const $btnPlay = document.getElementById('game-detail-steam-play');
    const $btnInstall = document.getElementById('game-detail-steam-install');
    const $btnConfig = document.getElementById('game-detail-config');

    // Procura download completo do app pra esse appid (jogo baixado pelo catálogo)
    const dlInfo = await findDownloadForCurrentGame(appid);
    if (dlInfo) currentDownloadInfo = dlInfo;

    // Verifica se já está na biblioteca manual
    let inManualLib = false;
    let manualOverrideExe = null;
    try { inManualLib = await window.zhub.manualLibrary.has(appid); } catch {}
    if (inManualLib) {
      try {
        const cfg = await window.zhub.gameOverrides.get(`lib_${appid}`);
        manualOverrideExe = cfg?.exePath || null;
      } catch {}
      currentManualLibInfo = { appid, key: `lib_${appid}`, exePath: manualOverrideExe };
    }

    // Atualiza estado/visual do botão "Adicionar à biblioteca"
    // Só aparece se o jogo NÃO estiver na biblioteca por outro caminho
    // (Steam Tools ou download via app já colocam na biblioteca automaticamente)
    const $btnAddLib = document.getElementById('game-detail-add-library');
    if ($btnAddLib) {
      const alreadyInLibByOther = hasLua || !!dlInfo;
      if (alreadyInLibByOther && !inManualLib) {
        // Jogo já tá na biblioteca via Steam Tools ou download → esconde
        $btnAddLib.hidden = true;
      } else {
        $btnAddLib.hidden = false;
        if (inManualLib) {
          $btnAddLib.innerHTML = '✓ Na biblioteca';
          $btnAddLib.dataset.mode = 'in-lib';
          $btnAddLib.classList.add('steam-action-lib-in');
        } else {
          $btnAddLib.innerHTML = '📚 Adicionar à biblioteca';
          $btnAddLib.dataset.mode = 'add';
          $btnAddLib.classList.remove('steam-action-lib-in');
        }
      }
    }

    if (!canAdd) {
      $btnSteamAdd.hidden = true;
      if ($btnPlay) $btnPlay.hidden = true;
      if ($btnInstall) $btnInstall.hidden = true;
      if ($btnConfig) $btnConfig.hidden = true;
    } else {
      $btnSteamAdd.hidden = false;
      if (hasLua) {
        // Já adicionado via Steam Tools
        $btnSteamAdd.innerHTML = '🗑 Remover da Steam';
        $btnSteamAdd.classList.remove('steam-action-add');
        $btnSteamAdd.classList.add('steam-action-remove');
        $btnSteamAdd.dataset.mode = 'remove';
        // Tem .exe (instalado ou override) → Jogar | Sem .exe → Instalar
        if (canPlay) {
          if ($btnPlay) $btnPlay.hidden = false;
          if ($btnInstall) $btnInstall.hidden = true;
        } else {
          if ($btnPlay) $btnPlay.hidden = true;
          if ($btnInstall) $btnInstall.hidden = false;
        }
        if ($btnConfig) $btnConfig.hidden = false;
      } else if (dlInfo) {
        // Jogo baixado pelo app (não está no Steam Tools) → Jogar + Configurar
        $btnSteamAdd.innerHTML = '➕ Adicionar à Steam';
        $btnSteamAdd.classList.add('steam-action-add');
        $btnSteamAdd.classList.remove('steam-action-remove');
        $btnSteamAdd.dataset.mode = 'add';
        if ($btnPlay) $btnPlay.hidden = !dlInfo.exePath;
        if ($btnInstall) $btnInstall.hidden = true;
        if ($btnConfig) $btnConfig.hidden = false;
      } else if (inManualLib) {
        // Jogo na biblioteca manual → Jogar (se exe) + Configurar
        $btnSteamAdd.innerHTML = '➕ Adicionar à Steam';
        $btnSteamAdd.classList.add('steam-action-add');
        $btnSteamAdd.classList.remove('steam-action-remove');
        $btnSteamAdd.dataset.mode = 'add';
        if ($btnPlay) $btnPlay.hidden = !manualOverrideExe;
        if ($btnInstall) $btnInstall.hidden = true;
        if ($btnConfig) $btnConfig.hidden = false;
      } else {
        // Não adicionado e não baixado: só Adicionar (primário)
        if ($btnPlay) $btnPlay.hidden = true;
        if ($btnInstall) $btnInstall.hidden = true;
        $btnSteamAdd.innerHTML = '➕ Adicionar à Steam';
        $btnSteamAdd.classList.add('steam-action-add');
        $btnSteamAdd.classList.remove('steam-action-remove');
        $btnSteamAdd.dataset.mode = 'add';
        if ($btnConfig) $btnConfig.hidden = true;
      }
    }
  }

  // Handler do botão Add/Remove
  $btnSteamAdd?.addEventListener('click', () => {
    if (!currentGame) return;
    const appid = extractAppid(currentGame.i);
    if (!appid) return;
    const name = currentGame.n;
    const mode = $btnSteamAdd.dataset.mode || 'add';

    // Fecha o modal de detalhes ANTES (z-index conflict com ATS modal)
    closeModal();

    if (mode === 'remove') {
      window.zhubSteamTools?.removeGame?.({ appid, name });
    } else {
      window.zhubSteamTools?.addGame?.({ appid, name });
    }
  });

  // Handler do botão Store
  $btnSteamStore?.addEventListener('click', () => {
    if (!currentGame) return;
    const appid = extractAppid(currentGame.i);
    if (!appid) return;
    window.zhub.system.openExternal(`https://store.steampowered.com/app/${appid}/`);
  });

  // Handler do botão Jogar (Steam Tools OU download do app)
  const $btnPlay = document.getElementById('game-detail-steam-play');
  $btnPlay?.addEventListener('click', async () => {
    if (!currentGame) return;
    const appid = extractAppid(currentGame.i);
    if (!appid) return;
    try {
      // Prioriza download do app se existe
      if (currentDownloadInfo?.exePath) {
        const r = await window.zhub.library.launchAppDownload({
          id: currentDownloadInfo.id,
          exePath: currentDownloadInfo.exePath,
        });
        if (r?.error) {
          if (typeof window.zhubToast === 'function') window.zhubToast('❌ ' + r.error);
        } else {
          if (typeof window.zhubToast === 'function') window.zhubToast('▶ Iniciando ' + (currentGame.n || 'jogo') + '…');
        }
        return;
      }
      // Manual lib: spawn direto do exePath salvo
      if (currentManualLibInfo?.exePath) {
        const r = await window.zhub.library.launchAppDownload({
          id: currentManualLibInfo.key,
          exePath: currentManualLibInfo.exePath,
        });
        if (r?.error) {
          if (typeof window.zhubToast === 'function') window.zhubToast('❌ ' + r.error);
        } else {
          if (typeof window.zhubToast === 'function') window.zhubToast('▶ Iniciando ' + (currentGame.n || 'jogo') + '…');
        }
        return;
      }
      // Senão tenta override de exePath (Steam Tools)
      let overrideExe = null;
      try {
        const cfg = await window.zhub.gameOverrides?.get?.(`st_${appid}`);
        overrideExe = cfg?.exePath || null;
      } catch {}
      if (overrideExe) {
        const r = await window.zhub.library.launchAppDownload({ id: `st_${appid}`, exePath: overrideExe });
        if (r?.error) {
          if (typeof window.zhubToast === 'function') window.zhubToast('❌ ' + r.error);
        } else {
          if (typeof window.zhubToast === 'function') window.zhubToast('▶ Iniciando…');
        }
      } else {
        // Fallback: launch via Steam (steam://run/{appid})
        await window.zhub.library.launchSteamTools({ appid });
        if (typeof window.zhubToast === 'function') window.zhubToast('▶ Abrindo na Steam…');
      }
    } catch (err) {
      if (typeof window.zhubToast === 'function') window.zhubToast('❌ ' + (err.message || 'Falha ao iniciar'));
    }
  });

  // Handler do botão Configurar (abre game-config-modal)
  const $btnConfig = document.getElementById('game-detail-config');
  $btnConfig?.addEventListener('click', () => {
    if (!currentGame) return;
    const appid = extractAppid(currentGame.i);
    if (!appid) return;
    if (typeof window.zhubOpenGameConfig === 'function') {
      // Prioridade: download > manual lib > Steam Tools
      const key = currentDownloadInfo?.key
        || currentManualLibInfo?.key
        || `st_${appid}`;
      window.zhubOpenGameConfig({ key, appid, name: currentGame.n });
    }
  });

  // Handler do botão "📚 Adicionar à biblioteca"
  const $btnAddLib = document.getElementById('game-detail-add-library');
  $btnAddLib?.addEventListener('click', async () => {
    if (!currentGame) return;
    const appid = extractAppid(currentGame.i);
    if (!appid) return;
    const mode = $btnAddLib.dataset.mode || 'add';
    try {
      if (mode === 'in-lib') {
        // Já tá na lib — clique remove
        await window.zhub.manualLibrary.remove(appid);
        try { await window.zhub.gameOverrides.remove(`lib_${appid}`); } catch {}
        try { await window.zhub.library.removePlaytime?.(`lib_${appid}`); } catch {}
        if (typeof window.zhubToast === 'function') window.zhubToast('🗑 Removido da biblioteca');
      } else {
        await window.zhub.manualLibrary.add({ appid, name: currentGame.n });
        if (typeof window.zhubToast === 'function') window.zhubToast('✓ Adicionado à biblioteca');
      }
      // Re-render botões + refresh views
      await setupSteamActions();
      try { window.zhubBibliotecaRefresh?.(); } catch {}
      try { window.zhubPerfilRefresh?.(); } catch {}
    } catch (err) {
      if (typeof window.zhubToast === 'function') window.zhubToast('❌ ' + (err.message || 'Falha'));
    }
  });

  // Handler do botão Instalar (jogo tem .lua mas o .exe não foi achado em steamapps/common)
  const $btnInstall = document.getElementById('game-detail-steam-install');
  $btnInstall?.addEventListener('click', async () => {
    if (!currentGame) return;
    const appid = extractAppid(currentGame.i);
    if (!appid) return;
    try {
      // steam://install/{appid} abre o diálogo de instalação da Steam
      await window.zhub.system.openExternal(`steam://install/${appid}`);
      if (typeof window.zhubToast === 'function') window.zhubToast('📥 Abrindo Steam pra instalar…');
    } catch (err) {
      if (typeof window.zhubToast === 'function') window.zhubToast('❌ ' + (err.message || 'Falha ao abrir Steam'));
    }
  });

  // Click num repack → abre o link (mesmo fluxo do site-engine: window.open intercepted by app)
  $repacks?.addEventListener('click', (e) => {
    const card = e.target.closest('.game-repack-card');
    if (!card) return;
    const idx = parseInt(card.dataset.linkIndex, 10);
    const link = currentLinks[idx];
    if (!link?.u) return;
    // Mesmo comportamento do site-engine: window.open dispara o setWindowOpenHandler
    // do main process que abre magnets / urls externos corretamente
    window.open(link.u, '_blank', 'noopener');
  });

  // ============================================================
  // LIGHTBOX (reutiliza o do buscar.js via window.zhubLightbox)
  // ============================================================
  $shots?.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-full]');
    if (!img) return;
    if (!window.zhubLightbox) return;
    const allImgs = [...$shots.querySelectorAll('img[data-full]')];
    const urls = allImgs.map((el) => el.dataset.full);
    const idx = allImgs.indexOf(img);
    window.zhubLightbox.open(urls, idx);
  });

  // ============================================================
  // CLICK INTERCEPTOR — substitui o handler do site-engine pros green-cards
  // ============================================================
  // Usa capture phase pra rodar ANTES do listener do site-engine.
  $grid.addEventListener('click', (e) => {
    const card = e.target.closest('.game-card.green-card');
    if (!card) return;

    const idx = parseInt(card.dataset.index, 10);
    // O global é GREEN_GAMES_DATA (site-engine renomeia internamente pra GREEN_GAMES)
    const game = window.GREEN_GAMES_DATA?.[idx];
    if (!game) return;

    // Para o site-engine de processar (que abriria o server-picker antigo)
    e.stopPropagation();
    e.preventDefault();

    openModal(game);
  }, true); // <-- capture phase

  // Expõe abertura do modal pra outras views (ex: inicio.js, biblioteca, etc)
  window.zhubOpenGameModal = openModal;
  // Permite outras views (game-config) re-renderizarem os botões após mudanças
  window.zhubCatalogoRefreshActions = () => {
    if (currentGame) setupSteamActions();
  };

  // ============================================================
  // ACHIEVEMENTS — fetch schema + render grid no modal de detalhes
  // ============================================================
  let achToken = 0; // race guard pra cancelar render se modal trocou de jogo
  let achListenerWired = false;

  async function setupAchievements() {
    if (!$achSection || !currentGame) return;
    const appid = extractAppid(currentGame.i);
    if (!appid) {
      $achSection.hidden = true;
      return;
    }

    // Determina key pra usar pra puxar progresso (prioriza download → manual → steam tools)
    const key = currentDownloadInfo?.key
      || currentManualLibInfo?.key
      || `st_${appid}`;

    const myToken = ++achToken;
    // Reset visual
    $achGrid.innerHTML = '<div class="ach-loading">Carregando conquistas…</div>';
    $achSection.hidden = false;
    $achCount.textContent = '…';
    if ($achFill) $achFill.style.width = '0%';

    // Tenta extrair exePath conhecido (override) pra scan completo
    let exePath = null;
    try {
      const cfg = await window.zhub.gameOverrides.get(key);
      if (cfg?.exePath) exePath = cfg.exePath;
    } catch {}

    // Scan pontual: detecta unlocks novos mesmo se o jogo não estiver rodando agora
    try {
      await window.zhub.achievements.scanOnce({ key, appid, exePath });
    } catch {}

    let progress = null;
    try {
      progress = await window.zhub.achievements.getProgress(key);
    } catch {}
    if (myToken !== achToken) return; // jogo trocou

    // Sem schema válido → tenta cache antes de "desistir"
    if (!progress || !progress.list || progress.list.length === 0) {
      // Fallback: busca schema direto pelo appid (caso key ainda sem entry)
      try {
        const schema = await window.zhub.achievements.getSchema(appid, {});
        if (myToken !== achToken) return;
        if (schema?.achievements?.length) {
          renderAchievements({ list: schema.achievements.map((a) => ({ ...a, unlocked: false, unlockTime: 0 })), unlocked: 0, total: schema.totalCount, percent: 0 });
          return;
        }
      } catch {}
      // Sem conquistas reais
      $achSection.hidden = true;
      return;
    }
    renderAchievements(progress);
  }

  function renderAchievements(progress) {
    if (!$achGrid) return;
    const total = progress.total || 0;
    const unlocked = progress.unlocked || 0;
    if (total === 0) {
      $achSection.hidden = true;
      return;
    }
    $achCount.textContent = `${unlocked}/${total}`;
    if ($achFill) $achFill.style.width = `${progress.percent || 0}%`;

    // Ordena: desbloqueadas primeiro (por unlockTime desc), depois bloqueadas
    const list = (progress.list || []).slice().sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (a.unlocked) return (b.unlockTime || 0) - (a.unlockTime || 0);
      return (a.displayName || '').localeCompare(b.displayName || '');
    });

    $achGrid.innerHTML = list.map((a) => renderAchievementCard(a)).join('');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderAchievementCard(a) {
    const isHiddenLocked = a.hidden && !a.unlocked;
    const displayName = isHiddenLocked ? 'Conquista oculta' : (a.displayName || a.name);
    const description = isHiddenLocked ? 'Continue jogando pra revelar.' : (a.description || '');
    const icon = a.unlocked ? (a.icon || a.icongray) : (a.icongray || a.icon);
    const cls = `ach-card ${a.unlocked ? 'ach-unlocked' : 'ach-locked'}${isHiddenLocked ? ' ach-hidden' : ''}`;
    const rarity = (a.rarity != null) ? `<span class="ach-rarity">${Math.round(a.rarity)}%</span>` : '';
    const time = a.unlocked && a.unlockTime ? `<span class="ach-time">${formatRelativeTime(a.unlockTime * 1000)}</span>` : '';
    // Barra de progresso parcial (só pra locked com progressValue > 0)
    let progressBar = '';
    if (!a.unlocked && a.progressValue != null && a.progressValue > 0) {
      const max = a.progressMax || 100;
      const pct = Math.min(100, Math.round((a.progressValue / max) * 100));
      progressBar = `
        <div class="ach-card-progress">
          <div class="ach-card-progress-bar"><div class="ach-card-progress-fill" style="width:${pct}%"></div></div>
          <span class="ach-card-progress-text">${a.progressValue}/${max}</span>
        </div>
      `;
    }
    return `
      <div class="${cls}" title="${escapeHtml(displayName)}">
        ${icon ? `<img class="ach-icon" src="${icon}" alt="" loading="lazy" />` : '<div class="ach-icon ach-icon-empty">🔒</div>'}
        <div class="ach-info">
          <div class="ach-name">${escapeHtml(displayName)}</div>
          <div class="ach-desc">${escapeHtml(description)}</div>
          ${progressBar}
          <div class="ach-meta">${rarity}${time}</div>
        </div>
      </div>
    `;
  }

  function formatRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min atrás`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h atrás`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d atrás`;
    return new Date(ts).toLocaleDateString('pt-BR');
  }

  // Botão "🔄 Atualizar" — força refetch do schema
  $achRefresh?.addEventListener('click', async () => {
    if (!currentGame) return;
    const appid = extractAppid(currentGame.i);
    if (!appid) return;
    $achRefresh.disabled = true;
    $achRefresh.textContent = '⏳';
    try {
      await window.zhub.achievements.refreshSchema(appid);
      await setupAchievements();
      if (typeof window.zhubToast === 'function') window.zhubToast('✓ Conquistas atualizadas');
    } catch (err) {
      if (typeof window.zhubToast === 'function') window.zhubToast('❌ ' + (err.message || 'Falha'));
    } finally {
      $achRefresh.disabled = false;
      $achRefresh.textContent = '🔄';
    }
  });

  // Listener: quando uma conquista desbloqueia em tempo real, refresh modal se aberto pro mesmo jogo
  if (!achListenerWired) {
    achListenerWired = true;
    try {
      window.zhub.achievements.onUnlocked?.((payload) => {
        if (!currentGame) return;
        const appid = extractAppid(currentGame.i);
        if (!appid || Number(appid) !== Number(payload?.appid)) return;
        setupAchievements();
      });
    } catch {}
  }

  console.log('[catalogo] view inicializada (Fase 5.3).');
})();
