// boot-loader.js — Tela de loading após auth (Fase 9)
//
// Após o auth-gate fechar, mostra tela de loading bonita por 1-2s.
// Durante isso, pre-carrega capas dos jogos pra que perfil/biblioteca abram instantâneo.

(() => {
  'use strict';
  if (typeof window.zhub === 'undefined') return;

  const $loader = document.getElementById('boot-loader');
  const $bar = document.getElementById('boot-loader-bar');
  const $msg = document.getElementById('boot-loader-msg');
  if (!$loader) return;

  const MIN_DURATION = 800;  // mostra ao menos 800ms pra não piscar
  const MAX_DURATION = 5000; // nunca passa de 5s (espera capas pesadas baixarem)

  let didRun = false;

  function setProgress(pct, message) {
    if ($bar) $bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if ($msg && message) $msg.textContent = message;
  }

  function preloadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
      // Timeout pra não travar
      setTimeout(() => resolve(false), 4000);
    });
  }

  async function run() {
    if (didRun) return;
    didRun = true;
    const startedAt = Date.now();
    $loader.hidden = false;
    setProgress(10, 'Preparando sua biblioteca…');

    // Anima barra suavemente até 80% baseada em tempo (visual feedback)
    const barTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(80, 10 + (elapsed / MAX_DURATION) * 70);
      if ($bar) $bar.style.width = `${pct}%`;
    }, 80);

    try {
      // Espera biblioteca.js terminar de carregar dados + capas (com timeout MAX_DURATION)
      while (!window.__zhubBibliotecaReady && (Date.now() - startedAt) < MAX_DURATION) {
        await new Promise((r) => setTimeout(r, 60));
      }
      setProgress(100, 'Pronto!');
    } catch (err) {
      console.warn('[boot-loader]', err);
    }

    clearInterval(barTimer);

    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, MIN_DURATION - elapsed);
    setTimeout(() => {
      $loader.classList.add('fading');
      setTimeout(() => { $loader.hidden = true; }, 420);
    }, wait);
  }

  // Mostra o overlay imediatamente (sem rodar a lógica ainda) — pra evitar flash
  // do conteúdo da view inicio quando auth-gate fecha antes do run() disparar.
  function showOverlay() {
    if ($loader && $loader.hidden) {
      $loader.classList.remove('fading');
      $loader.hidden = false;
    }
  }
  // Expõe pro auth-gate chamar logo antes de abrir o app
  window.__zhubShowBootLoader = showOverlay;

  // Dispara quando auth confirma sessão
  window.zhub.auth.onState(({ event, payload }) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && payload && !didRun) {
      showOverlay();
      run();
    }
  });

  // Fallback: se já tem sessão (boot rápido), dispara após 100ms
  setTimeout(async () => {
    if (didRun) return;
    try {
      const session = await window.zhub.auth.getSession();
      if (session && !didRun) {
        showOverlay();
        run();
      }
    } catch {}
  }, 100);

  // Garante max duration mesmo se tudo falhar
  setTimeout(() => {
    if (didRun) return;
    didRun = true;
    $loader.classList.add('fading');
    setTimeout(() => { $loader.hidden = true; }, 420);
  }, MAX_DURATION);
})();
