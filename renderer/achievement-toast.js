// achievement-toast.js — DEPRECATED (Fase 9.x)
//
// Substituído pela janela overlay flutuante (electron/main.js + renderer/overlay/notification.html)
// que aparece SOBRE qualquer programa, incluindo jogos fullscreen.
//
// Mantido vazio pra não quebrar imports existentes.

(() => {
  'use strict';
  return; // overlay window cobre os 2 casos (app aberto + minimizado)
  if (typeof window.zhub === 'undefined' || !window.zhub.achievements) return;

  // Container singleton (cria 1x e reusa)
  let $container = document.getElementById('zhub-ach-toast-container');
  if (!$container) {
    $container = document.createElement('div');
    $container.id = 'zhub-ach-toast-container';
    $container.className = 'zhub-ach-toast-container';
    document.body.appendChild($container);
  }

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
    const isHidden = achievement.hidden && !desc;

    const el = document.createElement('div');
    el.className = 'zhub-ach-toast';
    el.innerHTML = `
      <div class="zhub-ach-toast-glow"></div>
      <div class="zhub-ach-toast-icon-wrap">
        ${icon ? `<img class="zhub-ach-toast-icon" src="${icon}" alt="" />` : '<div class="zhub-ach-toast-icon zhub-ach-toast-icon-empty">🏆</div>'}
      </div>
      <div class="zhub-ach-toast-body">
        <div class="zhub-ach-toast-label">🏆 Conquista desbloqueada</div>
        <div class="zhub-ach-toast-name">${escapeHtml(name)}</div>
        ${desc ? `<div class="zhub-ach-toast-desc">${escapeHtml(desc)}</div>` : ''}
        ${total ? `<div class="zhub-ach-toast-progress">${unlocked || '?'}/${total}</div>` : ''}
      </div>
    `;
    $container.appendChild(el);

    // Animação entrada → permanece visível 5s → fade out
    requestAnimationFrame(() => el.classList.add('zhub-ach-toast-in'));
    setTimeout(() => {
      el.classList.add('zhub-ach-toast-out');
      setTimeout(() => { try { el.remove(); } catch {} }, 350);
    }, 5000);
  }

  // Throttle anti-spam: agrupa unlocks que chegam em < 250ms
  let pending = [];
  let flushTimer = null;
  function enqueue(payload) {
    pending.push(payload);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushQueue, 250);
  }

  function flushQueue() {
    flushTimer = null;
    if (pending.length === 0) return;
    if (pending.length === 1) {
      showToast(pending[0]);
    } else if (pending.length <= 3) {
      // Mostra cada uma com pequeno stagger
      pending.forEach((p, idx) => setTimeout(() => showToast(p), idx * 400));
    } else {
      // Muitas de uma vez → um toast resumo
      const first = pending[0];
      showToast({
        achievement: {
          displayName: `${pending.length} conquistas desbloqueadas`,
          description: `Incluindo "${first?.achievement?.displayName || first?.achievement?.name || ''}"`,
          icon: first?.achievement?.icon || '',
        },
        total: first?.total,
        unlocked: first?.unlocked,
      });
    }
    pending = [];
  }

  window.zhub.achievements.onUnlocked((payload) => {
    enqueue(payload);
  });
})();
