// renderer/views/settings.js
// View "Ajustes": sub-tabs (Geral / Fontes / Sobre), gerencia fontes externas
// e mescla os jogos delas no catálogo principal.

(() => {
  'use strict';

  if (typeof window.zhub === 'undefined') {
    console.warn('[settings] window.zhub indisponível.');
    return;
  }

  // ============================================================
  // PRESETS — fontes populares pra um clique adicionar
  // ============================================================
  const PRESETS = [
    { name: 'Kazumi',         url: 'https://davidkazumi-github-io.pages.dev/fontekazumi.json' },
    { name: 'KaOsKrew',       url: 'https://hydralinks.cloud/sources/kaoskrew.json' },
    { name: 'GarotaFit (FitGirl)', url: 'https://hydralinks.cloud/sources/fitgirl.json' },
    { name: 'GOG',            url: 'https://hydralinks.cloud/sources/gog.json' },
    { name: 'DODI',           url: 'https://hydralinks.cloud/sources/dodi.json' },
    { name: 'OnlineFix',      url: 'https://hydralinks.cloud/sources/onlinefix.json' },
    { name: 'SteamRip',       url: 'https://hydralinks.cloud/sources/steamrip.json' },
    { name: 'EMPRESS',        url: 'https://hydralinks.cloud/sources/empress.json' },
    { name: 'TinyRepacks',    url: 'https://hydralinks.cloud/sources/tinyrepacks.json' },
    { name: 'AtopGames',      url: 'https://hydralinks.cloud/sources/atop-games.json' },
    { name: 'Denuvo Pub',     url: 'https://konthe1.github.io/DenuvoPubSource.json' },
  ];

  // ============================================================
  // ELEMENTS
  // ============================================================
  const $tabs = document.querySelectorAll('.settings-tab');
  const $panels = document.querySelectorAll('.settings-panel');
  const $sourcesList = document.getElementById('sources-list');
  const $sourcesSyncAll = document.getElementById('sources-sync-all');
  const $sourcesAddBtn = document.getElementById('sources-add-btn');
  const $sourcesImportBtn = document.getElementById('sources-import-btn');
  const $officialCount = document.getElementById('source-official-count');

  const $defaultDir = document.getElementById('settings-default-dir');
  const $defaultDirPick = document.getElementById('settings-default-dir-pick');
  const $autoExtract = document.getElementById('settings-auto-extract');
  const $deleteArchive = document.getElementById('settings-delete-archive');
  const $rowDeleteArchive = document.getElementById('settings-row-delete-archive');
  const $steamPath = document.getElementById('settings-steam-path');
  const $steamPathPick = document.getElementById('settings-steam-path-pick');
  const $steamStatus = document.getElementById('settings-steam-status');
  const $appVersion = document.getElementById('settings-app-version');
  const $aboutVersion = document.getElementById('about-app-version');

  const $addModal = document.getElementById('add-source-modal');
  const $addClose = document.getElementById('add-source-close');
  const $addName = document.getElementById('add-source-name');
  const $addUrl = document.getElementById('add-source-url');
  const $addConfirm = document.getElementById('add-source-confirm');
  const $presetsList = document.getElementById('add-source-presets-list');

  // ============================================================
  // HELPERS
  // ============================================================
  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function fmtRelativeDate(ts) {
    if (!ts) return 'nunca';
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'agora há pouco';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`;
    const d = new Date(ts);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function toast(msg, type = '') {
    // Reusa o toast do downloads.js
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
  // SUB-TABS
  // ============================================================
  $tabs.forEach((t) => {
    t.addEventListener('click', () => {
      const tab = t.dataset.tab;
      $tabs.forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
      $panels.forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    });
  });

  // ============================================================
  // GERAL — diretório padrão + versão
  // ============================================================
  async function loadGeneralSettings() {
    try {
      const dir = await window.zhub.settings.get('downloadDir');
      if ($defaultDir) $defaultDir.value = dir || '';
      const ver = await window.zhub.app.getVersion();
      if ($appVersion) $appVersion.textContent = `v${ver}`;
      if ($aboutVersion) $aboutVersion.textContent = `v${ver}`;

      // Pasta Steam: mostra o que tá salvo + status da detecção atual
      const customSteam = await window.zhub.settings.get('steamPath');
      if ($steamPath) $steamPath.value = customSteam || '';
      await refreshSteamStatus();

      // Auto-extract toggles
      const ax = await window.zhub.settings.get('autoExtract');
      if ($autoExtract) $autoExtract.checked = ax !== false;
      const da = await window.zhub.settings.get('deleteArchiveAfterExtract');
      if ($deleteArchive) $deleteArchive.checked = !!da;
      // Sub-row só visível se autoExtract ligado
      if ($rowDeleteArchive) $rowDeleteArchive.hidden = !$autoExtract?.checked;
    } catch {}
  }

  // Toggle handlers
  $autoExtract?.addEventListener('change', async () => {
    try {
      await window.zhub.settings.set('autoExtract', !!$autoExtract.checked);
      if ($rowDeleteArchive) $rowDeleteArchive.hidden = !$autoExtract.checked;
      toast($autoExtract.checked ? '✓ Auto-extração ligada' : 'Auto-extração desligada');
    } catch (err) {
      toast('❌ ' + (err.message || 'Falha ao salvar'), 'error');
    }
  });
  $deleteArchive?.addEventListener('change', async () => {
    try {
      await window.zhub.settings.set('deleteArchiveAfterExtract', !!$deleteArchive.checked);
    } catch (err) {
      toast('❌ ' + (err.message || 'Falha ao salvar'), 'error');
    }
  });

  async function refreshSteamStatus() {
    if (!$steamStatus) return;
    try {
      const detected = await window.zhub.steamTools.detectSteam();
      if (detected) {
        $steamStatus.innerHTML = `✓ Detectada em: <code>${escapeHTML(detected)}</code>`;
        $steamStatus.style.color = 'rgba(74, 222, 128, 0.9)';
      } else {
        $steamStatus.textContent = '⚠ Não detectada — informe o caminho manualmente';
        $steamStatus.style.color = 'rgba(255, 180, 0, 0.9)';
      }
    } catch {
      $steamStatus.textContent = 'Erro ao detectar';
    }
  }

  $defaultDir?.addEventListener('change', async () => {
    try {
      await window.zhub.settings.set('downloadDir', $defaultDir.value);
      toast('💾 Pasta padrão atualizada');
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  $defaultDirPick?.addEventListener('click', async () => {
    try {
      const picked = await window.zhub.system.pickFolder($defaultDir.value || '');
      if (picked && $defaultDir) {
        $defaultDir.value = picked;
        await window.zhub.settings.set('downloadDir', picked);
        toast('💾 Pasta padrão atualizada');
      }
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  // Pasta da Steam — input direto
  $steamPath?.addEventListener('change', async () => {
    try {
      const v = $steamPath.value.trim();
      await window.zhub.settings.set('steamPath', v || null);
      toast(v ? '🎮 Pasta da Steam salva' : '🎮 Pasta da Steam limpa');
      await refreshSteamStatus();
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  // Pasta da Steam — picker
  $steamPathPick?.addEventListener('click', async () => {
    try {
      const picked = await window.zhub.system.pickFolder($steamPath.value || 'C:\\Program Files (x86)\\Steam');
      if (picked && $steamPath) {
        $steamPath.value = picked;
        await window.zhub.settings.set('steamPath', picked);
        toast('🎮 Pasta da Steam atualizada');
        await refreshSteamStatus();
      }
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  // ============================================================
  // FONTES — lista, sync, add, remove
  // ============================================================
  function sourceCardHTML(s) {
    const stats = s.lastSyncedAt
      ? `<strong>${s.gameCount.toLocaleString('pt-BR')}</strong> jogos · sincronizado ${fmtRelativeDate(s.lastSyncedAt)}`
      : 'Nunca sincronizada';
    const statusPill = s.enabled
      ? `<span class="source-status-pill source-active">Ativa</span>`
      : `<span class="source-status-pill source-disabled">Desabilitada</span>`;

    return `
      <div class="source-card" data-id="${escapeHTML(s.id)}">
        <div class="source-card-head">
          <span class="source-name">${escapeHTML(s.name)}</span>
          ${statusPill}
        </div>
        <p class="source-stats">${stats}</p>
        <p class="source-url">${escapeHTML(s.url)}</p>
        <div class="source-actions">
          <button class="source-btn" data-action="sync">🔄 Sincronizar</button>
          <button class="source-btn" data-action="toggle">${s.enabled ? '⏸ Desabilitar' : '▶ Habilitar'}</button>
          <button class="source-btn source-btn-danger" data-action="remove">🗑 Remover</button>
        </div>
      </div>
    `;
  }

  async function renderSourcesList() {
    if (!$sourcesList) return;
    try {
      const list = await window.zhub.sources.list();
      // Mantém o card oficial e remove os externos
      const officialCard = $sourcesList.querySelector('.source-card-official');
      $sourcesList.innerHTML = '';
      if (officialCard) $sourcesList.appendChild(officialCard);

      list.forEach((s) => {
        $sourcesList.insertAdjacentHTML('beforeend', sourceCardHTML(s));
      });

      // Conta jogos oficiais (do catálogo carregado)
      if ($officialCount && window.GREEN_GAMES_DATA) {
        const officialGames = window.GREEN_GAMES_DATA.filter((g) => !g._src);
        $officialCount.innerHTML = `<strong>${officialGames.length.toLocaleString('pt-BR')}</strong> jogos verdes`;
      }
    } catch (err) {
      console.error('[settings] renderSourcesList falhou:', err);
    }
  }

  $sourcesList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.source-card');
    if (!card) return;
    const id = card.dataset.id;
    if (!id) return;

    const action = btn.dataset.action;

    if (action === 'sync') {
      const pill = card.querySelector('.source-status-pill');
      if (pill) {
        pill.className = 'source-status-pill source-syncing';
        pill.textContent = 'Sincronizando…';
      }
      try {
        const result = await window.zhub.sources.sync(id);
        if (result?.error) {
          toast(`Erro ao sincronizar: ${result.error}`, 'error');
        } else {
          toast(`✓ ${result.name}: ${result.gameCount.toLocaleString('pt-BR')} jogos`, 'success');
          await reloadCatalogWithSources();
        }
      } catch (err) {
        toast(`Erro: ${err.message}`, 'error');
      }
      await renderSourcesList();
    }

    else if (action === 'toggle') {
      const list = await window.zhub.sources.list();
      const s = list.find((x) => x.id === id);
      if (!s) return;
      await window.zhub.sources.setEnabled({ id, enabled: !s.enabled });
      toast(s.enabled ? '⏸ Fonte desabilitada' : '▶ Fonte habilitada');
      await renderSourcesList();
      await reloadCatalogWithSources();
    }

    else if (action === 'remove') {
      const list = await window.zhub.sources.list();
      const s = list.find((x) => x.id === id);
      if (!s) return;
      if (!confirm(`Remover a fonte "${s.name}"?\n\nOs jogos dela vão sumir do catálogo.`)) return;
      await window.zhub.sources.remove(id);
      toast('🗑 Fonte removida');
      await renderSourcesList();
      await reloadCatalogWithSources();
    }
  });

  $sourcesSyncAll?.addEventListener('click', async () => {
    toast('🔄 Sincronizando todas as fontes…');
    try {
      const results = await window.zhub.sources.syncAll();
      const ok = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok).length;
      toast(`✓ ${ok} fonte(s) sincronizada(s)${fail > 0 ? `, ${fail} falha(s)` : ''}`, 'success');
      await renderSourcesList();
      await reloadCatalogWithSources();
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });

  // ============================================================
  // ADD SOURCE MODAL
  // ============================================================
  function renderPresets() {
    if (!$presetsList) return;
    $presetsList.innerHTML = PRESETS.map((p) => `
      <div class="preset-item" data-name="${escapeHTML(p.name)}" data-url="${escapeHTML(p.url)}">
        <span class="preset-item-name">${escapeHTML(p.name)}</span>
        <span class="preset-item-url">${escapeHTML(p.url.replace(/^https?:\/\//, ''))}</span>
      </div>
    `).join('');
  }
  renderPresets();

  $presetsList?.addEventListener('click', (e) => {
    const item = e.target.closest('.preset-item');
    if (!item) return;
    if ($addName) $addName.value = item.dataset.name;
    if ($addUrl) $addUrl.value = item.dataset.url;
  });

  function openAddModal() {
    if ($addName) $addName.value = '';
    if ($addUrl) $addUrl.value = '';
    $addModal?.classList.add('open');
    $addModal?.setAttribute('aria-hidden', 'false');
    setTimeout(() => $addName?.focus(), 100);
  }

  function closeAddModal() {
    $addModal?.classList.remove('open');
    $addModal?.setAttribute('aria-hidden', 'true');
  }

  $sourcesAddBtn?.addEventListener('click', openAddModal);

  $sourcesImportBtn?.addEventListener('click', async () => {
    try {
      const result = await window.zhub.sources.addFromFile();
      if (!result) return; // user cancelou o file picker
      if (result.error) {
        toast(`Erro: ${result.error}`, 'error');
        return;
      }
      toast(`✓ ${result.name}: ${result.gameCount.toLocaleString('pt-BR')} jogos importados`, 'success');
      await renderSourcesList();
      await reloadCatalogWithSources();
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });
  $addClose?.addEventListener('click', closeAddModal);
  $addModal?.addEventListener('click', (e) => {
    if (e.target === $addModal) closeAddModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $addModal?.classList.contains('open')) closeAddModal();
  });

  $addConfirm?.addEventListener('click', async () => {
    const name = $addName?.value.trim();
    const url = $addUrl?.value.trim();
    if (!url) {
      toast('Digite a URL.', 'error');
      $addUrl?.focus();
      return;
    }

    $addConfirm.disabled = true;
    $addConfirm.textContent = 'Adicionando…';

    try {
      const added = await window.zhub.sources.add({ name, url });
      if (added?.error) {
        toast(`Erro: ${added.error}`, 'error');
        return;
      }
      toast(`+ Fonte adicionada, sincronizando…`);
      closeAddModal();
      await renderSourcesList();

      // Sincroniza imediatamente
      const result = await window.zhub.sources.sync(added.id);
      if (result?.error) {
        toast(`Sincronização falhou: ${result.error}`, 'error');
      } else {
        toast(`✓ ${result.name}: ${result.gameCount.toLocaleString('pt-BR')} jogos`, 'success');
        await reloadCatalogWithSources();
      }
      await renderSourcesList();
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    } finally {
      $addConfirm.disabled = false;
      $addConfirm.textContent = '+ Adicionar e sincronizar';
    }
  });

  // ============================================================
  // CONVERTE FORMATO Hydra/Kazumi → formato greenGames
  // ============================================================
  function detectSourceLabel(url) {
    if (!url) return '';
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const map = {
        'pixeldrain.com': 'Pixeldrain',
        'gofile.io': 'Gofile',
        'buzzheavier.com': 'Buzzheavier',
        'mediafire.com': 'MediaFire',
        'mega.nz': 'Mega',
        '1fichier.com': '1Fichier',
      };
      return map[host] || host;
    } catch {
      if (url.startsWith('magnet:')) return 'Torrent (Magnet)';
      return '';
    }
  }

  function convertSourceGame(g) {
    const links = (g.uris || []).map((u) => ({
      u,
      x: u.startsWith('magnet:') ? 1 : 0,
      s: u.startsWith('magnet:') ? 'Torrent (Magnet)' : detectSourceLabel(u),
    }));
    return {
      n: g.title,
      i: '',                  // sem imagem (placeholder via CSS)
      t: [],                  // sem gêneros
      l: links,
      _src: g.sourceName,     // fonte (pra badge/filtro)
      _date: g.uploadDate,
      _size: g.fileSize,
    };
  }

  // ============================================================
  // MERGE — combina sources no catálogo e re-renderiza
  // ============================================================
  // Guarda o catálogo oficial original (antes de adicionarmos sources)
  if (!window.__zhubOfficialCatalog && window.GREEN_GAMES_DATA) {
    window.__zhubOfficialCatalog = window.GREEN_GAMES_DATA.slice();
  }

  async function reloadCatalogWithSources() {
    try {
      const additions = await window.zhub.sources.getMergedAdditions();
      const converted = (additions || []).map(convertSourceGame);

      // Substitui o array com [oficial + sources]
      const official = window.__zhubOfficialCatalog || [];
      window.GREEN_GAMES_DATA = official.concat(converted);

      // Re-inicializa o engine — preserva estado via sessionStorage
      if (typeof window.loadGreenGames === 'function') {
        window.loadGreenGames();
      }
    } catch (err) {
      console.error('[settings] reloadCatalog falhou:', err);
    }
  }

  // ============================================================
  // PATCH NO ENGINE — adiciona badge de fonte + placeholder de imagem
  // O engine renderiza cards via renderGreenCard. Vamos wrappar essa função
  // pra adicionar o badge e cuidar de imagens vazias.
  // ============================================================
  function installCardPatch() {
    if (typeof window.renderGreenCard !== 'function') return false;
    if (window.__zhubOriginalRenderGreenCard) return true; // já patchado

    window.__zhubOriginalRenderGreenCard = window.renderGreenCard;

    window.renderGreenCard = function patchedRenderGreenCard(g) {
      let html = window.__zhubOriginalRenderGreenCard(g);

      // Adiciona badge de fonte (se externo)
      if (g._src) {
        const badge = `<span class="source-card-badge">${escapeHTML(g._src)}</span>`;
        // Insere antes do </article>
        html = html.replace(
          /<\/article>$/,
          `${badge}</article>`
        );
      }

      // Se não tem imagem, substitui o <img> por um placeholder gradiente
      if (!g.i || g.i === '') {
        html = html.replace(
          /<img[^>]*\/>/,
          `<div class="cover-placeholder"><span>${escapeHTML(g.n)}</span></div>`
        );
      }

      return html;
    };
    return true;
  }

  // Tenta patchar imediatamente; se ainda não carregou, tenta após load
  if (!installCardPatch()) {
    window.addEventListener('load', () => installCardPatch());
  }

  // ============================================================
  // INIT — primeiro load
  // ============================================================
  loadGeneralSettings();
  renderSourcesList();
  // Carrega sources cacheados no boot (se houver)
  // Espera o engine inicializar primeiro pra não pisar nele
  setTimeout(() => reloadCatalogWithSources(), 100);

  console.log('[settings] view inicializada.');
})();
