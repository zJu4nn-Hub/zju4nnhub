// game-config.js — Modal de configurações por jogo (Fase 9, Hydra-style)
//
// API exposta:
//   window.zhubOpenGameConfig({ key, appid, name }) — abre modal pra editar
//   key: st_{appid} (Steam Tools) | dl_{id} (App download)
//
// Persistência: via window.zhub.gameOverrides.set/get (electron/game-overrides.js)

(() => {
  'use strict';
  if (typeof window.zhub === 'undefined') return;

  const $modal = document.getElementById('game-config-modal');
  if (!$modal) return;

  const $title = document.getElementById('game-config-title');
  const $close = document.getElementById('game-config-close');
  const $cancel = document.getElementById('game-config-cancel');
  const $save = document.getElementById('game-config-save');

  const $tabs = $modal.querySelectorAll('.game-config-tab');
  const $panels = $modal.querySelectorAll('.game-config-panel');

  // Geral
  const $name = document.getElementById('game-config-name');
  // Localizações
  const $exe = document.getElementById('game-config-exe');
  const $pickExe = document.getElementById('game-config-pick-exe');
  const $clearExe = document.getElementById('game-config-clear-exe');
  const $openFolder = document.getElementById('game-config-open-folder');
  // Zona Vermelha
  const $btnRemoveLib = document.getElementById('game-config-remove-library');
  const $btnResetPt = document.getElementById('game-config-reset-playtime');
  const $btnDeleteFiles = document.getElementById('game-config-delete-files');

  let currentCtx = null; // { key, appid, name, defaultName, kind, downloadId }
  let originalConfig = {};

  function open() { $modal.hidden = false; }
  function close() {
    $modal.hidden = true;
    currentCtx = null;
    originalConfig = {};
  }

  $close?.addEventListener('click', close);
  $cancel?.addEventListener('click', close);
  $modal?.addEventListener('click', (e) => { if (e.target === $modal) close(); });

  // Tabs
  $tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.cfgTab;
      $tabs.forEach((b) => b.classList.toggle('active', b === btn));
      $panels.forEach((p) => { p.hidden = p.dataset.cfgPanel !== tab; });
    });
  });

  // Pick .exe
  $pickExe?.addEventListener('click', async () => {
    try {
      const exePath = await window.zhub.gameOverrides.pickExe();
      if (exePath) {
        $exe.value = exePath;
        updateOpenFolderVisibility();
      }
    } catch (err) {
      console.warn('[game-config] pickExe falhou:', err);
    }
  });

  // Auto-detect (procura .exe em steamapps/common/{installdir}/)
  const $autoDetect = document.getElementById('game-config-auto-detect');
  $autoDetect?.addEventListener('click', () => doAutoDetect(true));

  async function doAutoDetect(isManual) {
    if (!currentCtx) return;
    try {
      $autoDetect && ($autoDetect.disabled = true);
      let found = null;

      // Pra downloads do app: scan na pasta onde o user salvou
      if (currentCtx.kind === 'download' && currentCtx.downloadPath) {
        found = await window.zhub.library.autoDetectExeInFolder(currentCtx.downloadPath);
      }

      // Pra Steam Tools (ou se download não achou nada): tenta steamapps/common via appid
      if (!found && currentCtx.appid) {
        found = await window.zhub.library.autoDetectGameExe({ appid: currentCtx.appid });
      }

      if (found) {
        $exe.value = found;
        updateOpenFolderVisibility();
        if (isManual && typeof window.zhubToast === 'function') window.zhubToast('✓ Executável detectado');
      } else if (isManual) {
        const where = currentCtx.kind === 'download'
          ? 'na pasta do download'
          : 'em steamapps/common — instale o jogo pela Steam primeiro';
        if (typeof window.zhubToast === 'function') window.zhubToast(`⚠ Nenhum .exe achado ${where}`);
      }
    } catch (err) {
      console.warn('[game-config] auto-detect falhou:', err);
    } finally {
      $autoDetect && ($autoDetect.disabled = false);
    }
  }

  // Clear exe
  $clearExe?.addEventListener('click', () => {
    $exe.value = '';
    updateOpenFolderVisibility();
  });

  function updateOpenFolderVisibility() {
    if (!$openFolder) return;
    $openFolder.hidden = !$exe.value;
  }

  // Abrir pasta do jogo
  $openFolder?.addEventListener('click', () => {
    if (!$exe.value) return;
    try { window.zhub.system.showInFolder($exe.value); } catch {}
  });

  // Salvar
  $save?.addEventListener('click', async () => {
    if (!currentCtx) return close();
    const patch = {
      displayName: ($name.value || '').trim(),
      exePath: ($exe.value || '').trim(),
    };
    // Se displayName == defaultName, salva vazio (usa o padrão)
    if (patch.displayName === currentCtx.defaultName) patch.displayName = '';
    try {
      await window.zhub.gameOverrides.set({ key: currentCtx.key, patch });
      if (typeof window.zhubToast === 'function') window.zhubToast('✓ Configurações salvas');
      // Refresh views (biblioteca + perfil + modal de detalhes) pra refletir mudança
      try { window.zhubBibliotecaRefresh?.(); } catch {}
      try { window.zhubPerfilRefresh?.(); } catch {}
      try { window.zhubCatalogoRefreshActions?.(); } catch {}
    } catch (err) {
      if (typeof window.zhubToast === 'function') window.zhubToast('❌ ' + (err.message || 'Falha ao salvar'));
    }
    close();
  });

  // ============================================================
  // CONFIRMAÇÃO CUSTOM (modal inline, não usa window.confirm)
  // ============================================================
  function confirmDanger({ title, message, confirmLabel = 'Confirmar', confirmStrong = false }) {
    return new Promise((resolve) => {
      // Cria overlay temporário
      const overlay = document.createElement('div');
      overlay.className = 'zhub-modal-overlay danger-confirm-overlay';
      overlay.innerHTML = `
        <div class="zhub-modal danger-confirm-box" role="dialog" aria-modal="true">
          <button class="zhub-modal-close danger-confirm-close" aria-label="Fechar">×</button>
          <div class="danger-confirm-icon ${confirmStrong ? 'strong' : ''}">⚠</div>
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="danger-confirm-actions">
            <button class="btn btn-ghost danger-confirm-cancel">Cancelar</button>
            <button class="btn ${confirmStrong ? 'danger-confirm-strong' : 'danger-confirm-ok'}">${confirmLabel}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = (val) => {
        try { overlay.remove(); } catch {}
        resolve(val);
      };
      overlay.querySelector('.danger-confirm-close').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.danger-confirm-cancel').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.danger-confirm-ok, .danger-confirm-strong').addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    });
  }

  function toast(msg) {
    if (typeof window.zhubToast === 'function') window.zhubToast(msg);
  }

  // ============================================================
  // ZONA VERMELHA — handlers
  // ============================================================
  $btnRemoveLib?.addEventListener('click', async () => {
    if (!currentCtx) return;
    const { key, kind, appid, downloadId } = currentCtx;
    const messages = {
      steamtools: 'O jogo será removido do Steam Tools (deleta o .lua/.manifest) e tirado da sua lista. Os arquivos do jogo no disco continuam intactos.',
      download: 'O jogo será tirado da sua lista de jogos. Os arquivos baixados no disco continuam intactos.',
      manual: 'O jogo será removido da sua biblioteca. Os arquivos no seu disco não são afetados.',
    };
    const ok = await confirmDanger({
      title: 'Remover da biblioteca?',
      message: messages[kind] || messages.download,
      confirmLabel: 'Remover',
    });
    if (!ok) return;
    try {
      if (kind === 'download' && downloadId) {
        try { await window.zhub.torrent.remove({ id: downloadId, deleteFiles: false }); } catch {}
        try { await window.zhub.http.remove({ id: downloadId, deleteFiles: false }); } catch {}
      } else if (kind === 'steamtools' && appid) {
        try { await window.zhub.steamTools.removeGame(appid); } catch (err) {
          console.warn('[game-config] removeGame falhou:', err);
        }
      } else if (kind === 'manual' && appid) {
        // Remove da biblioteca manual
        try { await window.zhub.manualLibrary.remove(appid); } catch (err) {
          console.warn('[game-config] manualLibrary.remove falhou:', err);
        }
      }
      // Em todos casos: remove playtime + override
      try { await window.zhub.library.removePlaytime(key); } catch {}
      try { await window.zhub.gameOverrides.remove(key); } catch {}
      toast('✓ Removido da biblioteca');
      try { window.zhubBibliotecaRefresh?.(); } catch {}
      try { window.zhubPerfilRefresh?.(); } catch {}
      try { window.zhubCatalogoRefreshActions?.(); } catch {}
      close();
    } catch (err) {
      toast('❌ ' + (err.message || 'Falha ao remover'));
    }
  });

  $btnResetPt?.addEventListener('click', async () => {
    if (!currentCtx) return;
    const ok = await confirmDanger({
      title: 'Resetar tempo de jogo?',
      message: 'Vai zerar o tempo total e a data de último acesso desse jogo.',
      confirmLabel: 'Resetar',
    });
    if (!ok) return;
    try {
      await window.zhub.library.resetPlaytime(currentCtx.key);
      toast('✓ Tempo de jogo zerado');
      try { window.zhubBibliotecaRefresh?.(); } catch {}
      try { window.zhubPerfilRefresh?.(); } catch {}
    } catch (err) {
      toast('❌ ' + (err.message || 'Falha ao resetar'));
    }
  });

  $btnDeleteFiles?.addEventListener('click', async () => {
    if (!currentCtx?.downloadId) return;
    const ok = await confirmDanger({
      title: 'Apagar arquivos do PC?',
      message: '<strong>Ação irreversível.</strong> A pasta inteira do download vai ser deletada do seu disco. Vai precisar baixar de novo se quiser jogar.',
      confirmLabel: 'Apagar tudo',
      confirmStrong: true,
    });
    if (!ok) return;
    try {
      const { key, downloadId } = currentCtx;
      // Tenta nos dois backends — só um vai funcionar
      try { await window.zhub.torrent.remove({ id: downloadId, deleteFiles: true }); } catch {}
      try { await window.zhub.http.remove({ id: downloadId, deleteFiles: true }); } catch {}
      try { await window.zhub.library.removePlaytime(key); } catch {}
      try { await window.zhub.gameOverrides.remove(key); } catch {}
      toast('✓ Arquivos apagados');
      try { window.zhubBibliotecaRefresh?.(); } catch {}
      try { window.zhubPerfilRefresh?.(); } catch {}
      try { window.zhubCatalogoRefreshActions?.(); } catch {}
      close();
    } catch (err) {
      toast('❌ ' + (err.message || 'Falha ao apagar arquivos'));
    }
  });

  // ============================================================
  // API PÚBLICA
  // ============================================================
  window.zhubOpenGameConfig = async function ({ key, appid, name }) {
    if (!key) return;
    // Determina tipo: st_ = Steam Tools, dl_ = download do app, lib_ = manual library
    let kind;
    let downloadId = null;
    if (key.startsWith('dl_')) { kind = 'download'; downloadId = key.slice(3); }
    else if (key.startsWith('lib_')) { kind = 'manual'; }
    else { kind = 'steamtools'; }

    // Pra downloads, busca o path da pasta onde foi salvo (pra usar no auto-detect)
    let downloadPath = null;
    if (kind === 'download' && downloadId) {
      try {
        const torrents = await window.zhub.torrent.list();
        const t = (torrents || []).find((x) => x.id === downloadId);
        if (t?.path) downloadPath = t.path;
        if (!downloadPath) {
          const httpDls = await window.zhub.http.list();
          const h = (httpDls || []).find((x) => x.id === downloadId);
          if (h?.downloadDir) downloadPath = h.downloadDir;
        }
      } catch (err) {
        console.warn('[game-config] falha ao obter downloadPath:', err);
      }
    }

    currentCtx = { key, appid, name, defaultName: name || '', kind, downloadId, downloadPath };

    // Mostra/esconde botão "Apagar arquivos" só pra downloads (manual e Steam Tools não têm pasta do app)
    if ($btnDeleteFiles) $btnDeleteFiles.hidden = kind !== 'download';

    if ($title) $title.textContent = name ? `Configurar — ${name}` : 'Configurações do jogo';

    // Reseta tabs pra Geral
    $tabs.forEach((b) => b.classList.toggle('active', b.dataset.cfgTab === 'geral'));
    $panels.forEach((p) => { p.hidden = p.dataset.cfgPanel !== 'geral'; });

    // Carrega override existente
    let cfg = null;
    let everSaved = false;
    try {
      cfg = await window.zhub.gameOverrides.get(key);
      everSaved = cfg !== null;
    } catch {}
    cfg = cfg || {};
    originalConfig = { ...cfg };

    if ($name) $name.value = cfg.displayName || name || '';
    if ($exe) $exe.value = cfg.exePath || '';
    updateOpenFolderVisibility();

    open();

    // Auto-detect SÓ na primeira vez (user nunca abriu/salvou config desse jogo).
    // Pra Steam Tools/manual: usa appid; pra download: usa downloadPath.
    if (!everSaved && !cfg.exePath) {
      const canAuto = ((kind === 'steamtools' || kind === 'manual') && currentCtx?.appid)
        || (kind === 'download' && currentCtx?.downloadPath);
      if (canAuto) doAutoDetect(false);
    }
  };
})();
