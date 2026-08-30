import * as cheerio from 'cheerio';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import process from 'node:process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data');

const RANKINGS = [
  {
    gender: 'men',
    rankingId: 1,
    file: 'cso-ranking-men.json',
    url: 'https://www.stedar.org/alms/league/rankings.view?orgId=1&rankingId=1',
  },
  {
    gender: 'women',
    rankingId: 2,
    file: 'cso-ranking-women.json',
    url: 'https://www.stedar.org/alms/league/rankings.view?orgId=1&rankingId=2',
  },
  {
    gender: 'doubles',
    rankingId: 6,
    file: 'cso-ranking-doubles.json',
    url: 'https://www.stedar.org/alms/league/rankings.view?orgId=1&rankingId=6',
  },
];

function withCacheBust(url) {
  const u = new URL(url);
  u.searchParams.set('_ts', String(Date.now()));
  return u.toString();
}

async function fetchHtml(url) {
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
 * @param {string} raw
 * @returns {string|null}
 */
function stedarDateToIso(raw) {
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
 * Čte Effective/Generated date (EN) nebo K datumu/Zaktualizován (CS) ze stránky Stedar.
 * @param {string} html
 */
function parseRankingPageMeta(html) {
  const $ = cheerio.load(html);
  const text = ($('#middlebox').text() || $.root().text() || '').replace(/\s+/g, ' ');

  const generatedMatch = text.match(
    /(?:Generated\s*date|Zaktualizov[aá]n(?:o|ý|a)?)\s*[:=]?\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?)/i
  );
  const effectiveMatch = text.match(
    /(?:Effective\s*date|K\s*datumu|Ke\s*dni)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i
  );

  let generatedAt = generatedMatch?.[1] ?? null;
  let effectiveDate = effectiveMatch?.[1] ?? null;

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

/**
 * Parsuje tabulku #rankingsTable ze Stedar (sloupce: #, Name, Reg. #, Club, Points).
 * @param {string} html
 * @returns {Array<{ rank: number, name: string, club?: string }>}
 */
function parseRankingTable(html) {
  const $ = cheerio.load(html);
  const players = [];

  $('#rankingsTable tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    const rank = parseInt($(cells[0]).text().trim(), 10);
    if (!Number.isFinite(rank)) return;

    const name = $(cells[1]).text().trim();
    const regRaw = $(cells[2]).text().trim();
    const club = $(cells[3]).text().trim();
    if (!name) return;

    const regNumber = regRaw && regRaw !== '–' && regRaw !== '-' ? regRaw : undefined;

    players.push({
      rank,
      name,
      ...(club ? { club } : {}),
      ...(regNumber ? { regNumber } : {}),
    });
  });

  return players;
}

async function fetchAndSave({ gender, file, url }) {
  console.log(`[${gender}] Stahuji: ${url}`);
  try {
    const html = await fetchHtml(url);
    const pageMeta = parseRankingPageMeta(html);
    const players = parseRankingTable(html);

    if (players.length === 0) {
      throw new Error(`Žádní hráči pro ${gender} – změnila se struktura stránky Stedar?`);
    }

    const payload = {
      meta: {
        gender,
        updatedAt: pageMeta.updatedAt,
        effectiveDate: pageMeta.effectiveDate,
        generatedAt: pageMeta.generatedAt,
        fetchedAt: new Date().toISOString(),
        totalPlayers: players.length,
      },
      players,
    };

    const outPath = join(OUT_DIR, file);
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(
      `[${gender}] OK – ${players.length} hráčů, Stedar ${pageMeta.generatedAt || pageMeta.effectiveDate || pageMeta.updatedAt} → ${outPath}`
    );
    return { gender, totalPlayers: players.length, updatedAt: pageMeta.updatedAt };
  } catch (err) {
    console.error(`[${gender}] CHYBA:`, err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  const errors = [];

  for (const cfg of RANKINGS) {
    try {
      const result = await fetchAndSave(cfg);
      results.push(result);
    } catch (err) {
      errors.push({ gender: cfg.gender, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (results.length > 0) {
    console.log('Úspěšně aktualizováno:', results);
  }

  if (errors.length > 0) {
    console.error('Selhalo:', errors);
    process.exit(1);
  }

  console.log('Hotovo – žebříčky aktualizovány (muži, ženy, dvojice).');
}

main().catch((err) => {
  console.error('Chyba při aktualizaci žebříčků:', err);
  process.exit(1);
});
