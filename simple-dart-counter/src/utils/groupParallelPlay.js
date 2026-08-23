import { isTeamPlayer } from './doublesSeeding.js';
import {
  findSlotById,
  pickRefereePeopleFromTeam,
  pickRotatingRefereeFromTeam,
} from './doublesReferee.js';

function matchKey(m) {
  return String(m?.matchId ?? m?.id ?? '');
}

function isFinished(m) {
  return m?.status === 'completed' || m?.status === 'walkover';
}

function isLive(m) {
  return m?.status === 'playing' || m?.tabletStatus === 'checked_in';
}

/**
 * Až `boardCount` zápasů, které můžou běžet zároveň (žádný společný hráč/pár).
 * Nejdřív už běžící, pak pending v pořadí rozvrhu.
 * @param {object[]} groupMatches
 * @param {number} boardCount
 * @returns {object[]}
 */
export function pickParallelGroupMatches(groupMatches, boardCount) {
  const cap = Math.max(1, Number(boardCount) || 1);
  const list = (groupMatches || []).filter((m) => m && !m.isBye && m.player1Id && m.player2Id);
  const live = list.filter((m) => isLive(m));
  const pending = list.filter((m) => m.status === 'pending' && m.tabletStatus !== 'checked_in');
  const selected = [];
  const busy = new Set();
  const free = (m) => !busy.has(m.player1Id) && !busy.has(m.player2Id);
  const occupy = (m) => {
    busy.add(m.player1Id);
    busy.add(m.player2Id);
  };
  for (const m of [...live, ...pending]) {
    if (selected.length >= cap) break;
    if (!free(m)) continue;
    selected.push(m);
    occupy(m);
  }
  return selected;
}

function sittingSlots(group, liveMatches) {
  const busy = new Set((liveMatches || []).flatMap((m) => [m.player1Id, m.player2Id]));
  return (group?.players || []).filter((p) => p && !p.isWithdrawn && !busy.has(p.id));
}

function stampSingleReferee(match, person) {
  if (!person) return;
  match.referees = [person];
  match.referee = person;
  match.refereeId = person.id;
}

function assignParallelReferees(selected, sitting, usedByTeam) {
  const sittingIds = new Set(sitting.map((s) => s.id));
  const pool = [];
  for (const slot of sitting) {
    if (isTeamPlayer(slot)) {
      for (const person of pickRefereePeopleFromTeam(slot)) {
        pool.push({ person, slot });
      }
    } else {
      pool.push({
        person: { id: slot.id, name: String(slot.name ?? slot.id) },
        slot,
      });
    }
  }
  const usedPeople = new Set();

  for (const m of selected) {
    if (isLive(m) && (m.referee?.id || m.refereeId)) {
      usedPeople.add(String(m.referee?.id ?? m.refereeId));
      continue;
    }
    let person = null;
    if (sittingIds.has(m.chalkerId)) {
      const slot = sitting.find((s) => s.id === m.chalkerId) || findSlotById(m.chalkerId, [], sitting);
      person = pickRotatingRefereeFromTeam(slot, usedByTeam);
    }
    if (!person) {
      const next = pool.find((row) => !usedPeople.has(String(row.person.id)));
      person = next?.person ?? null;
    }
    if (person) {
      usedPeople.add(String(person.id));
      stampSingleReferee(m, person);
    }
  }
}

/**
 * 1 terč = sériový rozvrh (neměnit počtáře).
 * 2+ terče = jen aktuální paralelní vlna dostane terč a počtáře z volných hráčů.
 * @param {object[]} matches
 * @param {Array<{ groupId?: string, players?: object[], boards?: Array<string|number> }>} groups
 */
export function adaptGroupParallelPlay(matches, groups) {
  if (!Array.isArray(matches) || matches.length === 0) return matches ?? [];
  const groupMap = new Map((groups ?? []).map((g) => [String(g.groupId ?? g.id ?? ''), g]));
  const next = matches.map((m) => ({ ...m }));
  const byGroup = new Map();
  for (const m of next) {
    const gid = String(m.groupId ?? m.group ?? '');
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(m);
  }

  for (const [gid, gms] of byGroup) {
    const group = groupMap.get(gid);
    if (!group) continue;
    const boards = (group.boards || []).map((b) => String(b).trim()).filter(Boolean);
    const usedByTeam = new Map();

    if (boards.length < 2) {
      if (boards.length === 1) {
        for (const m of gms) {
          if (isFinished(m) && m.board != null && m.board !== '') continue;
          m.board = boards[0];
        }
      }
      continue;
    }

    const selected = pickParallelGroupMatches(gms, boards.length);
    const selectedKeys = new Set(selected.map(matchKey));
    const sitting = sittingSlots(group, selected);
    assignParallelReferees(selected, sitting, usedByTeam);

    const usedBoards = new Set();
    selected.forEach((m) => {
      const b = m.board != null && m.board !== '' ? String(m.board).trim() : '';
      if (isLive(m) && b) usedBoards.add(b);
    });
    selected.forEach((m) => {
      if (isFinished(m)) return;
      if (isLive(m) && m.board != null && m.board !== '') return;
      const free = boards.find((b) => !usedBoards.has(b));
      if (!free) return;
      m.board = free;
      usedBoards.add(free);
    });

    for (const m of gms) {
      if (isFinished(m) || selectedKeys.has(matchKey(m))) continue;
      if (m.status === 'pending') m.board = '';
    }
  }

  return next;
}

export function parallelAssignSignature(matches) {
  return (matches || [])
    .map(
      (m) =>
        `${matchKey(m)}:${m.status}:${m.tabletStatus ?? ''}:${m.board ?? ''}:${m.refereeId ?? ''}`
    )
    .join('|');
}

export function matchPhaseSignature(matches) {
  return (matches || []).map((m) => `${matchKey(m)}:${m.status}:${m.tabletStatus ?? ''}`).join('|');
}
