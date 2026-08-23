import { isTeamPlayer } from './doublesSeeding.js';

/**
 * X01 dvojice: dva týmy po dvou hráčích.
 * V legu se střídají strany (p1 ↔ p2); uvnitř strany se po každém jejich hodu
 * střídají oba členové. Začínající dvojice musí vybrat házejícího před prvním hodem.
 * Druhá dvojice může vybrat hned, nebo až po odhození soupeře.
 */

/**
 * @param {object} member
 * @param {string} side
 * @param {number} index
 */
export function normalizeMember(member, side, index) {
  const name = String(member?.name ?? '').trim() || `${side}-${index + 1}`;
  const id = String(member?.id ?? member?.csoPlayerId ?? `${side}-m${index}`).trim();
  return {
    id,
    name,
    side,
    csoPlayerId: member?.csoPlayerId ?? null,
  };
}

/**
 * @param {object} settings
 * @param {'p1'|'p2'} side
 * @returns {Array<{id: string, name: string, side: string}>}
 */
export function getTeamMembers(settings, side) {
  const raw = settings?.teams?.[side]?.members;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 2).map((m, i) => normalizeMember(m, side, i));
}

/** @param {object} settings */
export function isDoublesMatch(settings) {
  if (settings?.doubles === true) {
    return getTeamMembers(settings, 'p1').length >= 2 && getTeamMembers(settings, 'p2').length >= 2;
  }
  return false;
}

/** @param {object} state */
export function hasBothStartingThrowers(state) {
  return Boolean(state?.startingThrowers?.p1 && state?.startingThrowers?.p2);
}

/**
 * Strana, která teď musí vybrat házejícího (nebo null, pokud se smí házet).
 * @param {object} state
 * @param {object} [settings]
 * @returns {'p1'|'p2'|null}
 */
export function pendingThrowerSide(state, settings) {
  if (state?.winner) return null;
  const side = state?.currentPlayer === 'p2' ? 'p2' : 'p1';
  if (state?.startingThrowers?.[side]) return null;
  if (state?.throwerId && settings && sideOfMember(settings, state.throwerId) === side) {
    return null;
  }
  return side;
}

/**
 * @param {Array<{id: string}>} members
 * @param {string} memberId
 */
export function otherMemberId(members, memberId) {
  if (!Array.isArray(members) || members.length < 2) return memberId || null;
  const id = String(memberId ?? '');
  const other = members.find((m) => String(m.id) !== id);
  return other?.id ?? members[0].id;
}

/**
 * @param {object} settings
 * @param {string} memberId
 * @returns {'p1'|'p2'|null}
 */
export function sideOfMember(settings, memberId) {
  const id = String(memberId ?? '');
  if (!id) return null;
  if (getTeamMembers(settings, 'p1').some((m) => m.id === id)) return 'p1';
  if (getTeamMembers(settings, 'p2').some((m) => m.id === id)) return 'p2';
  return null;
}

/**
 * @param {object} settings
 * @param {string} memberId
 */
export function memberName(settings, memberId) {
  const id = String(memberId ?? '');
  if (!id) return '';
  const all = [...getTeamMembers(settings, 'p1'), ...getTeamMembers(settings, 'p2')];
  return all.find((m) => m.id === id)?.name ?? '';
}

/**
 * Odvoď, kdo hází teď, z historie legu (nejnovější první, stejně jako GameX01).
 * @param {object} settings
 * @param {Array<{player?: string, throwerId?: string}>} newestFirstHistory
 * @param {'p1'|'p2'} startingPlayer
 * @param {{p1?: string, p2?: string}} startingThrowers
 */
export function deriveThrowerFromHistory(settings, newestFirstHistory, startingPlayer, startingThrowers) {
  const startSide = startingPlayer === 'p2' ? 'p2' : 'p1';
  const starters = {
    p1: startingThrowers?.p1 || null,
    p2: startingThrowers?.p2 || null,
  };
  const members = {
    p1: getTeamMembers(settings, 'p1'),
    p2: getTeamMembers(settings, 'p2'),
  };
  const chronological = [...(newestFirstHistory || [])].reverse();
  const lastBySide = { p1: null, p2: null };
  let currentSide = startSide;

  for (const move of chronological) {
    const side = move?.player === 'p2' ? 'p2' : 'p1';
    const tid = move?.throwerId || lastBySide[side] || starters[side];
    lastBySide[side] = tid;
    currentSide = side === 'p1' ? 'p2' : 'p1';
  }

  const lastOnCurrent = lastBySide[currentSide];
  const throwerId = lastOnCurrent
    ? otherMemberId(members[currentSide], lastOnCurrent)
    : starters[currentSide];

  return {
    currentPlayer: currentSide,
    throwerId,
    lastThrowerBySide: lastBySide,
  };
}

