// friends.js — Controller do sistema de Amigos no Perfil (Fase 10)
//
// Responsável por:
//   - Renderizar a sidebar de Amigos
//   - Modal "Adicionar amigo" com busca e pedidos pendentes
//   - Atualização em tempo real via window.zhub.friends.onState/onListChanged

(() => {
  'use strict';
  if (typeof window.zhub === 'undefined' || !window.zhub.friends) return;

  // Sidebar elements
  const $card = document.getElementById('perfil-friends-card');
  const $list = document.getElementById('perfil-friends-list');
  const $count = document.getElementById('perfil-friends-count');
  const $addBtn = document.getElementById('perfil-add-friend-btn');
  const $pendingWrap = document.getElementById('perfil-friends-pending');
  const $pendingBtn = document.getElementById('perfil-friends-pending-btn');
  const $pendingCount = document.getElementById('perfil-friends-pending-count');

  // Modal elements
  const $modal = document.getElementById('friends-add-modal');
  const $modalClose = document.getElementById('friends-add-close');
  const $searchInput = document.getElementById('friends-search-input');
  const $searchResults = document.getElementById('friends-search-results');
  const $pendingSection = document.getElementById('friends-pending-section');
  const $receivedList = document.getElementById('friends-received-list');
  const $receivedCount = document.getElementById('friends-received-count');
  const $sentTitle = document.getElementById('friends-sent-title');
  const $sentList = document.getElementById('friends-sent-list');
  const $sentCount = document.getElementById('friends-sent-count');

  if (!$card || !$modal) return;

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg) {
    if (typeof window.zhubToast === 'function') window.zhubToast(msg);
  }

  // ============================================================
  // SIDEBAR — render lista de amigos
  // ============================================================
  let cachedFriends = [];
  let cachedPending = { received: [], sent: [] };

  async function refreshFriendsList() {
    try {
      cachedFriends = await window.zhub.friends.list() || [];
    } catch { cachedFriends = []; }
    renderFriendsList();
  }

  async function refreshPending() {
    try {
      cachedPending = await window.zhub.friends.listPending() || { received: [], sent: [] };
    } catch { cachedPending = { received: [], sent: [] }; }
    renderPendingBadge();
    renderPendingLists();
  }

  function renderPendingBadge() {
    const totalReceived = cachedPending.received.length;
    if (totalReceived > 0) {
      if ($pendingWrap) $pendingWrap.hidden = false;
      if ($pendingCount) $pendingCount.textContent = String(totalReceived);
    } else {
      if ($pendingWrap) $pendingWrap.hidden = true;
    }
  }

  function renderFriendsList() {
    if ($count) $count.textContent = String(cachedFriends.length);
    if (!$list) return;
    if (!cachedFriends.length) {
      $list.innerHTML = '<div class="perfil-friends-empty">Nenhum amigo ainda. Clique em ＋ pra adicionar.</div>';
      return;
    }
    const visible = cachedFriends.slice(0, 8);
    $list.innerHTML = visible.map((f) => renderFriendRow(f)).join('');
  }

  function renderFriendRow(f) {
    const p = f.profile || {};
    const name = p.handle ? `@${p.handle}` : (p.username || 'Amigo');
    const avatar = p.avatar_url || '';
    return `
      <div class="perfil-friend-row" data-friend-id="${p.id}">
        ${avatar
          ? `<img class="perfil-friend-avatar" src="${avatar}" alt="" />`
          : `<div class="perfil-friend-avatar-empty">👤</div>`}
        <div class="perfil-friend-info">
          <div class="perfil-friend-name">${escapeHtml(name)}</div>
          ${p.username && p.handle ? `<div class="perfil-friend-sub">${escapeHtml(p.username)}</div>` : ''}
        </div>
      </div>
    `;
  }

  // Click num row → abre perfil do amigo
  $list?.addEventListener('click', (e) => {
    const row = e.target.closest('.perfil-friend-row');
    if (!row) return;
    const friendId = row.dataset.friendId;
    if (!friendId) return;
    if (typeof window.zhubOpenFriendProfile === 'function') {
      window.zhubOpenFriendProfile(friendId);
    }
  });

  // ============================================================
  // MODAL "Adicionar amigo"
  // ============================================================
  function openModal() {
    $modal.hidden = false;
    refreshPending();
    if ($searchInput) {
      $searchInput.value = '';
      $searchInput.focus();
    }
    if ($searchResults) {
      $searchResults.innerHTML = '<div class="friends-search-empty">Digite acima pra buscar (mínimo 2 caracteres).</div>';
    }
  }
  function closeModal() {
    $modal.hidden = true;
  }
  $modalClose?.addEventListener('click', closeModal);
  $modal?.addEventListener('click', (e) => { if (e.target === $modal) closeModal(); });
  $addBtn?.addEventListener('click', openModal);
  $pendingBtn?.addEventListener('click', openModal);

  // Pending lists no modal
  function renderPendingLists() {
    if (!$pendingSection) return;
    const hasAny = cachedPending.received.length || cachedPending.sent.length;
    $pendingSection.hidden = !hasAny;
    if (!hasAny) return;

    if ($receivedCount) $receivedCount.textContent = String(cachedPending.received.length);
    if ($receivedList) {
      $receivedList.innerHTML = cachedPending.received.map((p) => renderPendingRow(p, 'received')).join('')
        || '<div class="friends-search-empty">Nenhum pedido recebido.</div>';
    }
    if ($sentTitle) $sentTitle.hidden = cachedPending.sent.length === 0;
    if ($sentCount) $sentCount.textContent = String(cachedPending.sent.length);
    if ($sentList) {
      $sentList.innerHTML = cachedPending.sent.map((p) => renderPendingRow(p, 'sent')).join('') || '';
    }
  }

  function renderPendingRow(item, kind) {
    const p = item.profile || {};
    const name = p.handle ? `@${p.handle}` : (p.username || 'Usuário');
    const avatar = p.avatar_url || '';
    const actions = kind === 'received'
      ? `
        <button class="friends-row-btn friends-row-accept" data-action="accept" data-id="${item.otherId}">✓ Aceitar</button>
        <button class="friends-row-btn friends-row-reject" data-action="reject" data-id="${item.otherId}">Recusar</button>
      `
      : `<button class="friends-row-btn friends-row-cancel" data-action="cancel" data-id="${item.otherId}">Cancelar</button>`;
    return `
      <div class="friends-pending-row">
        ${avatar
          ? `<img class="friends-row-avatar" src="${avatar}" alt="" />`
          : `<div class="friends-row-avatar-empty">👤</div>`}
        <div class="friends-row-info">
          <div class="friends-row-name">${escapeHtml(name)}</div>
          ${p.username && p.handle ? `<div class="friends-row-sub">${escapeHtml(p.username)}</div>` : ''}
        </div>
        <div class="friends-row-actions">${actions}</div>
      </div>
    `;
  }

  // Handlers de aceite/recusa/cancelamento
  $modal?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.disabled = true;
    try {
      if (action === 'accept') {
        const r = await window.zhub.friends.respond({ requesterId: id, accept: true });
        if (r?.error) toast('❌ ' + r.error);
        else toast('✓ Pedido aceito');
      } else if (action === 'reject') {
        const r = await window.zhub.friends.respond({ requesterId: id, accept: false });
        if (r?.error) toast('❌ ' + r.error);
        else toast('Pedido recusado');
      } else if (action === 'cancel') {
        const r = await window.zhub.friends.cancel(id);
        if (r?.error) toast('❌ ' + r.error);
        else toast('Pedido cancelado');
      } else if (action === 'send') {
        const r = await window.zhub.friends.send(id);
        if (r?.error) toast('❌ ' + r.error);
        else toast('✓ Pedido enviado');
      } else if (action === 'open-profile') {
        closeModal();
        if (typeof window.zhubOpenFriendProfile === 'function') {
          window.zhubOpenFriendProfile(id);
        }
      }
      await refreshPending();
      await refreshFriendsList();
      // Re-renderiza search se tinha resultados
      if ($searchInput?.value) doSearch();
    } catch (err) {
      toast('❌ ' + (err.message || 'Falha'));
    } finally {
      btn.disabled = false;
    }
  });

  // ============================================================
  // BUSCA
  // ============================================================
  let searchTimer = null;
  $searchInput?.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 300);
  });

  async function doSearch() {
    const q = ($searchInput?.value || '').trim();
    if (q.length < 2) {
      $searchResults.innerHTML = '<div class="friends-search-empty">Digite acima pra buscar (mínimo 2 caracteres).</div>';
      return;
    }
    $searchResults.innerHTML = '<div class="friends-search-empty">Buscando…</div>';
    try {
      const results = await window.zhub.friends.search(q);
      if (results?.error) {
        $searchResults.innerHTML = `<div class="friends-search-empty">❌ ${escapeHtml(results.error)}</div>`;
        return;
      }
      if (!results || results.length === 0) {
        $searchResults.innerHTML = '<div class="friends-search-empty">Nenhum usuário encontrado.</div>';
        return;
      }
      // Determina status de cada resultado (já amigo? pedido pendente?)
      const friendIds = new Set(cachedFriends.map((f) => f.profile?.id).filter(Boolean));
      const sentIds = new Set(cachedPending.sent.map((p) => p.otherId));
      const receivedIds = new Set(cachedPending.received.map((p) => p.otherId));
      $searchResults.innerHTML = results.map((p) => {
        const name = p.handle ? `@${p.handle}` : (p.username || 'Usuário');
        const avatar = p.avatar_url || '';
        let actionBtn;
        if (friendIds.has(p.id)) {
          actionBtn = `<button class="friends-row-btn" data-action="open-profile" data-id="${p.id}">Ver perfil</button>`;
        } else if (sentIds.has(p.id)) {
          actionBtn = `<button class="friends-row-btn friends-row-cancel" data-action="cancel" data-id="${p.id}">Cancelar</button>`;
        } else if (receivedIds.has(p.id)) {
          actionBtn = `<button class="friends-row-btn friends-row-accept" data-action="accept" data-id="${p.id}">Aceitar</button>`;
        } else {
          actionBtn = `<button class="friends-row-btn friends-row-send" data-action="send" data-id="${p.id}">＋ Adicionar</button>`;
        }
        return `
          <div class="friends-pending-row">
            ${avatar
              ? `<img class="friends-row-avatar" src="${avatar}" alt="" />`
              : `<div class="friends-row-avatar-empty">👤</div>`}
            <div class="friends-row-info">
              <div class="friends-row-name">${escapeHtml(name)}</div>
              ${p.username && p.handle ? `<div class="friends-row-sub">${escapeHtml(p.username)}</div>` : ''}
            </div>
            <div class="friends-row-actions">${actionBtn}</div>
          </div>
        `;
      }).join('');
    } catch (err) {
      $searchResults.innerHTML = `<div class="friends-search-empty">❌ ${escapeHtml(err.message || 'Erro')}</div>`;
    }
  }

  // ============================================================
  // LISTENERS REALTIME
  // ============================================================
  try {
    window.zhub.friends.onListChanged?.(() => {
      refreshFriendsList();
      refreshPending();
    });
    window.zhub.friends.onState?.((payload) => {
      // Toast genérico já é tratado pelo overlay window
      // Aqui apenas garantimos que UI atualiza
      refreshFriendsList();
      refreshPending();
    });
  } catch {}

  // ============================================================
  // INIT — chamado ao logar / abrir perfil
  // ============================================================
  function init() {
    refreshFriendsList();
    refreshPending();
  }

  // Expõe pra perfil.js disparar
  window.zhubFriendsRefresh = init;

  // Auto-init se user já tá logado (delay pra esperar friends backend)
  setTimeout(init, 2000);
})();
