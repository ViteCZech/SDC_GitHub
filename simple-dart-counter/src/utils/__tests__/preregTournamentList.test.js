import { describe, expect, it } from 'vitest';
import {
  canRegisterFromCatalog,
  formatLocationLabel,
  getTournamentCatalogBadge,
  getVenuePlaceName,
  sortByNearestStart,
  sortByPreferredCityThenStart,
} from '../preregTournamentList';

const t = (overrides = {}) => {
  const { meta, counters, ...rest } = overrides;
  return {
    status: 'REGISTRATION_OPEN',
    meta: { capacity: 16, waitlistEnabled: false, competitionType: 'singles', ...meta },
    counters: { confirmed: 4, ...counters },
    ...rest,
  };
};

describe('preregTournamentList', () => {
  it('badge OPEN / FULL podle kapacity a waitlistu, mix bere confirmedTeams', () => {
    expect(getTournamentCatalogBadge(t({ counters: { confirmed: 16 } }))).toBe('FULL');
    expect(
      getTournamentCatalogBadge(t({ meta: { waitlistEnabled: true }, counters: { confirmed: 16 } }))
    ).toBe('OPEN');
    expect(
      getTournamentCatalogBadge(
        t({
          meta: { competitionType: 'mixed', capacity: 8 },
          counters: { confirmed: 20, confirmedTeams: 8 },
        })
      )
    ).toBe('FULL');
    expect(getTournamentCatalogBadge({ status: 'IN_PROGRESS' })).toBe('ACTIVE');
    expect(getTournamentCatalogBadge({ status: 'FINISHED' })).toBe('FINISHED');
    expect(canRegisterFromCatalog(t({ counters: { confirmed: 1 } }))).toBe(true);
    expect(canRegisterFromCatalog(t({ counters: { confirmed: 16 } }))).toBe(false);
  });

  it('sortByNearestStart: budoucí nejdřív, pak minulé, bez data nakonec', () => {
    const now = Date.now();
    const items = [
      { id: 'none', meta: {} },
      { id: 'later', meta: { startsAt: new Date(now + 20 * 86400000).toISOString() } },
      { id: 'soon', meta: { startsAt: new Date(now + 2 * 86400000).toISOString() } },
      { id: 'past', meta: { startsAt: new Date(now - 5 * 86400000).toISOString() } },
    ];
    expect([...items].sort(sortByNearestStart).map((x) => x.id)).toEqual([
      'soon',
      'later',
      'past',
      'none',
    ]);
  });

  it('preferované město má přednost před termínem', () => {
    const now = Date.now();
    const brnoLater = {
      id: 'brno',
      meta: {
        startsAt: new Date(now + 10 * 86400000).toISOString(),
        location: { city: 'Brno' },
      },
    };
    const prahaSoon = {
      id: 'praha',
      meta: {
        startsAt: new Date(now + 1 * 86400000).toISOString(),
        location: { city: 'Praha' },
      },
    };
    const cmp = sortByPreferredCityThenStart('brno');
    expect([prahaSoon, brnoLater].sort(cmp).map((x) => x.id)).toEqual(['brno', 'praha']);
  });

  it('místo: venueName, případně sloučení s legacy venue', () => {
    expect(
      getVenuePlaceName({ meta: { location: { venueName: 'Hospoda U Třech' }, venue: 'Hospoda U Třech' } })
    ).toBe('Hospoda U Třech');
    expect(
      getVenuePlaceName({ meta: { location: { venueName: 'Hospoda' }, venue: 'Stará adresa' } })
    ).toBe('Hospoda, Stará adresa');
    expect(
      formatLocationLabel({
        meta: { location: { venueName: 'Hospoda', city: 'Brno', region: 'Jihomoravský kraj' } },
      })
    ).toBe('Hospoda · Brno · Jihomoravský kraj');
  });
});
