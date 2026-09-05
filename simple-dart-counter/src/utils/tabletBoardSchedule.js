import { pickParallelGroupMatches } from './groupParallelPlay';
import { findTournamentSlot } from './doublesThrowOrder';
import { isTeamPlayer } from './doublesSeeding';
import { formatRefereeNames } from './doublesReferee';

/** Jméno hráče z turnaje (flat players + skupiny). */
export function resolveTournamentPlayerName(playerId, tournamentData) {
  if (playerId == null || playerId === '') return '';
  const id = String(playerId);
  const td = tournamentData;
  const flat = td?.players;
  if (Array.isArray(flat)) {
    const p = flat.find((x) => String(x.id ?? '') === id);
    if (p?.name != null && String(p.name).trim() !== '') return String(p.name);
  }
  for (const g of td?.groups || []) {
    const pl = (g.players || []).find((x) => String(x.id ?? '') === id);
    if (pl?.name != null && String(pl.name).trim() !== '') return String(pl.name);
  }
  return '';
}

export function enrichTabletMatchPlayerNames(raw, tournamentData, tournamentGroups) {
  if (!raw) return raw;
  let groupPlayers = [];
  if (raw.groupId) {
    const grp =
      tournamentGroups.find((g) => g.groupId === raw.groupId) ||
      tournamentData?.groups?.find((g) => g.groupId === raw.groupId);
    groupPlayers = grp?.players || [];
  }
  const p1Raw =
    (raw.player1Name != null && String(raw.player1Name).trim()) ||
    (raw.p1Name != null && String(raw.p1Name).trim()) ||
    groupPlayers.find((p) => p.id === raw.player1Id)?.name ||
    resolveTournamentPlayerName(raw.player1Id, tournamentData) ||
    (raw.player1Id != null ? String(raw.player1Id) : '');
  const p2Raw =
    (raw.player2Name != null && String(raw.player2Name).trim()) ||
    (raw.p2Name != null && String(raw.p2Name).trim()) ||
    groupPlayers.find((p) => p.id === raw.player2Id)?.name ||
    resolveTournamentPlayerName(raw.player2Id, tournamentData) ||
    (raw.player2Id != null ? String(raw.player2Id) : '');
  const p1Slot =
    groupPlayers.find((p) => p.id === raw.player1Id) ||
    findTournamentSlot(raw.player1Id, tournamentData, tournamentGroups);
  const p2Slot =
    groupPlayers.find((p) => p.id === raw.player2Id) ||
    findTournamentSlot(raw.player2Id, tournamentData, tournamentGroups);
  const p1Members = isTeamPlayer(p1Slot) ? p1Slot.members.slice(0, 2) : [];
  const p2Members = isTeamPlayer(p2Slot) ? p2Slot.members.slice(0, 2) : [];
  const referees =
    Array.isArray(raw.referees) && raw.referees.length > 0
      ? raw.referees
      : raw.referee?.name
        ? [raw.referee]
        : [];
  return {
    ...raw,
    player1Name: p1Raw || '?',
    player2Name: p2Raw || '?',
    p1Members,
    p2Members,
    referees,
    refereeName: formatRefereeNames({ ...raw, referees }) || raw.refereeName || '—',
    doubles: p1Members.length >= 2 && p2Members.length >= 2,
  };
}

/** Text výsledku pro rozpis (sety nebo legy). */
export function formatCompletedMatchScoreForSchedule(m) {
  if (!m || m.status !== 'completed') return null;
  const s1 = m.p1Sets;
  const s2 = m.p2Sets;
  if (s1 != null && s2 != null && Number.isFinite(Number(s1)) && Number.isFinite(Number(s2))) {
    return `${Number(s1)} : ${Number(s2)}`;
  }
  const r = m.result || {};
  const p1 = Number(r.p1Legs ?? m.legsP1 ?? m.score1 ?? m.score?.p1 ?? 0) || 0;
  const p2 = Number(r.p2Legs ?? m.legsP2 ?? m.score2 ?? m.score?.p2 ?? 0) || 0;
  return `${p1} : ${p2}`;
}

/** Zápas pro tablet na daném terči: pavouk (stejný board) nebo skupina (board ve skupině). */
export function pickTabletMatchForBoard({
  tournamentData,
  tournamentMatches,
  tournamentBracket,
  tournamentGroups,
  tabletBoardStr,
}) {
  const b = String(tabletBoardStr ?? '').trim();
  if (!b || !tournamentData) return null;

  const boardMatches = (m) => {
    if (!m || m.isBye) return false;
    const mb = m.board != null ? String(m.board).trim() : '';
    return mb === b && m.player1Id && m.player2Id;
  };

  const isTabletPickupCandidate = (m) => {
    if (!m) return false;
    const s = m.status;
    if (s === 'pending' || s === 'playing') return true;
    if (m.tabletStatus === 'checked_in') return true;
    return false;
  };

  const groupsList = tournamentData.groups?.length ? tournamentData.groups : tournamentGroups;
  const allGroupsFinished =
    !Array.isArray(groupsList) ||
    groupsList.length === 0 ||
    groupsList.every((g) => {
      const gm = (tournamentMatches || []).filter((m) => (m.groupId ?? m.group) === g.groupId);
      return gm.length > 0 && gm.every((m) => m.status === 'completed' || m.status === 'walkover');
    });

  if (Array.isArray(tournamentBracket) && tournamentBracket.length > 0 && allGroupsFinished) {
    for (let ri = 0; ri < tournamentBracket.length; ri++) {
      const matches = tournamentBracket[ri]?.matches || [];
      for (let mi = 0; mi < matches.length; mi++) {
        const m = matches[mi];
        if (!boardMatches(m) || !isTabletPickupCandidate(m)) continue;
        return {
          ...m,
          matchType: 'bracket',
          bracketRoundIndex: ri,
          matchId: m.matchId ?? m.id,
        };
      }
    }
  }

  const groups = tournamentData.groups?.length ? tournamentData.groups : tournamentGroups;
  const group = Array.isArray(groups)
    ? groups.find(
        (gr) => Array.isArray(gr.boards) && gr.boards.some((x) => String(x).trim() === b)
      )
    : null;
  if (!group) return null;

  const gms = (tournamentMatches || [])
    .filter((m) => (m.groupId ?? m.group) === group.groupId)
    .slice()
    .sort((a, c) => (a.round ?? 0) - (c.round ?? 0));
  const groupBoards = (group.boards || []).map((x) => String(x).trim()).filter(Boolean);
  const selected = pickParallelGroupMatches(gms, groupBoards.length || 1);
  const boardIdx = groupBoards.indexOf(b);
  const byBoard = selected.find((m) => String(m.board ?? '').trim() === b);
  const byIndex = boardIdx >= 0 ? selected[boardIdx] : selected[0];
  const m = byBoard || byIndex;
  if (!m || !isTabletPickupCandidate(m)) return null;
  return {
    ...m,
    matchType: 'group',
    matchId: m.matchId ?? m.id,
    groupId: m.groupId ?? group.groupId,
  };
}

