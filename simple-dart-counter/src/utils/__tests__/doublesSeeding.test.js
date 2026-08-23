import { describe, expect, it } from 'vitest';
import { compareTeamSeeds, computeTeamSeed, isTeamPlayer } from '../doublesSeeding';

describe('doublesSeeding', () => {
  it('seed páru je součet ČP obou hráčů, lepší individuální rank jako tie-break', () => {
    const seed = computeTeamSeed([{ doublesRank: 4 }, { doublesRank: 10 }], 0.5);
    expect(seed.ranking).toBe(14);
    expect(seed.seedBestMemberRank).toBe(4);
    expect(seed.seedTieBreak).toBe(0.5);
  });

  it('pár bez obou ranků je nenasazený', () => {
    const seed = computeTeamSeed([{ doublesRank: 3 }, { doublesRank: null }], 1);
    expect(seed.ranking).toBeNull();
    expect(seed.seedBestMemberRank).toBeNull();
  });

  it('compareTeamSeeds: nižší součet dřív, nenasazený až za nasazenými', () => {
    const better = { ranking: 8, seedBestMemberRank: 2, seedTieBreak: 0.2, name: 'A/B', id: 't1' };
    const worse = { ranking: 20, seedBestMemberRank: 5, seedTieBreak: 0.1, name: 'C/D', id: 't2' };
    const unranked = { ranking: null, seedBestMemberRank: null, seedTieBreak: 0.9, name: 'E/F', id: 't3' };
    expect(compareTeamSeeds(better, worse)).toBeLessThan(0);
    expect(compareTeamSeeds(better, unranked)).toBeLessThan(0);
    expect(compareTeamSeeds(unranked, worse)).toBeGreaterThan(0);
  });

  it('při stejném součtu vyhraje pár s lepším (nižším) individuálním rankem', () => {
    const a = { ranking: 20, seedBestMemberRank: 4, seedTieBreak: 0.9, name: 'A', id: '1' };
    const b = { ranking: 20, seedBestMemberRank: 8, seedTieBreak: 0.1, name: 'B', id: '2' };
    expect(compareTeamSeeds(a, b)).toBeLessThan(0);
  });

  it('isTeamPlayer vyžaduje kind team a alespoň 2 členy', () => {
    expect(isTeamPlayer({ kind: 'team', members: [{}, {}] })).toBe(true);
    expect(isTeamPlayer({ kind: 'team', members: [{}] })).toBe(false);
    expect(isTeamPlayer({ name: 'Solo' })).toBe(false);
  });
});
