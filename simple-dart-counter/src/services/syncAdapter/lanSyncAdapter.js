import {
  mergeAdminBracketFromTabletCloud,
  mergeAdminGroupMatchesFromTabletCloud,
} from '../tournamentSync';
import { LAN_PATHS, LAN_WS_TYPES, SYNC_ADAPTER_METHODS } from './lanProtocol.js';
import {
  generateLanAdminToken,
  lanHttpBase,
  lanWsBase,
  localOrganizerLanConfig,
  readLanAdminToken,
  rememberLanAdminToken,
  rememberLanRelayConfig,
  resolveLanRelayConfig,
} from './lanRelayConfig.js';

function lanUnsupported(name) {
  return async () => {
    throw new Error(`LAN režim nepodporuje ${name}. Použijte cloud turnaj.`);
  };
}

function backoffMs(attempt) {
  return Math.min(8000, 400 * 2 ** Math.min(attempt, 5));
}

/**
 * @param {{ host?: string, port?: number, protocol?: string, fetch?: typeof fetch, WebSocket?: typeof WebSocket }} [opts]
 */
export function createLanSyncAdapter(opts = {}) {
  const cfg = opts.host
    ? {
        host: opts.host,
        port: Number(opts.port) || 8787,
        protocol: opts.protocol === 'https' ? 'https' : 'http',
      }
    : resolveLanRelayConfig() || localOrganizerLanConfig(opts.port);
  rememberLanRelayConfig(cfg);

  const httpBase = lanHttpBase(cfg);
  const wsBase = lanWsBase(cfg);
  const fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const WsImpl = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  const adminTokens = new Map();

  function tokenFor(pin) {
    const id = String(pin ?? '').trim();
    const stored = readLanAdminToken(id) || adminTokens.get(id) || '';
    if (stored) return stored;
    const created = generateLanAdminToken();
    adminTokens.set(id, created);
    rememberLanAdminToken(id, created);
    return created;
  }

  function headers(pin, extra = {}) {
    const token = tokenFor(pin) || extra.adminToken || '';
    const h = { Accept: 'application/json', ...extra.headers };
    if (extra.json) h['Content-Type'] = 'application/json';
    if (token) h['X-Admin-Token'] = token;
    if (extra.boardToken) h['X-Board-Token'] = extra.boardToken;
    if (extra.tabletPassword) h['X-Tablet-Password'] = extra.tabletPassword;
    return h;
  }

  async function request(path, init = {}) {
    if (!fetchImpl) throw new Error('Fetch API není dostupná.');
    const { pin, json, adminToken, boardToken, tabletPassword, headers: extraHeaders, ...rest } = init;
    const res = await fetchImpl(`${httpBase}${path}`, {
      ...rest,
      keepalive: false,
      headers: {
        ...headers(pin, { json, adminToken, boardToken, tabletPassword, headers: extraHeaders }),
        ...(extraHeaders || {}),
      },
    });
    let body = null;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(body?.error || `LAN HTTP ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  const adapter = {
    mode: 'lan',
    isBackendReady() {
      return !!httpBase;
    },

    listenTournament(pin, callback) {
      const id = String(pin ?? '').trim();
      let closed = false;
      let ws = null;
      let attempt = 0;
      let timer = null;
      let reconnectTimer = null;
      let seenSnapshot = false;

      const notify = (data) => {
        if (data) seenSnapshot = true;
        try {
          callback(data);
        } catch {
          /* ignore subscriber errors */
        }
      };

      const isMissing = (err) =>
        Number(err?.status) === 404 || err?.body?.error === 'not_found';

      const pullSnapshot = () => {
        request(LAN_PATHS.tournament(id), { pin: id })
          .then((body) => {
            if (!closed) notify(body?.data ?? null);
          })
          .catch((err) => {
            if (closed) return;
            // 404 před prvním uložením = čekáme na turnaj, ne „konec turnaje“.
            if (isMissing(err)) {
              if (seenSnapshot) notify(null);
              return;
            }
          });
      };

      const connect = () => {
        if (closed) return;
        if (!WsImpl) {
          pullSnapshot();
          timer = setInterval(pullSnapshot, 800);
          return;
        }
        try {
          ws = new WsImpl(`${wsBase}${LAN_PATHS.ws}?pin=${encodeURIComponent(id)}`);
        } catch {
          reconnectTimer = setTimeout(connect, backoffMs(attempt++));
          return;
        }
        ws.onopen = () => {
          attempt = 0;
          pullSnapshot();
        };
        ws.onmessage = (ev) => {
          try {
            const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : JSON.parse(String(ev.data));
            if (msg?.type === LAN_WS_TYPES.snapshot) notify(msg.data ?? null);
            else if (msg?.type === LAN_WS_TYPES.deleted) notify(null);
          } catch {
            /* ignore malformed */
          }
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          if (closed) return;
          reconnectTimer = setTimeout(connect, backoffMs(attempt++));
        };
      };

      pullSnapshot();
      connect();
      return () => {
        closed = true;
        if (timer) clearInterval(timer);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    },

    async syncTournament(pin, tournamentState) {
      const id = String(pin ?? '').trim();
      if (!/^\d{4}$/.test(id)) return;
      const token = tokenFor(id);
      const body = await request(LAN_PATHS.tournament(id), {
        method: 'PUT',
        pin: id,
        adminToken: token,
        json: true,
        body: JSON.stringify({ ...tournamentState, adminToken: token }),
      });
      if (body?.adminToken) {
        adminTokens.set(id, body.adminToken);
        rememberLanAdminToken(id, body.adminToken);
      }
      return body?.data ?? null;
    },

    async deleteTournament(pin) {
      const id = String(pin ?? '').trim();
      await request(LAN_PATHS.tournament(id), {
        method: 'DELETE',
        pin: id,
        json: true,
        body: JSON.stringify({}),
      });
    },

    async archiveTournament(_ownerId, pin) {
      const id = String(pin ?? '').trim();
      await request(LAN_PATHS.archive(id), {
        method: 'POST',
        pin: id,
        json: true,
        body: JSON.stringify({}),
      });
    },

    async verifyTournamentPin(pin) {
      const id = String(pin ?? '').trim();
      if (!/^\d{4}$/.test(id)) return false;
      try {
        const body = await request(LAN_PATHS.verify(id), { method: 'POST', pin: id, json: true, body: '{}' });
        return body?.ok === true;
      } catch {
        return false;
      }
    },

    async verifyTabletAccess(pin, tabletPassword, opts = {}) {
      const id = String(pin ?? '').trim();
      if (!/^\d{4}$/.test(id)) return { ok: false, reason: 'not_found' };
      try {
        const body = await request(LAN_PATHS.tabletVerify(id), {
          method: 'POST',
          pin: id,
          json: true,
          tabletPassword,
          boardToken: opts.boardToken,
          body: JSON.stringify({
            tabletPassword: String(tabletPassword ?? '').trim().slice(0, 5) || undefined,
            board: opts.board,
            boardToken: opts.boardToken,
            token: opts.boardToken,
          }),
        });
        if (body?.ok === true) return { ok: true };
        return { ok: false, reason: body?.reason === 'bad_password' ? 'bad_password' : 'not_found' };
      } catch {
        return { ok: false, reason: 'error' };
      }
    },

    async loadTournamentSecrets(pin) {
      const id = String(pin ?? '').trim();
      try {
        const body = await request(LAN_PATHS.secrets(id), { pin: id });
        return body?.data ?? null;
      } catch {
        return null;
      }
    },

    async registerTabletPresence(pin, board, token, opts = {}) {
      const id = String(pin ?? '').trim();
      await request(LAN_PATHS.presence(id), {
        method: 'POST',
        pin: id,
        json: true,
        boardToken: token,
        tabletPassword: opts.tabletPassword,
        body: JSON.stringify({
          board,
          token,
          boardToken: token,
          tabletPassword: opts.tabletPassword,
          status: opts.status === 'offline' ? 'offline' : 'online',
        }),
      });
    },

    async updateMatchFromTablet(pin, matchType, matchId, matchUpdates, opts = {}) {
      const id = String(pin ?? '').trim();
      await request(LAN_PATHS.match(id), {
        method: 'POST',
        pin: id,
        json: true,
        boardToken: opts.boardToken,
        tabletPassword: opts.tabletPassword,
        body: JSON.stringify({
          matchType,
          matchId,
          matchUpdates,
          board: opts.board,
          boardToken: opts.boardToken,
          tabletPassword: opts.tabletPassword,
        }),
      });
    },

    mergeGroupMatchesFromCloud(prevLocal, cloudList) {
      return mergeAdminGroupMatchesFromTabletCloud(prevLocal, cloudList);
    },
    mergeBracketFromCloud(prevLocal, cloudBracket) {
      return mergeAdminBracketFromTabletCloud(prevLocal, cloudBracket);
    },

    heartbeatTabletPresence(presence) {
      return adapter.registerTabletPresence(presence?.pin, presence?.board, presence?.boardToken, {
        tabletPassword: presence?.tabletPassword,
        status: 'online',
      });
    },
    releaseTabletPresence(presence) {
      return adapter.registerTabletPresence(presence?.pin, presence?.board, presence?.boardToken, {
        tabletPassword: presence?.tabletPassword,
        status: 'offline',
      });
    },
    releaseTabletPresenceOnUnload(presence) {
      const pin = String(presence?.pin ?? '').trim();
      const board = String(presence?.board ?? '').replace(/\D/g, '').slice(0, 2);
      if (!fetchImpl || !/^\d{4}$/.test(pin) || !board) return;
      try {
        fetchImpl(`${httpBase}${LAN_PATHS.presence(pin)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Board-Token': String(presence?.boardToken ?? '').trim(),
            'X-Tablet-Password': String(presence?.tabletPassword ?? '').trim().slice(0, 5),
          },
          body: JSON.stringify({
            board,
            token: presence?.boardToken,
            tabletPassword: presence?.tabletPassword,
            status: 'offline',
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* ignore unload */
      }
    },

    listenPublicFeed(callback) {
      try {
        callback([]);
      } catch {
        /* ignore */
      }
      return () => {};
    },
    async getPublicResultById() {
      return null;
    },
    getOnlineGameById: lanUnsupported('online hry'),
    cancelOnlineGame: lanUnsupported('online hry'),
    abandonOnlineGameSession: lanUnsupported('online hry'),
    async savePublicMatch() {
      return null;
    },
    async deletePublicMatch() {
      return undefined;
    },
    async deletePublicMatchesForUser() {
      return undefined;
    },
    async getOwnerTournamentData() {
      return null;
    },
    async listTournamentRegistrations() {
      return [];
    },
    createManualRegistration: lanUnsupported('předregistraci'),
    adminConfirmPair: lanUnsupported('předregistraci'),
    async verifyAdminInviteToken() {
      return false;
    },
    claimAdminInviteAccess: lanUnsupported('předregistraci'),
  };

  Object.defineProperty(adapter, 'config', {
    value: Object.freeze({ ...cfg }),
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return Object.freeze(adapter);
}

export { SYNC_ADAPTER_METHODS };
