import * as cheerio from 'cheerio';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
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
];

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SDC-Ranking-Updater/1.0 (+https://github.com/)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
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

async function fetchAndSave({ gender, file, url }) {
  console.log(`Stahuji ${gender}: ${url}`);
  const html = await fetchHtml(url);
  const players = parseRankingTable(html);

  if (players.length === 0) {
    throw new Error(`Žádní hráči pro ${gender} – změnila se struktura stránky Stedar?`);
  }

  const payload = {
    meta: {
      gender,
      updatedAt: new Date().toISOString(),
      totalPlayers: players.length,
    },
    players,
  };

  const outPath = join(OUT_DIR, file);
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Uloženo ${players.length} hráčů → ${outPath}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const cfg of RANKINGS) {
    await fetchAndSave(cfg);
  }
  console.log('Hotovo.');
}

main().catch((err) => {
  console.error('Chyba při aktualizaci žebříčků:', err);
  process.exit(1);
});
