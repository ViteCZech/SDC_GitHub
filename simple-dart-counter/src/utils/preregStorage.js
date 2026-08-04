const STORAGE_PREFIX = 'dartsPrereg_';

/**
 * @typedef {Object} StoredRegistration
 * @property {string} registrationId
 * @property {'CONFIRMED'|'WAITLIST'} status
 * @property {string|null} variableSymbol
 * @property {'QR'|'CASH'|null} paymentMethod
 * @property {string} playerName
 * @property {string|null} [email]
 * @property {string|null} [phone]
 * @property {number|null} [amount]
 * @property {string} savedAt
 */

/**
 * @param {string} tournamentId
 * @returns {StoredRegistration|null}
 */
export function loadStoredRegistration(tournamentId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tournamentId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} tournamentId
 * @param {StoredRegistration} data
 */
export function saveStoredRegistration(tournamentId, data) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tournamentId}`, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {string} tournamentId
 */
export function clearStoredRegistration(tournamentId) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${tournamentId}`);
  } catch {}
}

const ADMIN_INVITE_PREFIX = 'dartsPreregAdminInvite_';

/**
 * @typedef {{ token: string, verifiedAt: string }} AdminInviteSession
 */

/**
 * @param {string} tournamentId
 * @returns {AdminInviteSession|null}
 */
export function loadAdminInviteSession(tournamentId) {
  try {
    const raw = localStorage.getItem(`${ADMIN_INVITE_PREFIX}${tournamentId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string} tournamentId
 * @param {string} token
 */
export function saveAdminInviteSession(tournamentId, token) {
  try {
    localStorage.setItem(
      `${ADMIN_INVITE_PREFIX}${tournamentId}`,
      JSON.stringify({ token, verifiedAt: new Date().toISOString() })
    );
  } catch {}
}

/**
 * @param {string} tournamentId
 */
export function clearAdminInviteSession(tournamentId) {
  try {
    localStorage.removeItem(`${ADMIN_INVITE_PREFIX}${tournamentId}`);
  } catch {}
}
