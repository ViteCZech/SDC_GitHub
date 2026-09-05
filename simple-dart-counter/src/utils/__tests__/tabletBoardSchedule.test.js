import { describe, expect, it } from 'vitest';
import {
  buildTabletBoardSchedule,
  formatCompletedMatchScoreForSchedule,
  pickTabletMatchForBoard,
  resolveTournamentPlayerName,
} from '../tabletBoardSchedule';

const tournamentData = {
  players: [
    { id: 'p1', name: 'Jalůvka' },
    { id: 'p2', name: 'Armlich' },
  ],
  groups: [
    {
      groupId: 'A',
      boards: ['1'],
      players: [
        { id: 'p1', name: 'Jalůvka' },
        { id: 'p2', name: 'Armlich' },
      ],
    },
  ],
};

describe('tabletBoardSchedule', () => {
  it('resolveTournamentPlayerName hledá ve flat soupisce i ve skupinách', () => {
    expect(resolveTournamentPlayerName('p1', tournamentData)).toBe('Jalůvka');
    expect(resolveTournamentPlayerName('missing', tournamentData)).toBe('');
  });

  it('pickTabletMatchForBoard vybere pending skupinový zápas na terči', () => {
    const picked = pickTabletMatchForBoard({
      tournamentData,
      tournamentGroups: tournamentData.groups,
      tournamentMatches: [
        {
          id: 'm1',
          groupId: 'A',
          player1Id: 'p1',
          player2Id: 'p2',
          status: 'pending',
          round: 1,
          board: '1',
        },
      ],
      tournamentBracket: [],
      tabletBoardStr: '1',
    });
    expect(picked).toMatchObject({ matchType: 'group', matchId: 'm1', groupId: 'A' });
  });

  it('pickTabletMatchForBoard po skupinách bere pavouk na stejném terči', () => {
    const picked = pickTabletMatchForBoard({
      tournamentData,
      tournamentGroups: tournamentData.groups,
      tournamentMatches: [
        { id: 'done', groupId: 'A', player1Id: 'p1', player2Id: 'p2', status: 'completed' },
      ],
      tournamentBracket: [
        {
          matches: [
            {
              id: 'br1',
              board: '1',
              player1Id: 'p1',
              player2Id: 'p2',
              status: 'pending',
            },
          ],
        },
      ],
      tabletBoardStr: '1',
    });
    expect(picked).toMatchObject({ matchType: 'bracket', matchId: 'br1', bracketRoundIndex: 0 });
  });

  it('buildTabletBoardSchedule vrací jména a skóre dokončeného zápasu', () => {
    const rows = buildTabletBoardSchedule({
      tournamentData,
      tournamentGroups: tournamentData.groups,
      tournamentMatches: [
        {
          matchId: 'm1',
          groupId: 'A',
          player1Id: 'p1',
          player2Id: 'p2',
          status: 'completed',
          round: 1,
          result: { p1Legs: 2, p2Legs: 1 },
        },
      ],
      tournamentBracket: [],
      tabletBoardStr: '1',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].player1Name).toBe('Jalůvka');
    expect(rows[0].player2Name).toBe('Armlich');
    expect(rows[0].scoreDisplay).toBe('2 : 1');
  });

  it('formatCompletedMatchScoreForSchedule preferuje sety', () => {
    expect(
      formatCompletedMatchScoreForSchedule({ status: 'completed', p1Sets: 2, p2Sets: 0 })
    ).toBe('2 : 0');
    expect(formatCompletedMatchScoreForSchedule({ status: 'pending' })).toBeNull();
  });
});
