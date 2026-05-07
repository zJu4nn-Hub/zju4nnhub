// auth.js — Login Discord via Supabase OAuth (Fase 8)
//
// Fluxo:
//   1. signInWithDiscord() chama supabase.auth.signInWithOAuth (skipBrowserRedirect)
//      → retorna a URL OAuth do Discord
//   2. Abre BrowserWindow popup com essa URL
//   3. User loga no Discord, Discord redireciona pro callback do Supabase
//   4. Supabase processa e redireciona pra http://localhost/auth-callback#access_token=...
//   5. Interceptamos esse redirect e extraímos os tokens da fragment
//   6. Chama supabase.auth.setSession() — supabase-js salva via storage adapter
//   7. Busca profile da tabela `profiles`
//   8. Broadcasta evento auth:state pra renderer atualizar UI
//
// Storage: arquivo userData/auth-session.json (custom adapter pra rodar fora de browser)

const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const SUPABASE_URL = 'https://ycvihkxwowxoajqwtrdr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljdmloa3h3b3d4b2FqcXd0cmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTY4NDYsImV4cCI6MjA5MzU5Mjg0Nn0.E7R46qLJvWLJ5fhnVbca4LAObti0DfJghA8ZcigiGB0';
const PORT_RANGE = [1421, 1422, 1423, 1424, 1425];
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5min

let supabase = null;
let mainWindow = null;
let stateFile = null;
let cachedProfile = null;

// ============================================================
// FILE STORAGE ADAPTER (substitui localStorage do supabase-js)
// ============================================================
function makeFileStorage(filePath) {
  function readAll() {
    try {
      if (!fs.existsSync(filePath)) return {};
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
    } catch {
      return {};
    }
  }
  function writeAll(data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    } catch (err) {
      console.warn('[auth] storage write falhou:', err.message);
    }
  }
  return {
    getItem: (key) => {
      const all = readAll();
      return all[key] ?? null;
    },
    setItem: (key, value) => {
      const all = readAll();
      all[key] = value;
      writeAll(all);
    },
    removeItem: (key) => {
      const all = readAll();
      delete all[key];
      writeAll(all);
    },
  };
}

function broadcast(event, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auth:state', { event, payload });
  }
}

// ============================================================
// INIT (chamar de main.js no whenReady)
// ============================================================
function init(window) {
  mainWindow = window;
  stateFile = path.join(app.getPath('userData'), 'auth-session.json');

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: makeFileStorage(stateFile),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    realtime: {
      transport: ws,
    },
  });

  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[auth] state:', event, session ? `(user: ${session.user?.email || session.user?.id})` : '(no session)');
    if (event === 'SIGNED_OUT') cachedProfile = null;
    broadcast(event, session ? sanitizeSession(session) : null);
  });

  console.log('[auth] init OK');
}

function sanitizeSession(session) {
  if (!session) return null;
  return {
    user: {
      id: session.user?.id,
      email: session.user?.email,
      // metadata bruto do Discord vem em user_metadata
      metadata: session.user?.user_metadata || {},
    },
    expires_at: session.expires_at,
  };
}

