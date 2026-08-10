import { normalizeForSearch } from './csoRanking';

/**
 * Identita hráče pro detekci duplicit (ne ranking — ten se mění).
 */

/**
 * Normovaný klíč jména: lowercase, bez diakritiky, bez nadbytečných mezer.
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function normalizePlayerNameKey(name) {
  return normalizeForSearch(name).replace(/\s+/g, ' ').trim();
}

/**
 * Stabilní ID z jména, pokud není ČŠO Reg. #.
 * @param {string|null|undefined} name
 * @returns {string|null}
 */
export function stableNamePlayerId(name) {
  const key = normalizePlayerNameKey(name);
  return key ? `name:${key}` : null;
}

/**
 * @param {{
 *   regNumber?: string|number|null,
 *   stedarId?: string|number|null,
 *   id?: string|number|null,
 *   csoPlayerId?: string|null,
 *   name?: string|null,
 * }|null|undefined} entry
 * @returns {string|null}
 */
export function resolveCsoPlayerId(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const raw =
    entry.csoPlayerId ??
    entry.regNumber ??
    entry.stedarId ??
    entry.id ??
    null;
  if (raw != null && String(raw).trim() !== '') {
    const s = String(raw).trim();
    if (s.startsWith('name:') || s.startsWith('cso:')) return s;
    return `cso:${s}`;
  }
  return stableNamePlayerId(entry.name);
}

/**
 * @param {{ name?: string|null, csoPlayerId?: string|null }|null|undefined} a
 * @param {{ name?: string|null, csoPlayerId?: string|null }|null|undefined} b
 * @returns {boolean}
 */
export function playersAreSame(a, b) {
  if (!a || !b) return false;
  const idA = a.csoPlayerId ? String(a.csoPlayerId).trim() : '';
  const idB = b.csoPlayerId ? String(b.csoPlayerId).trim() : '';
  if (idA && idB) {
    if (idA === idB) return true;
    // Různé ČŠO ID = různí hráči i při stejném jméně
    if (idA.startsWith('cso:') && idB.startsWith('cso:') && idA !== idB) return false;
  }
  const keyA = normalizePlayerNameKey(a.name);
  const keyB = normalizePlayerNameKey(b.name);
  return !!keyA && keyA === keyB;
}

/**
 * @param {Array<{ name?: string, csoPlayerId?: string|null }>} list
 * @param {{ name?: string, csoPlayerId?: string|null }} candidate
 * @param {{ excludeIndex?: number }} [opts]
 * @returns {{ index: number, player: object }|null}
 */
export function findDuplicatePlayer(list, candidate, opts = {}) {
  const excludeIndex = opts.excludeIndex;
  if (!Array.isArray(list) || !candidate) return null;
  for (let i = 0; i < list.length; i++) {
    if (excludeIndex != null && i === excludeIndex) continue;
    if (playersAreSame(list[i], candidate)) {
      return { index: i, player: list[i] };
    }
  }
  return null;
}

/**
 * Aktivní stavy registrace pro kontrolu duplicit v předregistraci.
 */
export const ACTIVE_PREREG_STATUSES = new Set([
  'CONFIRMED',
  'WAITLIST',
  'PENDING_PAYMENT',
]);

/**
 * @param {Array<object>} registrations
 * @param {{ name?: string, csoPlayerId?: string|null }} candidate
 * @returns {object|null} matching registration doc
 */
export function findDuplicateRegistration(registrations, candidate) {
  if (!Array.isArray(registrations) || !candidate) return null;
  for (const reg of registrations) {
    if (!ACTIVE_PREREG_STATUSES.has(reg?.status)) continue;
    const player = reg?.player ?? {};
    if (
      playersAreSame(
        {
          name: player.name,
          csoPlayerId:
            player.csoPlayerId ??
            (player.nameKey ? `name:${player.nameKey}` : null),
        },
        candidate
      )
    ) {
      return reg;
    }
  }
  return null;
}
