import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildVenueDisplayUrl,
  parseVenueDisplayRouteFromUrl,
  resolveAppEntry,
  resolveVenueLang,
} from '../venueDisplayRoutes';

describe('venueDisplayRoutes', () => {
  it('neimportuje tournamentLogic (vstupní chunk TV/hala)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../venueDisplayRoutes.js'), 'utf8');
    expect(src).not.toMatch(/from ['"].*tournamentLogic/);
  });

  it('parseVenueDisplayRouteFromUrl čte /tv/:pin a odmítne neplatný PIN', () => {
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/tv/1234', hash: '' })).toEqual({
      pin: '1234',
      invalid: false,
    });
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/tv/12', hash: '' })).toEqual({
      pin: null,
      invalid: true,
    });
    expect(parseVenueDisplayRouteFromUrl({ pathname: '/', hash: '' })).toBeNull();
  });

  it('resolveAppEntry oddělí TV od hlavní aplikace', () => {
    expect(resolveAppEntry({ pathname: '/tv/4321', hash: '' })).toEqual({
      kind: 'venue',
      pin: '4321',
      invalid: false,
    });
    expect(resolveAppEntry({ pathname: '/', hash: '' })).toEqual({ kind: 'app' });
    expect(resolveAppEntry({ pathname: '/results', hash: '' })).toEqual({ kind: 'app' });
  });

  it('buildVenueDisplayUrl a resolveVenueLang', () => {
    expect(buildVenueDisplayUrl('1234', 'https://example.test', 'en')).toBe(
      'https://example.test/tv/1234?lang=en'
    );
    expect(resolveVenueLang('?lang=pl')).toBe('pl');
    expect(resolveVenueLang('?lang=en')).toBe('en');
  });
});
