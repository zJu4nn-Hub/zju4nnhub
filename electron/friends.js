// friends.js — Sistema de Amigos via Supabase (Fase 10)
//
// Usa o cliente Supabase já autenticado de auth.js. Operações:
//   - search por handle (@username) ou discord_id
//   - send/respond/cancel/remove/block requests
//   - list friends + pending requests (separa SENT/RECEIVED)
//   - getProfile de outro user (respeita is_private)
//   - Realtime: postgres_changes em friendships + presence channels p2p
//
// Eventos broadcastados pro renderer:
//   'friends:state' { kind: 'requestReceived'|'requestSent'|'accepted'|'rejected'|'removed', other }
//   'friends:listChanged'
//   'friends:achComparisonResult' { friendId, appid, requestId, unlocked }

'use strict';

const auth = require('./auth');

let mainWindow = null;
let supabase = null;
let myUserId = null;
let mainChannel = null;       // friendships notification channel
let p2pChannels = new Map();  // friendId → channel (compare achievements)
let onUnlockHook = null;      // pra mostrar overlay (recebe payload)

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setOnFriendOverlayHook(fn) { onUnlockHook = typeof fn === 'function' ? fn : null; }

// ============================================================
// HELPERS DE NORMALIZAÇÃO DE PAR (user_a < user_b)
// ============================================================
function normalizePair(myId, otherId) {
  if (myId < otherId) return { user_a: myId, user_b: otherId };
  return { user_a: otherId, user_b: myId };
}

// ============================================================
// INIT — chamado de main.js após auth.init
// ============================================================
async function init(window) {
  mainWindow = window;
  supabase = auth.getSupabaseClient();
  if (!supabase) {
    console.warn('[friends] supabase client indisponível');
    return;
  }
  // Aguarda sessão pra setar userId
  await wireSessionAndChannels();
  console.log('[friends] init OK');
}

async function wireSessionAndChannels() {
  try {
    const { data } = await supabase.auth.getSession();
    const newUserId = data?.session?.user?.id || null;
    if (newUserId === myUserId && mainChannel) return; // sem mudança
    if (mainChannel) {
      try { await supabase.removeChannel(mainChannel); } catch {}
      mainChannel = null;
    }
    myUserId = newUserId;
    if (!myUserId) return;
    setupMainChannel();
  } catch (err) {
    console.warn('[friends] wireSession falhou:', err.message);
  }
}

// Realtime: escuta mudanças em friendships onde estamos envolvidos
function setupMainChannel() {
  if (!supabase || !myUserId) return;
  mainChannel = supabase.channel(`friendships:${myUserId}`);
  // Filtra rows onde user_a OU user_b é eu (Supabase Realtime filter syntax)
  // Como filter aceita só uma condição, escutamos tudo e filtramos no client
  mainChannel
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        (payload) => onFriendshipChange(payload))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('[friends] realtime subscribed');
    });
}

function onFriendshipChange(payload) {
  const row = payload.new || payload.old;
  if (!row) return;
  if (row.user_a !== myUserId && row.user_b !== myUserId) return; // não é nosso

  const isMyRequest = row.requester_id === myUserId;
  const otherId = row.user_a === myUserId ? row.user_b : row.user_a;

  if (payload.eventType === 'INSERT' && row.status === 'pending') {
    if (!isMyRequest) {
      // Recebi um pedido novo
      hydrateAndNotify(otherId, 'requestReceived', row);
    } else {
      hydrateAndNotify(otherId, 'requestSent', row);
    }
  } else if (payload.eventType === 'UPDATE' && row.status === 'accepted') {
    hydrateAndNotify(otherId, 'accepted', row);
    // Cria channel P2P pra comparison
    ensureP2PChannel(otherId);
  } else if (payload.eventType === 'DELETE') {
    broadcast('friends:state', { kind: 'removed', otherId });
    broadcast('friends:listChanged', {});
  }
}

