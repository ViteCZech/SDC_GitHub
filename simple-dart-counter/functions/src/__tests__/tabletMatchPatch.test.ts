import { describe, expect, it } from 'vitest';
import {
  applyMatchPatchPreservingTerminal,
  buildTabletMatchDocPatch,
} from '../tabletMatchPatch';

describe('applyMatchPatchPreservingTerminal', () => {
  it('návrat z completed na pending zahodí', () => {
    const next = applyMatchPatchPreservingTerminal(
      { status: 'completed', winnerId: 'p1', completedAt: 100 },
      { status: 'playing', tabletStatus: 'checked_in' }
    );
    expect(next.status).toBe('completed');
    expect(next.winnerId).toBe('p1');
    expect(next.tabletStatus).toBe('checked_in');
  });
});

describe('buildTabletMatchDocPatch', () => {
  const raw = {
    tournamentData: { name: 'Pátek' },
    groups: [{ groupId: 'A' }],
    groupMatches: [
      { matchId: 'm1', status: 'pending' },
      { matchId: 'm2', status: 'completed', winnerId: 'p1', completedAt: 80 },
    ],
    tournamentBracket: [{ matches: [{ id: 'b1', status: 'pending' }] }],
    boardStatuses: { '1': { status: 'online' } },
    status: 'running',
  };

  it('group update vrací jen groupMatches + status, ne celý dokument', () => {
    const patch = buildTabletMatchDocPatch({
      raw,
      matchType: 'group',
      matchId: 'm1',
      patches: { status: 'completed', winnerId: 'p2', completedAt: 90 },
    });
    expect(patch).toHaveProperty('groupMatches');
    expect(patch).not.toHaveProperty('tournamentBracket');
    expect(patch).not.toHaveProperty('tournamentData');
    expect(patch).not.toHaveProperty('groups');
    expect(patch).not.toHaveProperty('boardStatuses');
    expect((patch.groupMatches?.[0] as { status: string }).status).toBe('completed');
    expect((patch.groupMatches?.[1] as { winnerId: string }).winnerId).toBe('p1');
  });

  it('hotový group zápas nepřepíše starší completedAt', () => {
    const patch = buildTabletMatchDocPatch({
      raw,
      matchType: 'group',
      matchId: 'm2',
      patches: { status: 'completed', winnerId: 'p2', completedAt: 10 },
    });
    expect((patch.groupMatches?.[1] as { winnerId: string }).winnerId).toBe('p1');
  });

  it('bracket update nemění groupMatches', () => {
    const patch = buildTabletMatchDocPatch({
      raw,
      matchType: 'bracket',
      matchId: 'b1',
      patches: { status: 'playing' },
    });
    expect(patch).toHaveProperty('tournamentBracket');
    expect(patch).not.toHaveProperty('groupMatches');
    const round = patch.tournamentBracket?.[0] as { matches: Array<{ status: string }> };
    expect(round.matches[0].status).toBe('playing');
  });
});