/** Rozpis zápasů na terči pro tablet (skupina nebo pavouk). */
export function buildTabletBoardSchedule({
  tournamentData,
  tournamentMatches,
  tournamentBracket,
  tournamentGroups,
  tabletBoardStr,
}) {
  const b = String(tabletBoardStr ?? '').trim();
  if (!b || !tournamentData) return [];

  const boardMatches = (m) => {
    if (!m || m.isBye) return false;
    const mb = m.board != null ? String(m.board).trim() : '';
    return mb === b && m.player1Id && m.player2Id;
  };

  const groupsList = tournamentData.groups?.length ? tournamentData.groups : tournamentGroups;
  const allGroupsFinished =
    !Array.isArray(groupsList) ||
    groupsList.length === 0 ||
    groupsList.every((g) => {
      const gm = (tournamentMatches || []).filter((m) => (m.groupId ?? m.group) === g.groupId);
      return gm.length > 0 && gm.every((m) => m.status === 'completed' || m.status === 'walkover');
    });

  const groups = tournamentData.groups?.length ? tournamentData.groups : tournamentGroups;
  const groupOnBoard = Array.isArray(groups)
    ? groups.find(
        (gr) => Array.isArray(gr.boards) && gr.boards.some((x) => String(x).trim() === b)
      )
    : null;

  const playersOf = (gid) => {
    const grp =
      tournamentGroups.find((g) => g.groupId === gid) ||
      tournamentData?.groups?.find((g) => g.groupId === gid);
    return grp?.players || [];
  };

  const nameFor = (m, p1, players) => {
    const id = p1 ? m.player1Id : m.player2Id;
    const fromMatch = p1
      ? (m.player1Name && String(m.player1Name).trim()) || m.p1Name
      : (m.player2Name && String(m.player2Name).trim()) || m.p2Name;
    if (fromMatch) return String(fromMatch);
    const fromGroup = players?.find((p) => p.id === id)?.name;
    if (fromGroup) return fromGroup;
    const fromTd = resolveTournamentPlayerName(id, tournamentData);
    if (fromTd) return fromTd;
    return id != null ? String(id) : '—';
  };

  const refereeForBracket = (m) => m.referee?.name ?? '—';
  const refereeForGroup = (m, players) => {
    const both = formatRefereeNames(m);
    if (both) return both;
    if (m.chalkerId) return players.find((p) => p.id === m.chalkerId)?.name ?? '—';
    return '—';
  };

  const rows = [];

  if (Array.isArray(tournamentBracket) && tournamentBracket.length > 0 && allGroupsFinished) {
    for (let ri = 0; ri < tournamentBracket.length; ri++) {
      const matches = tournamentBracket[ri]?.matches || [];
      for (let mi = 0; mi < matches.length; mi++) {
        const m = matches[mi];
        if (!boardMatches(m)) continue;
        rows.push({
          key: `br-${ri}-${m.id ?? mi}`,
          matchType: 'bracket',
          roundIndex: ri,
          match: m,
          player1Name: nameFor(m, true, []),
          player2Name: nameFor(m, false, []),
          refereeName: refereeForBracket(m),
          status: m.status,
          tabletStatus: m.tabletStatus,
          scoreDisplay: formatCompletedMatchScoreForSchedule(m),
        });
      }
    }
    return rows;
  }

  if (!groupOnBoard) return [];

  const players = playersOf(groupOnBoard.groupId);
  const gms = (tournamentMatches || [])
    .filter((m) => (m.groupId ?? m.group) === groupOnBoard.groupId)
    .slice()
    .sort((a, c) => (a.round ?? 0) - (c.round ?? 0));

  const groupBoards = (groupOnBoard.boards || []).map((x) => String(x).trim()).filter(Boolean);
  const multiBoard = groupBoards.length > 1;
  for (let i = 0; i < gms.length; i++) {
    const m = gms[i];
    const assigned = m.board != null && m.board !== '' ? String(m.board).trim() : '';
    if (multiBoard && assigned !== b) continue;
    rows.push({
      key: `g-${m.matchId ?? m.id ?? i}`,
      matchType: 'group',
      roundIndex: m.round,
      match: m,
      player1Name: nameFor(m, true, players),
      player2Name: nameFor(m, false, players),
      refereeName: refereeForGroup(m, players),
      status: m.status,
      tabletStatus: m.tabletStatus,
      scoreDisplay: formatCompletedMatchScoreForSchedule(m),
    });
  }

  return rows;
}
