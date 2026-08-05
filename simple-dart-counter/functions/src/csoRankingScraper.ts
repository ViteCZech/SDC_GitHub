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

export interface CsoRankingPayload {
  meta: {
    gender: CsoGender;
    updatedAt: string;
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

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SDC-Ranking-Updater/2.0 (+https://github.com/)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
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
  const players = parseRankingTable(html);

  if (players.length === 0) {
    throw new Error(
      `Žádní hráči pro ${gender} – změnila se struktura stránky Stedar nebo stránka je prázdná?`
    );
  }

  const payload: CsoRankingPayload = {
    meta: {
      gender,
      updatedAt: new Date().toISOString(),
      totalPlayers: players.length,
    },
    players,
  };

  logger.info(`CSO ranking fetch ok: ${gender}`, { totalPlayers: players.length });
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
  });
}

export interface CsoRankingUpdateResult {
  updatedAt: string;
  men: { totalPlayers: number };
  women: { totalPlayers: number };
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

  return {
    updatedAt: new Date().toISOString(),
    men: { totalPlayers: men.meta.totalPlayers },
    women: { totalPlayers: women.meta.totalPlayers },
    totalPlayers: men.meta.totalPlayers + women.meta.totalPlayers,
  };
}
