import { describe, expect, it } from 'vitest';
import {
  buildDrawnTeam,
  drawRandomPairs,
  flattenPairDraw,
  isPairDrawComplete,
  isRandomDoublesDraft,
  shuffleInPlace,
} from '../drawRandomPairs';

const rngFrom = (values) => {
  let i = 0;
  return () => values[i++] ?? 0;
};

describe('drawRandomPairs', () => {
  it('sudý počet: žádná rezerva, n/2 týmů, flatten vrátí všechny', () => {
    const roster = [
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bo' },
      { id: 'c', name: 'Cy' },
      { id: 'd', name: 'Di' },
    ];
    const { teams, reserve, roster: people } = drawRandomPairs(roster, { rng: rngFrom([0, 0, 0]) });
    expect(people).toHaveLength(4);
    expect(reserve).toBeNull();
    expect(teams).toHaveLength(2);
    expect(teams.every((t) => t.kind === 'team' && t.members.length === 2)).toBe(true);
    expect(flattenPairDraw(teams, reserve)).toHaveLength(4);
  });

  it('lichý počet: jeden rezervní mimo soupisku dvojic', () => {
    const roster = [
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bo' },
      { id: 'c', name: 'Cy' },
    ];
    const { teams, reserve } = drawRandomPairs(roster, { rng: () => 0 });
    expect(teams).toHaveLength(1);
    expect(reserve).toBeTruthy();
    expect(flattenPairDraw(teams, reserve).map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('týmy a hotový los se ignorují, isPairDrawComplete jen když všichni kind=team', () => {
    expect(isRandomDoublesDraft({ competitionType: 'random_doubles' })).toBe(true);
    expect(isPairDrawComplete([{ kind: 'team' }, { kind: 'team' }])).toBe(true);
    expect(isPairDrawComplete([{ kind: 'team' }, { name: 'Ada' }])).toBe(false);
    expect(isPairDrawComplete([])).toBe(false);
  });

  it('buildDrawnTeam sečte ČP dvojice obou členů', () => {
    const team = buildDrawnTeam(
      { id: 'a', name: 'Ada', doublesRank: 4 },
      { id: 'b', name: 'Bo', doublesRank: 10 },
      0
    );
    expect(team.name).toBe('Ada / Bo');
    expect(team.ranking).toBe(14);
  });

  it('shuffleInPlace s deterministickým rng jen permutuje', () => {
    const arr = ['a', 'b', 'c'];
    expect(shuffleInPlace([...arr], () => 0)).toEqual(['b', 'c', 'a']);
  });
});
