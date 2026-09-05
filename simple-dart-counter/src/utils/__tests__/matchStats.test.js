import { describe, expect, it } from 'vitest';
import {
  calculateStats,
  doublesResultExtras,
  getTranslatedName,
  loserRefereePerson,
} from '../matchStats';

describe('matchStats', () => {
  it('getTranslatedName přeloží výchozí jména, vlastní nechá', () => {
    expect(getTranslatedName('Home', true, 'cs')).toBe('Domácí');
    expect(getTranslatedName('Away', false, 'cs')).toBe('Hosté');
    expect(getTranslatedName('Bot', false, 'cs')).toBe('Robot');
    expect(getTranslatedName('Jalůvka', true, 'cs')).toBe('Jalůvka');
    expect(getTranslatedName('', true, 'cs')).toBe('');
  });

  it('calculateStats ignoruje bust a spočítá průměr / checkout', () => {
    const stats = calculateStats(
      [
        {
          winner: 'p1',
          history: [
            { player: 'p1', score: 180, dartsUsed: 3, remaining: 321 },
            { player: 'p2', score: 60, dartsUsed: 3, remaining: 441 },
            { player: 'p1', score: 26, dartsUsed: 3, remaining: 321, isBust: true },
            { player: 'p1', score: 141, dartsUsed: 3, remaining: 0 },
          ],
        },
      ],
      'A',
      'B'
    );
    expect(stats.p1DartsTotal).toBe(6);
    expect(stats.p1Avg).toBe(160.5);
    expect(stats.p1High['180']).toBe(1);
    expect(stats.p1High['140+']).toBe(1);
    expect(stats.p1HighCheckout).toBe(141);
    expect(stats.legDetails[0]).toMatchObject({ winner: 'A', winnerKey: 'p1', checkout: 141, darts: 6 });
  });

  it('doublesResultExtras a loserRefereePerson nesou jen dostupná data', () => {
    expect(doublesResultExtras({})).toEqual({});
    expect(
      doublesResultExtras({ members: { a: 1 }, legStarters: ['x'] })
    ).toEqual({ members: { a: 1 }, legStarters: ['x'] });
    expect(loserRefereePerson(null, 'X', {}, {}, [])).toBeNull();
    expect(loserRefereePerson('p9', 'Novák', {}, { players: [] }, [])).toEqual({
      id: 'p9',
      name: 'p9',
    });
  });
});
