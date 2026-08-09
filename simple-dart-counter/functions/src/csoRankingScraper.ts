import * as cheerio from 'cheerio';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApp, getApps } from 'firebase-admin/app';
import * as logger from 'firebase-functions/logger';

export type CsoGender = 'men' | 'women';

export interface CsoPlayer {
  rank: number;
  name: string;
  club?: string;
}

export interface CsoRankingPageMeta {
  /** Preferované datum žebříčku ze Stedar (Generated → Effective). ISO nebo YYYY-MM-DD. */
  updatedAt: string;
  /** Effective date ze stránky (YYYY-MM-DD), pokud je k dispozici. */
  effectiveDate: string | null;
  /** Generated date ze stránky („YYYY-MM-DD HH:mm“), pokud je k dispozici. */
  generatedAt: string | null;
}

export interface CsoRankingPayload {
  meta: {
    gender: CsoGender;
    updatedAt: string;
    effectiveDate?: string | null;
    generatedAt?: string | null;
    fetchedAt: string;
    totalPlayers: number;
  };
  players: CsoPlayer[];
}

const RANKING_CONFIG: Array<{ gender: CsoGender; url: string }> = [
  {
    gender: 'men',
    url: 'https://www.stedar.org/alms/league/rankings.view?orgId=1&rankingId=1',
  },
  {
    gender: 'women',
    url: 'https://www.stedar.org/alms/league/rankings.view?orgId=1&rankingId=2',
  },
];

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');

/** Přidá cache-bust query param, ať CDN/proxy nevrací starou HTML stránku. */
export function withCacheBust(url: string): string {
  const u = new URL(url);
  u.searchParams.set('_ts', String(Date.now()));
  return u.toString();
}

