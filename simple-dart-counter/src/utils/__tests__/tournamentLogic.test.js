import { describe, expect, it } from 'vitest';
import {
  calculateFinalStandings,
  calculateGroupStandings,
  countPlayersAdvancingFromGroups,
  defaultSequentialGroupBoardAssignments,
  estimateSingleEliminationWallMs,
  generateBracketStructure,
  generateRoundRobinSchedule,
  generateTournamentVariants,
  getGroupSplit,
  hasAnyGroupBoardAssignment,
  isAllowedGroupSplit,
  isEntireTournamentFinished,
  isTournamentBracketOnlyFormat,
  isTournamentGroupsThenBracketFormat,
  listValidGroupCounts,
  propagateBracketWinners,
  sortPlayersForBracketSeeding,
} from '../tournamentLogic';

const player = (id, extra = {}) => ({ id, name: extra.name ?? id, ranking: extra.ranking ?? null, ...extra });

describe('tournamentLogic – formát', () => {
  it('pozná přímý pavouk i legacy ko_only', () => {
    expect(isTournamentBracketOnlyFormat('bracket_only')).toBe(true);
    expect(isTournamentBracketOnlyFormat('ko_only')).toBe(true);
    expect(isTournamentBracketOnlyFormat('groups_bracket')).toBe(false);
  });

  it('pozná skupiny → pavouk i legacy groups_ko', () => {
    expect(isTournamentGroupsThenBracketFormat('groups_bracket')).toBe(true);
    expect(isTournamentGroupsThenBracketFormat('groups_ko')).toBe(true);
    expect(isTournamentGroupsThenBracketFormat('bracket_only')).toBe(false);
  });
});

describe('tournamentLogic – rozdělení skupin', () => {
  it('lichý počet: 7 hráčů do 2 skupin je 4+3', () => {
    const split = getGroupSplit(7, 2);
    expect(split.minSize).toBe(3);
    expect(split.maxSize).toBe(4);
    expect(isAllowedGroupSplit(7, 2)).toBe(true);
  });

  it('skupina pod 3 hráče není povolena', () => {
    expect(isAllowedGroupSplit(5, 2)).toBe(false);
    expect(listValidGroupCounts(5)).toEqual([1]);
  });

  it('8 hráčů: 2 skupiny po 4, postup 2+2 = 4 do pavouka', () => {
    expect(isAllowedGroupSplit(8, 2)).toBe(true);
    expect(countPlayersAdvancingFromGroups(8, 2, 2)).toBe(4);
  });

  it('postup „all“ vrátí všechny hráče', () => {
    expect(countPlayersAdvancingFromGroups(9, 3, 'all')).toBe(9);
  });

  it('generateTournamentVariants: málo hráčů nic, 8 hráčů až 3 varianty se skupinami 3–5', () => {
    expect(generateTournamentVariants(2)).toEqual([]);
    const variants = generateTournamentVariants(8);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.length).toBeLessThanOrEqual(3);
    for (const v of variants) {
      expect(isAllowedGroupSplit(8, v.numGroups)).toBe(true);
      expect(v.totalAdvancees).toBe(
        countPlayersAdvancingFromGroups(8, v.numGroups, v.advancePerGroup)
      );
    }
  });
});

describe('tournamentLogic – round robin', () => {
  it('3 hráči: 3 zápasy, ve volném slotu počítá ten, kdo nehraje', () => {
    const players = [player('a'), player('b'), player('c')];
    const matches = generateRoundRobinSchedule(players, 'A');
    expect(matches).toHaveLength(3);
    for (const m of matches) {
      expect(m.player1Id).toBeTruthy();
      expect(m.player2Id).toBeTruthy();
      expect(m.player1Id).not.toBe(m.player2Id);
      expect([m.player1Id, m.player2Id]).not.toContain(m.chalkerId);
      const ids = new Set([m.player1Id, m.player2Id, m.chalkerId]);
      expect(ids.size).toBe(3);
    }
  });

  it('4 hráči: 6 zápasů (každý s každým)', () => {
    const players = [player('a'), player('b'), player('c'), player('d')];
    expect(generateRoundRobinSchedule(players, 'B')).toHaveLength(6);
  });

  it('méně než 2 hráči → prázdný rozpis', () => {
    expect(generateRoundRobinSchedule([player('a')], 'A')).toEqual([]);
  });
});

