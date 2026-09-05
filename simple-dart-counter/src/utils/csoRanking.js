import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { compareTeamSeeds, computeTeamSeed, isTeamPlayer } from './doublesSeeding';

const CSO_BASE_URL = 'https://www.stedar.org/alms/league/rankings.view?orgId=1';

export const CSO_RANKING_URLS = {
  men: `${CSO_BASE_URL}&rankingId=1`,
  women: `${CSO_BASE_URL}&rankingId=2`,
  /** ČP – dvojice nasazovací. Jen turnaje doubles/mixed/random_doubles. */
  doubles: `${CSO_BASE_URL}&rankingId=6`,
};

export const CSO_RANKING_FILES = {
  men: '/data/cso-ranking-men.json',
  women: '/data/cso-ranking-women.json',
  doubles: '/data/cso-ranking-doubles.json',
};

/** @type {Map<'men'|'women'|'doubles', { meta: object, players: Array<{ rank: number, name: string, club?: string, regNumber?: string }> }>} */
const cache = new Map();

/**
 * @param {string} key
 * @returns {'men'|'women'|'doubles'}
 */
export function normalizeCsoListKey(key) {
  if (key === 'women' || key === 'doubles') return key;
  return 'men';
}

/**
 * Vymaže in-memory cache (po ruční aktualizaci z Firestore).
 * @param {'men'|'women'|'doubles'|null} [gender] null = všechny
 */
export function clearCsoRankingCache(gender = null) {
  if (gender === 'men' || gender === 'women' || gender === 'doubles') {
    cache.delete(gender);
    return;
  }
  cache.clear();
}

/**
 * @param {'men'|'women'|'doubles'} gender
 * @param {{ fromServer?: boolean }} [options]
 * @returns {Promise<{ meta: object, players: Array<{ rank: number, name: string, club?: string, regNumber?: string }> }|null>}
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
 * @param {'men'|'women'|'doubles'} gender
 * @returns {Promise<{ meta: object, players: Array<{ rank: number, name: string, club?: string, regNumber?: string }> }>}
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
  if (gender === 'doubles') return CSO_RANKING_URLS.doubles;
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
 * Datum žebříčku pro UI — preferuj Stedar Generated / Effective před sync timestampem.
 * @param {{ updatedAt?: string|null, generatedAt?: string|null, effectiveDate?: string|null }|null|undefined} meta
 * @returns {string|null}
 */
export function getCsoRankingDisplayDate(meta) {
  if (!meta || typeof meta !== 'object') return null;
  return meta.generatedAt || meta.effectiveDate || meta.updatedAt || null;
}

/**
 * Načte žebříček — priorita Firestore (Cloud Function), fallback statické JSON v public/data.
 * @param {'men'|'women'|'doubles'|string} gender
 * @param {{ bypassCache?: boolean }} [options]
 * @returns {Promise<{ meta: object, players: Array<{ rank: number, name: string, club?: string, regNumber?: string }> }>}
 */
