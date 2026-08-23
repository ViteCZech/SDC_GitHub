import { describe, expect, it } from 'vitest';
import {
  hasDrawRankingSnapshot,
  isTournamentRankingLocked,
  stripPlayerRankingsForLive,
  withRankingsLocked,
} from '../tournamentRanking';

describe('tournamentRanking', () => {
  it('hasDrawRankingSnapshot jen když existuje rankingSnapshot', () => {
    expect(hasDrawRankingSnapshot({ rankingSnapshot: { at: 1 } })).toBe(true);
    expect(hasDrawRankingSnapshot({})).toBe(false);
    expect(hasDrawRankingSnapshot(null)).toBe(false);
  });

  it('isTournamentRankingLocked: živý turnaj nebo rankingsLocked', () => {
    expect(isTournamentRankingLocked({}, true)).toBe(true);
    expect(isTournamentRankingLocked({ rankingsLocked: true }, false)).toBe(true);
    expect(isTournamentRankingLocked({}, false)).toBe(false);
  });

  it('stripPlayerRankingsForLive vynuluje singles ranking, týmům ho nechá', () => {
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
