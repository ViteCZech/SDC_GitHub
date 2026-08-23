import { describe, expect, it } from 'vitest';
import {
  expandBusyIdsWithTeamMembers,
  pickWorsePlayerFromTeam,
  pickRotatingRefereeFromTeam,
} from '../doublesReferee';

const team = {
  kind: 'team',
  id: 't1',
  name: 'A / B',
  members: [
    { id: 'good', name: 'Good', doublesRank: 2 },
    { id: 'worse', name: 'Worse', doublesRank: 40 },
  ],
};

describe('doublesReferee', () => {
  it('z páru bere horšího (vyšší ČP) jako počtáře', () => {
    expect(pickWorsePlayerFromTeam(team)?.id).toBe('worse');
  });

  it('jednotlivce vrátí jako osobu', () => {
    expect(pickWorsePlayerFromTeam({ id: 'solo', name: 'Solo' })).toEqual({
      id: 'solo',
      name: 'Solo',
    });
  });

  it('rotace: první zápas horší, druhý druhý člen', () => {
    const used = new Map();
    expect(pickRotatingRefereeFromTeam(team, used)?.id).toBe('worse');
    expect(pickRotatingRefereeFromTeam(team, used)?.id).toBe('good');
  });

  it('expandBusyIdsWithTeamMembers přidá členy hrajícího páru', () => {
    const busy = expandBusyIdsWithTeamMembers(new Set(['t1']), [{ players: [team] }]);
    expect(busy.has('t1')).toBe(true);
    expect(busy.has('good')).toBe(true);
    expect(busy.has('worse')).toBe(true);
  });
});
