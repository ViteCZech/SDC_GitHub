import { describe, expect, it } from 'vitest';
import { drawRandomPairs, flattenPairDraw } from '../drawRandomPairs';
import { adaptGroupParallelPlay, pickParallelGroupMatches } from '../groupParallelPlay';
import {
  distributePlayersToFixedGroups,
  distributePlayersToGroups,
  generateGroupMatches,
} from '../tournamentGenerator';
import {
  assignBracketJitBoardsAndReferees,
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
import {
  hasDrawRankingSnapshot,
  isTournamentRankingLocked,
  stripPlayerRankingsForLive,
  withRankingsLocked,
} from '../tournamentRanking';

const player = (id, extra = {}) => ({ id, name: extra.name ?? id, ranking: extra.ranking ?? null, ...extra });

const pairKey = (a, b) => [a, b].sort().join('|');

const completedMatch = ({
  p1,
  p2,
  winner,
  p1Legs,
  p2Legs,
  groupId = 'A',
  extra = {},
}) => ({
  status: 'completed',
  player1Id: p1,
  player2Id: p2,
  winnerId: winner,
  result: { p1Legs, p2Legs },
  groupId,
  ...extra,
});

const walkoverMatch = ({ p1, p2, winner, winLegs = 2, groupId = 'A', extra = {} }) => {
  const p1Wins = winner === p1;
  return completedMatch({
    p1,
    p2,
    winner,
    p1Legs: p1Wins ? winLegs : 0,
    p2Legs: p1Wins ? 0 : winLegs,
    groupId,
    extra: { isWalkover: true, ...extra },
  });
};

const rngFrom = (values) => {
  let i = 0;
  return () => values[i++] ?? 0;
};

function assertDisjointPlayers(matches) {
  const seen = new Set();
  for (const m of matches) {
    for (const id of [m.player1Id, m.player2Id]) {
      expect(seen.has(id), `hráč ${id} hraje ve dvou paralelních zápasech`).toBe(false);
      seen.add(id);
    }
  }
}

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

describe('lichý počet ve skupině – rozpis a rotace pauz', () => {
  it('5 hráčů: 10 zápasů, každý s každým jednou, počtář nikdy nehraje', () => {
    const players = [player('s1'), player('s2'), player('s3'), player('s4'), player('s5')];
    const fromLogic = generateRoundRobinSchedule(players, 'A');
    const fromGenerator = generateGroupMatches(players, 'A');
    expect(fromLogic).toHaveLength(10);
    expect(fromGenerator).toHaveLength(10);

    const pairs = new Set(fromLogic.map((m) => pairKey(m.player1Id, m.player2Id)));
    expect(pairs.size).toBe(10);
    expect(fromGenerator.map((m) => pairKey(m.player1Id, m.player2Id)).sort()).toEqual(
      [...pairs].sort()
    );

    for (const m of [...fromLogic, ...fromGenerator]) {
      expect(m.player1Id).not.toBe(m.player2Id);
      expect([m.player1Id, m.player2Id]).not.toContain(m.chalkerId);
    }
  });

  it('5 hráčů: počtář se rovnoměrně střídá (každý 2×)', () => {
    const players = [player('s1'), player('s2'), player('s3'), player('s4'), player('s5')];
    const chalkCounts = {};
    for (const m of generateRoundRobinSchedule(players, 'A')) {
      chalkCounts[m.chalkerId] = (chalkCounts[m.chalkerId] ?? 0) + 1;
    }
    expect(Object.keys(chalkCounts).sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(new Set(Object.values(chalkCounts))).toEqual(new Set([2]));
  });

  it('7 hráčů: fallback circle, 21 zápasů, v každém kole právě jeden pauzírující', () => {
    const players = Array.from({ length: 7 }, (_, i) => player(`p${i + 1}`));
    const matches = generateRoundRobinSchedule(players, 'C');
    expect(matches).toHaveLength(21);
    expect(new Set(matches.map((m) => pairKey(m.player1Id, m.player2Id))).size).toBe(21);

    const byRound = new Map();
    for (const m of matches) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round).push(m);
    }
    expect(byRound.size).toBe(7);
    for (const roundMatches of byRound.values()) {
      expect(roundMatches).toHaveLength(3);
      const playing = new Set(roundMatches.flatMap((m) => [m.player1Id, m.player2Id]));
      expect(playing.size).toBe(6);
      const sitting = players.map((p) => p.id).filter((id) => !playing.has(id));
      expect(sitting).toHaveLength(1);
      for (const m of roundMatches) {
        if (m.chalkerId) {
          expect(m.chalkerId).toBe(sitting[0]);
          expect(playing.has(m.chalkerId)).toBe(false);
        }
      }
    }
  });

  it('7 hráčů do 2 skupin: split 4+3, snake i cyklická distribuce dodrží velikosti 3–4', () => {
    expect(getGroupSplit(7, 2)).toMatchObject({ minSize: 3, maxSize: 4 });
    const ranked = Array.from({ length: 7 }, (_, i) =>
      player(`p${i + 1}`, { ranking: i + 1, name: `P${i + 1}` })
    );
    const snake = distributePlayersToGroups(ranked, 4);
    expect(snake.map((g) => g.players.length).sort()).toEqual([3, 4]);
    const fixed = distributePlayersToFixedGroups(ranked, 2);
    expect(fixed.map((g) => g.players.length).sort()).toEqual([3, 4]);
    expect(fixed[0].players.map((p) => p.ranking)).toEqual([1, 3, 5, 7]);
    expect(fixed[1].players.map((p) => p.ranking)).toEqual([2, 4, 6]);
  });
});

