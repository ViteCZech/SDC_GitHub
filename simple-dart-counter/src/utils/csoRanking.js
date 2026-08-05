import { doc, getDoc } from 'firebase/firestore';
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
 * @returns {Promise<{ meta: object, players: Array<{ rank: number, name: string, club?: string }> }|null>}
 */
async function loadCsoRankingFromFirestore(gender) {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'cso_rankings', gender));
    if (!snap.exists()) return null;
    const data = snap.data();
    const players = Array.isArray(data?.players) ? data.players : [];
    if (players.length === 0) return null;
    return { meta: data?.meta ?? {}, players };
  } catch {
    return null;
  }
}

/**
 * @param {'men'|'women'} gender
 * @returns {Promise<{ meta: object, players: Array<{ rank: number, name: string, club?: string }> }>}
 */
async function loadCsoRankingFromStatic(gender) {
  const res = await fetch(CSO_RANKING_FILES[gender]);
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
 * Naformátuje ISO timestamp z meta.updatedAt pro zobrazení v UI (DD.MM.YYYY HH:mm).
 * @param {string|undefined|null} isoString
 * @param {string} [locale='cs-CZ']
 * @returns {string|null}
 */
export function formatCsoUpdatedAt(isoString, locale = 'cs-CZ') {
  if (!isoString) return null;
  const d = new Date(isoString);
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

  const fromFirestore = await loadCsoRankingFromFirestore(g);
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
