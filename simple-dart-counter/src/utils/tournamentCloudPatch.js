import { deepEqual } from './deepEqual';

const PATCH_FIELDS = ['tournamentData', 'groups', 'groupMatches', 'tournamentBracket', 'status', 'ownerUid'];

/**
 * Diff živého turnaje: zapsat jen změněná top-level pole, nebo celý dokument při create.
 * `lastUpdated` se přidá jen když se opravdu něco změnilo.
 *
 * @param {object|null|undefined} existing data z Firestore (nebo null když dokument není)
 * @param {object} next payload k zápisu (už bez tajemství)
 * @returns {{ mode: 'create', payload: object } | { mode: 'update', patch: object } | { mode: 'skip' }}
 */
export function buildTournamentFieldPatch(existing, next) {
  if (!next || typeof next !== 'object') return { mode: 'skip' };
  if (!existing || typeof existing !== 'object') {
    return { mode: 'create', payload: next };
  }

  const patch = {};
  for (const field of PATCH_FIELDS) {
    const left = existing[field] ?? null;
    const right = next[field] ?? null;
    if (!deepEqual(left, right)) {
      patch[field] = next[field];
    }
  }

  if (Object.keys(patch).length === 0) return { mode: 'skip' };
  if (next.lastUpdated != null) patch.lastUpdated = next.lastUpdated;
  return { mode: 'update', patch };
}