/**
 * @param {Array<object>} legs
 * @returns {string[]}
 */
export function collectLegStarters(legs) {
  return (legs || [])
    .map((leg) => {
      if (leg?.starterThrowerId) return String(leg.starterThrowerId);
      const chrono = [...(leg?.history || [])].reverse();
      return chrono[0]?.throwerId ? String(chrono[0].throwerId) : null;
    })
    .filter(Boolean);
}

/**
 * @param {Array<object>} legs
 * @param {object} settings
 */
export function computeMemberStatsFromLegs(legs, settings) {
  const all = [...getTeamMembers(settings, 'p1'), ...getTeamMembers(settings, 'p2')];
  const byId = {};
  for (const m of all) {
    byId[m.id] = {
      id: m.id,
      name: m.name,
      side: m.side,
      darts: 0,
      score: 0,
      avg: 0,
      highCheckout: 0,
      legsStarted: 0,
    };
  }

  for (const leg of legs || []) {
    const starter =
      leg?.starterThrowerId ||
      [...(leg?.history || [])].reverse()[0]?.throwerId ||
      null;
    if (starter && byId[starter]) byId[starter].legsStarted += 1;

    for (const move of leg?.history || []) {
      const id = move?.throwerId;
      if (!id || !byId[id] || move.isBust) continue;
      byId[id].darts += Number(move.dartsUsed) || 3;
      byId[id].score += Number(move.score) || 0;
      if (move.remaining === 0) {
        byId[id].highCheckout = Math.max(byId[id].highCheckout, Number(move.score) || 0);
      }
    }
  }

  for (const row of Object.values(byId)) {
    row.avg = row.darts > 0 ? (row.score / row.darts) * 3 : 0;
  }
  return byId;
}

/**
 * @param {object} slot
 * @returns {object|null}
 */
export function findTournamentSlot(playerId, tournamentData, extraGroups = []) {
  if (playerId == null || playerId === '') return null;
  const id = String(playerId);
  const lists = [
    tournamentData?.players,
    ...((tournamentData?.groups || []).map((g) => g.players)),
    ...((extraGroups || []).map((g) => g.players)),
  ];
  for (const list of lists) {
    const hit = (list || []).find((x) => String(x?.id ?? '') === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {object} p1
 * @param {object} p2
 */
export function buildDoublesSettingsFromSlots(p1, p2) {
  if (!isTeamPlayer(p1) || !isTeamPlayer(p2)) {
    return { doubles: false, teams: null };
  }
  return {
    doubles: true,
    teams: {
      p1: {
        id: p1.id,
        name: p1.name,
        members: (p1.members || []).slice(0, 2).map((m, i) => normalizeMember(m, 'p1', i)),
      },
      p2: {
        id: p2.id,
        name: p2.name,
        members: (p2.members || []).slice(0, 2).map((m, i) => normalizeMember(m, 'p2', i)),
      },
    },
  };
}

/**
 * Metadata dokončeného legu pro seed / statistiky členů.
 * @param {object} ns přepočtený stav legu (history newest-first)
 * @param {object} gs stav před tímto hodem
 */
export function snapshotCompletedLeg(ns, gs) {
  const chrono = [...(ns?.history || [])].reverse();
  const first = chrono[0];
  return {
    history: ns.history,
    winner: ns.winner,
    startingPlayer: gs?.startingPlayer ?? ns?.startingPlayer ?? null,
    startingThrowers: gs?.startingThrowers ?? ns?.startingThrowers ?? null,
    starterThrowerId:
      first?.throwerId ||
      gs?.startingThrowers?.[gs?.startingPlayer] ||
      null,
  };
}

/**
 * Extra pole do záznamu zápasu / result.
 * @param {Array<object>} legs
 * @param {object} settings
 */
export function attachDoublesRecordFields(legs, settings) {
  if (!isDoublesMatch(settings)) return {};
  return {
    doubles: true,
    teams: settings.teams,
    legStarters: collectLegStarters(legs),
    members: computeMemberStatsFromLegs(legs, settings),
  };
}
