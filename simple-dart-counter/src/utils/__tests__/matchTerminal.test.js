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

  it('isMatchTerminal správně rozpoznává terminální stavy', () => {
    expect(isMatchTerminal(null)).toBe(false);
    expect(isMatchTerminal(undefined)).toBe(false);
    expect(isMatchTerminal({})).toBe(false);
    expect(isMatchTerminal({ status: 'pending' })).toBe(false);
    expect(isMatchTerminal({ status: 'playing' })).toBe(false);
    expect(isMatchTerminal({ status: 'completed' })).toBe(true);
    expect(isMatchTerminal({ status: 'walkover' })).toBe(true);
    expect(isMatchTerminal({ walkover: true })).toBe(true);
    expect(isMatchTerminal({ status: 'pending', walkover: true })).toBe(true);
  });

  it('zachová walkover terminální stav před přepsáním pending nebo playing', () => {
    const walkoverMatch = {
      matchId: 'm1',
      status: 'walkover',
      winnerId: 'p2',
      walkover: true,
      completedAt: 150,
      whoStarts: 'p1',
    };
    const incomingPending = {
      status: 'pending',
      walkover: false,
      tabletStatus: 'assigned',
      whoStarts: 'p2',
    };
    const res = applyMatchPatchPreservingTerminal(walkoverMatch, incomingPending);
    expect(isMatchTerminal(res)).toBe(true);
    expect(res.status).toBe('walkover');
    expect(res.winnerId).toBe('p2');
    expect(res.walkover).toBe(true);
    // povolené telemetry a metadata vlastnosti se přenesou
    expect(res.tabletStatus).toBe('assigned');
    expect(res.whoStarts).toBe('p2');
  });

  it('při souběžném zápisu dvou dokončení se stejným časem nebo bez completedAt vyhraje příchozí patch', () => {
    const cur = { status: 'completed', winnerId: 'p1', completedAt: 100, score: '2:1' };
    const patchSameTime = { status: 'completed', winnerId: 'p2', completedAt: 100, score: '1:2' };
    const res = applyMatchPatchPreservingTerminal(cur, patchSameTime);
    expect(res.winnerId).toBe('p2');
    expect(res.score).toBe('1:2');
  });

  it('propíše všechny specifikované tablet telemetry klíče i když je zápas hotový', () => {
    const cur = {
      matchId: 'm2',
      status: 'completed',
      winnerId: 'p1',
      completedAt: 200,
    };
    const patch = {
      status: 'pending',
      tabletStatus: 'waiting_room',
      tabletCheckInPresent: { p1: true, p2: true, referee: true },
      tabletCheckInResume: { leg: 2 },
      tabletTimeoutWarningCount: 2,
      tabletTimeoutAdminAckedCount: 1,
      tabletTimeoutRoleWarningCounts: { p1: 1, p2: 0, referee: 1 },
      whoStarts: 'p1',
      customIgnoredField: 'should_not_be_copied',
    };
    const res = applyMatchPatchPreservingTerminal(cur, patch);
    expect(res.status).toBe('completed');
    expect(res.winnerId).toBe('p1');
    expect(res.tabletStatus).toBe('waiting_room');
    expect(res.tabletCheckInPresent).toEqual({ p1: true, p2: true, referee: true });
    expect(res.tabletCheckInResume).toEqual({ leg: 2 });
    expect(res.tabletTimeoutWarningCount).toBe(2);
    expect(res.tabletTimeoutAdminAckedCount).toBe(1);
    expect(res.tabletTimeoutRoleWarningCounts).toEqual({ p1: 1, p2: 0, referee: 1 });
    expect(res.whoStarts).toBe('p1');
    expect(res.customIgnoredField).toBeUndefined();
  });
});
