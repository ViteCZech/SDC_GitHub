/**
 * Routing pro TV obrazovku /tv/:pin — bez turnajové logiky,
 * aby vstupní App.jsx nenačetl tournamentLogic.
 */

/**
 * @param {Pick<Location, 'pathname'|'hash'>|null|undefined} loc
 * @returns {{ pin: string|null, invalid: boolean }|null}
 */
export function parseVenueDisplayRouteFromUrl(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc) return null;
  const path = String(loc.pathname || '');
  const hash = String(loc.hash || '').replace(/^#/, '');
  const match =
    path.match(/^\/tv\/([^/]+)\/?$/i) || hash.match(/^\/?tv\/([^/]+)\/?$/i);
  if (!match) return null;
  const raw = decodeURIComponent(match[1] || '').trim();
  if (!/^\d{4}$/.test(raw)) return { pin: null, invalid: true };
  return { pin: raw, invalid: false };
}

/**
 * @param {string|number} pin
 * @param {string} [origin]
 * @param {string} [lang]
 */
export function buildVenueDisplayUrl(pin, origin, lang) {
  const o =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://simple-dart-counter-12ff2.web.app');
  const base = `${String(o).replace(/\/+$/, '')}/tv/${encodeURIComponent(String(pin ?? '').trim())}`;
  if (lang === 'cs' || lang === 'en' || lang === 'pl') return `${base}?lang=${lang}`;
  return base;
}

/**
 * @param {string} [search]
 */
export function resolveVenueLang(search = typeof window !== 'undefined' ? window.location.search : '') {
  const q = new URLSearchParams(search || '').get('lang');
  if (q === 'cs' || q === 'en' || q === 'pl') return q;
  const nav = typeof navigator !== 'undefined' ? String(navigator.language || '').toLowerCase() : '';
  if (nav.startsWith('pl')) return 'pl';
  if (nav.startsWith('en')) return 'en';
  return 'cs';
}

/**
 * @param {Pick<Location, 'pathname'|'hash'>|null|undefined} loc
 * @returns {{ kind: 'venue', pin: string|null, invalid: boolean } | { kind: 'app' }}
 */
export function resolveAppEntry(loc = typeof window !== 'undefined' ? window.location : null) {
  const venue = parseVenueDisplayRouteFromUrl(loc);
  if (venue) return { kind: 'venue', pin: venue.pin, invalid: venue.invalid };
  return { kind: 'app' };
}
