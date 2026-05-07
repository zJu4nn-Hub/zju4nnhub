// auth-gate.js — Gate de login (roda antes de tudo no boot)
//
// Estados:
//   - checking: ao boot, verifica se tem sessão salva
//   - login: sem sessão → mostra botão Discord
//   - waiting: clicou login → popup OAuth tá aberto
//   - error: deu pau, mostra retry
//   - (gate fechado): logado, app shell visível

(() => {
  'use strict';
  if (typeof window.zhub === 'undefined') return;

  const $body = document.body;
  const $gate = document.getElementById('auth-gate');
  const $checking = document.getElementById('auth-gate-checking');
  const $login = document.getElementById('auth-gate-login');
  const $waiting = document.getElementById('auth-gate-waiting');
  const $error = document.getElementById('auth-gate-error');
  const $errorMsg = document.getElementById('auth-gate-error-msg');
  const $loginBtn = document.getElementById('auth-gate-login-btn');
  const $retryBtn = document.getElementById('auth-gate-retry-btn');
  const $cancelBtn = document.getElementById('auth-gate-cancel');

  if (!$gate) return;

  function setState(state) {
    [$checking, $login, $waiting, $error].forEach((el) => {
      if (el) el.hidden = true;
    });
    if (state === 'checking' && $checking) $checking.hidden = false;
    if (state === 'login' && $login) $login.hidden = false;
    if (state === 'waiting' && $waiting) $waiting.hidden = false;
    if (state === 'error' && $error) $error.hidden = false;
  }

  function openApp() {
    // Mostra o boot-loader ANTES de revelar o app-layout — assim não pisca a inicio
    // entre o gate fechar e o boot-loader aparecer.
    try { window.__zhubShowBootLoader?.(); } catch {}
    $body.classList.remove('auth-pending');
    $body.classList.add('auth-ready');
    if ($gate) $gate.hidden = true;
  }

  function closeApp() {
    $body.classList.remove('auth-ready');
    $body.classList.add('auth-pending');
    if ($gate) $gate.hidden = false;
    setState('login');
  }

  async function startLogin() {
    setState('waiting');
    try {
      const result = await window.zhub.auth.signInDiscord();
      if (result?.error) {
        showError(result.error);
        return;
      }
      // Sucesso → SIGNED_IN vem via auth:state, abre app de lá
    } catch (err) {
      showError(err?.message || 'Falha desconhecida');
    }
  }

  function showError(msg) {
    if ($errorMsg) $errorMsg.textContent = msg || 'Erro';
    setState('error');
  }

  $loginBtn?.addEventListener('click', startLogin);
  $retryBtn?.addEventListener('click', () => setState('login'));
  $cancelBtn?.addEventListener('click', async () => {
    try { await window.zhub.auth.cancelSignIn(); } catch {}
    setState('login');
  });

  // ============================================================
  // AUTH STATE LISTENER
  // ============================================================
  window.zhub.auth.onState(({ event, payload }) => {
    console.log('[auth-gate] event:', event);
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (payload) openApp();
    } else if (event === 'INITIAL_SESSION') {
      if (payload) openApp();
      else setState('login');
    } else if (event === 'SIGNED_OUT') {
      closeApp();
    }
  });

  // ============================================================
  // INIT — checa sessão imediatamente no boot
  // ============================================================
  async function init() {
    setState('checking');
    try {
      const session = await window.zhub.auth.getSession();
      if (session) {
        openApp();
      } else {
        setState('login');
      }
    } catch (err) {
      console.warn('[auth-gate] init falhou:', err);
      setState('login');
    }
  }
  init();

  // Expõe pro perfil.js poder reabrir gate ao logout
  window.__zhubShowAuthGate = closeApp;
})();
