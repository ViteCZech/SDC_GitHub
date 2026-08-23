import { findCsoPlayerEntry } from './csoRanking';
import { computeTeamSeed } from './doublesSeeding';

/**
 * Potvrzené páry, kde oba mají check-in.
 * @param {object[]} registrations
 */
export function collectCheckedInPairs(registrations) {
  const eligible = (registrations ?? []).filter(
    (r) => r.status === 'CONFIRMED' && r.attendance?.checkedIn === true
  );
  const byId = new Map(eligible.map((r) => [r.id, r]));
  const seen = new Set();
  const pairs = [];
  const leftover = [];

  for (const r of eligible) {
    if (seen.has(r.id)) continue;
    const pairOk = String(r.pair?.status ?? '') === 'CONFIRMED';
    const partnerId = String(r.pair?.partnerRegistrationId ?? '').trim();
    const partner = partnerId ? byId.get(partnerId) : null;
    if (pairOk && partner && String(partner.pair?.status ?? '') === 'CONFIRMED') {
      seen.add(r.id);
      seen.add(partner.id);
      pairs.push([r, partner]);
    } else {
      leftover.push(r);
    }
  }

  return { pairs, leftover, eligibleCount: eligible.length };
}

function memberFromReg(reg, doublesPlayers) {
  const name = String(reg?.player?.name ?? '').trim();
  const csoPlayerId = reg?.player?.csoPlayerId ?? null;
  const hit = findCsoPlayerEntry(doublesPlayers, { name, csoPlayerId });
  return {
    id: reg.id,
    name,
    csoPlayerId,
    nameKey: reg?.player?.nameKey ?? null,
    gender: reg?.player?.gender ?? null,
    doublesRank: hit?.rank != null ? Number(hit.rank) : null,
  };
}

/**
 * @param {object} aReg
 * @param {object} bReg
 * @param {Array<{ rank: number, name: string, regNumber?: string }>} doublesPlayers
 * @param {number} index
 */
export function buildImportedTeam(aReg, bReg, doublesPlayers, index) {
  const members = [memberFromReg(aReg, doublesPlayers), memberFromReg(bReg, doublesPlayers)];
  const seed = computeTeamSeed(members);
  return {
    kind: 'team',
    id: `t${index + 1}`,
    name: `${members[0].name} / ${members[1].name}`,
    memberIds: members.map((m) => m.id),
    members,
    ranking: seed.ranking,
    seedBestMemberRank: seed.seedBestMemberRank,
    seedTieBreak: seed.seedTieBreak,
    csoPlayerId: null,
  };
}

/**
 * @param {object[]} registrations
 * @param {Array<{ rank: number, name: string, regNumber?: string }>} [doublesPlayers]
 */
export function buildImportedTeams(registrations, doublesPlayers = []) {
  const { pairs, leftover } = collectCheckedInPairs(registrations);
  const teams = pairs.map((pair, i) => buildImportedTeam(pair[0], pair[1], doublesPlayers, i));
  return { teams, leftover };
}
