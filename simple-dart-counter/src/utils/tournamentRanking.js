/**
 * Plovoucí ČŠO ranking vs. snapshot v losu turnaje.
 */

/**
 * Má turnaj aktivní snímek rankingu z vygenerovaného losu?
 * @param {object|null|undefined} tournamentData
 */
export function hasDrawRankingSnapshot(tournamentData) {
  return !!(tournamentData && tournamentData.rankingSnapshot);
}

/**
 * Los / ranking je trvale uzamčen (odehraný zápas).
 * @param {object|null|undefined} tournamentData
 * @param {boolean} [isTournamentLive]
 */
export function isTournamentRankingLocked(tournamentData, isTournamentLive = false) {
  if (isTournamentLive) return true;
  return !!tournamentData?.rankingsLocked;
}

/**
 * Hráči z draftu / turnaje bez zmrazených ranků (pro živý režim).
 * @param {Array<{ id?: string, name: string, ranking?: number|null }>|null|undefined} players
 */
export function stripPlayerRankingsForLive(players) {
  return (players || [])
    .map((p, i) => ({
      ...p,
      id: p?.id ?? `p${i + 1}`,
      name: String(p?.name ?? '').trim(),
      ranking: p?.kind === 'team' ? p.ranking ?? null : null,
    }))
    .filter((p) => p.name);
}

/**
 * Po prvním zápase — uzamknout snapshot (idempotentní).
 * @param {object|null|undefined} tournamentData
 */
export function withRankingsLocked(tournamentData) {
  if (!tournamentData || tournamentData.rankingsLocked) return tournamentData;
  return { ...tournamentData, rankingsLocked: true };
}
