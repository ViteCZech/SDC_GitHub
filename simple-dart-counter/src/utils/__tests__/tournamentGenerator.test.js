import { describe, expect, it } from 'vitest';
import {
  distributePlayersToFixedGroups,
  distributePlayersToGroups,
} from '../tournamentGenerator';

const ranked = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, ranking: i + 1 }));

describe('tournamentGenerator', () => {
  it('snake: 8 hráčů do skupin po 4 dá A 1/4/5/8 a B 2/3/6/7', () => {
    const groups = distributePlayersToGroups(ranked(8), 4);
    expect(groups.map((g) => g.groupId)).toEqual(['A', 'B']);
    expect(groups[0].players.map((p) => p.ranking)).toEqual([1, 4, 5, 8]);
    expect(groups[1].players.map((p) => p.ranking)).toEqual([2, 3, 6, 7]);
  });

  it('fixed groups: cyklicky 1. do A, 2. do B, 3. do A…', () => {
    const groups = distributePlayersToFixedGroups(ranked(6), 2);
    expect(groups).toHaveLength(2);
    expect(groups[0].players.map((p) => p.ranking)).toEqual([1, 3, 5]);
    expect(groups[1].players.map((p) => p.ranking)).toEqual([2, 4, 6]);
  });

  it('hráči bez ranku jdou až za nasazené', () => {
    const groups = distributePlayersToFixedGroups(
      [
        { id: 'z', name: 'Zuzana', ranking: null },
        { id: 'a', name: 'Ada', ranking: 2 },
      ],
      1
    );
    expect(groups[0].players.map((p) => p.id)).toEqual(['a', 'z']);
  });
});