describe('tournamentLogic – tabulka skupiny', () => {
  it('řadí podle výher, pak rozdílu legů', () => {
    const players = [player('a', { name: 'A' }), player('b', { name: 'B' }), player('c', { name: 'C' })];
    const matches = [
      {
        status: 'completed',
        player1Id: 'a',
        player2Id: 'b',
        winnerId: 'a',
        result: { p1Legs: 2, p2Legs: 0 },
      },
      {
        status: 'completed',
        player1Id: 'a',
        player2Id: 'c',
        winnerId: 'a',
        result: { p1Legs: 2, p2Legs: 1 },
      },
      {
        status: 'completed',
        player1Id: 'b',
        player2Id: 'c',
        winnerId: 'b',
        result: { p1Legs: 2, p2Legs: 0 },
      },
    ];
    const table = calculateGroupStandings(players, matches);
    expect(table.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(table[0].matchesWon).toBe(2);
    expect(table[1].matchesWon).toBe(1);
  });

  it('pending zápas se do tabulky nepočítá', () => {
    const players = [player('a'), player('b')];
    const table = calculateGroupStandings(players, [
      { status: 'pending', player1Id: 'a', player2Id: 'b', result: { p1Legs: 2, p2Legs: 0 } },
    ]);
    expect(table.every((r) => r.played === 0)).toBe(true);
  });

  it('odstoupivší hráč je na konci tabulky', () => {
    const players = [
      player('a', { isWithdrawn: true }),
      player('b'),
      player('c'),
    ];
    const table = calculateGroupStandings(players, []);
    expect(table[table.length - 1].id).toBe('a');
  });
});

describe('tournamentLogic – pavouk a BYE', () => {
  it('5 postupujících → pavouk na 8, volný los pro nejlepší nasazení', () => {
    const groups = [
      {
        groupId: 'A',
        name: 'A',
        players: [player('a1'), player('a2'), player('a3')],
      },
      {
        groupId: 'B',
        name: 'B',
        players: [player('b1'), player('b2')],
      },
    ];
    const rounds = generateBracketStructure(groups, 'all', 3, []);
    expect(rounds.length).toBeGreaterThan(0);
    const first = rounds[0].matches;
    expect(first).toHaveLength(4);
    const byes = first.filter((m) => m.status === 'completed' && m.winnerId);
    expect(byes.length).toBe(3);
  });

  it('2 postupující → přímé finále bez BYE', () => {
    const groups = [
      { groupId: 'A', name: 'A', players: [player('x', { name: 'X' }), player('y', { name: 'Y' })] },
    ];
    const rounds = generateBracketStructure(groups, 'all', 3, []);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].matches).toHaveLength(1);
    expect(rounds[0].matches[0].isFinal).toBe(true);
    expect(rounds[0].matches[0].status).toBe('pending');
  });

  it('propagateBracketWinners posune vítěze do dalšího kola', () => {
    const rounds = [
      {
        round: 1,
        matches: [
          {
            id: 'r1-m0',
            status: 'completed',
            player1Id: 'a',
            player2Id: 'b',
            player1Name: 'A',
            player2Name: 'B',
            winnerId: 'a',
            score: { p1: 2, p2: 0 },
          },
          {
            id: 'r1-m1',
            status: 'completed',
            player1Id: 'c',
            player2Id: 'd',
            player1Name: 'C',
            player2Name: 'D',
            winnerId: 'd',
            score: { p1: 0, p2: 2 },
          },
        ],
      },
      {
        round: 2,
        matches: [
          {
            id: 'r2-m0',
            status: 'pending',
            player1Id: null,
            player2Id: null,
            player1Name: null,
            player2Name: null,
            score: { p1: 0, p2: 0 },
          },
        ],
      },
    ];
    const next = propagateBracketWinners(rounds);
    expect(next[1].matches[0].player1Id).toBe('a');
    expect(next[1].matches[0].player2Id).toBe('d');
    expect(rounds[1].matches[0].player1Id).toBeNull();
  });
});

