import { describe, expect, it } from 'vitest';
import { pickParallelGroupMatches } from '../groupParallelPlay';

describe('groupParallelPlay', () => {
  it('na 2 terče vezme dva zápasy bez společného hráče', () => {
    const matches = [
      { id: 'm1', status: 'pending', player1Id: 'a', player2Id: 'b' },
      { id: 'm2', status: 'pending', player1Id: 'a', player2Id: 'c' },
      { id: 'm3', status: 'pending', player1Id: 'c', player2Id: 'd' },
    ];
    const picked = pickParallelGroupMatches(matches, 2);
    expect(picked.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('už běžící zápasy mají prioritu před pending', () => {
    const matches = [
      { id: 'p', status: 'pending', player1Id: 'c', player2Id: 'd' },
      { id: 'live', status: 'playing', player1Id: 'a', player2Id: 'b' },
    ];
    expect(pickParallelGroupMatches(matches, 1).map((m) => m.id)).toEqual(['live']);
  });

  it('1 terč = jen jeden zápas', () => {
    const matches = [
      { id: 'm1', status: 'pending', player1Id: 'a', player2Id: 'b' },
      { id: 'm2', status: 'pending', player1Id: 'c', player2Id: 'd' },
    ];
    expect(pickParallelGroupMatches(matches, 1)).toHaveLength(1);
  });
});