export async function loadCsoRanking(gender, options = {}) {
  const g = normalizeCsoListKey(gender);
  if (!options.bypassCache && cache.has(g)) return cache.get(g);

  const fromFirestore = await loadCsoRankingFromFirestore(g, {
    fromServer: !!options.bypassCache,
  });
  if (fromFirestore) {
    cache.set(g, fromFirestore);
    return fromFirestore;
  }

  // Při vynuceném serverovém čtení nespadni tiše na starý static JSON, pokud Firestore selhal —
  // zkus ještě jednou běžný getDoc (offline cache), pak teprve static.
  if (options.bypassCache) {
    const cachedFs = await loadCsoRankingFromFirestore(g, { fromServer: false });
    if (cachedFs) {
      cache.set(g, cachedFs);
      return cachedFs;
    }
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

/** @type {WeakMap<object, { byNormName: Map<string, object>, byReg: Map<string, object>, searchRows: Array<{ player: object, nameN: string }> }>} */
const lookupCache = new WeakMap();

function getCsoLookup(players) {
  if (!Array.isArray(players) || players.length === 0) {
    return { byNormName: new Map(), byReg: new Map(), searchRows: [] };
  }
  const cached = lookupCache.get(players);
  if (cached) return cached;
  const byNormName = new Map();
  const byReg = new Map();
  const searchRows = [];
  for (const p of players) {
    const nameN = normalizeForSearch(p?.name);
    const reg = String(p?.regNumber ?? '').trim();
    if (nameN && !byNormName.has(nameN)) byNormName.set(nameN, p);
    if (reg) byReg.set(reg, p);
    searchRows.push({ player: p, nameN });
  }
  const index = { byNormName, byReg, searchRows };
  lookupCache.set(players, index);
  return index;
}

/** Náhled in-memory cache bez I/O (okamžité našeptávání). */
export function peekCsoRankingCache(gender) {
  const g = normalizeCsoListKey(gender);
  return cache.get(g) || null;
}

/**
 * Přesná shoda jména v žebříčku (bez diakritiky / case).
 * Pro plovoucí ranking — ne fuzzy, ať se nepřiřadí špatná pozice.
 * @param {Array<{ rank: number, name: string, club?: string }>} players
 * @param {string} name
 * @returns {{ rank: number, name: string, club?: string }|null}
 */
export function findCsoPlayerByName(players, name) {
  const n = normalizeForSearch(name);
  if (!n || !Array.isArray(players)) return null;
  return getCsoLookup(players).byNormName.get(n) ?? null;
}

/**
 * Shoda v žebříčku podle ČŠO Reg. #, jinak podle jména.
 * @param {Array<{ rank: number, name: string, regNumber?: string }>} players
 * @param {{ name?: string, csoPlayerId?: string|null }} player
 */
export function findCsoPlayerEntry(players, player) {
  if (!Array.isArray(players) || !player) return null;
  const rawId = String(player.csoPlayerId ?? '').trim();
  const regFromId = rawId.startsWith('cso:') ? rawId.slice(4) : '';
  if (regFromId) {
    const byReg = getCsoLookup(players).byReg.get(regFromId);
    if (byReg) return byReg;
  }
  return findCsoPlayerByName(players, player.name);
}

/**
 * @param {string} name
 * @param {Array<{ rank: number, name: string }>|null|undefined} players
 * @returns {number|null}
 */
export function resolvePlayerLiveRank(name, players) {
  const hit = findCsoPlayerByName(players, name);
  if (hit?.rank == null || Number.isNaN(Number(hit.rank))) return null;
  return Number(hit.rank);
}

/**
 * Najde rank v jednom nebo více žebříčcích (např. muži + ženy).
 * @param {string} name
 * @param {...Array<{ rank: number, name: string }>} lists
 * @returns {number|null}
 */
export function resolvePlayerLiveRankFromLists(name, ...lists) {
  for (const list of lists) {
    const rank = resolvePlayerLiveRank(name, list);
    if (rank != null) return rank;
  }
  return null;
}

/**
 * Při generování losu: živý žebříček → trvalý snímek ranků hráčů.
 * @param {{
 *   players: Array<{ id?: string, name: string, ranking?: number|null }>,
 *   rankingData?: { meta?: object, players?: Array<{ rank: number, name: string }> }|null,
 *   gender?: 'men'|'women'|string|null,
 *   useCsoRanking?: boolean,
 * }} opts
 * @returns {{
 *   players: Array<{ id?: string, name: string, ranking: number|null }>,
 *   rankingSnapshot: {
 *     gender: 'men'|'women'|null,
 *     useCsoRanking: boolean,
 *     snappedAt: number,
 *     sourceMeta: object|null,
 *   },
 * }}
 */
export function buildDrawRankingSnapshot(opts) {
  const useCso = !!opts?.useCsoRanking;
  const rankingKind = opts?.rankingKind === 'doubles' ? 'doubles' : 'singles';
  const gender =
    rankingKind === 'doubles'
      ? 'doubles'
      : opts?.gender === 'women'
        ? 'women'
        : opts?.gender === 'men'
          ? 'men'
          : useCso
            ? 'men'
            : null;
  const list = opts?.rankingData?.players ?? [];
  const players = (opts?.players || []).map((p) => {
    const name = String(p?.name ?? '').trim();
    if (isTeamPlayer(p) || rankingKind === 'doubles') {
      const members = (p.members ?? []).map((m) => {
        const memberName = String(m?.name ?? '').trim();
        let doublesRank = m?.doublesRank ?? null;
        if (useCso && rankingKind === 'doubles') {
          const hit = findCsoPlayerEntry(list, m);
          doublesRank = hit?.rank != null ? Number(hit.rank) : null;
        }
        return { ...m, name: memberName, doublesRank };
      });
      const seed = computeTeamSeed(members, p.seedTieBreak);
      return {
        ...p,
        kind: 'team',
        name,
        members,
        ranking: seed.ranking,
        seedBestMemberRank: seed.seedBestMemberRank,
        seedTieBreak: seed.seedTieBreak,
      };
    }

    let ranking = null;
    if (useCso && rankingKind === 'singles') {
      ranking = resolvePlayerLiveRank(name, list);
    } else if (p?.ranking != null && !Number.isNaN(Number(p.ranking))) {
      ranking = Number(p.ranking);
    }
    return {
      ...p,
      name,
      ranking,
    };
  });

  if (rankingKind === 'doubles' || players.some((p) => isTeamPlayer(p))) {
    players.sort(compareTeamSeeds);
  } else {
    players.sort((a, b) => {
      const ha = a.ranking != null;
      const hb = b.ranking != null;
      if (ha && hb) return a.ranking - b.ranking;
      if (ha && !hb) return -1;
      if (!ha && hb) return 1;
      return String(a.name).localeCompare(String(b.name), 'cs');
    });
  }

  return {
    players,
    rankingSnapshot: {
      gender,
      rankingKind,
      useCsoRanking: useCso,
      snappedAt: Date.now(),
      sourceMeta: opts?.rankingData?.meta ?? null,
    },
  };
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
  const { searchRows } = getCsoLookup(players);

  return searchRows
    .filter((row) => qTokens.every((tok) => row.nameN.includes(tok)))
    .sort((a, b) => {
      const aStarts = a.nameN.startsWith(q) ? 0 : 1;
      const bStarts = b.nameN.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return (a.player.rank ?? 9999) - (b.player.rank ?? 9999);
    })
    .slice(0, limit)
    .map((row) => row.player);
}