// ============================================================
// SIGN IN WITH DISCORD (via navegador + servidor HTTP local)
// ============================================================
let pendingAuth = null; // { server, port, resolve, reject, timeout }

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>zJu4nn Hub — Login</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#08060d 0%,#1a0d2e 60%,#0a0612 100%);
    color:#f5edff;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  .card{text-align:center;padding:48px 32px;max-width:440px;background:rgba(255,255,255,0.04);
    border:1px solid rgba(255,61,154,0.2);border-radius:18px;
    box-shadow:0 16px 40px rgba(0,0,0,0.4)}
  .icon{font-size:72px;margin-bottom:16px;animation:bounce .6s ease}
  h1{font-size:30px;margin:0 0 12px;
    background:linear-gradient(135deg,#ff3d9a,#a04bff);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  p{opacity:0.8;line-height:1.6;margin:8px 0}
  small{opacity:0.4;display:block;margin-top:20px;font-size:12px}
  @keyframes bounce{0%{transform:scale(0.5)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
</style>
<script>
  // Limpa a URL feiosa imediatamente
  try { history.replaceState({}, '', '/'); } catch(e) {}
  // Tenta fechar a aba (browsers modernos podem bloquear; sem fallback de redirect por enquanto)
  setTimeout(function(){ try { window.close(); } catch(e) {} }, 1800);
</script>
</head>
<body><div class="card"><div class="icon">✅</div>
<h1>Login feito!</h1>
<p>Pode voltar pro <strong>zJu4nn Hub</strong> — você já tá logado.</p>
<small>Pode fechar essa aba.</small>
</div></body></html>`;

const ERROR_HTML = (msg) => `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Erro</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#08060d;color:#f5edff;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
.card{text-align:center;padding:40px;max-width:400px;border:1px solid rgba(255,80,80,0.4);
  border-radius:14px;background:rgba(255,80,80,0.05)}
.icon{font-size:48px;margin-bottom:12px}
h1{color:#ff6b6b;margin:0 0 12px}p{opacity:0.8}
</style></head><body><div class="card"><div class="icon">❌</div>
<h1>Erro no login</h1><p>${msg}</p><p><small>Volta pro app e tenta novamente.</small></p>
</div></body></html>`;

function startCallbackServer() {
  return new Promise((resolve, reject) => {
    let idx = 0;
    function tryPort() {
      if (idx >= PORT_RANGE.length) {
        reject(new Error('Sem portas livres no range 1421-1425'));
        return;
      }
      const port = PORT_RANGE[idx++];
      const server = http.createServer();
      server.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE') tryPort();
        else reject(err);
      });
      server.listen(port, '127.0.0.1', () => resolve({ server, port }));
    }
    tryPort();
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function signInWithDiscord() {
  if (!supabase) throw new Error('auth não inicializado');
  if (pendingAuth) {
    return { error: 'Já tem login em andamento. Cancele antes de tentar de novo.' };
  }

  // 1. Sobe servidor HTTP local
  let server, port;
  try {
    ({ server, port } = await startCallbackServer());
  } catch (err) {
    throw new Error('Falha ao abrir porta local: ' + err.message);
  }
  const redirectTo = `http://localhost:${port}/auth-callback`;
  console.log('[auth] callback server em', redirectTo);

  // 2. Pega URL OAuth do Supabase (PKCE)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: 'identify email',
    },
  });
  if (error) {
    try { server.close(); } catch {}
    throw error;
  }
  const oauthUrl = data?.url;
  if (!oauthUrl) {
    try { server.close(); } catch {}
    throw new Error('Supabase não retornou URL OAuth');
  }

  // 3. Promise que resolve quando o callback chega
  return new Promise((resolve, reject) => {
    function cleanup() {
      pendingAuth = null;
      try { server.close(); } catch {}
      if (timeout) clearTimeout(timeout);
    }
    function fail(err) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
    function ok(result) {
      cleanup();
      // Traz a janela principal pra frente quando login dá certo
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } catch {}
      }
      resolve(result);
    }

    server.on('request', async (req, res) => {
      try {
        const u = new URL(req.url, `http://localhost:${port}`);
        // Bloqueia paths que não são o callback (favicon, etc)
        if (u.pathname !== '/auth-callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const code = u.searchParams.get('code');
        const errParam = u.searchParams.get('error_description') || u.searchParams.get('error');

        if (errParam) {
          const decoded = decodeURIComponent(errParam);
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(ERROR_HTML(escapeHtml(decoded)));
          fail(decoded);
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(ERROR_HTML('Callback sem código de autorização.'));
          fail('Callback sem code');
          return;
        }

        // Troca o code por uma sessão
        const { data: exch, error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchErr) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(ERROR_HTML(escapeHtml(exchErr.message)));
          fail(exchErr);
          return;
        }

        cachedProfile = null;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(SUCCESS_HTML);
        ok(sanitizeSession(exch.session));
      } catch (err) {
        try {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Erro: ' + err.message);
        } catch {}
        fail(err);
      }
    });

    const timeout = setTimeout(() => fail('Login expirou (5min sem resposta)'), OAUTH_TIMEOUT_MS);

    pendingAuth = { server, port, resolve: ok, reject: fail, timeout };

    // 4. Abre URL OAuth no navegador padrão do sistema
    shell.openExternal(oauthUrl).catch((err) => {
      fail(new Error('Não consegui abrir o navegador: ' + err.message));
    });
  });
}

function cancelSignIn() {
  if (!pendingAuth) return { ok: true, idle: true };
  try { pendingAuth.server.close(); } catch {}
  if (pendingAuth.timeout) clearTimeout(pendingAuth.timeout);
  const p = pendingAuth;
  pendingAuth = null;
  try { p.reject(new Error('Login cancelado')); } catch {}
  return { ok: true, cancelled: true };
}

