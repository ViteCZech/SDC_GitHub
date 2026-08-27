/**
 * Veřejné výsledky turnajů:
 * - /results
 * - /results/top
 * - /results/:resultId
 */
export function parsePublicResultsRouteFromUrl() {
  if (typeof window === 'undefined') return null;
  const path = String(window.location.pathname || '');

  if (/^\/results\/?$/i.test(path)) {
    return { view: 'home' };
  }
  if (/^\/results\/top\/?$/i.test(path)) {
    return { view: 'top' };
  }

  const detail = path.match(/^\/results\/([^/]+)\/?$/i);
  if (detail) {
    const resultId = decodeURIComponent(detail[1] || '').trim();
    if (resultId) return { view: 'detail', resultId };
  }

  return null;
}
