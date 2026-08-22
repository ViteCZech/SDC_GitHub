/**
 * Pomocné funkce pro seznamy / katalog turnajů předregistrace.
 */

/**
 * @param {object} item
 * @returns {number|null}
 */
export function getStartsAtMs(item) {
  const s = item?.meta?.startsAt;
  if (!s) return null;
  try {
    const d = s.toDate ? s.toDate() : new Date(s);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

/** Budoucí termíny první (nejbližší), pak minulé, bez data na konci. */
export function sortByNearestStart(a, b) {
  const ma = getStartsAtMs(a);
  const mb = getStartsAtMs(b);
  if (ma == null && mb == null) return 0;
  if (ma == null) return 1;
  if (mb == null) return -1;

  const now = Date.now();
  const aFuture = ma >= now;
  const bFuture = mb >= now;
  if (aFuture && bFuture) return ma - mb;
  if (aFuture && !bFuture) return -1;
  if (!aFuture && bFuture) return 1;
  return mb - ma;
}

/**
 * Nejdřív turnaje v preferovaném městě (textová shoda), pak podle termínu.
 * Bez GPS — poloha v katalogu je jen město / podnik / kraj.
 * @param {string} preferredCity
 * @returns {(a: object, b: object) => number}
 */
export function sortByPreferredCityThenStart(preferredCity) {
  const key = String(preferredCity ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const cityScore = (item) => {
    if (!key) return 1;
    const city = String(item?.meta?.location?.city ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    const region = String(item?.meta?.location?.region ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (!city && !region) return 2;
    if (city === key || region === key) return 0;
    if (city.includes(key) || key.includes(city) || region.includes(key)) return 1;
    return 2;
  };

  return (a, b) => {
    const sa = cityScore(a);
    const sb = cityScore(b);
    if (sa !== sb) return sa - sb;
    return sortByNearestStart(a, b);
  };
}

/**
 * @param {object} tournament
 * @returns {'OPEN'|'FULL'|'ACTIVE'|'FINISHED'|'OTHER'}
 */
export function getTournamentCatalogBadge(tournament) {
  const status = tournament?.status;
  const confirmed = tournament?.counters?.confirmed ?? 0;
  const capacity = tournament?.meta?.capacity;
  const unlimited = capacity == null || capacity === 0;
  const waitlist = !!tournament?.meta?.waitlistEnabled;
  const full = !unlimited && capacity > 0 && confirmed >= capacity;

  if (status === 'REGISTRATION_OPEN') {
    if (full && !waitlist) return 'FULL';
    return 'OPEN';
  }
  if (status === 'REGISTRATION_CLOSED' || status === 'IN_PROGRESS') return 'ACTIVE';
  if (status === 'FINISHED') return 'FINISHED';
  return 'OTHER';
}

/**
 * @param {object} tournament
 * @returns {boolean}
 */
export function canRegisterFromCatalog(tournament) {
  return getTournamentCatalogBadge(tournament) === 'OPEN';
}

/**
 * Sloučené místo (podnik / adresa) — nové turnaje ukládají stejný text do venue i location.venueName.
 * @param {object} tournament
 * @returns {string}
 */
export function getVenuePlaceName(tournament) {
  const loc = tournament?.meta?.location;
  const fromStructured = String(loc?.venueName || '').trim();
  const fromLegacy = String(tournament?.meta?.venue || '').trim();
  if (fromStructured && fromLegacy && fromStructured !== fromLegacy) {
    return `${fromStructured}, ${fromLegacy}`;
  }
  return fromStructured || fromLegacy;
}

/**
 * Text pro vyhledávání v mapách: podnik, město, kraj (bez duplicit).
 * @param {object} tournament
 * @returns {string}
 */
export function getMapsSearchQuery(tournament) {
  const loc = tournament?.meta?.location;
  const parts = [
    getVenuePlaceName(tournament),
    loc?.city,
    loc?.region,
  ]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean);
  return [...new Set(parts)].join(', ');
}

/**
 * Google Maps search URL, nebo null když není co hledat.
 * @param {object} tournament
 * @returns {string|null}
 */
export function buildMapsSearchUrl(tournament) {
  const q = getMapsSearchQuery(tournament);
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * @param {object} tournament
 * @returns {string}
 */
export function formatLocationLabel(tournament) {
  const loc = tournament?.meta?.location;
  const parts = [
    getVenuePlaceName(tournament),
    loc?.city,
    loc?.region,
  ]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.join(' · ') || '–';
}
