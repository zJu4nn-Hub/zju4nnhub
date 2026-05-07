// zJu4nn Hub — App bootstrap (renderer)
// Roda ANTES do site-engine.js. Configura titlebar, sidebar, navegação SPA
// e ajusta o ambiente pra que o engine do site funcione dentro do Electron.

(() => {
  'use strict';

  // ============================================================
  // 1. ENVIRONMENT SHIM
  //    O site original esperava um <a href> ou nav top. No app a
  //    nav é via sidebar buttons + sections com [hidden]. O engine
  //    espera #stat-hyper, #stat-green etc — todos já existem no HTML.
  // ============================================================

  // Detecta se tá rodando em Electron (vs preview no browser)
  const IS_ELECTRON = typeof window.zhub !== 'undefined';

  // ============================================================
  // 2. TITLEBAR
  // ============================================================
  if (IS_ELECTRON) {
    const $min = document.getElementById('tb-min');
    const $max = document.getElementById('tb-max');
    const $close = document.getElementById('tb-close');
    const $version = document.getElementById('titlebar-version');

    $min?.addEventListener('click', () => window.zhub.window.minimize());
    $max?.addEventListener('click', () => window.zhub.window.maximize());
    $close?.addEventListener('click', () => window.zhub.window.close());

    window.zhub.app.getVersion().then((v) => {
      if ($version) $version.textContent = `v${v}`;
    });

    // Atualiza ícone do botão maximizar quando estado da janela mudar
    window.zhub.window.onStateChange(({ isMaximized }) => {
      if (!$max) return;
      $max.setAttribute('title', isMaximized ? 'Restaurar' : 'Maximizar');
    });
  } else {
    // Modo preview no browser — esconde os botões da titlebar
    document.querySelector('.titlebar-actions')?.style.setProperty('display', 'none');
    const v = document.getElementById('titlebar-version');
    if (v) v.textContent = '(preview)';
  }

  // ============================================================
  // 2.5. AUTO-UPDATER UI (Fase 13)
  // ============================================================
  const $updateBanner = document.getElementById('update-banner');
  const $updateTitle = document.getElementById('update-banner-title');
  const $updateSub = document.getElementById('update-banner-sub');
  const $updateBtn = document.getElementById('update-banner-btn');
  const $updateClose = document.getElementById('update-banner-close');
  if (typeof window.zhub?.updater?.onAvailable === 'function') {
    window.zhub.updater.onAvailable(({ version }) => {
      if (!$updateBanner) return;
      $updateBanner.hidden = false;
      $updateTitle.textContent = `Atualização v${version} disponível`;
      $updateSub.textContent = 'Baixando…';
      $updateBtn.hidden = true;
    });
    window.zhub.updater.onProgress(({ percent }) => {
      if ($updateSub) $updateSub.textContent = `Baixando… ${percent}%`;
    });
    window.zhub.updater.onReady(({ version }) => {
      if (!$updateBanner) return;
      $updateBanner.hidden = false;
      $updateTitle.textContent = `Atualização v${version} pronta`;
      $updateSub.textContent = 'Reinicie pra instalar';
      $updateBtn.hidden = false;
    });
    $updateBtn?.addEventListener('click', async () => {
      $updateBtn.disabled = true;
      $updateBtn.textContent = 'Reiniciando…';
      try { await window.zhub.updater.installNow(); } catch {}
    });
    $updateClose?.addEventListener('click', () => {
      if ($updateBanner) $updateBanner.hidden = true;
    });
  }

  // ============================================================
  // 3. NAVEGAÇÃO SPA (sidebar → views)
  // ============================================================
  const VIEWS = ['inicio', 'catalogo', 'buscar', 'hypervisor', 'biblioteca', 'downloads', 'ajustes', 'perfil'];
  const STATE_KEY = 'zhub_app_state_v1';

  function showView(name) {
    if (!VIEWS.includes(name)) name = 'catalogo';

    VIEWS.forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (!el) return;
      const willShow = v === name;
      // Em views com fade-in: aplica is-loading SINCRONIZADO com hidden=false
      // pra que browser nunca pinte o conteúdo "antigo" antes do JS reagir
      if (willShow && el.classList.contains('view-fade')) {
        el.classList.add('is-loading');
      }
      el.hidden = !willShow;
    });

    document.querySelectorAll('.sidebar-link').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });

    // Reseta scroll ao trocar de view
    const main = document.querySelector('.app-main');
    if (main) main.scrollTop = 0;

    // Persiste
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ view: name }));
    } catch {}
  }

  // Click handlers
  document.querySelectorAll('.sidebar-link[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.goto));
  });

  // ============================================================
  // 4. INICIA SEMPRE NA PÁGINA INÍCIO
  // ============================================================
  showView('inicio');

  // ============================================================
  // 5. ANCHOR LINKS (#jogos-verdes, #hypervisor, #inicio)
  //    O engine do site usa esses anchors em alguns lugares.
  //    Mapeamos pros nomes de view do app.
  // ============================================================
  const ANCHOR_MAP = {
    inicio: 'inicio',
    'jogos-verdes': 'catalogo',
    hypervisor: 'hypervisor',
  };

  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;
    const id = anchor.getAttribute('href').slice(1);
    if (ANCHOR_MAP[id]) {
      e.preventDefault();
      showView(ANCHOR_MAP[id]);
    }
  });

  // ============================================================
  // 6. INTERCEPTOR DE LINKS EXTERNOS + MAGNETS
  //    - Links http(s) → abrem no browser externo via IPC
  //    - Links magnet:  → abrem o prompt "como baixar?" (in-app vs externo)
  //
  //    Pra magnets precisamos saber o NOME do jogo. O engine chama
  //    window.open(url) sem passar isso, então usamos um heurístico:
  //    pegamos o card .green-card mais próximo do click ativo, ou o
  //    nome do picker aberto. (definido em pendingMagnetName abaixo)
  // ============================================================
  let pendingMagnetName = null;

  // Captura o nome do jogo ANTES do engine processar o click,
  // pra ter contexto na hora que o window.open(magnet:...) for chamado.
  if (IS_ELECTRON) {
    document.addEventListener('click', (e) => {
      // Click num card de Jogos Verdes → captura o nome via data-index
      const card = e.target.closest('.green-card');
      if (card) {
        const idx = parseInt(card.dataset.index, 10);
        const game = window.GREEN_GAMES_DATA?.[idx];
        pendingMagnetName = game?.n
          || card.querySelector('h3')?.textContent?.trim()
          || null;
        return;
      }
      // Click num botão do server-picker → nome vem do header do picker
      const serverBtn = e.target.closest('.server-btn');
      if (serverBtn) {
        const pickerName = document.querySelector('.picker-game-name');
        pendingMagnetName = pickerName?.textContent?.trim() || null;
        return;
      }
    }, true); // capture phase: roda ANTES do handler do engine

    const _origOpen = window.open;
    window.open = function (url, _target, _features) {
      if (typeof url === 'string') {
        if (url.startsWith('magnet:')) {
          // Mostra o prompt "como baixar"
          const name = pendingMagnetName || 'Jogo';
          if (typeof window.__zhubOpenDownloadPrompt === 'function') {
            window.__zhubOpenDownloadPrompt({ magnet: url, name });
          } else {
            // fallback: abre externo se downloads.js não carregou
            window.zhub.system.openExternal(url);
          }
          return null;
        }
        if (/^https?:/i.test(url)) {
          // Hosts suportados pra download in-app (só Pixeldrain por enquanto)
          // Gofile mudou a API e exige autenticação dinâmica via JS ofuscado —
          // o esforço pra automatizar não vale; cai no fluxo "unsupported".
          const isSupportedHost = /pixeldrain\.com\/u\//i.test(url);
          if (isSupportedHost && typeof window.__zhubOpenHttpDownload === 'function') {
            const name = pendingMagnetName || 'Download';
            window.__zhubOpenHttpDownload({ url, name });
            return null;
          }
          // Host não suportado pra download in-app: mostra modal de aviso
          if (typeof window.__zhubOpenHttpUnsupported === 'function') {
            const name = pendingMagnetName || 'Download';
            window.__zhubOpenHttpUnsupported({ url, name });
            return null;
          }
          // Fallback: abre externo se downloads.js não carregou
          window.zhub.system.openExternal(url);
          return null;
        }
      }
      return _origOpen.apply(window, arguments);
    };
  }

  // ============================================================
  // 7. PROTECT.JS WORKAROUND
  //    O site original carrega protect.js antes do script.js.
  //    No app não carregamos protect.js — F12 fica liberado em dev.
  //    (já que o site-engine.js NÃO depende de protect.js, só do DOM)
  // ============================================================

  // ============================================================
  // 8. SESSIONSTORAGE → LOCALSTORAGE PROXY
  //    O engine do site salva o estado dos filtros em sessionStorage
  //    (chave 'zju4nn_green_state_v1'). No app queremos persistir entre
  //    fechamentos da janela. Espelha sessionStorage no localStorage.
  // ============================================================
  const SITE_STATE_KEY = 'zju4nn_green_state_v1';

  // Restaura do localStorage pro sessionStorage no boot (engine vai ler de session)
  try {
    const persisted = localStorage.getItem(SITE_STATE_KEY);
    if (persisted && !sessionStorage.getItem(SITE_STATE_KEY)) {
      sessionStorage.setItem(SITE_STATE_KEY, persisted);
    }
  } catch {}

  // Espelha gravações: toda vez que sessionStorage receber esse key,
  // copia pro localStorage também.
  const _origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    _origSetItem.call(this, key, value);
    if (this === sessionStorage && key === SITE_STATE_KEY) {
      try { localStorage.setItem(key, value); } catch {}
    }
  };

  // ============================================================
  // 9. EVENTOS GLOBAIS DEV
  // ============================================================
  if (!IS_ELECTRON) {
    console.log('[zJu4nn Hub] Modo preview no browser — sem IPC.');
  } else {
    console.log('[zJu4nn Hub] Modo Electron ativo.');
  }

  // ============================================================
  // 10. PRE-WARM COVERS — baixa header.jpg dos jogos do user em background
  //     (Steam Tools + downloads completos) pra que Perfil/Biblioteca abram instantâneo
  // ============================================================
  if (IS_ELECTRON) {
    async function prewarmCovers() {
      const appids = new Set();
      try {
        const lua = await window.zhub.steamTools.listLua();
        if (Array.isArray(lua)) lua.forEach((it) => it.appid && appids.add(it.appid));
      } catch {}
      // Dispara Image() pra cada appid — browser baixa e cachea
      for (const appid of appids) {
        const img1 = new Image();
        img1.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
        // Library_hero como fallback alternativo (cache fica)
        const img2 = new Image();
        img2.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`;
      }
      if (appids.size > 0) console.log(`[prewarm] disparou cache de ${appids.size} cover(s) Steam Tools`);
    }
    // Roda imediato (Image() é async, não bloqueia)
    prewarmCovers().catch(() => {});
  }
})();