describe('tournamentLogic – nasazení a konec turnaje', () => {
  it('sortPlayersForBracketSeeding: nižší ranking dřív, bez ranku až za nimi', () => {
    const sorted = sortPlayersForBracketSeeding([
      player('c', { ranking: 20 }),
      player('a', { ranking: 1 }),
      player('z', { ranking: null }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['a', 'c', 'z']);
  });

  it('isEntireTournamentFinished: walkover ve skupině i pavouku se počítá jako dohráno', () => {
    const data = { tournamentFormat: 'groups_bracket' };
    const groupsDone = [
      { player1Id: 'a', player2Id: 'b', status: 'walkover' },
    ];
    const bracket = [
      {
        matches: [
          {
            player1Id: 'a',
            player2Id: 'c',
            player1Name: 'A',
            player2Name: 'C',
            status: 'walkover',
          },
        ],
      },
    ];
    expect(isEntireTournamentFinished(data, groupsDone, bracket)).toBe(true);
    expect(isEntireTournamentFinished(data, groupsDone, [])).toBe(false);
  });

  it('calculateFinalStandings: vítěz 1., finalista 2., semifinalisté sdílí 3.', () => {
    const { placementById } = calculateFinalStandings([
      {
        matches: [
          { status: 'completed', player1Id: 'a', player2Id: 'b', winnerId: 'a' },
          { status: 'completed', player1Id: 'c', player2Id: 'd', winnerId: 'c' },
        ],
      },
      {
        matches: [{ status: 'completed', player1Id: 'a', player2Id: 'c', winnerId: 'a' }],
      },
    ]);
    expect(placementById).toEqual({ a: 1, c: 2, b: 3, d: 3 });
  });

  it('estimateSingleEliminationWallMs: 8 hráčů, 1 terč = 7 zápasů, 4 terče = 3 kola paralelně', () => {
    expect(estimateSingleEliminationWallMs(8, 10, 1)).toBe(70);
    expect(estimateSingleEliminationWallMs(8, 10, 4)).toBe(30);
    expect(estimateSingleEliminationWallMs(1, 10, 4)).toBe(0);
  });
});

describe('tournamentLogic – výchozí přiřazení terčů skupinám', () => {
  const groups = [{ groupId: 'A' }, { groupId: 'B' }, { groupId: 'C' }, { groupId: 'D' }];

  it('přiřadí 1. skupinu na terč 1, 2. na terč 2, …', () => {
    expect(defaultSequentialGroupBoardAssignments(groups.slice(0, 3), 3)).toEqual({
      A: '1',
      B: '2',
      C: '3',
    });
  });

  it('přebytečné skupiny nechá ve frontě, když je terčů méně', () => {
    expect(defaultSequentialGroupBoardAssignments(groups, 2)).toEqual({
      A: '1',
      B: '2',
      C: '',
      D: '',
    });
  });

  it('bez terčů nic nepřiřadí', () => {
    expect(defaultSequentialGroupBoardAssignments(groups.slice(0, 2), 0)).toEqual({ A: '', B: '' });
  });

  it('hasAnyGroupBoardAssignment je false, dokud není žádný záznam', () => {
    expect(hasAnyGroupBoardAssignment({}, {}, groups)).toBe(false);
    expect(hasAnyGroupBoardAssignment(undefined, undefined, groups)).toBe(false);
  });

  it('hasAnyGroupBoardAssignment pozná draft, persistovanou mapu i boards na skupině', () => {
    expect(hasAnyGroupBoardAssignment({ A: '1' }, {}, groups)).toBe(true);
    expect(hasAnyGroupBoardAssignment({}, { B: '' }, groups)).toBe(true);
    expect(hasAnyGroupBoardAssignment({}, {}, [{ groupId: 'A', boards: [2] }])).toBe(true);
  });
});
