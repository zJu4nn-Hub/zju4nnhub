// friend-profile.js — Modal de perfil de amigo + comparação de conquistas (Fase 10)
//
// API exposta:
//   window.zhubOpenFriendProfile(userId)
//
// Renderiza:
//   - Avatar + handle + bio + premium badge
//   - "Ver na Steam Store" / "Comparar conquistas" se applicable
//   - Privacy: se is_private && não somos amigos → mostra placeholder

(() => {
  'use strict';
  if (typeof window.zhub === 'undefined' || !window.zhub.friends) return;

  const $modal = document.getElementById('friend-profile-modal');
  const $close = document.getElementById('friend-profile-close');
  const $content = document.getElementById('friend-profile-content');
  const $cmpModal = document.getElementById('ach-compare-modal');
  const $cmpClose = document.getElementById('ach-compare-close');
  const $cmpTitle = document.getElementById('ach-compare-title');
  const $cmpContent = document.getElementById('ach-compare-content');

  if (!$modal) return;

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg) { if (typeof window.zhubToast === 'function') window.zhubToast(msg); }

  let currentFriend = null;

  function open() { $modal.hidden = false; }
  function close() { $modal.hidden = true; currentFriend = null; }
  $close?.addEventListener('click', close);
  $modal?.addEventListener('click', (e) => { if (e.target === $modal) close(); });

  function openCmp() { $cmpModal.hidden = false; }
  function closeCmp() { $cmpModal.hidden = true; }
  $cmpClose?.addEventListener('click', closeCmp);
  $cmpModal?.addEventListener('click', (e) => { if (e.target === $cmpModal) closeCmp(); });

  // ============================================================
  // Render perfil de amigo
  // ============================================================
  async function load(userId) {
    if (!userId) return;
    open();
    $content.innerHTML = '<div class="friend-profile-loading">Carregando…</div>';
    let profile;
    try {
      profile = await window.zhub.friends.getProfile(userId);
    } catch (err) {
      $content.innerHTML = `<div class="friend-profile-error">❌ ${escapeHtml(err.message || 'Erro')}</div>`;
      return;
    }
    if (!profile) {
      $content.innerHTML = '<div class="friend-profile-error">Perfil não encontrado.</div>';
      return;
    }
    currentFriend = profile;
    renderProfile(profile);
  }

  function renderProfile(p) {
    const name = p.handle ? `@${p.handle}` : (p.username || 'Usuário');
    const realName = p.username && p.handle ? p.username : '';
    const banner = p.banner_url || '';
    const avatar = p.avatar_url || '';
    const tier = p.premium ? 'Premium' : 'Gratuito';
    const tierCls = p.premium ? 'fp-tier-premium' : 'fp-tier-free';
    const bio = p.bio ? escapeHtml(p.bio) : '';

    const isPrivate = p.is_private && !p._viewerIsFriend && !p._viewerIsSelf;

    $content.innerHTML = `
      <div class="fp-hero" ${banner ? `style="background-image:url('${banner}')"` : ''}>
        <div class="fp-hero-overlay"></div>
        <div class="fp-hero-content">
          ${avatar
            ? `<img class="fp-avatar" src="${avatar}" alt="" />`
            : `<div class="fp-avatar fp-avatar-empty">👤</div>`}
          <div class="fp-info">
            <div class="fp-name">${escapeHtml(name)}</div>
            ${realName ? `<div class="fp-realname">${escapeHtml(realName)}</div>` : ''}
            <div class="fp-tier ${tierCls}">${tier}</div>
            ${bio ? `<div class="fp-bio">${bio}</div>` : ''}
          </div>
        </div>
      </div>
      ${isPrivate ? `
        <div class="fp-private-msg">🔒 Este perfil é privado. Adicione como amigo pra ver biblioteca e conquistas.</div>
      ` : `
        <div class="fp-actions">
          ${!p._viewerIsSelf ? `
            ${p._viewerIsFriend
              ? `<button class="btn btn-ghost fp-btn-danger" data-action="remove">Remover amigo</button>`
              : `<button class="btn btn-primary" data-action="send">＋ Adicionar amigo</button>`}
          ` : ''}
        </div>
        <div class="fp-section" id="fp-shared-games-section" hidden>
          <h4>🎮 Jogos em comum</h4>
          <div id="fp-shared-games-list" class="fp-shared-games"></div>
        </div>
      `}
    `;

    if (!isPrivate && p._viewerIsFriend && !p._viewerIsSelf) {
      loadSharedGames(p.id);
    }

    $content.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        btn.disabled = true;
        try {
          if (action === 'send') {
            const r = await window.zhub.friends.send(p.id);
            if (r?.error) toast('❌ ' + r.error);
            else { toast('✓ Pedido enviado'); load(p.id); }
          } else if (action === 'remove') {
            const r = await window.zhub.friends.remove(p.id);
            if (r?.error) toast('❌ ' + r.error);
            else { toast('Amigo removido'); close(); }
          }
        } catch (err) {
          toast('❌ ' + (err.message || 'Falha'));
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // ============================================================
  // Jogos em comum (com appid) — pra comparar conquistas
  // ============================================================
  async function loadSharedGames(friendId) {
    const $section = document.getElementById('fp-shared-games-section');
    const $list = document.getElementById('fp-shared-games-list');
    if (!$section || !$list) return;
    $section.hidden = false;
    $list.innerHTML = '<div class="fp-loading">Carregando jogos…</div>';

    try {
      // Lista MEUS jogos com appid (Steam Tools + manual + downloads resolvidos)
      const myLua = await window.zhub.steamTools.listLua().catch(() => []);
      const myManual = await window.zhub.manualLibrary.list().catch(() => []);
      const stIds = (myLua || []).map((g) => g.appid).filter(Boolean);
      const manualIds = (myManual || []).map((m) => m.appid).filter(Boolean);
      const allMyAppids = Array.from(new Set([...stIds, ...manualIds]));

      if (!allMyAppids.length) {
        $list.innerHTML = '<div class="fp-loading">Você não tem jogos com appid.</div>';
        return;
      }

      // Pra cada appid, fetch schema (cache) + checar nome
      const cards = [];
      for (const appid of allMyAppids.slice(0, 30)) {
        try {
          const schema = await window.zhub.achievements.getCachedSchema(appid);
          if (!schema) continue;
          cards.push({
            appid,
            name: schema.displayName || `App ${appid}`,
            cover: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
          });
        } catch {}
      }

      if (!cards.length) {
        $list.innerHTML = '<div class="fp-loading">Nenhum jogo com schema disponível.</div>';
        return;
      }

      $list.innerHTML = cards.map((g) => `
        <div class="fp-shared-game" data-appid="${g.appid}" data-name="${escapeHtml(g.name)}">
          <img class="fp-shared-cover" src="${g.cover}" alt="" loading="lazy" />
          <div class="fp-shared-name">${escapeHtml(g.name)}</div>
          <button class="fp-shared-cmp-btn" data-cmp-appid="${g.appid}" data-cmp-name="${escapeHtml(g.name)}">🏆 Comparar</button>
        </div>
      `).join('');

      $list.querySelectorAll('.fp-shared-cmp-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const appid = parseInt(btn.dataset.cmpAppid, 10);
          const name = btn.dataset.cmpName;
          openCompareModal(friendId, appid, name);
        });
      });
    } catch (err) {
      $list.innerHTML = `<div class="fp-loading">❌ ${escapeHtml(err.message || 'Erro')}</div>`;
    }
  }

  // ============================================================
  // Modal de comparação
  // ============================================================
  async function openCompareModal(friendId, appid, gameName) {
    if ($cmpTitle) $cmpTitle.textContent = `🏆 ${gameName}`;
    $cmpContent.innerHTML = '<div class="friend-profile-loading">Solicitando dados do amigo…</div>';
    openCmp();

    // Busca em paralelo: meu progresso + amigo via P2P
    const [myProgress, friendData] = await Promise.all([
      window.zhub.achievements.getProgress(`st_${appid}`).catch(() => null),
      window.zhub.friends.compareAchievements({ friendId, appid }).catch((err) => ({ error: err.message })),
    ]);

    if (friendData?.error) {
      $cmpContent.innerHTML = `<div class="friend-profile-error">❌ ${escapeHtml(friendData.error)}</div>`;
      return;
    }

    renderCompare(myProgress, friendData);
  }

  function renderCompare(my, friendData) {
    const myList = my?.list || [];
    const friendUnlockedSet = new Set((friendData?.friend?.unlocked || []).map((u) => u.name?.toLowerCase()));

    // Combina por nome do achievement (case-insensitive)
    const combined = myList.map((a) => ({
      name: a.name,
      displayName: a.displayName,
      description: a.description,
      icon: a.unlocked || friendUnlockedSet.has(a.name.toLowerCase()) ? a.icon : a.icongray,
      myUnlocked: !!a.unlocked,
      friendUnlocked: friendUnlockedSet.has(a.name.toLowerCase()),
    }));

    // Sort: ambos unlocked → meu unlocked → amigo unlocked → ambos locked
    combined.sort((a, b) => {
      const sa = (a.myUnlocked ? 2 : 0) + (a.friendUnlocked ? 1 : 0);
      const sb = (b.myUnlocked ? 2 : 0) + (b.friendUnlocked ? 1 : 0);
      return sb - sa || (a.displayName || '').localeCompare(b.displayName || '');
    });

    const myCount = combined.filter((c) => c.myUnlocked).length;
    const friendCount = combined.filter((c) => c.friendUnlocked).length;
    const total = combined.length;

    $cmpContent.innerHTML = `
      <div class="ach-compare-header">
        <div class="ach-compare-stat ach-compare-stat-me">
          <div class="ach-compare-stat-label">Você</div>
          <div class="ach-compare-stat-value">${myCount}/${total}</div>
        </div>
        <div class="ach-compare-stat ach-compare-stat-friend">
          <div class="ach-compare-stat-label">Amigo</div>
          <div class="ach-compare-stat-value">${friendCount}/${total}</div>
        </div>
      </div>
      <div class="ach-compare-grid">
        ${combined.map((a) => `
          <div class="ach-compare-card">
            <img class="ach-compare-icon" src="${a.icon}" alt="" loading="lazy" />
            <div class="ach-compare-info">
              <div class="ach-compare-name">${escapeHtml(a.displayName || a.name)}</div>
              <div class="ach-compare-desc">${escapeHtml(a.description || '')}</div>
            </div>
            <div class="ach-compare-status">
              <div class="ach-compare-cell ${a.myUnlocked ? 'ach-cmp-yes' : 'ach-cmp-no'}" title="Você">${a.myUnlocked ? '✓' : '✗'}</div>
              <div class="ach-compare-cell ${a.friendUnlocked ? 'ach-cmp-yes' : 'ach-cmp-no'}" title="Amigo">${a.friendUnlocked ? '✓' : '✗'}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================
  window.zhubOpenFriendProfile = load;
})();
