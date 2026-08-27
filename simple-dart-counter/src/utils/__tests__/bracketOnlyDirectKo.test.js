import { describe, expect, it } from 'vitest';
import {
  assignBracketJitBoardsAndReferees,
  generateBracketStructure,
  getBracketSeedingTemplate,
  isEntireTournamentFinished,
  isRealPendingBracketMatch,
  propagateBracketWinners,
  sortPlayersForBracketSeeding,
  updateBracketReferees,
} from '../tournamentLogic';

const rankedPlayers = (n) =>
  sortPlayersForBracketSeeding(
    Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Hráč ${String(i + 1).padStart(2, '0')}`,
      ranking: i + 1,
    }))
  );

function classifyR1(m) {
  const p1Real = m.player1Id != null && m.player1Name !== 'Volný los';
  const p2Real = m.player2Id != null && m.player2Name !== 'Volný los';
  if (p1Real && p2Real) return 'real';
  if (m.status === 'completed' && m.winnerId && (m.player1Name === 'Volný los' || m.player2Name === 'Volný los')) {
    return 'bye';
  }
  if (!p1Real && !p2Real) return 'empty';
  return 'other';
}

function completeBoardedP1(bracket) {
  const next = JSON.parse(JSON.stringify(bracket));
  for (const round of next) {
    for (const m of round.matches) {
      if (!isRealPendingBracketMatch(m) || m.board == null) continue;
      m.status = 'completed';
      m.winnerId = m.player1Id;
      m.score = { p1: Number(m.winLegs) || 3, p2: 0 };
    }
  }
  return propagateBracketWinners(next);
}

function jitDirectKo(bracket, players, boards = 8) {
  return assignBracketJitBoardsAndReferees(bracket, {
    availableBoards: boards,
    groups: [],
    promotersCount: 'all',
    groupMatches: [],
    registeredPlayersForDirectKo: players,
    prelimLegs: null,
  });
}

describe('getBracketSeedingTemplate', () => {
  it('4/8/16/32/64 zůstávají oficiální šablony', () => {
    expect(getBracketSeedingTemplate(8)).toEqual([1, 8, 4, 5, 3, 6, 2, 7]);
    const t64 = getBracketSeedingTemplate(64);
    expect(t64[0]).toBe(1);
    expect(t64[1]).toBe(64);
    const i2 = t64.indexOf(2);
    expect(t64[i2 + 1]).toBe(63);
  });

  it('128: 1 vs 128, 2 vs 127, jednička a dvojka v opačných polovinách', () => {
    const t = getBracketSeedingTemplate(128);
    expect(t).toHaveLength(128);
    expect(t[0]).toBe(1);
    expect(t[1]).toBe(128);
    const idx2 = t.indexOf(2);
    expect(t[idx2 + 1]).toBe(127);
    expect(idx2).toBeGreaterThanOrEqual(64);
  });

  it('256 se složí z 64 a má platnou délku', () => {
    const t = getBracketSeedingTemplate(256);
    expect(t).toHaveLength(256);
    expect(t[0]).toBe(1);
    expect(t[1]).toBe(256);
    expect(new Set(t).size).toBe(256);
  });
});

describe('přímý pavouk 79 hráčů / 8 terčů', () => {
  const players = rankedPlayers(79);
  const groups = [{ groupId: 'direct-ko', name: 'A', players }];

  it('nasazení: 49 volných losů pro seed 1–49, 15 reálných zápasů, žádné prázdné listy', () => {
    const raw = generateBracketStructure(groups, 'all', 3, [], null);
    expect(raw).toHaveLength(7);
    const r1 = raw[0].matches;
    expect(r1).toHaveLength(64);
    const counts = { real: 0, bye: 0, empty: 0, other: 0 };
    for (const m of r1) counts[classifyR1(m)] += 1;
    expect(counts).toEqual({ real: 15, bye: 49, empty: 0, other: 0 });

    const s1 = r1.find((m) => m.winnerId === 'p1' || m.player1Id === 'p1' || m.player2Id === 'p1');
    expect(s1.status).toBe('completed');
    expect(s1.winnerId).toBe('p1');
    expect(s1.player1Name === 'Volný los' || s1.player2Name === 'Volný los').toBe(true);

    const s50 = r1.find((m) => m.player1Id === 'p50' || m.player2Id === 'p50');
    expect(s50.status).toBe('pending');
    const other50 = s50.player1Id === 'p50' ? s50.player2Id : s50.player1Id;
    expect(other50).toBe('p79');
  });

  it('živé JIT bez skupin (jako App.jsx) přiřadí terče i počtáře z hráčů s volným losem', () => {
    const raw = generateBracketStructure(groups, 'all', 3, [], null);
    const { bracket, stats } = jitDirectKo(raw, players, 8);
    expect(stats.onBoards).toBe(8);
    expect(stats.withReferee).toBe(8);
    expect(stats.totalReady).toBeGreaterThanOrEqual(15);
    expect(stats.queued).toBe(stats.totalReady - 8);

    const boarded = [];
    for (const round of bracket) {
      for (const m of round.matches) {
        if (isRealPendingBracketMatch(m) && m.board) boarded.push(m);
      }
    }
    expect(boarded).toHaveLength(8);
    for (const m of boarded) {
      expect(m.referee?.name).toBeTruthy();
      expect([m.player1Id, m.player2Id]).not.toContain(m.referee.id);
    }
    const refRanks = boarded.map((m) => Number(String(m.referee.id).slice(1)));
    expect(Math.min(...refRanks)).toBeGreaterThan(40);
  });

  it('po simulaci 1. vlny dostanou další zápasy na terčích znovu počtáře', () => {
    const raw = generateBracketStructure(groups, 'all', 3, [], null);
    const first = jitDirectKo(raw, players, 8);
    const afterWave = jitDirectKo(completeBoardedP1(first.bracket), players, 8);
    expect(afterWave.stats.onBoards).toBe(8);
    expect(afterWave.stats.withReferee).toBe(8);
    const boarded = [];
    for (const round of afterWave.bracket) {
      for (const m of round.matches) {
        if (isRealPendingBracketMatch(m) && m.board) boarded.push(m);
      }
    }
    expect(boarded.every((m) => m.referee?.name)).toBe(true);
  });

  it('celý turnaj dohraje bez ručního doplňování dvojic a má vítěze', () => {
    let cur = jitDirectKo(generateBracketStructure(groups, 'all', 3, [], null), players, 8).bracket;
    let waves = 0;
    while (waves < 40) {
      let ready = 0;
      for (const round of cur) {
        for (const m of round.matches) {
          if (isRealPendingBracketMatch(m)) ready += 1;
        }
      }
      if (ready === 0) break;
      cur = jitDirectKo(completeBoardedP1(cur), players, 8).bracket;
      waves += 1;
    }
    let tba = 0;
    let empty = 0;
    for (const round of cur) {
      for (const m of round.matches) {
        if (m.status !== 'pending' && m.status !== 'playing') continue;
        if (m.player1Id && m.player2Id) continue;
        if (m.player1Id || m.player2Id) tba += 1;
        else empty += 1;
      }
    }
    expect({ waves, tba, empty }).toEqual({ waves: expect.any(Number), tba: 0, empty: 0 });
    expect(waves).toBeGreaterThan(0);
    const finalMatch = cur[cur.length - 1].matches[0];
    expect(finalMatch.status).toBe('completed');
    expect(finalMatch.winnerId).toBeTruthy();
    expect(
      isEntireTournamentFinished({ tournamentFormat: 'bracket_only' }, [], cur)
    ).toBe(true);
  });

  it('ručně zamčeného počtáře engine nepřepíše', () => {
    const raw = generateBracketStructure(groups, 'all', 3, [], null);
    const { bracket } = jitDirectKo(raw, players, 8);
    const r0 = bracket[0].matches;
    const boarded = r0.find((m) => isRealPendingBracketMatch(m) && m.board);
    expect(boarded).toBeTruthy();
    boarded.referee = { id: 'custom-ref', name: 'Externí počtář' };
    boarded.refereeLocked = true;
    const next = updateBracketReferees(bracket, [], 'all', 8, [], players, null);
    const same = next[0].matches.find((m) => m.id === boarded.id);
    expect(same.referee.id).toBe('custom-ref');
    expect(same.refereeLocked).toBe(true);
  });
});
