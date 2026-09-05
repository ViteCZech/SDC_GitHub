import { describe, expect, it } from 'vitest';
import {
  buildDrawRankingSnapshot,
  findCsoPlayerEntry,
  searchCsoPlayers,
} from '../csoRanking';

const list = [
  { rank: 1, name: 'Jan Novák', regNumber: '111', club: 'A' },
  { rank: 8, name: 'Petr Svoboda', regNumber: '222', club: 'B' },
];

describe('csoRanking', () => {
  it('findCsoPlayerEntry preferuje Reg. # před jménem', () => {
    const byId = findCsoPlayerEntry(list, { name: 'Petr Svoboda', csoPlayerId: 'cso:111' });
    expect(byId?.rank).toBe(1);
    const byName = findCsoPlayerEntry(list, { name: 'Petr Svoboda', csoPlayerId: null });
    expect(byName?.rank).toBe(8);
  });

  it('searchCsoPlayers najde bez diakritiky, krátký query nic, index je opakovatelný', () => {
    expect(searchCsoPlayers(list, 'novak').map((p) => p.rank)).toEqual([1]);
    expect(searchCsoPlayers(list, 'x')).toEqual([]);
    expect(searchCsoPlayers(list, 'novak').map((p) => p.rank)).toEqual([1]);
  });

  it('buildDrawRankingSnapshot zmrazí živý rank a nenasazené dá až za ně', () => {
    const { players, rankingSnapshot } = buildDrawRankingSnapshot({
      useCsoRanking: true,
      gender: 'men',
      rankingData: { players: list, meta: { updatedAt: '2026-08-01' } },
      players: [
        { id: 'p2', name: 'Petr Svoboda' },
        { id: 'p3', name: 'Neznámý' },
        { id: 'p1', name: 'Jan Novák' },
      ],
    });
    expect(rankingSnapshot.useCsoRanking).toBe(true);
    expect(players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(players[0].ranking).toBe(1);
    expect(players[1].ranking).toBe(8);
    expect(players[2].ranking).toBeNull();
  });
});
