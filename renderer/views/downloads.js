// renderer/views/downloads.js
// View "Downloads": lista, progress bars, controles, prompt de "como baixar".
// Também intercepta cliques em links magnet pra abrir o prompt.

(() => {
  'use strict';

  if (typeof window.zhub === 'undefined') {
    console.warn('[downloads] window.zhub indisponível — Downloads desativado.');
    return;
  }

  const $list = document.getElementById('downloads-list');
  const $empty = document.getElementById('downloads-empty');
  const $promptOverlay = document.getElementById('dl-prompt');
  const $promptGame = document.getElementById('dl-prompt-game');
  const $promptApp = document.getElementById('dl-option-app');
  const $promptExternal = document.getElementById('dl-option-external');
  const $promptClose = document.getElementById('dl-prompt-close');

  // Remove prompt
  const $removeOverlay = document.getElementById('dl-remove-prompt');
  const $removeGame = document.getElementById('dl-remove-game');
  const $removeKeep = document.getElementById('dl-remove-keep');
  const $removeFiles = document.getElementById('dl-remove-files');
  const $removeCancel = document.getElementById('dl-remove-cancel');
  const $removeClose = document.getElementById('dl-remove-close');

  // Settings prompt (Ajustes do download)
  const $settingsOverlay = document.getElementById('dl-settings-overlay');
  const $settingsClose = document.getElementById('dl-settings-close');
  const $settingsDisk = document.getElementById('dl-settings-disk');
  const $settingsGame = document.getElementById('dl-settings-game');
  const $settingsSize = document.getElementById('dl-settings-size');
  const $settingsSizeText = document.getElementById('dl-settings-size-text');
  const $settingsPath = document.getElementById('dl-settings-path');
  const $settingsPick = document.getElementById('dl-settings-pick');
  const $settingsRemember = document.getElementById('dl-settings-remember');
  const $settingsStart = document.getElementById('dl-settings-start');

  // ============================================================
  // Estado local — espelha o que o engine envia
  // ============================================================
  /** @type {Map<string, object>} id → snapshot do download */
  const items = new Map();

  /** @type {Map<string, object>} id → resultado do installer.detect (cache) */
  const detections = new Map();

  // ============================================================
  // FORMATTERS
  // ============================================================
  function fmtBytes(b) {
    if (!b || b < 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function fmtSpeed(bps) {
    if (!bps || bps < 0) return '—';
    return `${fmtBytes(bps)}/s`;
  }

  function fmtETA(dl) {
    if (dl.status !== 'downloading') return null;
    if (!dl.totalSize || !dl.speed || dl.speed < 1024) return null;
    const remaining = dl.totalSize - dl.downloadedSize;
    const sec = Math.floor(remaining / dl.speed);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }

  function statusLabel(status) {
    switch (status) {
      case 'downloading': return '⬇ Baixando';
      case 'paused': return '⏸ Pausado';
      case 'completed': return '✓ Concluído';
      case 'failed': return '✗ Erro';
      default: return status;
    }
  }

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderEmpty() {
    if (items.size === 0) {
      $empty.style.display = '';
      // Remove qualquer card existente
      [...$list.querySelectorAll('.dl-card')].forEach((el) => el.remove());
    } else {
      $empty.style.display = 'none';
    }
  }

  // Labels amigáveis pros repackers
  const REPACKER_LABELS = {
    fitgirl: 'FitGirl',
    dodi: 'DODI',
    gog: 'GOG',
    empress: 'EMPRESS',
    kaoskrew: 'Setup',
    steamrip: 'Pré-instalado',
    onlinefix: 'Online Fix',
    unknown: '',
  };

  function cardHTML(dl) {
    const pct = (dl.progress * 100).toFixed(1);
    const eta = fmtETA(dl);
    const status = dl.status;
    const det = detections.get(dl.id);

    const repackerPill = det && det.repacker && det.repacker !== 'unknown'
      ? `<span class="dl-repacker-pill">${REPACKER_LABELS[det.repacker] || det.repacker}</span>`
      : '';

    const meta = [
      `<span class="dl-status-pill ${status}">${statusLabel(status)}</span>`,
      repackerPill,
      status === 'completed'
        ? `<span><strong>${fmtBytes(dl.totalSize)}</strong></span>`
        : `<span><strong>${fmtBytes(dl.downloadedSize)}</strong> / ${fmtBytes(dl.totalSize)} (${pct}%)</span>`,
      status === 'downloading' ? `<span>⚡ ${fmtSpeed(dl.speed)}</span>` : null,
      status === 'downloading' ? `<span>👥 ${dl.peers} peers</span>` : null,
      eta ? `<span>⏱ ${eta}</span>` : null,
      dl.error ? `<span style="color:#ff6060">${escapeHTML(dl.error)}</span>` : null,
    ].filter(Boolean).join('');

    let actions = '';

    // === Smart action button quando concluído ===
    if (status === 'completed' && det) {
      if (det.type === 'install' && det.exe) {
        actions += `<button class="dl-btn dl-btn-install" data-action="install" title="Rodar setup.exe (admin)">⚙ Instalar</button>`;
      } else if (det.type === 'play' && det.exe) {
        actions += `<button class="dl-btn dl-btn-play" data-action="play" title="Rodar o jogo">▶ Jogar</button>`;
      } else if (det.type === 'patch') {
        actions += `<button class="dl-btn dl-btn-install" data-action="onlinefix" title="Ver instruções">🌐 Aplicar fix</button>`;
      }
    }

    // === Pause/Resume ===
    if (status === 'downloading') {
      actions += `<button class="dl-btn" data-action="pause" title="Pausar">⏸</button>`;
    } else if (status === 'paused' || status === 'failed') {
      actions += `<button class="dl-btn" data-action="resume" title="Retomar">▶</button>`;
    }

    // === Open folder ===
    if (status === 'completed' || status === 'paused' || status === 'downloading') {
      actions += `<button class="dl-btn" data-action="folder" title="Abrir pasta">📁</button>`;
    }

    actions += `<button class="dl-btn dl-btn-danger" data-action="remove" title="Remover">🗑</button>`;

    const cardClass = `dl-card ${status === 'completed' ? 'dl-completed' : ''} ${status === 'failed' ? 'dl-failed' : ''}`;

    return `
      <div class="${cardClass}" data-id="${dl.id}">
        <div class="dl-info">
          <p class="dl-name" title="${escapeHTML(dl.name)}">${escapeHTML(dl.name)}</p>
          <div class="dl-meta">${meta}</div>
          <div class="dl-progress-wrap">
            <div class="dl-progress-bar" style="width: ${pct}%"></div>
          </div>
        </div>
        <div class="dl-actions">${actions}</div>
      </div>
    `;
  }

  function upsertCard(dl) {
    items.set(dl.id, dl);

    // Se completou e ainda não detectou o instalador, dispara a detecção
    // (assíncrona, atualiza o card de novo quando terminar)
    if (dl.status === 'completed' && !detections.has(dl.id) && dl.path) {
      detections.set(dl.id, { pending: true });
      window.zhub.installer.detect(dl.path).then((det) => {
        detections.set(dl.id, det || { type: 'unknown' });
        // Re-render do card com os botões smart
        const current = items.get(dl.id);
        if (current) {
          const el = $list.querySelector(`.dl-card[data-id="${dl.id}"]`);
          if (el) el.outerHTML = cardHTML(current);
        }
      }).catch(() => {
        detections.set(dl.id, { type: 'unknown' });
      });
    }

    let el = $list.querySelector(`.dl-card[data-id="${dl.id}"]`);
    if (!el) {
      // Insere no topo
      $empty.style.display = 'none';
      $list.insertAdjacentHTML('afterbegin', cardHTML(dl));
      return;
    }
    // Atualização rápida: só os campos mudaram. Substitui o HTML do card.
    el.outerHTML = cardHTML(dl);
  }

  function removeCard(id) {
    items.delete(id);
    const el = $list.querySelector(`.dl-card[data-id="${id}"]`);
    if (el) el.remove();
    renderEmpty();
  }

  // ============================================================
  // ACTIONS
  // ============================================================
  $list?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.dl-card');
    if (!card) return;
    const id = card.dataset.id;
    const action = btn.dataset.action;

    // Dispatcher: torrent ou http baseado no type do item
    const dl = items.get(id);
    const backend = dl?.type === 'http' ? window.zhub.http : window.zhub.torrent;

    try {
      if (action === 'pause') {
        await backend.pause(id);
      } else if (action === 'resume') {
        await backend.resume(id);
      } else if (action === 'folder') {
        await backend.openFolder(id);
      } else if (action === 'remove') {
        openRemovePrompt(id);
      } else if (action === 'install' || action === 'play') {
        const det = detections.get(id);
        if (!det || !det.exe) {
          toast('Não consegui achar o executável.', 'error');
          return;
        }
        const result = await window.zhub.installer.run({
          exePath: det.exe,
          asAdmin: action === 'install', // setup precisa de admin, jogo não
        });
        if (result?.error) {
          toast(`Erro: ${result.error}`, 'error');
        } else {
          toast(action === 'install' ? '⚙ Instalador iniciado…' : '▶ Iniciando jogo…', 'success');
        }
      } else if (action === 'onlinefix') {
        openOnlineFixModal(id);
      }
    } catch (err) {
      console.error('[downloads] ação falhou:', err);
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  // ============================================================
  // EVENTOS DO ENGINE
  // ============================================================
  window.zhub.torrent.onAdded((dl) => {
    upsertCard(dl);
    toast(`📥 Download iniciado: ${dl.name}`);
  });

  window.zhub.torrent.onProgress((dl) => upsertCard(dl));

  window.zhub.torrent.onState(({ id, status, speed }) => {
    const dl = items.get(id);
    if (!dl) return;
    dl.status = status;
    if (typeof speed === 'number') dl.speed = speed;
    upsertCard(dl);
  });

  window.zhub.torrent.onDone((dl) => {
    upsertCard(dl);
    toast(`✓ ${dl.name} concluído!`, 'success');
  });

  window.zhub.torrent.onRemoved(({ id }) => removeCard(id));

  // ============================================================
  // INICIAL: lista existente do disco
  // ============================================================
  window.zhub.torrent.list().then((list) => {
    list.forEach(upsertCard);
    renderEmpty();
  }).catch((err) => {
    console.error('[downloads] list inicial falhou:', err);
  });

  // ============================================================
  // PROMPT (escolha entre "no app" ou "externo")
  // ============================================================
  let pendingPrompt = null;

  function openPrompt({ magnet, name }) {
    pendingPrompt = { magnet, name };
    if ($promptGame) $promptGame.textContent = name || '';
    $promptOverlay?.classList.add('open');
    $promptOverlay?.setAttribute('aria-hidden', 'false');
  }

  function closePrompt() {
    pendingPrompt = null;
    $promptOverlay?.classList.remove('open');
    $promptOverlay?.setAttribute('aria-hidden', 'true');
  }

  $promptClose?.addEventListener('click', closePrompt);
  $promptOverlay?.addEventListener('click', (e) => {
    if (e.target === $promptOverlay) closePrompt();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $promptOverlay?.classList.contains('open')) {
      closePrompt();
    }
  });

  $promptApp?.addEventListener('click', async () => {
    if (!pendingPrompt) return;
    const { magnet, name } = pendingPrompt;
    closePrompt();
    // Abre o modal de ajustes (pasta, disk space, etc) — só inicia o download
    // depois que o user confirmar lá
    openDownloadSettings({ magnet, name });
  });

  $promptExternal?.addEventListener('click', () => {
    if (!pendingPrompt) return;
    const { magnet } = pendingPrompt;
    closePrompt();
    window.zhub.system.openExternal(magnet);
  });

  // Expõe pra ser chamado pelo app.js (interceptor de clicks)
  window.__zhubOpenDownloadPrompt = openPrompt;

  // ============================================================
  // REMOVE PROMPT (substitui o confirm() nativo feio)
  // ============================================================
  let pendingRemoveId = null;

  function openRemovePrompt(id) {
    const dl = items.get(id);
    pendingRemoveId = id;
    if ($removeGame) $removeGame.textContent = dl?.name || '';
    $removeOverlay?.classList.add('open');
    $removeOverlay?.setAttribute('aria-hidden', 'false');
  }

  function closeRemovePrompt() {
    pendingRemoveId = null;
    $removeOverlay?.classList.remove('open');
    $removeOverlay?.setAttribute('aria-hidden', 'true');
  }

  $removeClose?.addEventListener('click', closeRemovePrompt);
  $removeCancel?.addEventListener('click', closeRemovePrompt);
  $removeOverlay?.addEventListener('click', (e) => {
    if (e.target === $removeOverlay) closeRemovePrompt();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $removeOverlay?.classList.contains('open')) {
      closeRemovePrompt();
    }
  });

  $removeKeep?.addEventListener('click', async () => {
    if (!pendingRemoveId) return;
    const id = pendingRemoveId;
    const dl = items.get(id);
    const backend = dl?.type === 'http' ? window.zhub.http : window.zhub.torrent;
    closeRemovePrompt();
    try {
      await backend.remove({ id, deleteFiles: false });
      toast('📋 Removido da lista. Arquivos preservados.');
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  $removeFiles?.addEventListener('click', async () => {
    if (!pendingRemoveId) return;
    const id = pendingRemoveId;
    const dl = items.get(id);
    const backend = dl?.type === 'http' ? window.zhub.http : window.zhub.torrent;
    closeRemovePrompt();
    try {
      await backend.remove({ id, deleteFiles: true });
      toast('💣 Removido + arquivos apagados.');
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  // ============================================================
  // AJUSTES DO DOWNLOAD (segundo modal, depois do "como baixar?")
  // ============================================================
  let pendingDownload = null;

  function fmtFreeSpace(free) {
    if (typeof free !== 'number' || free <= 0) return '— livre em disco';
    return `${fmtBytes(free)} livre em disco`;
  }

  // Token incremental pra evitar race condition se user abrir 2 modais em sequência
  let metadataFetchToken = 0;

  async function openDownloadSettings({ magnet, url, name }) {
    // Detecta o tipo: torrent (magnet) ou http (url)
    const isHttp = !!url && !magnet;
    pendingDownload = isHttp ? { url, name, type: 'http' } : { magnet, name, type: 'torrent' };

    if ($settingsGame) $settingsGame.textContent = name || 'Jogo';
    if ($settingsDisk) $settingsDisk.textContent = 'Calculando espaço…';

    // Reseta o display do tamanho pro estado "carregando"
    if ($settingsSize) {
      $settingsSize.classList.remove('loaded', 'error');
      $settingsSize.innerHTML = `<span class="dl-spinner"></span><span id="dl-settings-size-text">Calculando…</span>`;
    }

    // Pega pasta default (lastDownloadDir > downloadDir)
    let defaultPath = '';
    try {
      const last = await window.zhub.settings.get('lastDownloadDir');
      const def = await window.zhub.settings.get('downloadDir');
      defaultPath = last || def || '';
    } catch {}

    if ($settingsPath) $settingsPath.value = defaultPath;
    if ($settingsRemember) $settingsRemember.checked = true;

    $settingsOverlay?.classList.add('open');
    $settingsOverlay?.setAttribute('aria-hidden', 'false');

    // Atualiza disk space para a pasta atual
    refreshDiskSpace(defaultPath);

    // Busca metadados (torrent: fetchMetadata, http: host.getSize)
    const myToken = ++metadataFetchToken;
    const sizePromise = isHttp
      ? window.zhub.host.getSize(url).then((size) => ({ size }))
      : window.zhub.torrent.fetchMetadata(magnet);

    sizePromise.then((meta) => {
      if (myToken !== metadataFetchToken) return;
      if (!$settingsSize) return;

      if (meta?.error) {
        $settingsSize.classList.remove('loaded');
        $settingsSize.classList.add('error');
        $settingsSize.innerHTML = `<span>${escapeHTML(meta.error)}</span>`;
        return;
      }

      if (typeof meta?.size === 'number' && meta.size > 0) {
        $settingsSize.classList.remove('error');
        $settingsSize.classList.add('loaded');
        const fileCount = !isHttp && Array.isArray(meta.files) ? meta.files.length : 0;
        const fileLabel = fileCount > 1 ? ` em ${fileCount} arquivos` : '';
        $settingsSize.innerHTML = `<span>${fmtBytes(meta.size)}${fileLabel}</span>`;
      } else if (isHttp) {
        // Pixeldrain às vezes não tem size disponível
        $settingsSize.classList.remove('error');
        $settingsSize.classList.add('loaded');
        $settingsSize.innerHTML = `<span>Tamanho indisponível</span>`;
      }
    }).catch((err) => {
      if (myToken !== metadataFetchToken) return;
      if (!$settingsSize) return;
      $settingsSize.classList.remove('loaded');
      $settingsSize.classList.add('error');
      $settingsSize.innerHTML = `<span>Não consegui obter (${escapeHTML(err.message)})</span>`;
    });
  }

  function closeDownloadSettings() {
    pendingDownload = null;
    metadataFetchToken++; // invalida fetch em andamento
    $settingsOverlay?.classList.remove('open');
    $settingsOverlay?.setAttribute('aria-hidden', 'true');
  }

  async function refreshDiskSpace(folder) {
    if (!$settingsDisk) return;
    try {
      const info = await window.zhub.system.getDiskSpace(folder);
      if (info?.error) {
        $settingsDisk.textContent = '— livre em disco';
        return;
      }
      $settingsDisk.textContent = fmtFreeSpace(info.free);
    } catch {
      $settingsDisk.textContent = '— livre em disco';
    }
  }

  $settingsClose?.addEventListener('click', closeDownloadSettings);
  $settingsOverlay?.addEventListener('click', (e) => {
    if (e.target === $settingsOverlay) closeDownloadSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $settingsOverlay?.classList.contains('open')) {
      closeDownloadSettings();
    }
  });

  // Atualiza disk space ao editar manualmente o caminho
  let pathDebounce = null;
  $settingsPath?.addEventListener('input', () => {
    clearTimeout(pathDebounce);
    pathDebounce = setTimeout(() => refreshDiskSpace($settingsPath.value), 400);
  });

  // Botão Explorar — abre dialog nativo de pasta
  $settingsPick?.addEventListener('click', async () => {
    try {
      const current = $settingsPath?.value || '';
      const picked = await window.zhub.system.pickFolder(current);
      if (picked) {
        if ($settingsPath) $settingsPath.value = picked;
        refreshDiskSpace(picked);
      }
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  // Botão Iniciar download — adiciona torrent OU http baseado no type
  $settingsStart?.addEventListener('click', async () => {
    if (!pendingDownload) return;
    const { magnet, url, name, type } = pendingDownload;
    const downloadDir = ($settingsPath?.value || '').trim();
    const remember = !!$settingsRemember?.checked;

    if (!downloadDir) {
      toast('Escolha uma pasta de download.', 'error');
      return;
    }

    closeDownloadSettings();

    if (remember) {
      try {
        await window.zhub.settings.update({
          lastDownloadDir: downloadDir,
          downloadDir,
        });
      } catch {}
    } else {
      try {
        await window.zhub.settings.set('lastDownloadDir', downloadDir);
      } catch {}
    }

    try {
      let result;
      if (type === 'http') {
        result = await window.zhub.http.add({ url, name, downloadDir });
      } else {
        result = await window.zhub.torrent.add({ magnet, name, downloadDir });
      }

      if (result?.error) {
        toast(`Erro: ${result.error}`, 'error');
        return;
      }
      if (result?.alreadyExists) {
        toast(`Já tá baixando "${name}"`);
      }
      // Vai pra view de Downloads pra mostrar o progresso
      const downloadsBtn = document.querySelector('.sidebar-link[data-view="downloads"]');
      downloadsBtn?.click();
    } catch (err) {
      toast(`Erro ao adicionar: ${err.message}`, 'error');
    }
  });

  // ============================================================
  // ONLINE FIX MODAL (senha + aviso da Steam)
  // ============================================================
  const $onlinefixModal = document.getElementById('onlinefix-modal');
  const $onlinefixClose = document.getElementById('onlinefix-close');
  const $onlinefixCopy = document.getElementById('onlinefix-copy');
  const $onlinefixOpenFolder = document.getElementById('onlinefix-open-folder');
  let pendingOnlineFixId = null;

  function openOnlineFixModal(id) {
    pendingOnlineFixId = id;
    $onlinefixModal?.classList.add('open');
    $onlinefixModal?.setAttribute('aria-hidden', 'false');
  }

  function closeOnlineFixModal() {
    pendingOnlineFixId = null;
    $onlinefixModal?.classList.remove('open');
    $onlinefixModal?.setAttribute('aria-hidden', 'true');
  }

  $onlinefixClose?.addEventListener('click', closeOnlineFixModal);
  $onlinefixModal?.addEventListener('click', (e) => {
    if (e.target === $onlinefixModal) closeOnlineFixModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $onlinefixModal?.classList.contains('open')) {
      closeOnlineFixModal();
    }
  });

  $onlinefixCopy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('online-fix.me');
      toast('🔑 Senha copiada: online-fix.me', 'success');
    } catch {
      toast('Falha ao copiar.', 'error');
    }
  });

  $onlinefixOpenFolder?.addEventListener('click', () => {
    if (!pendingOnlineFixId) return;
    window.zhub.torrent.openFolder(pendingOnlineFixId);
    closeOnlineFixModal();
  });

  // ============================================================
  // TOAST (notificação in-app, complementa a notificação Windows)
  // ============================================================
  function ensureToastContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function toast(message, type = '') {
    const c = ensureToastContainer();
    const el = document.createElement('div');
    el.className = `toast ${type ? `toast-${type}` : ''}`;
    el.textContent = message;
    c.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  // ============================================================
  // HTTP DOWNLOADS (Pixeldrain, Gofile via session.downloadURL)
  // ============================================================
  // Normaliza estado HTTP do main process pra o formato que cardHTML espera
  // (igual aos torrents). HTTP usa 'done', renderer espera 'completed'; speed
  // não existe em HTTP (calculamos local com diff de bytes ao longo do tempo).
  const httpSpeedTracker = new Map(); // id → { lastBytes, lastTime, speed }

  function normalizeHttp(dl) {
    const status = dl.status === 'done' ? 'completed' : (dl.status || 'queued');

    // Calcula velocidade local: delta bytes / delta tempo
    let speed = 0;
    if (status === 'downloading') {
      const tracker = httpSpeedTracker.get(dl.id) || { lastBytes: 0, lastTime: Date.now(), speed: 0 };
      const now = Date.now();
      const dt = (now - tracker.lastTime) / 1000;
      if (dt >= 0.5) {
        speed = Math.max(0, (dl.downloaded - tracker.lastBytes) / dt);
        httpSpeedTracker.set(dl.id, { lastBytes: dl.downloaded, lastTime: now, speed });
      } else {
        speed = tracker.speed;
      }
    }

    return {
      id: dl.id,
      type: 'http',
      name: dl.name,
      status,
      progress: dl.progress || 0,
      downloadedSize: dl.downloaded || 0,
      totalSize: dl.totalSize || 0,
      speed,
      peers: 0,                  // não existe pra HTTP
      path: dl.downloadDir,      // pra installer.detect funcionar
      downloadDir: dl.downloadDir,
      error: dl.error,
      host: dl.host,
    };
  }

  // Listeners de eventos HTTP
  window.zhub.http.onAdded((dl) => {
    upsertCard(normalizeHttp(dl));
    toast(`📥 Baixando do ${dl.host}: ${dl.name}`);
  });

  window.zhub.http.onProgress(({ state }) => upsertCard(normalizeHttp(state)));
  window.zhub.http.onState(({ state }) => upsertCard(normalizeHttp(state)));

  window.zhub.http.onDone(({ state }) => {
    upsertCard(normalizeHttp(state));
    toast(`✓ ${state.name} concluído!`, 'success');
    httpSpeedTracker.delete(state.id);
  });

  window.zhub.http.onRemoved(({ id }) => {
    removeCard(id);
    httpSpeedTracker.delete(id);
  });

  // Lista existente do disco
  window.zhub.http.list().then((list) => {
    list.forEach((dl) => upsertCard(normalizeHttp(dl)));
    renderEmpty();
  }).catch(() => {});

  // ============================================================
  // ENTRY POINT — chamado pelo app.js quando user clica num link Pixeldrain/Gofile
  // ============================================================
  // Fecha modal de detalhe do jogo (catálogo / steam search) — usado quando empilhamos outros modais
  function closeDetailModals() {
    const gameModal = document.getElementById('game-detail-modal');
    if (gameModal?.classList.contains('open')) {
      gameModal.classList.remove('open');
      gameModal.setAttribute('aria-hidden', 'true');
    }
    const steamModal = document.getElementById('steam-detail-modal');
    if (steamModal?.classList.contains('open')) {
      steamModal.classList.remove('open');
      steamModal.setAttribute('aria-hidden', 'true');
    }
  }

  // Click num link Pixeldrain → abre dl-settings (path picker) — mesma UX dos torrents
  window.__zhubOpenHttpDownload = function ({ url, name }) {
    closeDetailModals();
    openDownloadSettings({ url, name });
  };

  // ============================================================
  // UNSUPPORTED HOST MODAL (1Fichier, MEGA, etc)
  // ============================================================
  const $unsupOverlay = document.getElementById('http-unsupported-modal');
  const $unsupClose = document.getElementById('http-unsupported-close');
  const $unsupHost = document.getElementById('http-unsupported-host');
  const $unsupHostname = document.getElementById('http-unsupported-hostname');
  const $unsupOpen = document.getElementById('http-unsupported-open');
  const $unsupCancel = document.getElementById('http-unsupported-cancel');

  let pendingUnsupportedUrl = null;

  function openUnsupportedModal({ url, name }) {
    pendingUnsupportedUrl = url;
    let hostname = '?';
    try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    if ($unsupHost) $unsupHost.textContent = name || hostname;
    if ($unsupHostname) $unsupHostname.textContent = hostname;
    closeDetailModals();
    $unsupOverlay?.classList.add('open');
    $unsupOverlay?.setAttribute('aria-hidden', 'false');
  }

  function closeUnsupportedModal() {
    pendingUnsupportedUrl = null;
    $unsupOverlay?.classList.remove('open');
    $unsupOverlay?.setAttribute('aria-hidden', 'true');
  }

  $unsupClose?.addEventListener('click', closeUnsupportedModal);
  $unsupCancel?.addEventListener('click', closeUnsupportedModal);
  $unsupOverlay?.addEventListener('click', (e) => {
    if (e.target === $unsupOverlay) closeUnsupportedModal();
  });
  $unsupOpen?.addEventListener('click', () => {
    if (pendingUnsupportedUrl) window.zhub.system.openExternal(pendingUnsupportedUrl);
    closeUnsupportedModal();
  });

  window.__zhubOpenHttpUnsupported = openUnsupportedModal;

  // ============================================================
  // ACTION DISPATCHER POR TIPO (torrent vs http)
  // Pra pause/resume/openFolder/remove o backend é diferente
  // ============================================================
  function getBackend(id) {
    const dl = items.get(id);
    return dl?.type === 'http' ? window.zhub.http : window.zhub.torrent;
  }
  // Expõe pros handlers existentes que precisam disso
  window.__zhubGetBackend = getBackend;

  console.log('[downloads] view inicializada (com HTTP).');
})();
