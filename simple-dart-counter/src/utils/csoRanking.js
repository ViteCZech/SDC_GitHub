import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';

const CSO_BASE_URL = 'https://www.stedar.org/alms/league/rankings.view?orgId=1';

export const CSO_RANKING_URLS = {
  men: `${CSO_BASE_URL}&rankingId=1`,
  women: `${CSO_BASE_URL}&rankingId=2`,
};

export const CSO_RANKING_FILES = {
  men: '/data/cso-ranking-men.json',
  women: '/data/cso-ranking-women.json',
};

/** @type {Map<'men'|'women', { meta: object, players: Array<{ rank: number, name: string, club?: string }> }>} */
const cache = new Map();

/**
 * Vymaže in-memory cache (po ruční aktualizaci z Firestore).
 * @param {'men'|'women'|null} [gender] null = oba
 */
export function clearCsoRankingCache(gender = null) {
  if (gender === 'men' || gender === 'women') {
    cache.delete(gender);
    return;
  }
  cache.clear();
}

/**
 * @param {'men'|'women'} gender
 * @param {{ fromServer?: boolean }} [options]
 * @returns {Promise<{ meta: object, players: Array<{ rank: number, name: string, club?: string }> }|null>}
 */
async function loadCsoRankingFromFirestore(gender, options = {}) {
  if (!db) return null;
  const ref = doc(db, 'cso_rankings', gender);
  try {
    const snap = options.fromServer ? await getDocFromServer(ref) : await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    const players = Array.isArray(data?.players) ? data.players : [];
    if (players.length === 0) return null;
    return { meta: data?.meta ?? {}, players };
  } catch (err) {
    console.warn('[csoRanking] Firestore read failed', gender, err?.code || err?.message || err);
    // Po ruční aktualizaci neber starý offline snapshot — ať se nesplete se static JSON.
    if (options.fromServer) return null;
    return null;
  }
}

/**
 * @param {'men'|'women'} gender
 * @returns {Promise<{ meta: object, players: Array<{ rank: number, name: string, club?: string }> }>}
 */
async function loadCsoRankingFromStatic(gender) {
  const sep = CSO_RANKING_FILES[gender].includes('?') ? '&' : '?';
  const res = await fetch(`${CSO_RANKING_FILES[gender]}${sep}_ts=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Nepodařilo se načíst žebříček (${res.status})`);
  }
  const data = await res.json();
  const players = Array.isArray(data?.players) ? data.players : [];
  return { meta: data?.meta ?? {}, players };
}

/**
 * @param {'men'|'women'|string} gender
 * @returns {string}
 */
export function getCsoRankingUrl(gender) {
  return gender === 'women' ? CSO_RANKING_URLS.women : CSO_RANKING_URLS.men;
}

/**
 * Naformátuje datum žebříčku ze Stedar / meta.updatedAt pro UI.
 * Preferuje kalendářní den ze Stedar (bez TZ posunu), u ISO s časem zobrazí i hodiny.
 * @param {string|undefined|null} isoString
 * @param {string} [locale='cs-CZ']
 * @returns {string|null}
 */
export function formatCsoUpdatedAt(isoString, locale = 'cs-CZ') {
  if (!isoString) return null;
  const raw = String(isoString).trim();

  // Stedar „YYYY-MM-DD“ nebo ISO půlnoc/poledne → jen datum (žebříček „k datumu“)
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T12:00:00(?:\.000)?Z)?$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${d}.${m}.${y}`;
  }

  // Stedar / ISO s časem — vezmi komponenty z řetězce (bez TZ posunu dne)
  const withTime = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/
  );
  if (withTime) {
    const [, y, m, d, h, mi] = withTime;
    return `${d}.${m}.${y} ${h.padStart(2, '0')}:${mi}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Načte žebříček — priorita Firestore (Cloud Function), fallback statické JSON v public/data.
 * @param {'men'|'women'|string} gender
 * @param {{ bypassCache?: boolean }} [options]
 * @returns {Promise<{ meta: object, players: Array<{ rank: number, name: string, club?: string }> }>}
 */
export async function loadCsoRanking(gender, options = {}) {
  const g = gender === 'women' ? 'women' : 'men';
  if (!options.bypassCache && cache.has(g)) return cache.get(g);

  const fromFirestore = await loadCsoRankingFromFirestore(g, {
    fromServer: !!options.bypassCache,
  });
  if (fromFirestore) {
    cache.set(g, fromFirestore);
    return fromFirestore;
  }

  const result = await loadCsoRankingFromStatic(g);
  cache.set(g, result);
  return result;
}

/**
 * Odstraní diakritiku a sjednotí text pro porovnávání.
 * @param {string} str
 */
export function normalizeForSearch(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Fuzzy vyhledávání hráčů podle jména (tokeny, bez diakritiky).
 * @param {Array<{ rank: number, name: string, club?: string }>} players
 * @param {string} query
 * @param {number} [limit=8]
 */
export function searchCsoPlayers(players, query, limit = 8) {
  const q = normalizeForSearch(query);
  if (!q || q.length < 2 || !Array.isArray(players)) return [];

  const qTokens = q.split(/[\s,]+/).filter(Boolean);

  return players
    .filter((p) => {
      const normName = normalizeForSearch(p?.name ?? '');
      return qTokens.every((tok) => normName.includes(tok));
    })
    .sort((a, b) => {
      const na = normalizeForSearch(a.name);
      const nb = normalizeForSearch(b.name);
      const aStarts = na.startsWith(q) ? 0 : 1;
      const bStarts = nb.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return (a.rank ?? 9999) - (b.rank ?? 9999);
    })
    .slice(0, limit);
}