async function fetchHtml(url: string): Promise<string> {
  const busted = withCacheBust(url);
  const res = await fetch(busted, {
    headers: {
      'User-Agent': 'SDC-Ranking-Updater/2.1 (+https://github.com/)',
      Accept: 'text/html,application/xhtml+xml',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${busted}`);
  }
  return res.text();
}

/**
 * Převede Stedar datum („YYYY-MM-DD“ nebo „YYYY-MM-DD HH:mm“) na ISO řetězec
 * bez posunu dne (wall-clock jako lokální komponenty → UTC stejné číslice).
 */
export function stedarDateToIso(raw: string): string | null {
  const m = String(raw)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  if (hh != null && mm != null) {
    return `${y}-${mo}-${d}T${hh.padStart(2, '0')}:${mm}:00.000Z`;
  }
  return `${y}-${mo}-${d}T12:00:00.000Z`;
}

/**
 * Čte meta žebříčku ze Stedar HTML:
 * - „Generated date“ / „Zaktualizován“ (s časem)
 * - „Effective date“ / „K datumu“
 * Anglické i české varianty labelů.
 */
export function parseRankingPageMeta(html: string): CsoRankingPageMeta {
  const $ = cheerio.load(html);
  const text = ($('#middlebox').text() || $.root().text() || '').replace(/\s+/g, ' ');

  const generatedMatch = text.match(
    /(?:Generated\s*date|Zaktualizov[aá]n(?:o|ý|a)?)\s*[:=]?\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?)/i
  );
  const effectiveMatch = text.match(
    /(?:Effective\s*date|K\s*datumu|Ke\s*dni)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i
  );

  // Fallback: tabulka label | hodnota
  let generatedAt: string | null = generatedMatch?.[1] ?? null;
  let effectiveDate: string | null = effectiveMatch?.[1] ?? null;

  if (!generatedAt || !effectiveDate) {
    $('table.tablebox tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;
      const label = $(cells[0]).text().replace(/\s+/g, ' ').trim().toLowerCase();
      const value = $(cells[1]).text().replace(/\s+/g, ' ').trim();
      if (!generatedAt && /generated\s*date|zaktualiz/.test(label)) {
        const m = value.match(/(\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?)/);
        if (m) generatedAt = m[1];
      }
      if (!effectiveDate && /effective\s*date|k\s*datumu|ke\s*dni/.test(label)) {
        const m = value.match(/(\d{4}-\d{2}-\d{2})/);
        if (m) effectiveDate = m[1];
      }
    });
  }

  const preferredRaw = generatedAt || effectiveDate;
  const updatedAt = preferredRaw
    ? stedarDateToIso(preferredRaw) || new Date().toISOString()
    : new Date().toISOString();

  return { updatedAt, effectiveDate, generatedAt };
}

/** Parsuje tabulku #rankingsTable ze Stedar (sloupce: #, Name, Reg. #, Club, Points). */
export function parseRankingTable(html: string): CsoPlayer[] {
  const $ = cheerio.load(html);
  const players: CsoPlayer[] = [];

  $('#rankingsTable tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    const rank = parseInt($(cells[0]).text().trim(), 10);
    if (!Number.isFinite(rank)) return;

    const name = $(cells[1]).text().trim();
    const club = $(cells[3]).text().trim();
    if (!name) return;

    players.push({
      rank,
      name,
      ...(club ? { club } : {}),
    });
  });

  return players;
}

export async function fetchCsoRanking(gender: CsoGender, url: string): Promise<CsoRankingPayload> {
  logger.info(`CSO ranking fetch start: ${gender}`, { url });
  const html = await fetchHtml(url);
  const pageMeta = parseRankingPageMeta(html);
  const players = parseRankingTable(html);

  if (players.length === 0) {
    throw new Error(
      `Žádní hráči pro ${gender} – změnila se struktura stránky Stedar nebo stránka je prázdná?`
    );
  }

  const fetchedAt = new Date().toISOString();
  const payload: CsoRankingPayload = {
    meta: {
      gender,
      updatedAt: pageMeta.updatedAt,
      effectiveDate: pageMeta.effectiveDate,
      generatedAt: pageMeta.generatedAt,
      fetchedAt,
      totalPlayers: players.length,
    },
    players,
  };

  logger.info(`CSO ranking fetch ok: ${gender}`, {
    totalPlayers: players.length,
    updatedAt: pageMeta.updatedAt,
    effectiveDate: pageMeta.effectiveDate,
    generatedAt: pageMeta.generatedAt,
  });
  return payload;
}

async function saveRankingToFirestore(payload: CsoRankingPayload): Promise<void> {
  await db.collection('cso_rankings').doc(payload.meta.gender).set({
    meta: payload.meta,
    players: payload.players,
    syncedAt: FieldValue.serverTimestamp(),
  });
  logger.info(`CSO ranking saved to Firestore: ${payload.meta.gender}`, {
    totalPlayers: payload.meta.totalPlayers,
    updatedAt: payload.meta.updatedAt,
    effectiveDate: payload.meta.effectiveDate,
    generatedAt: payload.meta.generatedAt,
  });
}

export interface CsoRankingUpdateResult {
  updatedAt: string;
  men: { totalPlayers: number; updatedAt: string };
  women: { totalPlayers: number; updatedAt: string };
  totalPlayers: number;
}

/**
 * Stáhne oba žebříčky ze Stedar a uloží do Firestore `cso_rankings/{gender}`.
 * Při chybě jednoho pohlaví loguje detail a propaguje chybu (nic se neuloží částečně).
 */
export async function runCsoRankingUpdate(): Promise<CsoRankingUpdateResult> {
  const results: CsoRankingPayload[] = [];

  for (const cfg of RANKING_CONFIG) {
    try {
      const payload = await fetchCsoRanking(cfg.gender, cfg.url);
      await saveRankingToFirestore(payload);
      results.push(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`CSO ranking update failed for ${cfg.gender}`, {
        gender: cfg.gender,
        url: cfg.url,
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw new Error(`Import žebříčku (${cfg.gender}) selhal: ${message}`);
    }
  }

  const men = results.find((r) => r.meta.gender === 'men')!;
  const women = results.find((r) => r.meta.gender === 'women')!;

  // Pro UI vrať novější ze Stedar dat (ne čas běhu funkce).
  const updatedAt =
    men.meta.updatedAt >= women.meta.updatedAt ? men.meta.updatedAt : women.meta.updatedAt;

  return {
    updatedAt,
    men: { totalPlayers: men.meta.totalPlayers, updatedAt: men.meta.updatedAt },
    women: { totalPlayers: women.meta.totalPlayers, updatedAt: women.meta.updatedAt },
    totalPlayers: men.meta.totalPlayers + women.meta.totalPlayers,
  };
}
