/** Typy soutěže předregistrace — zrcadlí functions/src/pairing.ts */

export const COMPETITION_TYPES = ['singles', 'doubles', 'mixed', 'random_doubles'];

/**
 * @param {unknown} raw
 * @returns {'singles'|'doubles'|'mixed'|'random_doubles'}
 */
export function normalizeCompetitionType(raw) {
  const v = String(raw ?? 'singles');
  if (v === 'doubles' || v === 'mixed' || v === 'random_doubles') return v;
  return 'singles';
}

/** @param {string} type */
export function allowsPairing(type) {
  return type === 'doubles' || type === 'mixed';
}

/** @param {string} type */
export function usesTeamCapacity(type) {
  return type === 'doubles' || type === 'mixed';
}

/**
 * @param {object} tournament
 * @returns {number}
 */
export function occupiedSlots(tournament) {
  const type = normalizeCompetitionType(tournament?.meta?.competitionType);
  if (usesTeamCapacity(type)) {
    return Number(tournament?.counters?.confirmedTeams ?? 0) || 0;
  }
  return Number(tournament?.counters?.confirmed ?? 0) || 0;
}

/**
 * @param {object} tournament
 * @returns {number|null}
 */
export function parseCapacity(tournament) {
  const raw = tournament?.meta?.capacity;
  const n = raw == null ? null : Number(raw);
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Počet potvrzených dvojic ze seznamu přihlášek (admin panel).
 * @param {object[]} registrations
 */
export function countConfirmedTeams(registrations) {
  const keys = new Set();
  for (const r of registrations ?? []) {
    if (String(r?.status ?? '') !== 'CONFIRMED') continue;
    if (String(r?.pair?.status ?? '') !== 'CONFIRMED') continue;
    const partnerId = String(r?.pair?.partnerRegistrationId ?? '').trim();
    if (!partnerId) continue;
    keys.add([String(r.id), partnerId].sort().join(':'));
  }
  return keys.size;
}

/**
 * @param {object} tournament
 * @returns {'pair'|'split'}
 */
export function normalizeFeeMode(tournament) {
  return String(tournament?.finance?.feeMode ?? '') === 'pair' ? 'pair' : 'split';
}
