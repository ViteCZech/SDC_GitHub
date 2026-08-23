import { describe, expect, it } from 'vitest';
import {
  deriveThrowerFromHistory,
  isDoublesMatch,
  otherMemberId,
  pendingThrowerSide,
} from '../doublesThrowOrder';

const settings = {
  doubles: true,
  teams: {
    p1: { members: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bo' }] },
    p2: { members: [{ id: 'c', name: 'Cy' }, { id: 'd', name: 'Di' }] },
  },
};

describe('doublesThrowOrder', () => {
  it('isDoublesMatch vyžaduje dva týmy po dvou členech', () => {
    expect(isDoublesMatch(settings)).toBe(true);
    expect(isDoublesMatch({ doubles: true, teams: { p1: { members: [{}] }, p2: { members: [{}, {}] } } })).toBe(
      false
    );
  });

  it('dokud strana nevybere házejícího, pendingThrowerSide ji drží', () => {
    expect(pendingThrowerSide({ currentPlayer: 'p1', startingThrowers: {} }, settings)).toBe('p1');
    expect(
      pendingThrowerSide({ currentPlayer: 'p1', startingThrowers: { p1: 'a', p2: 'c' } }, settings)
    ).toBeNull();
  });

  it('po hodu strany se střídá soupeř, uvnitř týmu se střídají členové', () => {
    const starters = { p1: 'a', p2: 'c' };
    const afterP1 = deriveThrowerFromHistory(
      settings,
      [{ player: 'p1', throwerId: 'a' }],
      'p1',
      starters
    );
    expect(afterP1.currentPlayer).toBe('p2');
    expect(afterP1.throwerId).toBe('c');

    const afterP2 = deriveThrowerFromHistory(
      settings,
      [
        { player: 'p2', throwerId: 'c' },
        { player: 'p1', throwerId: 'a' },
      ],
      'p1',
      starters
    );
    expect(afterP2.currentPlayer).toBe('p1');
    expect(afterP2.throwerId).toBe('b');
  });

  it('otherMemberId vrací druhého člena týmu', () => {
    expect(otherMemberId(settings.teams.p1.members, 'a')).toBe('b');
  });
});
