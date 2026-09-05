import { mkdir, rename, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMatchPatchPreservingTerminal } from '../src/utils/matchTerminal.js';

function clone(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function stripSecrets(tournamentData) {
  if (!tournamentData || typeof tournamentData !== 'object') return tournamentData;
  const rest = { ...tournamentData };
  delete rest.tabletPassword;
  delete rest.boardAuthTokens;
  delete rest.lanAdminToken;
  return rest;
}

function matchKey(m) {
  return String(m?.matchId ?? m?.id ?? '');
}

function findGroupMatchIndex(list, matchId) {
  const id = String(matchId ?? '').trim();
  return (list || []).findIndex((m) => matchKey(m) === id);
}

function findBracketMatch(bracket, matchId) {
  const id = String(matchId ?? '').trim();
  const rounds = Array.isArray(bracket) ? bracket : [];
  for (let ri = 0; ri < rounds.length; ri++) {
    const matches = rounds[ri]?.matches || [];
    for (let mi = 0; mi < matches.length; mi++) {
      if (matchKey(matches[mi]) === id) return { ri, mi, match: matches[mi] };
    }
  }
  return null;
}

export function defaultLanDataDir() {
  const fromEnv = String(process.env.SDC_LAN_DATA_DIR ?? '').trim();
  if (fromEnv) return fromEnv;
  return path.join(os.homedir(), '.simple-dart-counter', 'lan-relay');
}

export function createLanStore(dataDir = defaultLanDataDir()) {
  const dir = dataDir;
  const stateFile = path.join(dir, 'state.json');
  const eventsFile = path.join(dir, 'events.jsonl');
  /** @type {Map<string, object>} */
  const tournaments = new Map();
  let ready = Promise.resolve();

  async function persist() {
    await mkdir(dir, { recursive: true });
    const payload = {
      version: 1,
      savedAt: Date.now(),
      tournaments: Object.fromEntries(tournaments),
    };
    const tmp = `${stateFile}.tmp`;
    await writeFile(tmp, JSON.stringify(payload), 'utf8');
    await rename(tmp, stateFile);
  }

  async function appendEvent(kind, pin, extra = {}) {
    try {
      await mkdir(dir, { recursive: true });
      const line = JSON.stringify({ t: Date.now(), kind, pin, ...extra }) + '\n';
      await writeFile(eventsFile, line, { flag: 'a' });
    } catch {
      /* append-only log nesmí shodit relay */
    }
  }

  async function load() {
    if (!existsSync(stateFile)) return;
    try {
      const raw = JSON.parse(await readFile(stateFile, 'utf8'));
      const recs = raw?.tournaments && typeof raw.tournaments === 'object' ? raw.tournaments : {};
      tournaments.clear();
      for (const [pin, rec] of Object.entries(recs)) {
        if (/^\d{4}$/.test(pin) && rec && typeof rec === 'object') tournaments.set(pin, rec);
      }
    } catch (err) {
      console.warn('LAN store load failed:', err);
    }
  }

  ready = load();

  function get(pin) {
    const id = String(pin ?? '').trim();
    return tournaments.get(id) || null;
  }

  function publicSnapshot(pin) {
    const rec = get(pin);
    if (!rec) return null;
    return {
      tournamentData: stripSecrets(rec.tournamentData),
      groups: rec.groups ?? [],
      groupMatches: rec.groupMatches ?? [],
      tournamentBracket: rec.tournamentBracket ?? [],
      boardStatuses: rec.boardStatuses ?? {},
      status: rec.status ?? 'running',
      updatedAt: rec.updatedAt ?? Date.now(),
    };
  }

  function connectedTabletCount(pin) {
    const rec = pin ? get(pin) : null;
    const all = pin
      ? [rec]
      : [...tournaments.values()];
    let n = 0;
    const cutoff = Date.now() - 30_000;
    for (const r of all) {
      if (!r) continue;
      for (const row of Object.values(r.boardStatuses || {})) {
        if (row?.status !== 'online') continue;
        const ms = Number(row.lastSeenMs) || (Number(row.lastSeen?.seconds) || 0) * 1000;
        if (ms >= cutoff) n += 1;
      }
    }
    return n;
  }

  function listPins() {
    return [...tournaments.keys()];
  }

  async function put(pin, state, adminToken) {
    const id = String(pin ?? '').trim();
    if (!/^\d{4}$/.test(id)) throw Object.assign(new Error('Neplatný PIN turnaje.'), { code: 400 });
    const token = String(adminToken ?? '').trim();
    if (!token) throw Object.assign(new Error('Chybí admin token.'), { code: 401 });
    await ready;
    const prev = get(id);
    if (prev && prev.adminToken && prev.adminToken !== token) {
      throw Object.assign(new Error('Neplatný admin token.'), { code: 403 });
    }
    const next = {
      adminToken: prev?.adminToken || token,
      tabletPassword:
        state?.tournamentData?.tabletPassword != null
          ? String(state.tournamentData.tabletPassword).trim().slice(0, 5)
          : prev?.tabletPassword || '',
      boardAuthTokens:
        state?.tournamentData?.boardAuthTokens && typeof state.tournamentData.boardAuthTokens === 'object'
          ? clone(state.tournamentData.boardAuthTokens, {})
          : prev?.boardAuthTokens || {},
      tournamentData: clone(state?.tournamentData ?? prev?.tournamentData ?? null, null),
      groups: clone(state?.groups ?? prev?.groups ?? [], []),
      groupMatches: clone(state?.groupMatches ?? prev?.groupMatches ?? [], []),
      tournamentBracket: clone(state?.tournamentBracket ?? prev?.tournamentBracket ?? [], []),
      boardStatuses: prev?.boardStatuses ?? {},
      status: state?.status || prev?.status || 'running',
      updatedAt: Date.now(),
    };
    tournaments.set(id, next);
    await persist();
    await appendEvent('put', id);
    return publicSnapshot(id);
  }

  async function remove(pin, adminToken) {
    const id = String(pin ?? '').trim();
    await ready;
    const prev = get(id);
    if (!prev) return false;
    if (prev.adminToken && prev.adminToken !== String(adminToken ?? '').trim()) {
      throw Object.assign(new Error('Neplatný admin token.'), { code: 403 });
    }
    tournaments.delete(id);
    await persist();
    await appendEvent('delete', id);
    return true;
  }

  function authorizeTablet(rec, opts = {}) {
    if (!rec) return { ok: false, reason: 'not_found' };
    const token = String(opts.boardToken ?? opts.token ?? '').trim();
    const password = String(opts.tabletPassword ?? '').trim().slice(0, 5);
    const board = String(opts.board ?? '').replace(/\D/g, '').slice(0, 2);
    const tokens = rec.boardAuthTokens && typeof rec.boardAuthTokens === 'object' ? rec.boardAuthTokens : {};
    if (token && board && tokens[board] && tokens[board] === token) return { ok: true };
    if (token && Object.values(tokens).includes(token)) return { ok: true };
    if (rec.tabletPassword && password && rec.tabletPassword === password) return { ok: true };
    if (!rec.tabletPassword && !Object.keys(tokens).length) return { ok: true };
    if (!rec.tabletPassword && !token) return { ok: true };
    return { ok: false, reason: 'bad_password' };
  }

  async function setPresence(pin, board, opts = {}) {
    const id = String(pin ?? '').trim();
    await ready;
    const rec = get(id);
    if (!rec) throw Object.assign(new Error('Turnaj nenalezen.'), { code: 404 });
    const access = authorizeTablet(rec, { ...opts, board });
    if (!access.ok) throw Object.assign(new Error('Neplatná autorizace tabletu.'), { code: 403, reason: access.reason });
    const boardStr = String(board ?? '').replace(/\D/g, '').slice(0, 2);
    const status = opts.status === 'offline' ? 'offline' : 'online';
    rec.boardStatuses = { ...(rec.boardStatuses || {}) };
    rec.boardStatuses[boardStr] = {
      status,
      lastSeen: { seconds: nowSeconds() },
      lastSeenMs: Date.now(),
    };
    rec.updatedAt = Date.now();
    await persist();
    await appendEvent('presence', id, { board: boardStr, status });
    return publicSnapshot(id);
  }

  async function applyTabletMatch(pin, matchType, matchId, matchUpdates, opts = {}) {
    const id = String(pin ?? '').trim();
    await ready;
    const rec = get(id);
    if (!rec) throw Object.assign(new Error('Turnaj nenalezen.'), { code: 404 });
    const access = authorizeTablet(rec, opts);
    if (!access.ok) throw Object.assign(new Error('Neplatná autorizace tabletu.'), { code: 403, reason: access.reason });
    const mt = matchType === 'bracket' ? 'bracket' : matchType === 'group' ? 'group' : null;
    if (!mt) throw Object.assign(new Error('Neplatný typ zápasu.'), { code: 400 });
    const patches = clone(matchUpdates, {});
    if (!patches || typeof patches !== 'object' || !Object.keys(patches).length) {
      throw Object.assign(new Error('Chybí data zápasu.'), { code: 400 });
    }
    if (mt === 'group') {
      const idx = findGroupMatchIndex(rec.groupMatches, matchId);
      if (idx < 0) throw Object.assign(new Error('Zápas nenalezen.'), { code: 404 });
      rec.groupMatches = rec.groupMatches.map((m, i) =>
        i === idx ? applyMatchPatchPreservingTerminal(m, patches) : m
      );
    } else {
      const found = findBracketMatch(rec.tournamentBracket, matchId);
      if (!found) throw Object.assign(new Error('Zápas nenalezen.'), { code: 404 });
      rec.tournamentBracket = rec.tournamentBracket.map((round, ri) => {
        if (ri !== found.ri) return round;
        return {
          ...round,
          matches: (round.matches || []).map((m, mi) =>
            mi === found.mi ? applyMatchPatchPreservingTerminal(m, patches) : m
          ),
        };
      });
    }
    rec.updatedAt = Date.now();
    await persist();
    await appendEvent('match', id, { matchType: mt, matchId: String(matchId) });
    return publicSnapshot(id);
  }

  return {
    ready,
    get,
    publicSnapshot,
    connectedTabletCount,
    listPins,
    put,
    remove,
    authorizeTablet,
    setPresence,
    applyTabletMatch,
    secrets(pin) {
      const rec = get(pin);
      if (!rec) return null;
      return {
        tabletPassword: rec.tabletPassword || '',
        boardAuthTokens: rec.boardAuthTokens || null,
      };
    },
  };
}
