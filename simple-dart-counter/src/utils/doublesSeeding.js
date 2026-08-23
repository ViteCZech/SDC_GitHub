/**
 * Nasazení dvojic: součet ČP – dvojice (rankingId=6), ne singles.
 * 1) nižší součet obou ranků
 * 2) při shodě pár s lepším (nižším) individuálním rankem
 * 3) pořád shoda → uložený náhodný seedTieBreak
 * Bez ranku = nenasazení, až za nasazenými.
 */

/**
 * @param {Array<{ doublesRank?: number|null }>} members
 * @param {number} [seedTieBreak]
 */
export function computeTeamSeed(members, seedTieBreak) {
  const ranks = (members ?? [])
    .map((m) => (m?.doublesRank != null ? Number(m.doublesRank) : null))
    .filter((r) => r != null && Number.isFinite(r));
  const bothRanked = ranks.length === 2 && (members ?? []).length === 2;
  const tie =
    seedTieBreak != null && Number.isFinite(Number(seedTieBreak))
      ? Number(seedTieBreak)
      : Math.random();
  return {
    ranking: bothRanked ? ranks[0] + ranks[1] : null,
    seedBestMemberRank: bothRanked ? Math.min(ranks[0], ranks[1]) : null,
    seedTieBreak: tie,
  };
}

/**
 * @param {{ ranking?: number|null, seedBestMemberRank?: number|null, seedTieBreak?: number|null, name?: string, id?: string }} a
 * @param {{ ranking?: number|null, seedBestMemberRank?: number|null, seedTieBreak?: number|null, name?: string, id?: string }} b
 */
export function compareTeamSeeds(a, b) {
  const ra = a?.ranking != null && Number.isFinite(Number(a.ranking)) ? Number(a.ranking) : null;
  const rb = b?.ranking != null && Number.isFinite(Number(b.ranking)) ? Number(b.ranking) : null;
  if (ra != null && rb != null && ra !== rb) return ra - rb;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;

  const ba =
    a?.seedBestMemberRank != null && Number.isFinite(Number(a.seedBestMemberRank))
      ? Number(a.seedBestMemberRank)
      : null;
  const bb =
    b?.seedBestMemberRank != null && Number.isFinite(Number(b.seedBestMemberRank))
      ? Number(b.seedBestMemberRank)
      : null;
  if (ba != null && bb != null && ba !== bb) return ba - bb;
  if (ba != null && bb == null) return -1;
  if (ba == null && bb != null) return 1;

  const ta = Number(a?.seedTieBreak);
  const tb = Number(b?.seedTieBreak);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;

  const nameCmp = String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'cs');
  if (nameCmp !== 0) return nameCmp;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'cs');
}

/** @param {object} player */
export function isTeamPlayer(player) {
  return player?.kind === 'team' && Array.isArray(player?.members) && player.members.length >= 2;
}