async function hydrateAndNotify(otherId, kind, row) {
  // Busca profile pra ter username+avatar pro toast
  const profile = await fetchPublicProfile(otherId);
  broadcast('friends:state', { kind, other: profile, row });
  broadcast('friends:listChanged', {});
  // Toast overlay
  if (onUnlockHook && (kind === 'requestReceived' || kind === 'accepted')) {
    onUnlockHook({ kind, other: profile });
  }
}

// ============================================================
// PROFILE LOOKUP (público, simples — busca um único perfil)
// ============================================================
async function fetchPublicProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, discord_id, username, avatar_url, banner_url, premium, handle, bio, is_private')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[friends] fetchPublicProfile erro:', error.message);
    return null;
  }
  return data;
}

// ============================================================
// SEARCH — by Discord ID OU @handle
// ============================================================
async function searchUsers(query) {
  if (!supabase) throw new Error('Supabase não disponível');
  if (!query || typeof query !== 'string') return [];
  const q = query.trim().replace(/^@/, '').toLowerCase();
  if (q.length < 2) return [];

  // Se input é só dígitos, match em discord_id; senão usa handle/username
  const isDigitsOnly = /^\d+$/.test(q);

  let supabaseQuery;
  if (isDigitsOnly) {
    supabaseQuery = supabase
      .from('profiles')
      .select('id, discord_id, username, avatar_url, handle, premium, is_private')
      .eq('discord_id', q)
      .limit(5);
  } else {
    // Busca em handle (case-insensitive). Como Supabase ilike funciona em colunas text:
    supabaseQuery = supabase
      .from('profiles')
      .select('id, discord_id, username, avatar_url, handle, premium, is_private')
      .or(`handle.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(10);
  }
  const { data, error } = await supabaseQuery;
  if (error) {
    console.warn('[friends] search erro:', error.message);
    return [];
  }
  // Filtra eu mesmo do resultado
  return (data || []).filter((p) => p.id !== myUserId);
}

// ============================================================
// SEND REQUEST
// ============================================================
async function sendRequest(targetUserId) {
  if (!supabase || !myUserId) throw new Error('Não autenticado');
  if (!targetUserId || targetUserId === myUserId) throw new Error('Alvo inválido');
  const { user_a, user_b } = normalizePair(myUserId, targetUserId);
  const { error } = await supabase
    .from('friendships')
    .insert({ user_a, user_b, status: 'pending', requester_id: myUserId });
  if (error) {
    if (error.code === '23505') throw new Error('Já existe pedido ou amizade com esse user');
    throw error;
  }
  return { ok: true };
}

// ============================================================
// RESPOND REQUEST (accept/reject)
// ============================================================
async function respondRequest({ requesterId, accept }) {
  if (!supabase || !myUserId) throw new Error('Não autenticado');
  if (!requesterId) throw new Error('requesterId ausente');
  const { user_a, user_b } = normalizePair(myUserId, requesterId);
  if (accept) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('user_a', user_a).eq('user_b', user_b)
      .eq('status', 'pending');
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_a', user_a).eq('user_b', user_b)
      .eq('status', 'pending');
    if (error) throw error;
  }
  return { ok: true };
}

// ============================================================
// CANCEL REQUEST (eu enviei e quero cancelar)
// ============================================================
async function cancelRequest(targetUserId) {
  if (!supabase || !myUserId) throw new Error('Não autenticado');
  const { user_a, user_b } = normalizePair(myUserId, targetUserId);
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_a', user_a).eq('user_b', user_b)
    .eq('requester_id', myUserId)
    .eq('status', 'pending');
  if (error) throw error;
  return { ok: true };
}

// ============================================================
// REMOVE FRIEND (desfaz amizade)
// ============================================================
async function removeFriend(friendId) {
  if (!supabase || !myUserId) throw new Error('Não autenticado');
  const { user_a, user_b } = normalizePair(myUserId, friendId);
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_a', user_a).eq('user_b', user_b);
  if (error) throw error;
  // Fecha P2P channel se houver
  closeP2PChannel(friendId);
  return { ok: true };
}

// ============================================================
// BLOCK USER
// ============================================================
async function blockUser(targetId) {
  if (!supabase || !myUserId) throw new Error('Não autenticado');
  const { user_a, user_b } = normalizePair(myUserId, targetId);
  const { data: existing } = await supabase
    .from('friendships').select('*')
    .eq('user_a', user_a).eq('user_b', user_b).maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'blocked', requester_id: myUserId })
      .eq('user_a', user_a).eq('user_b', user_b);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('friendships')
      .insert({ user_a, user_b, status: 'blocked', requester_id: myUserId });
    if (error) throw error;
  }
  return { ok: true };
}

// ============================================================
// LIST FRIENDS
// ============================================================
async function listFriends() {
  if (!supabase || !myUserId) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a, user_b, status, created_at, responded_at')
    .or(`user_a.eq.${myUserId},user_b.eq.${myUserId}`)
    .eq('status', 'accepted');
  if (error) {
    console.warn('[friends] listFriends erro:', error.message);
    return [];
  }
  // Pra cada row, pega o "outro" id e busca profile
  const otherIds = (data || []).map((r) => r.user_a === myUserId ? r.user_b : r.user_a);
  if (!otherIds.length) return [];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, discord_id, username, avatar_url, handle, premium, is_private')
    .in('id', otherIds);
  const profMap = new Map((profiles || []).map((p) => [p.id, p]));
  return (data || []).map((r) => {
    const otherId = r.user_a === myUserId ? r.user_b : r.user_a;
    return {
      friendId: otherId,
      profile: profMap.get(otherId) || null,
      since: r.responded_at || r.created_at,
    };
  }).filter((x) => x.profile);
}

// ============================================================
// LIST PENDING REQUESTS (sent + received)
// ============================================================
async function listPending() {
  if (!supabase || !myUserId) return { received: [], sent: [] };
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a, user_b, status, created_at, requester_id')
    .or(`user_a.eq.${myUserId},user_b.eq.${myUserId}`)
    .eq('status', 'pending');
  if (error) {
    console.warn('[friends] listPending erro:', error.message);
    return { received: [], sent: [] };
  }
  const otherIds = (data || []).map((r) => r.user_a === myUserId ? r.user_b : r.user_a);
  if (!otherIds.length) return { received: [], sent: [] };
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, discord_id, username, avatar_url, handle, premium')
    .in('id', otherIds);
  const profMap = new Map((profiles || []).map((p) => [p.id, p]));
  const result = { received: [], sent: [] };
  for (const r of (data || [])) {
    const otherId = r.user_a === myUserId ? r.user_b : r.user_a;
    const item = {
      otherId,
      profile: profMap.get(otherId) || null,
      requestedAt: r.created_at,
    };
    if (!item.profile) continue;
    if (r.requester_id === myUserId) result.sent.push(item);
    else result.received.push(item);
  }
  return result;
}

// ============================================================
// GET FRIEND PROFILE — respeita privacy
// ============================================================
async function getUserProfile(userId) {
  const profile = await fetchPublicProfile(userId);
  if (!profile) return null;
  // Verifica se somos amigos
  const isFriend = userId !== myUserId ? await checkFriendship(userId) : true;
  // Privacy:
  //  - Se não privado: tudo público
  //  - Se privado: só amigo confirmado vê detalhes (campos retornados não mudam aqui — quem
  //    consome decide o que mostrar com base em isFriend)
  return { ...profile, _viewerIsFriend: isFriend, _viewerIsSelf: userId === myUserId };
}

async function checkFriendship(otherId) {
  if (!supabase || !myUserId) return false;
  const { user_a, user_b } = normalizePair(myUserId, otherId);
  const { data } = await supabase
    .from('friendships')
    .select('status')
    .eq('user_a', user_a).eq('user_b', user_b)
    .eq('status', 'accepted')
    .maybeSingle();
  return !!data;
}

// ============================================================
// SET HANDLE / SET PRIVACY (delegate pra auth.updateProfile)
// ============================================================
async function setHandle(handle) {
  return auth.updateProfile({ handle });
}
async function setPrivacy(isPrivate) {
  return auth.updateProfile({ is_private: !!isPrivate });
}

// ============================================================
// COMPARE ACHIEVEMENTS (P2P via Realtime broadcast)
// ============================================================
const pendingCompareRequests = new Map(); // requestId → { resolve, timeout }

function ensureP2PChannel(friendId) {
  if (!supabase || !myUserId) return null;
  if (p2pChannels.has(friendId)) return p2pChannels.get(friendId);
  const sortedKey = [myUserId, friendId].sort().join('-');
  const ch = supabase.channel(`p2p:${sortedKey}`, {
    config: { broadcast: { self: false } },
  });
  ch.on('broadcast', { event: 'ach:request' }, async ({ payload }) => {
    // Amigo me pediu progress de um appid → respondo com meu local
    if (!payload || !payload.appid || !payload.requestId) return;
    try {
      const achievements = require('./achievements');
      const key = `st_${payload.appid}`;
      const progress = achievements.getProgressSync(key);
      const fullProgress = await achievements.getProgress(key, { fetch: false });
      ch.send({
        type: 'broadcast',
        event: 'ach:response',
        payload: {
          requestId: payload.requestId,
          appid: payload.appid,
          unlocked: fullProgress?.list?.filter((a) => a.unlocked).map((a) => ({ name: a.name, unlockTime: a.unlockTime })) || [],
          total: fullProgress?.total || 0,
          unlockedCount: fullProgress?.unlocked || 0,
        },
      });
    } catch (err) {
      console.warn('[friends] ach:request resp falhou:', err.message);
    }
  });
  ch.on('broadcast', { event: 'ach:response' }, ({ payload }) => {
    if (!payload?.requestId) return;
    const pending = pendingCompareRequests.get(payload.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingCompareRequests.delete(payload.requestId);
      pending.resolve(payload);
    }
  });
  ch.subscribe();
  p2pChannels.set(friendId, ch);
  return ch;
}

function closeP2PChannel(friendId) {
  const ch = p2pChannels.get(friendId);
  if (ch) {
    try { supabase.removeChannel(ch); } catch {}
    p2pChannels.delete(friendId);
  }
}

async function compareAchievements({ friendId, appid }) {
  if (!supabase || !myUserId) throw new Error('Não autenticado');
  if (!friendId || !appid) throw new Error('friendId/appid ausentes');
  const isFriend = await checkFriendship(friendId);
  if (!isFriend) throw new Error('Não são amigos');

  const ch = ensureP2PChannel(friendId);
  if (!ch) throw new Error('Channel falhou');
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCompareRequests.delete(requestId);
      reject(new Error('Timeout: amigo offline ou não respondeu'));
    }, 8000);
    pendingCompareRequests.set(requestId, { resolve, timeout });
  });

  ch.send({
    type: 'broadcast',
    event: 'ach:request',
    payload: { appid, requestId },
  });

  try {
    const friendData = await responsePromise;
    return {
      friendId,
      appid,
      friend: {
        unlocked: friendData.unlocked || [],
        total: friendData.total,
        unlockedCount: friendData.unlockedCount,
      },
    };
  } catch (err) {
    return { friendId, appid, error: err.message };
  }
}

// ============================================================
// SHUTDOWN
// ============================================================
async function shutdown() {
  if (mainChannel) {
    try { await supabase.removeChannel(mainChannel); } catch {}
    mainChannel = null;
  }
  for (const [, ch] of p2pChannels) {
    try { await supabase.removeChannel(ch); } catch {}
  }
  p2pChannels.clear();
}

module.exports = {
  init,
  setOnFriendOverlayHook,
  searchUsers,
  sendRequest,
  respondRequest,
  cancelRequest,
  removeFriend,
  blockUser,
  listFriends,
  listPending,
  getUserProfile,
  setHandle,
  setPrivacy,
  compareAchievements,
  shutdown,
};
