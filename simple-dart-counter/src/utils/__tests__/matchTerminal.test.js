import { describe, expect, it } from 'vitest';
import { applyMatchPatchPreservingTerminal, isMatchTerminal } from '../matchTerminal';

describe('applyMatchPatchPreservingTerminal', () => {
  it('návrat z completed na pending zahodí, telemetry nechá', () => {
    const current = {
      matchId: 'm1',
      status: 'completed',
      winnerId: 'p1',
      completedAt: 100,
      tabletStatus: 'completed',
    };
    const next = applyMatchPatchPreservingTerminal(current, {
      status: 'playing',
      tabletStatus: 'checked_in',
    });
    expect(isMatchTerminal(next)).toBe(true);
    expect(next.winnerId).toBe('p1');
    expect(next.tabletStatus).toBe('checked_in');
  });

  it('novější completedAt vyhraje', () => {
    const current = { status: 'completed', winnerId: 'p1', completedAt: 50, score1: 2 };
    const next = applyMatchPatchPreservingTerminal(current, {
      status: 'completed',
      winnerId: 'p2',
      completedAt: 90,
      score1: 0,
    });
    expect(next.winnerId).toBe('p2');
  });

  it('starší completedAt nepřepíše novější výsledek', () => {
    const current = { status: 'completed', winnerId: 'p1', completedAt: 90 };
    const next = applyMatchPatchPreservingTerminal(current, {
      status: 'completed',
      winnerId: 'p2',
      completedAt: 10,
    });
    expect(next.winnerId).toBe('p1');
  });

  it('pending se běžně sloučí s patchem', () => {
    const next = applyMatchPatchPreservingTerminal(
      { matchId: 'm1', status: 'pending' },
      { status: 'playing', tabletStatus: 'ready_to_play' }
    );
    expect(next).toEqual({
      matchId: 'm1',
      status: 'playing',
      tabletStatus: 'ready_to_play',
    });
  });
});
