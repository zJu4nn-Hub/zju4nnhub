// renderer/views/buscar.js — View "Buscar Jogos" (Steam Store)
// Busca via storesearch API, mostra resultados, abre modal de detalhes,
// oferece "Adicionar à Steam" (Lua Tools flow) e "Abrir na Steam".

(() => {
  'use strict';

  if (typeof window.zhub === 'undefined') {
    console.warn('[buscar] window.zhub indisponível.');
    return;
  }

  // ============================================================
  // ELEMENTS
  // ============================================================
  const $input = document.getElementById('steam-search-input');
  const $clear = document.getElementById('steam-search-clear');
  const $count = document.getElementById('steam-search-count');
  const $results = document.getElementById('steam-search-results');
  const $empty = document.getElementById('steam-search-empty');

  const $modal = document.getElementById('steam-detail-modal');
  const $modalClose = document.getElementById('steam-detail-close');
  const $detailBg = document.getElementById('steam-detail-bg');
  const $detailCover = document.getElementById('steam-detail-cover');
  const $detailName = document.getElementById('steam-detail-name');
  const $detailDeveloper = document.getElementById('steam-detail-developer');
  const $detailRelease = document.getElementById('steam-detail-release');
  const $detailTags = document.getElementById('steam-detail-tags');
  const $detailSummary = document.getElementById('steam-detail-summary');
  const $detailScreenshots = document.getElementById('steam-detail-screenshots');
  const $detailAbout = document.getElementById('steam-detail-about');
  const $btnAdd = document.getElementById('steam-detail-add');
  const $btnLaunch = document.getElementById('steam-detail-launch');
  const $btnStore = document.getElementById('steam-detail-store');

  // ============================================================
  // STATE
  // ============================================================
  let searchToken = 0;
  let detailToken = 0;
  let currentDetail = null; // último jogo aberto no modal

  // ============================================================
  // HELPERS
  // ============================================================
  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function fmtPrice(item) {
    if (item.isFree) return '<span class="steam-price free">Gratuito</span>';
    if (typeof item.price === 'number') {
      return `<span class="steam-price">R$ ${item.price.toFixed(2).replace('.', ',')}</span>`;
    }
    return '';
  }

  function toast(msg, type = '') {
    const c = document.getElementById('toast-container') || (() => {
      const el = document.createElement('div');
      el.id = 'toast-container';
      el.className = 'toast-container';
      document.body.appendChild(el);
      return el;
    })();
    const el = document.createElement('div');
    el.className = `toast ${type ? `toast-${type}` : ''}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  // ============================================================
  // SEARCH
  // ============================================================
  function renderResults(items) {
    if (!items.length) {
      $empty.style.display = '';
      $empty.querySelector('h3').textContent = 'Nada encontrado';
      $empty.querySelector('p').textContent = 'Tenta outra palavra-chave.';
      $results.querySelectorAll('.steam-game-card').forEach((el) => el.remove());
      return;
    }
    $empty.style.display = 'none';

    const html = items.map((g) => {
      // Plataformas como texto curto
      const platformLabels = [];
      if (g.platforms?.windows) platformLabels.push('PC');
      if (g.platforms?.mac) platformLabels.push('Mac');
      if (g.platforms?.linux) platformLabels.push('Linux');
      const platTxt = platformLabels.join(' · ');

      const isInstalled = installedAppids.has(parseInt(g.appid, 10));
      const installedBadge = isInstalled
        ? '<span class="steam-already-badge">✓ Adicionado</span>'
        : '';

      // Badge "NO HUB" se esse jogo (pelo appid) tá no greenGames
      const isInHub = greenAppids.has(parseInt(g.appid, 10));
      const hubBadge = isInHub
        ? '<span class="steam-hub-badge">🟢 NO HUB</span>'
        : '';

      // Cadeia de fallback: headerImage (akamai, 460×215) → cloudflare CDN → tinyImage (184×69) → placeholder com nome.
      // Listeners attachados via JS (ver setupCoverFallback) — CSP bloqueia onerror inline.
      const primary = g.headerImage;
      const fallback1 = `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`;
      const fallback2 = g.tinyImage || '';

      return `
        <article class="steam-game-card${isInstalled ? ' already-added' : ''}${isInHub ? ' in-hub' : ''}" data-appid="${g.appid}">
          <span class="steam-badge-steam">⛁ Steam</span>
          ${installedBadge}
          ${hubBadge}
          <div class="steam-cover-wrap">
            <img class="steam-cover" src="${escapeHTML(primary)}" alt="${escapeHTML(g.name)}" loading="lazy"
                 data-fb1="${escapeHTML(fallback1)}" data-fb2="${escapeHTML(fallback2)}" />
            <div class="cover-fallback-text">${escapeHTML(g.name)}</div>
          </div>
          <div class="steam-info">
            <div class="steam-title">${escapeHTML(g.name)}</div>
            <div class="steam-meta">
              <span class="steam-platforms">${platTxt}</span>
              <span style="margin-left: auto;">${fmtPrice(g)}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Substitui resultados
    $results.querySelectorAll('.steam-game-card').forEach((el) => el.remove());
    $results.insertAdjacentHTML('beforeend', html);

    // Setup fallback de imagens (CSP bloqueia onerror inline, então usamos addEventListener)
    setupCoverFallback();
  }

  // ============================================================
  // IMAGE FALLBACK CHAIN (substitui o onerror inline bloqueado pelo CSP)
  // Cadeia: headerImage → cloudflare CDN → tinyImage → appdetails API → placeholder
  // ============================================================
  // Cache de URLs canônicas vindas do appdetails (evita refetch)
  const canonicalImageCache = new Map();   // appid → URL ou null
  const inFlightAppDetails = new Map();    // appid → Promise (dedup chamadas concorrentes)

  async function fetchCanonicalImage(appid) {
    if (canonicalImageCache.has(appid)) return canonicalImageCache.get(appid);
    if (inFlightAppDetails.has(appid)) return inFlightAppDetails.get(appid);

    const promise = (async () => {
      try {
        const data = await window.zhub.steam.details(appid);
        if (data && !data.error && data.headerImage) {
          canonicalImageCache.set(appid, data.headerImage);
          return data.headerImage;
        }
      } catch {}
      canonicalImageCache.set(appid, null);
      return null;
    })();

    inFlightAppDetails.set(appid, promise);
    promise.finally(() => inFlightAppDetails.delete(appid));
    return promise;
  }

  async function handleCoverError(e) {
    const img = e.target;
    const attempt = parseInt(img.dataset.attempt || '0', 10);

    const card = img.closest('.steam-game-card');
    const appid = card?.dataset.appid || img.dataset.appid;

    // 1: Cloudflare CDN (mesmo header.jpg em CDN alternativa)
    if (attempt === 0) {
      img.dataset.attempt = '1';
      img.src = img.dataset.fb1;
      return;
    }
    // 2: library_hero.jpg (1920×620 — alta resolução, comum pra pre-release)
    if (attempt === 1 && appid) {
      img.dataset.attempt = '2';
      img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`;
      return;
    }
    // 3: appdetails canonical (URL com hash + ?t=)
    if (attempt === 2 && appid) {
      img.dataset.attempt = '3';
      const canonical = await fetchCanonicalImage(appid);
      if (canonical) {
        img.src = canonical;
        return;
      }
    }
    // 4: tinyImage (184×69, baixa qualidade — último recurso antes do placeholder)
    if (attempt <= 3) {
      const fb2 = img.dataset.fb2;
      if (fb2) {
        img.dataset.attempt = '4';
        img.src = fb2;
        return;
      }
    }
    // Tudo falhou: placeholder com nome do jogo
    img.style.display = 'none';
    img.parentElement?.classList.add('cover-fallback');
  }

  function setupCoverFallback() {
    $results.querySelectorAll('.steam-cover').forEach((img) => {
      // Evita registrar 2x (no caso de re-render)
      if (img.dataset.fbWired === '1') return;
      img.dataset.fbWired = '1';
      img.addEventListener('error', handleCoverError);

      // Se a imagem JÁ falhou antes do listener ser anexado (cache 404),
      // dispara o handler manualmente.
      if (img.complete && img.naturalWidth === 0) {
        handleCoverError({ target: img });
      }
    });
  }

  async function doSearch(term) {
    const myToken = ++searchToken;

    if (!term || term.length < 2) {
      $count.textContent = 'Digite pra buscar';
      $empty.style.display = '';
      $empty.querySelector('h3').textContent = 'Comece digitando';
      $empty.querySelector('p').textContent = 'Os resultados aparecem em tempo real conforme você digita.';
      $results.querySelectorAll('.steam-game-card').forEach((el) => el.remove());
      return;
    }

    $count.textContent = 'Buscando...';

    try {
      const result = await window.zhub.steam.search(term);
      if (myToken !== searchToken) return; // request mais nova

      if (result?.error) {
        $count.textContent = `Erro: ${result.error}`;
        toast(`Erro Steam: ${result.error}`, 'error');
        return;
      }

      const items = Array.isArray(result) ? result : [];
      $count.textContent = `${items.length} jogo${items.length === 1 ? '' : 's'}`;
      renderResults(items);
    } catch (err) {
      if (myToken !== searchToken) return;
      $count.textContent = `Erro: ${err.message}`;
    }
  }

  const debouncedSearch = debounce(doSearch, 350);

  $input?.addEventListener('input', () => {
    const v = $input.value.trim();
    if (v) {
      $clear?.classList.add('show');
    } else {
      $clear?.classList.remove('show');
    }
    debouncedSearch(v);
  });

  $clear?.addEventListener('click', () => {
    $input.value = '';
    $clear.classList.remove('show');
    doSearch('');
    $input.focus();
  });

  // ============================================================
  // DETAIL MODAL
  // ============================================================
  $results?.addEventListener('click', (e) => {
    const card = e.target.closest('.steam-game-card');
    if (!card) return;
    const appid = card.dataset.appid;
    if (appid) openDetail(appid);
  });

  async function openDetail(appid) {
    const myToken = ++detailToken;

    // Setup loading state
    $detailName.textContent = 'Carregando...';
    $detailDeveloper.textContent = '—';
    $detailRelease.textContent = '—';
    $detailTags.innerHTML = '';
    $detailSummary.textContent = '';
    $detailScreenshots.innerHTML = '';
    $detailAbout.innerHTML = '';
    $detailBg.src = '';
    $detailCover.src = '';

    $modal.classList.add('open');
    $modal.setAttribute('aria-hidden', 'false');

    try {
      const data = await window.zhub.steam.details(appid);
      if (myToken !== detailToken) return;

      if (data?.error) {
        $detailName.textContent = 'Erro ao carregar';
        $detailSummary.textContent = data.error;
        return;
      }

      currentDetail = data;
      renderDetail(data);
    } catch (err) {
      if (myToken !== detailToken) return;
      $detailName.textContent = 'Erro ao carregar';
      $detailSummary.textContent = err.message;
    }
  }

  function renderDetail(g) {
    $detailName.textContent = g.name || '—';
    $detailDeveloper.textContent = (g.developers || []).join(', ') || 'Desconhecido';
    $detailRelease.textContent = g.releaseDate?.date || (g.releaseDate?.comingSoon ? 'Em breve' : '—');

    // Botão Adicionar muda pra Remover quando o jogo já tá adicionado via Lua Tools
    const isInstalled = installedAppids.has(parseInt(g.appid, 10));
    if (isInstalled) {
      $btnAdd.innerHTML = '🗑 Remover da Steam';
      $btnAdd.classList.remove('steam-action-add');
      $btnAdd.classList.add('steam-action-remove');
      $btnAdd.dataset.mode = 'remove';
      $btnLaunch.innerHTML = '▶ Abrir na biblioteca';
    } else {
      $btnAdd.innerHTML = '➕ Adicionar à Steam';
      $btnAdd.classList.add('steam-action-add');
      $btnAdd.classList.remove('steam-action-remove');
      $btnAdd.dataset.mode = 'add';
      $btnLaunch.innerHTML = '🛒 Abrir na Steam';
    }

    // Background hero (use library_hero if available, else background)
    const heroUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/library_hero.jpg`;
    $detailBg.src = heroUrl;
    $detailBg.onerror = () => { $detailBg.src = g.background || g.headerImage || ''; };

    // Capsule cover (vertical 600x900)
    const coverUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/library_600x900.jpg`;
    $detailCover.src = coverUrl;
    $detailCover.onerror = () => { $detailCover.src = g.capsuleImage || g.headerImage || ''; };

    // Tags = genres + 1 categoria
    const tagsHtml = (g.genres || []).slice(0, 5).map((t) =>
      `<span class="steam-tag">${escapeHTML(t)}</span>`
    ).join('');
    $detailTags.innerHTML = tagsHtml;

    // Short description
    $detailSummary.innerHTML = g.shortDescription || '';

    // Screenshots
    const shots = (g.screenshots || []).slice(0, 6);
    $detailScreenshots.innerHTML = shots.map((s) =>
      `<img src="${escapeHTML(s.thumb)}" alt="" loading="lazy" data-full="${escapeHTML(s.full)}" />`
    ).join('');

    // About (full description with HTML)
    $detailAbout.innerHTML = g.aboutTheGame || g.detailedDescription || '<em>Sem descrição.</em>';
  }

  // ============================================================
  // LIGHTBOX (visualizador in-app das screenshots)
  // ============================================================
  const $lightbox = document.getElementById('lightbox');
  const $lightboxImg = document.getElementById('lightbox-img');
  const $lightboxClose = document.getElementById('lightbox-close');
  const $lightboxPrev = document.getElementById('lightbox-prev');
  const $lightboxNext = document.getElementById('lightbox-next');
  const $lightboxCounter = document.getElementById('lightbox-counter');

  let lightboxImages = [];   // array de URLs (full size)
  let lightboxIndex = 0;

  function openLightbox(urls, startIdx) {
    lightboxImages = urls;
    lightboxIndex = startIdx;
    showLightboxImage();
    $lightbox.classList.add('open');
    $lightbox.setAttribute('aria-hidden', 'false');
  }

  function showLightboxImage() {
    if (!lightboxImages.length) return;
    const url = lightboxImages[lightboxIndex];
    $lightboxImg.src = url;
    $lightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    $lightboxPrev.disabled = lightboxIndex === 0;
    $lightboxNext.disabled = lightboxIndex === lightboxImages.length - 1;
  }

  function closeLightbox() {
    $lightbox.classList.remove('open');
    $lightbox.setAttribute('aria-hidden', 'true');
    $lightboxImg.src = '';
    lightboxImages = [];
  }

  function lightboxPrev() {
    if (lightboxIndex > 0) {
      lightboxIndex--;
      showLightboxImage();
    }
  }

  function lightboxNext() {
    if (lightboxIndex < lightboxImages.length - 1) {
      lightboxIndex++;
      showLightboxImage();
    }
  }

  // Click numa screenshot → abre lightbox naquela posição
  $detailScreenshots?.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-full]');
    if (!img) return;
    const allImgs = [...$detailScreenshots.querySelectorAll('img[data-full]')];
    const urls = allImgs.map((el) => el.dataset.full);
    const idx = allImgs.indexOf(img);
    openLightbox(urls, idx);
  });

  // Expõe o lightbox globalmente pra outras views (ex: catálogo, hypervisor) reutilizarem
  window.zhubLightbox = {
    open: openLightbox,
    close: closeLightbox,
  };

  // Expõe os flows Add/Remove de Steam (Lua Tools) pra outras views
  window.zhubSteamTools = {
    addGame: async ({ appid, name }) => {
      const status = await window.zhub.steamTools.detectInstall();
      if (!status?.steamPath) {
        toast('Steam não encontrada. Configure em Ajustes.', 'error');
        return;
      }
      if (!status.installed) {
        toast('⚠ Steam Tools não detectado.', 'error');
        return;
      }
      currentAddAppid = parseInt(appid, 10);
      openAtsModal(name);
      try {
        const result = await window.zhub.steamTools.addGame({ appid: currentAddAppid, name });
        if (result?.error) {
          $atsStep.textContent = result.error;
          $atsStep.className = 'ats-step error';
          $atsClose.hidden = false;
        }
      } catch {}
    },
    removeGame: ({ appid, name }) => openRemoveModal(parseInt(appid, 10), name),
    isInstalled: (appid) => installedAppids.has(parseInt(appid, 10)),
    refreshStatus: () => refreshSteamToolsStatus(),
  };

  // Click no overlay (fora da imagem) → fecha
  $lightbox?.addEventListener('click', (e) => {
    // Não fecha se clicar na imagem ou nos controles
    if (e.target === $lightbox) closeLightbox();
  });

  $lightboxClose?.addEventListener('click', closeLightbox);
  $lightboxPrev?.addEventListener('click', (e) => { e.stopPropagation(); lightboxPrev(); });
  $lightboxNext?.addEventListener('click', (e) => { e.stopPropagation(); lightboxNext(); });

  // Teclado: ESC fecha, ← → navegam
  document.addEventListener('keydown', (e) => {
    if (!$lightbox?.classList.contains('open')) return;
    if (e.key === 'Escape') { closeLightbox(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { lightboxPrev(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { lightboxNext(); e.preventDefault(); }
  });

  function closeDetail() {
    $modal.classList.remove('open');
    $modal.setAttribute('aria-hidden', 'true');
    currentDetail = null;
  }

  $modalClose?.addEventListener('click', closeDetail);
  $modal?.addEventListener('click', (e) => {
    if (e.target === $modal) closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $modal?.classList.contains('open')) closeDetail();
  });

  // ============================================================
  // ACTIONS
  // ============================================================
  $btnLaunch?.addEventListener('click', () => {
    if (!currentDetail) return;
    const isInstalled = installedAppids.has(parseInt(currentDetail.appid, 10));
    if (isInstalled) {
      // Já tem o jogo: abre a página de biblioteca dele na Steam
      // (steam://run/{appid} só funciona se o jogo está instalado/baixado)
      window.zhub.system.openExternal(`steam://nav/games/details/${currentDetail.appid}`);
      toast(`▶ Abrindo ${currentDetail.name} na sua biblioteca...`);
    } else {
      // Não tem ainda: abre a Steam Store dentro do client da Steam
      window.zhub.system.openExternal(`steam://store/${currentDetail.appid}`);
      toast(`🛒 Abrindo ${currentDetail.name} na Steam Store...`);
    }
  });

  $btnStore?.addEventListener('click', () => {
    if (!currentDetail) return;
    window.zhub.system.openExternal(`https://store.steampowered.com/app/${currentDetail.appid}/`);
  });

  // ============================================================
  // STEAM TOOLS BANNER + STATUS
  // ============================================================
  const $stbBanner = document.getElementById('steam-tools-banner');
  const $stbTitle = document.getElementById('stb-title');
  const $stbSubtitle = document.getElementById('stb-subtitle');
  const $stbInstall = document.getElementById('stb-install');

  let steamToolsInstalled = false;
  let steamPath = null;

  async function refreshSteamToolsStatus() {
    try {
      const status = await window.zhub.steamTools.detectInstall();
      steamToolsInstalled = !!status?.installed;
      steamPath = status?.steamPath || null;

      // Banner foi removido na Fase 9.x — atualiza só se ainda existir
      if ($stbBanner) {
        if (!status?.steamPath) {
          $stbBanner.hidden = false;
          $stbBanner.classList.remove('success');
          if ($stbTitle) $stbTitle.textContent = 'Steam não detectada';
          if ($stbSubtitle) $stbSubtitle.innerHTML = 'Não consegui encontrar a Steam. Configure o caminho em <b>Ajustes → Geral → Pasta da Steam</b>.';
          if ($stbInstall) {
            $stbInstall.hidden = false;
            $stbInstall.textContent = '⚙ Configurar';
            $stbInstall.dataset.action = 'goto-settings';
          }
        } else if (!status.installed) {
          $stbBanner.hidden = false;
          $stbBanner.classList.remove('success');
          if ($stbTitle) $stbTitle.textContent = 'Steam Tools não detectado';
          if ($stbSubtitle) $stbSubtitle.textContent = `Steam em ${status.steamPath}. Steam Tools será instalado quando você instalar o app pela primeira vez (NSIS post-install).`;
          if ($stbInstall) $stbInstall.hidden = true;
        } else {
          $stbBanner.hidden = false;
          $stbBanner.classList.add('success');
          if ($stbTitle) $stbTitle.textContent = '✓ Pronto pra usar';
          if ($stbSubtitle) {
            const count = await window.zhub.steamTools.countLua();
            $stbSubtitle.textContent = `Steam Tools detectado · ${count} jogo(s) já adicionado(s)`;
          }
          if ($stbInstall) $stbInstall.hidden = true;
        }
      }
      $btnAdd?.removeAttribute('disabled');

      // Sempre carrega appids instalados (independente do banner)
      await loadInstalledAppids();
    } catch (err) {
      console.error('[buscar] refreshSteamToolsStatus falhou:', err);
    }
  }

  // Cache local dos appids já adicionados (pra mostrar badge nos cards)
  let installedAppids = new Set();

  // Set dos appids que estão no greenGames (pra badge "NO HUB")
  const greenAppids = (() => {
    const s = new Set();
    const arr = window.GREEN_GAMES_DATA;
    if (Array.isArray(arr)) {
      for (const g of arr) {
        const m = String(g.i || '').match(/\/apps\/(\d+)\//);
        if (m) s.add(parseInt(m[1], 10));
      }
    }
    return s;
  })();

  async function loadInstalledAppids() {
    try {
      const list = await window.zhub.steamTools.listLua();
      installedAppids = new Set((list || []).map((a) => a.appid));
      // Re-render dos cards pra atualizar badges
      const cards = $results.querySelectorAll('.steam-game-card');
      cards.forEach((card) => {
        const id = parseInt(card.dataset.appid, 10);
        if (installedAppids.has(id)) {
          card.classList.add('already-added');
          if (!card.querySelector('.steam-already-badge')) {
            card.insertAdjacentHTML('beforeend', '<span class="steam-already-badge">✓ Adicionado</span>');
          }
        } else {
          card.classList.remove('already-added');
          card.querySelector('.steam-already-badge')?.remove();
        }
      });
    } catch {}
  }

  // Click no banner — vai pra Ajustes se for "configurar"
  $stbInstall?.addEventListener('click', async () => {
    if ($stbInstall.dataset.action === 'goto-settings') {
      // Vai pra view Ajustes
      const link = document.querySelector('.sidebar-link[data-view="ajustes"]');
      link?.click();
      return;
    }
  });

  // ============================================================
  // ADD-TO-STEAM MODAL (progresso)
  // ============================================================
  const $atsModal = document.getElementById('ats-modal');
  const $atsClose = document.getElementById('ats-close');
  const $atsIcon = document.getElementById('ats-icon');
  const $atsTitle = document.getElementById('ats-title');
  const $atsGame = document.getElementById('ats-game');
  const $atsStep = document.getElementById('ats-step-msg');
  const $atsProgressWrap = document.getElementById('ats-progress-wrap');
  const $atsProgressBar = document.getElementById('ats-progress-bar');
  const $atsMeta = document.getElementById('ats-meta');
  const $atsActions = document.getElementById('ats-actions');
  const $atsRestartBtn = document.getElementById('ats-restart-steam');
  const $atsLaterBtn = document.getElementById('ats-later');

  let currentAddAppid = null;

  function openAtsModal(name) {
    $atsModal.classList.add('open');
    $atsModal.setAttribute('aria-hidden', 'false');
    $atsIcon.textContent = '⚙️';
    $atsTitle.textContent = 'Adicionando à Steam…';
    $atsGame.textContent = name || '';
    $atsStep.textContent = 'Detectando Steam…';
    $atsStep.className = 'ats-step';
    $atsProgressWrap.hidden = true;
    $atsProgressBar.style.width = '0%';
    $atsMeta.textContent = '';
    $atsActions.hidden = true;
    $atsClose.hidden = true;
  }

  function closeAtsModal() {
    $atsModal.classList.remove('open');
    $atsModal.setAttribute('aria-hidden', 'true');
    currentAddAppid = null;
  }

  function fmtMB(bytes) {
    if (!bytes) return '—';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Subscribe nos eventos de progresso (do main process)
  window.zhub.steamTools.onState(({ appid, state }) => {
    if (appid !== currentAddAppid) return;

    if (state.status === 'detecting') {
      $atsStep.textContent = state.message || 'Detectando Steam…';
      $atsStep.className = 'ats-step';
    }
    else if (state.status === 'downloading') {
      $atsStep.textContent = state.message || `Baixando de ${state.currentApi}…`;
      $atsStep.className = 'ats-step';
      $atsProgressWrap.hidden = false;
      $atsProgressBar.style.width = `${state.percent || 0}%`;
      $atsMeta.textContent = state.total
        ? `${fmtMB(state.received)} / ${fmtMB(state.total)} (${state.percent || 0}%)`
        : `${fmtMB(state.received || 0)}`;
    }
    else if (state.status === 'extracting') {
      $atsStep.textContent = '⚙ Extraindo .lua e .manifest…';
      $atsStep.className = 'ats-step';
      $atsProgressBar.style.width = '100%';
    }
    else if (state.status === 'done') {
      $atsIcon.textContent = '✅';
      $atsTitle.textContent = 'Adicionado à Steam!';
      $atsStep.textContent = state.message || `✓ Adicionado via ${state.api}.`;
      $atsStep.className = 'ats-step done';
      $atsProgressWrap.hidden = true;
      $atsMeta.textContent = state.manifestsCount ? `${state.manifestsCount} manifest(s) instalado(s)` : '';
      $atsActions.hidden = false;
      $atsClose.hidden = false;

      // ATUALIZA tudo em tempo real (banner, badges, contador)
      refreshSteamToolsStatus();
      // Atualiza o botão do modal de detalhes (vira "Remover")
      if (currentDetail) {
        installedAppids.add(parseInt(currentDetail.appid, 10));
        renderDetail(currentDetail);
      }
    }
    else if (state.status === 'failed') {
      $atsIcon.textContent = '❌';
      $atsTitle.textContent = 'Falhou';
      $atsStep.textContent = state.error || 'Erro desconhecido';
      $atsStep.className = 'ats-step error';
      $atsClose.hidden = false;
    }
    else if (state.status === 'already-installed') {
      $atsIcon.textContent = 'ℹ️';
      $atsTitle.textContent = 'Já adicionado';
      $atsStep.textContent = 'Esse jogo já foi adicionado à sua Steam antes.';
      $atsStep.className = 'ats-step done';
      $atsProgressWrap.hidden = true;
      $atsActions.hidden = false;
      $atsClose.hidden = false;
    }
  });

  $atsClose?.addEventListener('click', closeAtsModal);
  $atsLaterBtn?.addEventListener('click', closeAtsModal);

  $atsRestartBtn?.addEventListener('click', async () => {
    $atsRestartBtn.disabled = true;
    $atsRestartBtn.textContent = 'Reiniciando…';
    try {
      const result = await window.zhub.steamTools.restartSteam();
      if (result?.error) {
        toast(`Erro: ${result.error}`, 'error');
      } else {
        toast('🔄 Steam reiniciando — em alguns segundos seu jogo aparece.', 'success');
        closeAtsModal();
      }
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    } finally {
      $atsRestartBtn.disabled = false;
      $atsRestartBtn.textContent = '▶ Reiniciar Steam agora';
    }
  });

  // ============================================================
  // MODAL DE CONFIRMAÇÃO DE REMOÇÃO
  // ============================================================
  const $removeModal = document.getElementById('steam-remove-modal');
  const $removeGameName = document.getElementById('steam-remove-game-name');
  const $removeConfirm = document.getElementById('steam-remove-confirm');
  const $removeCancel = document.getElementById('steam-remove-cancel');

  let pendingRemoveAppid = null;
  let pendingRemoveName = null;

  function openRemoveModal(appid, name) {
    pendingRemoveAppid = appid;
    pendingRemoveName = name;
    $removeGameName.textContent = name;
    $removeModal.classList.add('open');
    $removeModal.setAttribute('aria-hidden', 'false');
  }

  function closeRemoveModal() {
    $removeModal.classList.remove('open');
    $removeModal.setAttribute('aria-hidden', 'true');
    pendingRemoveAppid = null;
    pendingRemoveName = null;
  }

  $removeCancel?.addEventListener('click', closeRemoveModal);
  $removeModal?.addEventListener('click', (e) => {
    if (e.target === $removeModal) closeRemoveModal();
  });

  $removeConfirm?.addEventListener('click', async () => {
    const appid = pendingRemoveAppid;
    const gameName = pendingRemoveName;
    if (!appid) return;

    // Desabilita botão durante operação
    $removeConfirm.disabled = true;
    $removeConfirm.querySelector('strong').textContent = 'Removendo…';

    try {
      const result = await window.zhub.steamTools.removeGame(appid);
      if (result?.error) {
        toast(`Erro ao remover: ${result.error}`, 'error');
        $removeConfirm.disabled = false;
        $removeConfirm.querySelector('strong').textContent = 'Remover e reiniciar a Steam';
        return;
      }

      // Atualiza UI imediatamente
      installedAppids.delete(appid);
      if (currentDetail && parseInt(currentDetail.appid, 10) === appid) {
        renderDetail(currentDetail);
      }
      await refreshSteamToolsStatus();

      // Fecha o modal de confirmação
      closeRemoveModal();
      $removeConfirm.disabled = false;
      $removeConfirm.querySelector('strong').textContent = 'Remover e reiniciar a Steam';

      // Reinicia Steam automaticamente
      toast(`🔄 Reiniciando a Steam…`);
      try {
        const restart = await window.zhub.steamTools.restartSteam();
        if (restart?.error) {
          toast(`⚠ Não foi possível reiniciar a Steam: ${restart.error}`, 'error');
        } else {
          toast(`✅ Steam reiniciada! "${gameName}" foi removido da biblioteca.`, 'success');
        }
      } catch {
        toast(`⚠ Reiniciar Steam falhou. Feche e abra a Steam manualmente.`, 'error');
      }
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
      $removeConfirm.disabled = false;
      $removeConfirm.querySelector('strong').textContent = 'Remover e reiniciar a Steam';
    }
  });

  // ============================================================
  // BOTÃO "ADICIONAR À STEAM" / "REMOVER" no modal de detalhes
  // ============================================================
  $btnAdd?.addEventListener('click', async () => {
    if (!currentDetail) return;

    const mode = $btnAdd.dataset.mode || 'add';
    const appid = parseInt(currentDetail.appid, 10);
    const gameName = currentDetail.name;

    // ===== REMOVE =====
    if (mode === 'remove') {
      openRemoveModal(appid, gameName);
      return;
    }

    // ===== ADD =====
    const status = await window.zhub.steamTools.detectInstall();
    if (!status?.steamPath) {
      toast('Steam não encontrada. Configure em Ajustes.', 'error');
      return;
    }
    if (!status.installed) {
      toast('⚠ Steam Tools não detectado.', 'error');
      return;
    }

    // Fecha o modal de detalhes ANTES pra evitar z-index conflict
    closeDetail();

    // Abre modal de progresso e dispara o add
    currentAddAppid = appid;
    openAtsModal(gameName);

    try {
      const result = await window.zhub.steamTools.addGame({ appid, name: gameName });
      if (result?.error) {
        if (!$atsClose.hidden) return;
        $atsStep.textContent = result.error;
        $atsStep.className = 'ats-step error';
        $atsClose.hidden = false;
      }
    } catch (err) {
      // erro tratado via onState
    }
  });

  // ============================================================
  // INIT — checa Steam Tools status quando user entra na view
  // ============================================================
  // Detecta quando o user troca pra a view "buscar" — re-checa status
  document.querySelectorAll('.sidebar-link[data-view="buscar"]').forEach((el) => {
    el.addEventListener('click', () => {
      setTimeout(() => refreshSteamToolsStatus(), 50);
    });
  });

  // Primeira checagem no load
  refreshSteamToolsStatus();

  console.log('[buscar] view inicializada.');
})();
