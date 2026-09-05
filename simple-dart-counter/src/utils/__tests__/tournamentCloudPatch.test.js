import { describe, expect, it } from 'vitest';
import { buildTournamentFieldPatch } from '../tournamentCloudPatch';

const next = {
  tournamentData: { name: 'Pátek', groups: [{ groupId: 'A' }] },
  groups: [{ groupId: 'A' }],
  groupMatches: [{ matchId: 'm1', status: 'pending' }],
  tournamentBracket: [],
  status: 'running',
  ownerUid: 'u1',
  lastUpdated: '2026-09-05T07:00:00.000Z',
};

describe('buildTournamentFieldPatch', () => {
  it('create když dokument chybí', () => {
    expect(buildTournamentFieldPatch(null, next)).toEqual({ mode: 'create', payload: next });
  });

  it('skip když se nic nezměnilo (i při jiném lastUpdated)', () => {
    const existing = { ...next, lastUpdated: 'older' };
    expect(buildTournamentFieldPatch(existing, next)).toEqual({ mode: 'skip' });
  });

  it('update jen groupMatches když se změnil jeden zápas', () => {
    const existing = {
      ...next,
      groupMatches: [{ matchId: 'm1', status: 'pending' }],
    };
    const incoming = {
      ...next,
      groupMatches: [{ matchId: 'm1', status: 'completed', winnerId: 'p1' }],
    };
    const plan = buildTournamentFieldPatch(existing, incoming);
    expect(plan.mode).toBe('update');
    expect(Object.keys(plan.patch).sort()).toEqual(['groupMatches', 'lastUpdated']);
    expect(plan.patch.groupMatches[0].status).toBe('completed');
    expect(plan.patch).not.toHaveProperty('tournamentData');
    expect(plan.patch).not.toHaveProperty('tournamentBracket');
  });

  it('update status + bracket spolu, bez groups', () => {
    const existing = { ...next, status: 'running', tournamentBracket: [] };
    const incoming = {
      ...next,
      status: 'finished',
      tournamentBracket: [{ matches: [{ id: 'f', status: 'completed' }] }],
    };
    const plan = buildTournamentFieldPatch(existing, incoming);
    expect(plan.mode).toBe('update');
    expect(plan.patch).toHaveProperty('status', 'finished');
    expect(plan.patch).toHaveProperty('tournamentBracket');
    expect(plan.patch).not.toHaveProperty('groups');
  });
});
