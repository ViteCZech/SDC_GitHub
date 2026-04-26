/** Lokální persistence pro obnovu online relace po pádu prohlížeče (fáze Reconnecting). */

export const LS_LAST_ONLINE_GAME_ID = 'lastOnlineGameId';
export const LS_LAST_ONLINE_ROLE = 'lastOnlineRole';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function persistLastOnlineSession(gameId, role) {
  const id = String(gameId || '').trim();
  if (!id) return;
  const r = role === 'p2' ? 'p2' : 'p1';
  safeSet(LS_LAST_ONLINE_GAME_ID, id);
  safeSet(LS_LAST_ONLINE_ROLE, r);
}

export function clearLastOnlineSession() {
  safeRemove(LS_LAST_ONLINE_GAME_ID);
  safeRemove(LS_LAST_ONLINE_ROLE);
}

/** @returns {{ gameId: string, role: 'p1'|'p2' } | null} */
export function readLastOnlineSession() {
  const gameId = safeGet(LS_LAST_ONLINE_GAME_ID);
  const roleRaw = safeGet(LS_LAST_ONLINE_ROLE);
  if (!gameId || !roleRaw) return null;
  const role = roleRaw === 'p2' ? 'p2' : 'p1';
  return { gameId: String(gameId).trim(), role };
}
