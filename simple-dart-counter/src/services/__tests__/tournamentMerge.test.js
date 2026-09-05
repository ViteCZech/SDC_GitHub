import { describe, expect, it } from 'vitest';
import {
  mergeAdminBracketFromTabletCloud,
  mergeAdminGroupMatchesFromTabletCloud,
} from '../tournamentSync';

describe('mergeAdminGroupMatchesFromTabletCloud', () => {
  it('cloud completed přepíše lokální pending', () => {
    const local = [{ matchId: 'm1', status: 'pending', player1Id: 'a', player2Id: 'b' }];
    const cloud = [
      {
        matchId: 'm1',
        status: 'completed',
        winnerId: 'a',
        completedAt: 50,
        player1Id: 'a',
        player2Id: 'b',
      },
    ];
    const next = mergeAdminGroupMatchesFromTabletCloud(local, cloud);
    expect(next[0].status).toBe('completed');
    expect(next[0].winnerId).toBe('a');
  });

  it('lokální novější completedAt se nenechá přepsat starším cloudem', () => {
    const local = [
      { matchId: 'm1', status: 'completed', winnerId: 'a', completedAt: 90, player1Id: 'a', player2Id: 'b' },
    ];
    const cloud = [
      { matchId: 'm1', status: 'completed', winnerId: 'b', completedAt: 10, player1Id: 'a', player2Id: 'b' },
    ];
    const next = mergeAdminGroupMatchesFromTabletCloud(local, cloud);
    expect(next[0].winnerId).toBe('a');
  });

  it('lokální completed nenechá pending cloud vrátit zápas zpět', () => {
    const local = [
      { matchId: 'm1', status: 'completed', winnerId: 'a', completedAt: 40, player1Id: 'a', player2Id: 'b' },
    ];
    const cloud = [{ matchId: 'm1', status: 'pending', player1Id: 'a', player2Id: 'b' }];
    const next = mergeAdminGroupMatchesFromTabletCloud(local, cloud);
    expect(next[0].status).toBe('completed');
    expect(next[0].winnerId).toBe('a');
  });
});

describe('mergeAdminBracketFromTabletCloud', () => {
  it('cloud completed v pavouku se sloučí do lokálního pending', () => {
    const local = [{ matches: [{ id: 'b1', status: 'pending' }] }];
    const cloud = [{ matches: [{ id: 'b1', status: 'completed', winnerId: 'p2', completedAt: 3 }] }];
    const next = mergeAdminBracketFromTabletCloud(local, cloud);
    expect(next[0].matches[0].status).toBe('completed');
    expect(next[0].matches[0].winnerId).toBe('p2');
  });
});
