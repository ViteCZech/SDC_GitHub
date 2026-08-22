const STORAGE_PREFIX = 'dartsPrereg_';

/**
 * @typedef {Object} StoredRegistration
 * @property {string} registrationId
 * @property {'CONFIRMED'|'WAITLIST'|'CANCELLED'|'PENDING_PAYMENT'} status
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

/**
 * Všechny přihlášky uložené v tomto prohlížeči (device-scoped).
 * @returns {Array<StoredRegistration & { tournamentId: string }>}
 */
export function listAllStoredRegistrations() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const tournamentId = key.slice(STORAGE_PREFIX.length);
      if (!tournamentId) continue;
      const data = loadStoredRegistration(tournamentId);
      if (data?.registrationId) {
        out.push({ tournamentId, ...data });
      }
    }
  } catch {
    /* private mode */
  }
  return out;
}

const PREFERRED_CITY_KEY = 'dartsPreregPreferredCity';

/** @returns {string} */
export function loadPreferredCity() {
  try {
    return String(localStorage.getItem(PREFERRED_CITY_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

/** @param {string} city */
export function savePreferredCity(city) {
  try {
    const v = String(city ?? '').trim();
    if (!v) localStorage.removeItem(PREFERRED_CITY_KEY);
    else localStorage.setItem(PREFERRED_CITY_KEY, v);
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
