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
 * @property {boolean} [isPaid]
 * @property {boolean} [refundDue]
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

const SETUP_TEMPLATES_KEY = 'dartsPreregSetupTemplates_v1';
const MAX_SETUP_TEMPLATES = 30;

/**
 * Vzor nastavení předregistrace (bez termínů, uzávěrky a PIN).
 * @typedef {Object} PreregSetupTemplate
 * @property {string} id
 * @property {string} title
 * @property {string} savedAt
 * @property {boolean} includeBank
 * @property {object} fields
 */

/** @returns {PreregSetupTemplate[]} */
export function loadPreregSetupTemplates() {
  try {
    const raw = localStorage.getItem(SETUP_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === 'object' && row.id && row.title);
  } catch {
    return [];
  }
}

/** @param {PreregSetupTemplate[]} list */
export function savePreregSetupTemplates(list) {
  try {
    const next = Array.isArray(list) ? list.slice(0, MAX_SETUP_TEMPLATES) : [];
    localStorage.setItem(SETUP_TEMPLATES_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {PreregSetupTemplate} template
 * @returns {PreregSetupTemplate[]}
 */
export function upsertPreregSetupTemplate(template) {
  const list = loadPreregSetupTemplates();
  const idx = list.findIndex(
    (row) =>
      row.id === template.id ||
      String(row.title || '').trim().toLowerCase() === String(template.title || '').trim().toLowerCase()
  );
  const next = [...list];
  if (idx >= 0) next[idx] = { ...template, id: list[idx].id };
  else next.unshift(template);
  savePreregSetupTemplates(next);
  return loadPreregSetupTemplates();
}

/** @param {string} templateId */
export function deletePreregSetupTemplate(templateId) {
  const next = loadPreregSetupTemplates().filter((row) => row.id !== templateId);
  savePreregSetupTemplates(next);
  return next;
}