describe('KO pavouk – BYE v 1. kole a automatický postup', () => {
  it('přímý KO (direct-ko) s 5 hráči: 3 volné losy pro nasazení 1–3, 4. vs 5. hraje', () => {
    const seeded = sortPlayersForBracketSeeding([
      player('c', { ranking: 3, name: 'C' }),
      player('e', { ranking: 5, name: 'E' }),
      player('a', { ranking: 1, name: 'A' }),
      player('d', { ranking: 4, name: 'D' }),
      player('b', { ranking: 2, name: 'B' }),
    ]);
    expect(seeded.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);

    const rounds = generateBracketStructure(
      [{ groupId: 'direct-ko', name: 'A', players: seeded }],
      'all',
      3,
      []
    );
    expect(rounds).toHaveLength(3);
    const r1 = rounds[0].matches;
    expect(r1).toHaveLength(4);

    const byes = r1.filter(
      (m) =>
        m.status === 'completed' &&
        (m.player1Name === 'Volný los' || m.player2Name === 'Volný los')
    );
    expect(byes).toHaveLength(3);
    expect(byes.map((m) => m.winnerId).sort()).toEqual(['a', 'b', 'c']);

    const live = r1.filter((m) => m.status === 'pending');
    expect(live).toHaveLength(1);
    expect([live[0].player1Id, live[0].player2Id].sort()).toEqual(['d', 'e']);

    const qfByeWinners = rounds[1].matches.find(
      (m) => m.player1Id && m.player2Id && m.status === 'pending'
    );
    expect(qfByeWinners).toBeTruthy();
    expect([qfByeWinners.player1Id, qfByeWinners.player2Id].sort()).toEqual(['b', 'c']);
  });

  it('3 postupující → pavouk na 4, jeden BYE a vítěz BYE je ve finálovém slotu', () => {
    const groups = [
      {
        groupId: 'A',
        name: 'A',
        players: [player('x', { name: 'X' }), player('y', { name: 'Y' }), player('z', { name: 'Z' })],
      },
    ];
    const rounds = generateBracketStructure(groups, 'all', 3, []);
    const r1Byes = rounds[0].matches.filter((m) => m.status === 'completed' && m.winnerId);
    expect(r1Byes).toHaveLength(1);
    const next = rounds[1].matches[0];
    expect(next.isFinal || rounds[1].matches.length === 1).toBe(true);
    expect([next.player1Id, next.player2Id]).toContain(r1Byes[0].winnerId);
  });
});

