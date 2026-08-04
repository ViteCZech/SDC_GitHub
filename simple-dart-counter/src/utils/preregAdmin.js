/**
 * SHA-256 hash admin PINu (ukládá se do Firestore, ne plaintext).
 * @param {string} pin
 * @returns {Promise<string>}
 */
export async function hashAdminPin(pin) {
  const normalized = String(pin ?? '').trim();
  if (!normalized) return '';
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @returns {string}
 */
export function generateInviteToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return `${Date.now()}${Math.random().toString(16).slice(2)}`.slice(0, 16);
}

/**
 * @param {string|null|undefined} val
 * @returns {number|null}
 */
export function parseOptionalNumber(val) {
  if (val === '' || val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string|null|undefined} val
 * @returns {string|null}
 */
export function parseOptionalString(val) {
  const s = String(val ?? '').trim();
  return s || null;
}

/**
 * @param {string|null|undefined} localDateTime - hodnota z input type="datetime-local"
 * @returns {Date|null}
 */
export function parseOptionalDateTimeLocal(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string} tournamentId
 * @returns {string}
 */
export function getPublicRegistrationUrl(tournamentId) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/t/${encodeURIComponent(tournamentId)}`;
}

/**
 * @param {string} tournamentId
 * @param {string} inviteToken
 * @returns {string}
 */
export function getAdminInviteUrl(tournamentId, inviteToken) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/t/${encodeURIComponent(tournamentId)}?invite=${encodeURIComponent(inviteToken)}`;
}

/**
 * @returns {{ tournamentId: string, inviteToken: string|null }|null}
 */
export function parsePreregRouteFromUrl() {
  if (typeof window === 'undefined') return null;
  const match = String(window.location.pathname || '').match(/^\/t\/([^/]+)\/?$/i);
  if (!match) return null;
  const tournamentId = decodeURIComponent(match[1]).trim();
  const params = new URLSearchParams(window.location.search || '');
  const inviteToken = params.get('invite') || params.get('admin');
  return {
    tournamentId,
    inviteToken: inviteToken ? String(inviteToken).trim() : null,
  };
}
