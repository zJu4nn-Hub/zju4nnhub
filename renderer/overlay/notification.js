// notification.js — Renderer da janela overlay de notificação (flutua sobre jogos)
// Recebe IPC do main process e renderiza toasts.

(() => {
  'use strict';
  const $stack = document.getElementById('stack');
  if (!$stack || !window.zhubOverlay?.onAchievement) return;

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showToast({ achievement, total, unlocked }) {
    if (!achievement) return;
    const name = achievement.displayName || achievement.name || 'Conquista';
    const desc = achievement.description || '';
    const icon = achievement.icon || achievement.icongray || '';

    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      ${icon
        ? `<div class="icon-wrap"><img src="${icon}" alt="" /></div>`
        : `<div class="icon-wrap empty">🏆</div>`}
      <div class="body">
        <div class="label">🏆 Conquista desbloqueada</div>
        <div class="name">${escapeHtml(name)}</div>
        ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
        ${total ? `<div class="progress">${unlocked || '?'}/${total}</div>` : ''}
      </div>
    `;
    $stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('hide');
      setTimeout(() => { try { el.remove(); } catch {} }, 400);
    }, 5000);

    // Pede pra janela mostrar (caso tenha sido escondida)
    try { window.zhubOverlay.notifyShown(); } catch {}
  }

  window.zhubOverlay.onAchievement((payload) => {
    showToast(payload);
  });

  // Toast de amigo (pedido recebido / aceito)
  function showFriendToast(payload) {
    if (!payload?.other) return;
    const other = payload.other;
    const name = other.handle ? `@${other.handle}` : (other.username || 'Amigo');
    const avatar = other.avatar_url || '';
    const labelText = payload.kind === 'requestReceived' ? '👋 Pedido de amizade' : '✓ Amizade aceita';
    const desc = payload.kind === 'requestReceived' ? `${name} quer ser seu amigo` : `${name} aceitou seu pedido`;

    const el = document.createElement('div');
    el.className = 'toast friend-toast';
    el.innerHTML = `
      ${avatar
        ? `<div class="icon-wrap"><img src="${avatar}" alt="" /></div>`
        : `<div class="icon-wrap empty">👤</div>`}
      <div class="body">
        <div class="label" style="color:#a04bff">${labelText}</div>
        <div class="name">${name}</div>
        <div class="desc">${desc}</div>
      </div>
    `;
    $stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('hide');
      setTimeout(() => { try { el.remove(); } catch {} }, 400);
    }, 5000);
    try { window.zhubOverlay.notifyShown(); } catch {}
  }

  if (window.zhubOverlay.onFriend) {
    window.zhubOverlay.onFriend((payload) => showFriendToast(payload));
  }
})();