// ============================================================
// SIGN OUT
// ============================================================
async function signOut() {
  if (!supabase) throw new Error('auth não inicializado');
  cachedProfile = null;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return { ok: true };
}

// ============================================================
// GET SESSION
// ============================================================
async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('[auth] getSession error:', error.message);
    return null;
  }
  return sanitizeSession(data?.session);
}

// ============================================================
// GET PROFILE (tabela profiles)
// ============================================================
async function getProfile() {
  if (!supabase) return null;
  if (cachedProfile) return cachedProfile;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, discord_id, username, avatar_url, banner_url, premium, created_at, handle, bio, is_private')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[auth] getProfile error:', error.message);
    return null;
  }
  cachedProfile = data;
  return data;
}

// Exporta o cliente supabase (já autenticado) pra outros módulos (friends.js)
function getSupabaseClient() { return supabase; }

// ============================================================
// UPDATE PROFILE (limited)
// ============================================================
async function updateProfile(patch) {
  if (!supabase) throw new Error('auth não inicializado');
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) throw new Error('Sem sessão');

  const allowed = {};
  if (typeof patch?.username === 'string') allowed.username = patch.username.trim().slice(0, 60);
  if (typeof patch?.avatar_url === 'string' || patch?.avatar_url === null) allowed.avatar_url = patch.avatar_url;
  if (typeof patch?.banner_url === 'string' || patch?.banner_url === null) allowed.banner_url = patch.banner_url;
  // Fase 10: handle / bio / is_private
  if (typeof patch?.handle === 'string' || patch?.handle === null) {
    const h = (patch.handle || '').trim();
    if (h && !/^[a-zA-Z0-9_]{3,20}$/.test(h)) {
      throw new Error('Handle inválido (3-20 chars, letras/números/underscore)');
    }
    allowed.handle = h || null;
  }
  if (typeof patch?.bio === 'string' || patch?.bio === null) {
    allowed.bio = patch.bio == null ? null : String(patch.bio).slice(0, 200);
  }
  if (typeof patch?.is_private === 'boolean') allowed.is_private = patch.is_private;
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update(allowed)
    .eq('id', userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  cachedProfile = data;
  return data;
}

// ============================================================
// UPLOAD IMAGE (avatar / banner) — via imgbb API
// ============================================================
function uploadToImgbb(buffer, filename, apiKey) {
  return new Promise((resolve, reject) => {
    const https = require('node:https');
    // imgbb aceita base64 no campo `image` via form-urlencoded
    const base64 = buffer.toString('base64');
    const form = new URLSearchParams();
    form.append('image', base64);
    if (filename) form.append('name', filename);
    const body = form.toString();

    const req = https.request({
      method: 'POST',
      host: 'api.imgbb.com',
      path: `/1/upload?key=${encodeURIComponent(apiKey)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(chunks);
          if (!json.success) {
            reject(new Error(json.error?.message || `imgbb ${res.statusCode}`));
            return;
          }
          resolve({
            url: json.data?.url || json.data?.display_url,
            deleteUrl: json.data?.delete_url,
            id: json.data?.id,
          });
        } catch (err) {
          reject(new Error('imgbb resp inválida: ' + err.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Upload timeout (30s)')); });
    req.write(body);
    req.end();
  });
}

async function uploadImage({ kind, filePath }) {
  if (!supabase) throw new Error('auth não inicializado');
  if (!['avatar', 'banner'].includes(kind)) throw new Error('kind inválido (avatar|banner)');
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Arquivo não encontrado');

  const settings = require('./settings');
  const imgbbKey = settings.get('imgbbKey');
  if (!imgbbKey) throw new Error('Token imgbb não configurado');

  const buffer = fs.readFileSync(filePath);
  if (buffer.length > 32 * 1024 * 1024) {
    throw new Error('Imagem maior que 32MB');
  }
  const filename = `${kind}-${Date.now()}`;

  const { url } = await uploadToImgbb(buffer, filename, imgbbKey);
  if (!url) throw new Error('imgbb não retornou URL');

  // Atualiza profile com a nova URL
  const patch = kind === 'avatar' ? { avatar_url: url } : { banner_url: url };
  await updateProfile(patch);

  return { ok: true, url };
}

module.exports = {
  init,
  signInWithDiscord,
  cancelSignIn,
  signOut,
  getSession,
  getProfile,
  updateProfile,
  uploadImage,
  getSupabaseClient,
};
