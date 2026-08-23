import { findCsoPlayerEntry } from './csoRanking.js';
import { computeTeamSeed } from './doublesSeeding.js';
import { normalizeCompetitionType } from './preregCompetition.js';

/**
 * Fisher–Yates. `rng` vrací [0, 1) — default Math.random.
 * @param {Array} arr
 * @param {() => number} [rng]
 */
export function shuffleInPlace(arr, rng = Math.random) {
  const list = arr;
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/**
 * @param {object} player
 * @param {Array<{ rank: number, name: string, regNumber?: string }>} [doublesPlayers]
 */
export function memberFromSinglesPlayer(player, doublesPlayers = []) {
  const name = String(player?.name ?? '').trim();
  const csoPlayerId = player?.csoPlayerId ?? null;
  const hit = findCsoPlayerEntry(doublesPlayers, { name, csoPlayerId });
  const fromList = hit?.rank != null ? Number(hit.rank) : null;
  const stored =
    player?.doublesRank != null && Number.isFinite(Number(player.doublesRank))
      ? Number(player.doublesRank)
      : player?.ranking != null && Number.isFinite(Number(player.ranking))
        ? Number(player.ranking)
        : null;
  return {
    id: player?.id || csoPlayerId || name,
    name,
    csoPlayerId,
    nameKey: player?.nameKey ?? null,
    gender: player?.gender ?? null,
    doublesRank: fromList ?? stored,
  };
}

/**
 * @param {object} a
 * @param {object} b
 * @param {number} index
 * @param {Array} [doublesPlayers]
 */
export function buildDrawnTeam(a, b, index, doublesPlayers = []) {
  const members = [memberFromSinglesPlayer(a, doublesPlayers), memberFromSinglesPlayer(b, doublesPlayers)];
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

function isSinglesSlot(p) {
  return p && String(p.name ?? '').trim() && p.kind !== 'team';
}

/**
 * Los párů z jednotlivců. Lichý počet → jeden rezervní (mimo soupisku dvojic).
 * @param {object[]} roster
 * @param {{ doublesPlayers?: Array, rng?: () => number }} [opts]
 * @returns {{ teams: object[], reserve: object|null, roster: object[] }}
 */
export function drawRandomPairs(roster, opts = {}) {
  const doublesPlayers = opts.doublesPlayers ?? [];
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const people = (roster ?? []).filter(isSinglesSlot);
  const shuffled = shuffleInPlace([...people], rng);
  let reserve = null;
  if (shuffled.length % 2 === 1) {
    reserve = shuffled.pop();
  }
  const teams = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    teams.push(buildDrawnTeam(shuffled[i], shuffled[i + 1], teams.length, doublesPlayers));
  }
  return { teams, reserve, roster: people };
}

/**
 * @param {object[]} teams
 * @param {object|null} [reserve]
 * @returns {object[]}
 */
export function flattenPairDraw(teams, reserve = null) {
  const people = [];
  for (const team of teams ?? []) {
    for (const m of team?.members ?? []) {
      const name = String(m?.name ?? '').trim();
      if (!name) continue;
      people.push({
        name,
        ranking: null,
        id: m.id,
        csoPlayerId: m.csoPlayerId ?? null,
        nameKey: m.nameKey ?? null,
        gender: m.gender ?? null,
      });
    }
  }
  if (reserve && String(reserve.name ?? '').trim()) {
    people.push({
      name: String(reserve.name).trim(),
      ranking: null,
      id: reserve.id,
      csoPlayerId: reserve.csoPlayerId ?? null,
      nameKey: reserve.nameKey ?? null,
      gender: reserve.gender ?? null,
    });
  }
  return people;
}

/** @param {object} draft */
export function isRandomDoublesDraft(draft) {
  return normalizeCompetitionType(draft?.competitionType) === 'random_doubles';
}

/** Páry jsou vylosované — v `players` jsou jen týmy. */
export function isPairDrawComplete(players) {
  const list = players ?? [];
  return list.length > 0 && list.every((p) => p?.kind === 'team');
}