describe('tie-breaky ve skupinách', () => {
  it('při shodě výher rozhoduje rozdíl legů', () => {
    const players = [player('a'), player('b'), player('c')];
    const matches = [
      completedMatch({ p1: 'a', p2: 'b', winner: 'a', p1Legs: 2, p2Legs: 0 }),
      completedMatch({ p1: 'a', p2: 'c', winner: 'c', p1Legs: 1, p2Legs: 2 }),
      completedMatch({ p1: 'b', p2: 'c', winner: 'b', p1Legs: 2, p2Legs: 0 }),
    ];
    const table = calculateGroupStandings(players, matches);
    expect(table.every((r) => r.matchesWon === 1)).toBe(true);
    expect(table.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(table.map((r) => r.legDifference)).toEqual([1, 0, -1]);
  });

  it('při shodě výher i LD rozhoduje vzájemný zápas', () => {
    const players = [player('a'), player('b'), player('c'), player('d')];
    const matches = [
      completedMatch({ p1: 'a', p2: 'b', winner: 'a', p1Legs: 2, p2Legs: 0 }),
      completedMatch({ p1: 'a', p2: 'c', winner: 'a', p1Legs: 2, p2Legs: 1 }),
      completedMatch({ p1: 'a', p2: 'd', winner: 'd', p1Legs: 0, p2Legs: 2 }),
      completedMatch({ p1: 'b', p2: 'c', winner: 'b', p1Legs: 2, p2Legs: 0 }),
      completedMatch({ p1: 'b', p2: 'd', winner: 'b', p1Legs: 2, p2Legs: 1 }),
      completedMatch({ p1: 'c', p2: 'd', winner: 'c', p1Legs: 2, p2Legs: 1 }),
    ];
    const table = calculateGroupStandings(players, matches);
    const a = table.find((r) => r.id === 'a');
    const b = table.find((r) => r.id === 'b');
    expect(a.matchesWon).toBe(2);
    expect(b.matchesWon).toBe(2);
    expect(a.legDifference).toBe(b.legDifference);
    expect(a.legsWon).toBe(b.legsWon);
    expect(table.map((r) => r.id).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('při absolutní shodě bez vzájemného zápasu řadí deterministicky podle id', () => {
    const players = [player('d'), player('c'), player('b'), player('a')];
    const matches = [
      completedMatch({ p1: 'a', p2: 'c', winner: 'a', p1Legs: 2, p2Legs: 0 }),
      completedMatch({ p1: 'a', p2: 'd', winner: 'a', p1Legs: 2, p2Legs: 0 }),
      completedMatch({ p1: 'b', p2: 'c', winner: 'b', p1Legs: 2, p2Legs: 0 }),
      completedMatch({ p1: 'b', p2: 'd', winner: 'b', p1Legs: 2, p2Legs: 0 }),
    ];
    const table = calculateGroupStandings(players, matches);
    const a = table.find((r) => r.id === 'a');
    const b = table.find((r) => r.id === 'b');
    expect(a.matchesWon).toBe(2);
    expect(b.matchesWon).toBe(2);
    expect(a.legDifference).toBe(b.legDifference);
    expect(a.legsWon).toBe(b.legsWon);
    expect(table.map((r) => r.id).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('ČŠO ranking / seedTieBreak: nižší ranking a nižší tie-break dřív (nasazení pavouka)', () => {
    const sorted = sortPlayersForBracketSeeding([
      player('t2', { ranking: 20, seedTieBreak: 0.1, name: 'T2' }),
      player('t1', { ranking: 8, seedTieBreak: 0.9, name: 'T1' }),
      player('t3', { ranking: 20, seedTieBreak: 0.8, name: 'T3' }),
      player('u', { ranking: null, seedTieBreak: 0.01, name: 'Unranked' }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['t1', 't2', 't3', 'u']);
  });

  it('bez odehraných zápasů drží pořadí nasazení ve skupině (seed pole)', () => {
    const table = calculateGroupStandings(
      [player('seed1', { ranking: 9 }), player('seed2', { ranking: 1 }), player('seed3', { ranking: 3 })],
      []
    );
    expect(table.map((r) => r.id)).toEqual(['seed1', 'seed2', 'seed3']);
  });
});

describe('walkovery (kontumace)', () => {
  it('skupinový walkover (completed + isWalkover) se započte do tabulky jako výhra 2:0', () => {
    const players = [player('a'), player('b'), player('c')];
    const matches = [
      walkoverMatch({ p1: 'a', p2: 'b', winner: 'a', winLegs: 2 }),
      completedMatch({ p1: 'a', p2: 'c', winner: 'a', p1Legs: 2, p2Legs: 1 }),
      walkoverMatch({ p1: 'b', p2: 'c', winner: 'c', winLegs: 2 }),
    ];
    const table = calculateGroupStandings(players, matches);
    expect(table.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(table[0].matchesWon).toBe(2);
    expect(table[0].legsWon).toBe(4);
    expect(table[1].matchesWon).toBe(1);
    expect(table[2].matchesWon).toBe(0);
    expect(table[2].legsLost).toBe(4);
  });

  it('legacy status=walkover se počítá jako dohraný zápas (konec turnaje), ne jako pending', () => {
    const data = { tournamentFormat: 'groups_bracket' };
    const groupsDone = [{ player1Id: 'a', player2Id: 'b', status: 'walkover' }];
    const bracket = [
      {
        matches: [
          {
            player1Id: 'a',
            player2Id: 'c',
            player1Name: 'A',
            player2Name: 'C',
            status: 'walkover',
            winnerId: 'a',
          },
        ],
      },
    ];
    expect(isEntireTournamentFinished(data, groupsDone, bracket)).toBe(true);
  });

  it('walkover v pavouku posune vítěze do dalšího kola', () => {
    const rounds = [
      {
        round: 1,
        matches: [
          {
            id: 'r1-m0',
            status: 'completed',
            isWalkover: true,
            player1Id: 'a',
            player2Id: 'b',
            player1Name: 'A',
            player2Name: 'B',
            winnerId: 'b',
            score: { p1: 0, p2: 3 },
            result: { p1Legs: 0, p2Legs: 3 },
          },
          {
            id: 'r1-m1',
            status: 'completed',
            player1Id: 'c',
            player2Id: 'd',
            player1Name: 'C',
            player2Name: 'D',
            winnerId: 'c',
            score: { p1: 3, p2: 1 },
          },
        ],
      },
      {
        round: 2,
        matches: [
          {
            id: 'r2-m0',
            status: 'pending',
            isFinal: true,
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
    expect(next[1].matches[0].player1Id).toBe('b');
    expect(next[1].matches[0].player2Id).toBe('c');

    const { placementById } = calculateFinalStandings(next);
    expect(placementById.a).toBe(3);
    expect(placementById.d).toBe(3);
  });
});

describe('losované dvojice (drawRandomPairs)', () => {
  it('sudý počet: n/2 párů, žádná rezerva, nasazení podle součtu ČP', () => {
    const roster = [
      { id: 'a', name: 'Ada', doublesRank: 4 },
      { id: 'b', name: 'Bo', doublesRank: 10 },
      { id: 'c', name: 'Cy', doublesRank: 1 },
      { id: 'd', name: 'Di', doublesRank: 20 },
    ];
    const { teams, reserve } = drawRandomPairs(roster, { rng: rngFrom([0, 0, 0]) });
    expect(reserve).toBeNull();
    expect(teams).toHaveLength(2);
    expect(teams.every((t) => t.kind === 'team' && t.members.length === 2)).toBe(true);
    for (const team of teams) {
      const sum = team.members.reduce((acc, m) => acc + Number(m.doublesRank), 0);
      expect(team.ranking).toBe(sum);
    }
    const seeded = sortPlayersForBracketSeeding(teams);
    expect(seeded[0].ranking).toBeLessThanOrEqual(seeded[1].ranking);
    expect(flattenPairDraw(teams, reserve)).toHaveLength(4);
  });

  it('lichý počet: max párů + 1 rezervní mimo soupisku dvojic', () => {
    const roster = [
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bo' },
      { id: 'c', name: 'Cy' },
      { id: 'd', name: 'Di' },
      { id: 'e', name: 'Ed' },
    ];
    const { teams, reserve, roster: people } = drawRandomPairs(roster, { rng: () => 0 });
    expect(people).toHaveLength(5);
    expect(teams).toHaveLength(2);
    expect(reserve).toBeTruthy();
    expect(teams.flatMap((t) => t.members.map((m) => m.id))).not.toContain(reserve.id);
    const flat = flattenPairDraw(teams, reserve);
    expect(flat).toHaveLength(5);
    expect(flat.map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('JIT terče a počtáři (skupiny + pavouk)', () => {
  it('6 hráčů na 2 terčích: dvě disjunktní utkání, počtář z volných ve skupině', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id));
    const pending = generateGroupMatches(players, 'A').map((m) => ({ ...m, status: 'pending' }));
    const groups = [{ groupId: 'A', players, boards: ['1', '2'] }];
    const next = adaptGroupParallelPlay(pending, groups);

    const onBoards = next.filter((m) => m.board === '1' || m.board === '2');
    expect(onBoards).toHaveLength(2);
    expect(new Set(onBoards.map((m) => String(m.board))).size).toBe(2);
    assertDisjointPlayers(onBoards);

    const busy = new Set(onBoards.flatMap((m) => [m.player1Id, m.player2Id]));
    const sitting = players.map((p) => p.id).filter((id) => !busy.has(id));
    expect(sitting).toHaveLength(2);
    for (const m of onBoards) {
      const refId = m.refereeId ?? m.referee?.id;
      expect(sitting).toContain(refId);
      expect(busy.has(refId)).toBe(false);
    }
    expect(next.filter((m) => m.status === 'pending' && m.board === '')).toHaveLength(
      pending.length - 2
    );
  });

  it('pickParallelGroupMatches na 2 terčích nenasadí zápas se společným hráčem', () => {
    const matches = [
      { id: 'm1', status: 'pending', player1Id: 'a', player2Id: 'b' },
      { id: 'm2', status: 'pending', player1Id: 'b', player2Id: 'c' },
      { id: 'm3', status: 'pending', player1Id: 'd', player2Id: 'e' },
      { id: 'm4', status: 'pending', player1Id: 'c', player2Id: 'f' },
    ];
    const picked = pickParallelGroupMatches(matches, 2);
    expect(picked).toHaveLength(2);
    assertDisjointPlayers(picked);
    expect(picked.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('pavouk JIT: 4 pending zápasy a 2 terče → 2 na deskách, 2 ve frontě, bez sdílených hráčů', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      player(`p${i + 1}`, { ranking: i + 1, name: `P${i + 1}` })
    );
    const raw = generateBracketStructure(
      [{ groupId: 'direct-ko', name: 'A', players }],
      'all',
      3,
      []
    );
    const { bracket, stats } = assignBracketJitBoardsAndReferees(raw, {
      availableBoards: 2,
      groups: [],
      promotersCount: 'all',
      groupMatches: [],
      registeredPlayersForDirectKo: players,
    });
    expect(stats.availableBoards).toBe(2);
    expect(stats.onBoards).toBe(2);
    expect(stats.queued).toBe(2);
    expect(stats.totalReady).toBe(4);

    const onBoards = bracket[0].matches.filter(
      (m) => m.status === 'pending' && m.board != null && m.board !== ''
    );
    expect(onBoards).toHaveLength(2);
    expect(new Set(onBoards.map((m) => m.board)).size).toBe(2);
    assertDisjointPlayers(onBoards);
  });
});

describe('přechod skupin → KO pavouk (groups_bracket)', () => {
  it('1. z A vs 2. z B a 1. z B vs 2. z A, postupující podle tabulky', () => {
    const groupA = {
      groupId: 'A',
      name: 'A',
      players: [player('a1', { name: 'A1' }), player('a2', { name: 'A2' }), player('a3', { name: 'A3' })],
    };
    const groupB = {
      groupId: 'B',
      name: 'B',
      players: [player('b1', { name: 'B1' }), player('b2', { name: 'B2' }), player('b3', { name: 'B3' })],
    };
    const matches = [
      completedMatch({ p1: 'a1', p2: 'a2', winner: 'a1', p1Legs: 2, p2Legs: 0, groupId: 'A' }),
      completedMatch({ p1: 'a1', p2: 'a3', winner: 'a1', p1Legs: 2, p2Legs: 1, groupId: 'A' }),
      completedMatch({ p1: 'a2', p2: 'a3', winner: 'a2', p1Legs: 2, p2Legs: 0, groupId: 'A' }),
      completedMatch({ p1: 'b1', p2: 'b2', winner: 'b1', p1Legs: 2, p2Legs: 0, groupId: 'B' }),
      completedMatch({ p1: 'b1', p2: 'b3', winner: 'b1', p1Legs: 2, p2Legs: 0, groupId: 'B' }),
      completedMatch({ p1: 'b2', p2: 'b3', winner: 'b2', p1Legs: 2, p2Legs: 1, groupId: 'B' }),
    ];

    expect(calculateGroupStandings(groupA.players, matches.filter((m) => m.groupId === 'A')).map((r) => r.id)).toEqual([
      'a1',
      'a2',
      'a3',
    ]);
    expect(calculateGroupStandings(groupB.players, matches.filter((m) => m.groupId === 'B')).map((r) => r.id)).toEqual([
      'b1',
      'b2',
      'b3',
    ]);

    const rounds = generateBracketStructure([groupA, groupB], 2, 3, matches);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].matches).toHaveLength(2);
    const pairing = rounds[0].matches.map((m) => [m.player1Id, m.player2Id].sort().join('-')).sort();
    expect(pairing).toEqual(['a1-b2', 'a2-b1']);
    expect(rounds[1].matches[0].isFinal || rounds[1].matches.length === 1).toBe(true);
  });

  it('3 skupiny × 2 postupující = 6 hráčů → pavouk 8 se 2 BYE a křížením drah', () => {
    const mkGroup = (gid, ids) => ({
      groupId: gid,
      name: gid,
      players: ids.map((id) => player(id, { name: id.toUpperCase() })),
    });
    const groups = [
      mkGroup('A', ['a1', 'a2', 'a3']),
      mkGroup('B', ['b1', 'b2', 'b3']),
      mkGroup('C', ['c1', 'c2', 'c3']),
    ];
    const wins = (p1, p2, groupId) =>
      completedMatch({ p1, p2, winner: p1, p1Legs: 2, p2Legs: 0, groupId });
    const matches = [
      wins('a1', 'a2', 'A'),
      wins('a1', 'a3', 'A'),
      wins('a2', 'a3', 'A'),
      wins('b1', 'b2', 'B'),
      wins('b1', 'b3', 'B'),
      wins('b2', 'b3', 'B'),
      wins('c1', 'c2', 'C'),
      wins('c1', 'c3', 'C'),
      wins('c2', 'c3', 'C'),
    ];
    const rounds = generateBracketStructure(groups, 2, 3, matches);
    expect(rounds[0].matches).toHaveLength(4);
    const byes = rounds[0].matches.filter((m) => m.status === 'completed' && m.winnerId);
    expect(byes).toHaveLength(2);
    const live = rounds[0].matches.filter((m) => m.status === 'pending');
    expect(live).toHaveLength(2);
    const allIds = new Set(
      rounds[0].matches.flatMap((m) => [m.player1Id, m.player2Id, m.winnerId]).filter(Boolean)
    );
    expect([...allIds].sort()).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'c2']);
  });
});

describe('tournamentRanking – zámek losu / snapshot', () => {
  it('živý turnaj i rankingsLocked uzamknou ranking', () => {
    expect(hasDrawRankingSnapshot({ rankingSnapshot: { at: 1 } })).toBe(true);
    expect(hasDrawRankingSnapshot({})).toBe(false);
    expect(isTournamentRankingLocked({}, true)).toBe(true);
    expect(isTournamentRankingLocked({ rankingsLocked: true }, false)).toBe(true);
    expect(isTournamentRankingLocked({}, false)).toBe(false);
  });

  it('stripPlayerRankingsForLive vynuluje singles, týmům ranking nechá', () => {
    const out = stripPlayerRankingsForLive([
      { id: 'a', name: 'Ada', ranking: 12 },
      { id: 't', name: 'Tým', kind: 'team', ranking: 20 },
      { name: '   ' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].ranking).toBeNull();
    expect(out[1].ranking).toBe(20);
  });

  it('withRankingsLocked je idempotentní', () => {
    const first = withRankingsLocked({ id: 't1' });
    expect(first.rankingsLocked).toBe(true);
    expect(withRankingsLocked(first)).toBe(first);
  });
});
