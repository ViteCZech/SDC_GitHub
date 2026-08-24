/**
 * QR kódy pro připojení herních tabletů k terčům.
 * URL: /tablet?t=[pin]&board=[n]&token=[boardAuthToken]
 */

export const TABLET_LAST_SEEN_OFFLINE_MS = 30_000;

/** @returns {number} */
export function resolveTotalBoards(tournamentData) {
  return (
    Number(
      tournamentData?.totalBoards ?? tournamentData?.numBoards ?? tournamentData?.boardsCount ?? 0
    ) || 0
  );
}

/** @returns {string} */
export function generateBoardAuthToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 16);
}

/**
 * Doplní chybějící tokeny pro terče 1…totalBoards.
 * @param {object|null|undefined} tournamentData
 * @returns {object|null|undefined}
 */
export function ensureBoardAuthTokens(tournamentData) {
  if (!tournamentData || typeof tournamentData !== 'object') return tournamentData;
  const totalBoards = resolveTotalBoards(tournamentData);
  if (totalBoards <= 0) return tournamentData;

  const existing =
    tournamentData.boardAuthTokens && typeof tournamentData.boardAuthTokens === 'object'
      ? { ...tournamentData.boardAuthTokens }
      : {};

  let changed = false;
  for (let i = 1; i <= totalBoards; i += 1) {
    const key = String(i);
    if (!existing[key]) {
      existing[key] = generateBoardAuthToken();
      changed = true;
    }
  }
  if (!changed && tournamentData.boardAuthTokens) return tournamentData;
  return { ...tournamentData, boardAuthTokens: existing };
}

/**
 * @param {{ pin: string, board: number|string, token: string }} params
 * @returns {string}
 */
export function buildTabletBoardQrUrl({ pin, board, token }) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://simple-dart-counter-12ff2.web.app';
  const url = new URL('/tablet', origin);
  url.searchParams.set('t', String(pin ?? '').trim());
  url.searchParams.set('board', String(board ?? '').trim());
  url.searchParams.set('token', String(token ?? '').trim());
  return url.toString();
}

/**
 * @returns {{ pin: string, board: string, token: string }|null}
 */
export function parseTabletRouteFromUrl() {
  if (typeof window === 'undefined') return null;
  const path = String(window.location.pathname || '').replace(/\/+$/, '').toLowerCase();
  if (path !== '/tablet') return null;

  const params = new URLSearchParams(window.location.search);
  const pin = String(params.get('t') ?? params.get('pin') ?? '').trim();
  const board = String(params.get('board') ?? '').replace(/\D/g, '').slice(0, 2);
  const token = String(params.get('token') ?? '').trim();
  if (!/^\d{4}$/.test(pin) || !board || !token) return null;
  return { pin, board, token };
}

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts?.toMillis === 'function') {
    const ms = Number(ts.toMillis());
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts?.seconds === 'number' && Number.isFinite(ts.seconds)) {
    const nanos = typeof ts?.nanoseconds === 'number' && Number.isFinite(ts.nanoseconds)
      ? ts.nanoseconds
      : 0;
    return Math.floor(ts.seconds * 1000 + nanos / 1e6);
  }
  return null;
}

/** @param {Record<string, { status?: string, lastSeen?: any }>|null|undefined} boardStatuses @param {string|number} board */
export function isBoardOnline(boardStatuses, board, nowMs = Date.now()) {
  const key = String(board);
  const row = boardStatuses?.[key];
  if (!row || row.status !== 'online') return false;
  const lastSeenMs = toMillis(row.lastSeen);
  if (!Number.isFinite(lastSeenMs)) return false;
  return nowMs - lastSeenMs <= TABLET_LAST_SEEN_OFFLINE_MS;
}
