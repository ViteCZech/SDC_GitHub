/**
 * Čisté matematické a logické funkce pro generování zápasů a výpočet predikce času.
 * Žádné UI závislosti.
 */

import { distributePlayersToGroups, distributePlayersToFixedGroups } from './tournamentGenerator';

const BRACKET_BYE_LABEL = 'Volný los';

/** Přímý pavouk bez skupin (nový `bracket_only` i legacy `ko_only`). */
export function isTournamentBracketOnlyFormat(fmt) {
  return fmt === 'bracket_only' || fmt === 'ko_only';
}

/** Skupiny a následně pavouk (`groups_bracket` / legacy `groups_ko`). */
export function isTournamentGroupsThenBracketFormat(fmt) {
  return fmt === 'groups_bracket' || fmt === 'groups_ko';
}

/** Standardní číselné nasazení (seed 1…N) do listů pavouka pro danou kapacitu. */
const SEEDING_TEMPLATES = {
  4: [1, 4, 2, 3],
  8: [1, 8, 4, 5, 3, 6, 2, 7],
  16: [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15],
  32: [1, 32, 16, 17, 9, 24, 8, 25, 5, 28, 12, 21, 13, 20, 4, 29, 3, 30, 14, 19, 11, 22, 6, 27, 7, 26, 10, 23, 15, 18, 2, 31],
  64: [
    1, 64, 32, 33, 16, 49, 17, 48, 9, 56, 24, 41, 8, 57, 25, 40, 5, 60, 28, 37, 12, 53, 21, 44, 13, 52, 20, 45, 4, 61, 29, 36,
    3, 62, 30, 35, 14, 51, 19, 46, 11, 54, 22, 43, 6, 59, 27, 38, 7, 58, 26, 39, 10, 55, 23, 42, 15, 50, 18, 47, 2, 63, 31, 34,
  ],
};

function getBracketSeedingTemplate(bracketSize) {
  if (SEEDING_TEMPLATES[bracketSize]) return SEEDING_TEMPLATES[bracketSize];
  if (bracketSize === 128) {
    const a = SEEDING_TEMPLATES[64];
    return [...a, ...a.map((s) => s + 64)];
  }
  const asc = [4, 8, 16, 32, 64].filter((k) => SEEDING_TEMPLATES[k]);
  const ge = asc.find((k) => k >= bracketSize);
  if (ge != null) return SEEDING_TEMPLATES[ge];
  return SEEDING_TEMPLATES[32];
}

const DEFAULT_MATCH_DURATION_MS = 15 * 60 * 1000; // 15 minut
const DEFAULT_LEG_TIME_MS = 3.5 * 60 * 1000; // 3.5 minuty

/** Oficiální šablony ČŠO: [Hráč 1, Hráč 2, Zapisovatel] – čísla jsou nasazení (1-based). */
const MATCH_TEMPLATES = {
  3: [
    [1, 3, 2], [2, 3, 1], [1, 2, 3],
  ],
  4: [
    [1, 4, 3], [2, 3, 4], [1, 3, 2], [2, 4, 3], [1, 2, 4], [3, 4, 1],
  ],
  5: [
    [1, 5, 3], [2, 4, 1], [3, 5, 2], [1, 4, 5], [2, 3, 4],
    [4, 5, 2], [1, 3, 4], [2, 5, 1], [3, 4, 5], [1, 2, 3],
  ],
  6: [
    [1, 6, 3], [2, 5, 4], [3, 4, 1], [1, 5, 2], [4, 6, 5],
    [2, 3, 6], [1, 4, 5], [3, 5, 2], [2, 6, 4], [1, 3, 6],
    [2, 4, 1], [5, 6, 3], [1, 2, 4], [3, 6, 5], [4, 5, 1],
  ],
};

function generateRoundRobinFallback(players, groupId) {
  const normalized = players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }));
  const n = normalized.length;
  const arr = n % 2 === 1 ? [...normalized, null] : [...normalized];
  const count = arr.length;
  const rounds = count - 1;
  const half = count / 2;
  let rotateIdx = Array.from({ length: count - 1 }, (_, i) => i + 1);
  const matches = [];

  for (let r = 0; r < rounds; r++) {
    const circle = [0, ...rotateIdx];
    const firstHalf = circle.slice(0, half);
    const secondHalf = circle.slice(half).reverse();
    const roundMatches = [];
    let byePlayerId = null;

    for (let i = 0; i < half; i++) {
      const a = arr[firstHalf[i]];
      const b = arr[secondHalf[i]];
      if (a !== null && b !== null) {
        roundMatches.push({ player1Id: a.id, player2Id: b.id });
      } else {
        byePlayerId = (a !== null ? a : b).id;
      }
    }

    const nonPlayingIds = normalized.map((p) => p.id).filter((id) => id !== byePlayerId);
    let chalkerPool = byePlayerId ? [byePlayerId] : [...nonPlayingIds];

    for (const m of roundMatches) {
      const available = chalkerPool.filter((id) => id !== m.player1Id && id !== m.player2Id);
      const chalkerId = available.length > 0 ? available[0] : null;
      if (chalkerId && byePlayerId) chalkerPool = chalkerPool.filter((id) => id !== chalkerId);
      matches.push({
        player1Id: m.player1Id,
        player2Id: m.player2Id,
        chalkerId,
        groupId,
        round: r + 1,
        status: 'pending',
      });
    }
    rotateIdx = [...rotateIdx.slice(1), rotateIdx[0]];
  }
  return matches;
}

/**
 * Vygeneruje rozpis zápasů Round Robin (každý s každým) podle šablon ČŠO nebo fallback algoritmu.
 *
 * @param {Array<{id: string, name?: string, [key: string]: any}>} players - pole hráčů ve skupině (řazení = nasazení 1,2,3...)
 * @param {string} groupId - ID skupiny (např. 'A')
 * @returns {Array<{player1Id: string, player2Id: string, chalkerId: string|null, groupId: string, round: number, status: 'pending'}>}
 */
export function generateRoundRobinSchedule(players, groupId) {
  if (!players || players.length < 2) return [];

  const normalized = players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }));
  const n = normalized.length;
  const template = MATCH_TEMPLATES[n];

  if (template) {
    const matchesPerRound = Math.floor(n / 2) || 1;
    return template.map(([p1, p2, chalker], i) => {
      const player1Id = normalized[p1 - 1].id;
      const player2Id = normalized[p2 - 1].id;
      const round = Math.floor(i / matchesPerRound) + 1;
      return {
        id: `${groupId}-r${round}-${player1Id}-${player2Id}`,
        player1Id,
        player2Id,
        chalkerId: normalized[chalker - 1]?.id ?? null,
        groupId,
        round,
        status: 'pending',
      };
    });
  }

  return generateRoundRobinFallback(normalized, groupId);
}

/**
 * Spočítá počet odehraných legů v zápase (score1 + score2).
 */
function getLegsInMatch(m) {
  const s1 = m.score1 ?? m.legsP1 ?? 0;
  const s2 = m.score2 ?? m.legsP2 ?? 0;
  return (Number(s1) || 0) + (Number(s2) || 0);
}

/**
 * Vypočítá odhadovaný čas konce skupinové fáze podle legů a terčů (kritická cesta).
 *
 * @param {Array<{groupId: string, players: Array, boards?: number[]}>} groups - pole skupin
 * @param {Array<{groupId?: string, status: string, startedAt?: number, completedAt?: number, score1?: number, score2?: number, legsP1?: number, legsP2?: number}>} matches - pole zápasů
 * @param {{groupsLegs?: number}} settings - groupsLegs = počet legů k vítězství (First to X)
 * @returns {{estimatedEnd: Date, avgMatchDurationMs: number, averageLegTimeMs: number}}
 */
export function calculateTournamentTimePrediction(groups, matches, settings = {}) {
  const now = Date.now();
  const legsToWin = settings?.groupsLegs ?? 3;
  const averageLegTimeMs = DEFAULT_LEG_TIME_MS;
  const averageLegsPerMatch = Math.max(1, (legsToWin * 2) - 0.5);
  const avgMatchDurationMs = averageLegsPerMatch * averageLegTimeMs;
  const unfinishedCount = (matches || []).filter((m) => m.status !== 'completed').length;

  const explicitBoards = Number(settings?.totalBoards);
  const fromSettings = Number.isFinite(explicitBoards) && explicitBoards > 0 ? explicitBoards : 0;
  const uniqueBoards = new Set();
  for (const g of groups || []) {
    for (const b of (g?.boards || [])) {
      const n = Number(b);
      if (Number.isFinite(n) && n > 0) uniqueBoards.add(n);
    }
  }
  const availableBoards = Math.max(1, fromSettings || uniqueBoards.size || 1);
  const remainingMs = (unfinishedCount * avgMatchDurationMs) / availableBoards;

  return {
    estimatedEnd: new Date(now + remainingMs),
    avgMatchDurationMs,
    averageLegTimeMs,
  };
}

/**
 * Vypočítá a seřadí pořadí hráčů ve skupině podle zápasů.
 *
 * @param {Array<{id: string, name?: string, [key: string]: any}>} groupPlayers - pole hráčů ve skupině
 * @param {Array<{status: string, player1Id: string, player2Id: string, result?: {p1Legs: number, p2Legs: number}, legsP1?: number, legsP2?: number, score1?: number, score2?: number}>} groupMatches - pole zápasů této skupiny
 * @returns {Array<{...player, played: number, wins: number, losses: number, legsWon: number, legsLost: number, legDifference: number, points: number, average: number}>} seřazené pole hráčů se statistikami
 */
export function calculateGroupStandings(groupPlayers, groupMatches) {
  const stats = (groupPlayers || []).map((p) => ({
    ...p,
    id: p.id ?? p,
    name: p.name ?? p.id ?? p,
    matchesWon: 0,
    matchesLost: 0,
    legsWon: 0,
    legsLost: 0,
    legDifference: 0,
    _avgSum: 0,
    _avgCount: 0,
  }));

  const byId = Object.fromEntries(stats.map((s) => [s.id, s]));

  const seen = new Set();
  for (const m of groupMatches || []) {
    const key =
      m.matchId ??
      m.id ??
      `${m.groupId ?? m.group}-${m.player1Id}-${m.player2Id}-${m.round ?? 'x'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (m.status !== 'completed') continue;

    // Skóre legů z match.result (turnaj); fallback na starší formáty (včetně 0 legů)
    const p1Legs = Number(m.result?.p1Legs ?? m.legsP1 ?? m.score1 ?? 0) || 0;
    const p2Legs = Number(m.result?.p2Legs ?? m.legsP2 ?? m.score2 ?? 0) || 0;

    const p1Stats = byId[m.player1Id];
    const p2Stats = byId[m.player2Id];
    if (!p1Stats || !p2Stats) continue;

    p1Stats.legsWon += p1Legs;
    p1Stats.legsLost += p2Legs;
    p2Stats.legsWon += p2Legs;
    p2Stats.legsLost += p1Legs;

    const winnerId =
      m.winnerId ??
      (p1Legs > p2Legs ? m.player1Id : (p2Legs > p1Legs ? m.player2Id : null));
    if (winnerId === m.player1Id) {
      p1Stats.matchesWon += 1;
      p2Stats.matchesLost += 1;
    } else if (winnerId === m.player2Id) {
      p2Stats.matchesWon += 1;
      p1Stats.matchesLost += 1;
    }

    const p1Avg = Number(m.result?.p1Avg ?? m.avgP1 ?? m.player1Avg);
    const p2Avg = Number(m.result?.p2Avg ?? m.avgP2 ?? m.player2Avg);
    if (Number.isFinite(p1Avg)) {
      p1Stats._avgSum += p1Avg;
      p1Stats._avgCount += 1;
    }
    if (Number.isFinite(p2Avg)) {
      p2Stats._avgSum += p2Avg;
      p2Stats._avgCount += 1;
    }
  }

  // Odvozené metriky pro tabulku
  for (const s of stats) {
    s.played = s.matchesWon + s.matchesLost;
    s.wins = s.matchesWon; // kompatibilita se stávajícím UI
    s.losses = s.matchesLost; // kompatibilita se stávajícím UI
    // Klasický formát: 1 výhra = 1 bod
    s.points = s.matchesWon;
    s.legDifference = s.legsWon - s.legsLost;
    // Průměr = průměr z uložených p1Avg/p2Avg v dohraných zápasech; bez dat 0,00
    const rawAvg = s._avgCount > 0 ? s._avgSum / s._avgCount : 0;
    s.average = Number(Number(rawAvg).toFixed(2));
    delete s._avgSum;
    delete s._avgCount;
  }

  const findHeadToHeadWinner = (aId, bId) => {
    const h2h = (groupMatches || []).find(
      (m) =>
        m.status === 'completed' &&
        ((m.player1Id === aId && m.player2Id === bId) || (m.player1Id === bId && m.player2Id === aId))
    );
    if (!h2h) return null;

    if (h2h.winnerId) return h2h.winnerId;
    const s1 = Number(h2h.result?.p1Legs ?? h2h.legsP1 ?? h2h.score1 ?? 0) || 0;
    const s2 = Number(h2h.result?.p2Legs ?? h2h.legsP2 ?? h2h.score2 ?? 0) || 0;
    if (s1 > s2) return h2h.player1Id;
    if (s2 > s1) return h2h.player2Id;
    return null;
  };

  // Oficiální tie-breakery:
  // 0) Odstoupivší hráči vždy na konec tabulky
  // 1) Počet výher v utkáních
  // 2) Rozdíl legů
  // 3) Počet vyhraných legů
  // 4) Vzájemný zápas
  return stats.sort((a, b) => {
    const aWithdrawn = !!a.isWithdrawn;
    const bWithdrawn = !!b.isWithdrawn;
    if (aWithdrawn !== bWithdrawn) return aWithdrawn ? 1 : -1;

    if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
    if (b.legDifference !== a.legDifference) return b.legDifference - a.legDifference;
    if (b.legsWon !== a.legsWon) return b.legsWon - a.legsWon;

    const h2hWinner = findHeadToHeadWinner(a.id, b.id);
    if (h2hWinner === b.id) return 1;
    if (h2hWinner === a.id) return -1;
    return 0;
  });
}

/**
 * Vypočítá "šipkařské" finální umístění podle vyřazení v KO pavouku.
 * Používá princip sdílených míst (competition ranking): např. 2 hráči na místě 3, další místo je 5.
 *
 * Pozn.: U nedokončeného pavouka přiřazuje umístění těm, kdo už byli vyřazeni (prohráli v completed zápase).
 * Nedokončeným účastníkům (zatím nevyřazeným) umístění nevrací.
 *
 * @param {Array<{matches: Array}>} bracketRounds
 * @returns {{placementById: Record<string, number>}}
 */
export function calculateFinalStandings(bracketRounds) {
  if (!Array.isArray(bracketRounds) || bracketRounds.length === 0) {
    return { placementById: {} };
  }

  const R = bracketRounds.length;
  // Předpoklad: pavouk má velikost P = 2^R (odpovídá generátoru).
  const P = Math.pow(2, R);

  const eliminationRoundById = {};

  for (let roundIndex = 0; roundIndex < bracketRounds.length; roundIndex++) {
    const matches = bracketRounds[roundIndex]?.matches ?? [];
    for (const match of matches) {
      if (!match) continue;
      if (match.status !== 'completed') continue;
      if (match.isBye) continue;
      if (!match.player1Id || !match.player2Id) continue;
      if (match.winnerId == null) continue;

      let loserId = null;
      if (match.winnerId === match.player1Id) loserId = match.player2Id;
      else if (match.winnerId === match.player2Id) loserId = match.player1Id;
      else continue;

      if (!loserId) continue;
      if (eliminationRoundById[loserId] == null) {
        eliminationRoundById[loserId] = roundIndex;
      }
    }
  }

  const placementById = {};
  const eliminatedAtRoundCount = (roundIndex) => P / Math.pow(2, roundIndex + 1);

  for (const [pid, eliminationRound] of Object.entries(eliminationRoundById)) {
    // champion: roundIndex == R (speciální)
    if (Number(eliminationRound) === R) {
      placementById[pid] = 1;
      continue;
    }

    const finishIndex = Number(eliminationRound);
    let betterFinishers = 1; // 1 = vítěz pavouka
    for (let k = finishIndex + 1; k <= R - 1; k++) {
      betterFinishers += eliminatedAtRoundCount(k);
    }
    const rank = betterFinishers + 1;
    placementById[pid] = Math.max(1, Math.round(rank));
  }

  return { placementById };
}

/**
 * Agregační statistiky za celý turnaj (průběžné).
 * Využívá průměry a další per-zápas data (p1Avg/p2Avg, p1DartsTotal/p2DartsTotal, p1High, p1HighCheckout, legDetails).
 *
 * @param {Array} groups turnajové skupiny (kvůli jménům hráčů)
 * @param {Array} bracketRounds kola pavouka
 * @param {Array} groupMatches odehrané zápasy ve skupinách
 */
export function calculateTournamentStats(groups = [], bracketRounds = [], groupMatches = []) {
  const bracketMatches = Array.isArray(bracketRounds)
    ? bracketRounds.flatMap((r) => (Array.isArray(r?.matches) ? r.matches : []))
    : [];

  const allMatches = [...(groupMatches || []), ...bracketMatches].filter((m) => m?.status === 'completed');

  const { placementById } = calculateFinalStandings(bracketRounds);

  // Mapování pro jména (fallback na id)
  const nameById = new Map();
  for (const g of groups || []) {
    for (const p of g?.players || []) {
      if (p?.id != null) nameById.set(p.id, p?.name ?? String(p.id));
    }
  }

  const keyOf = (id, name) => (id != null ? id : name != null ? name : null);

  const ensurePlayer = (pid, fallbackName) => {
    if (!pid) return null;
    if (playerAgg[pid]) return playerAgg[pid];
    playerAgg[pid] = {
      id: pid,
      name: nameById.get(pid) ?? fallbackName ?? String(pid),
      totalDartsThrown: 0,
      totalScore: 0,
      total180s: 0,
      total100plus: 0,
      total140plus: 0,
      totalCheckouts: 0,
      bestCheckout: 0,
      bestLegDarts: Infinity,
      bestLegPlayers: [],
    };
    return playerAgg[pid];
  };

  const playerAgg = {};

  let totalDartsThrown = 0;
  let totalScore = 0;

  let globalBestLegDarts = Infinity;

  const processPlayerFromMatch = (match, sideKey) => {
    const isP1 = sideKey === 'p1';
    const pid = keyOf(isP1 ? match.player1Id : match.player2Id, isP1 ? match.player1Name : match.player2Name);
    const pname = isP1 ? match.player1Name : match.player2Name;
    const pl = ensurePlayer(pid, pname);
    if (!pl) return;

    const avg = Number(
      match[`${sideKey}Avg`] ??
        match.result?.[`${sideKey}Avg`] ??
        match[`${sideKey}Average`] ??
        0
    );
    const darts = Number(
      match[`${sideKey}DartsTotal`] ?? match.result?.[`${sideKey}DartsTotal`] ?? 0
    );

    if (Number.isFinite(darts) && darts > 0 && Number.isFinite(avg) && avg > 0) {
      const score = (avg / 3) * darts;
      pl.totalDartsThrown += darts;
      pl.totalScore += score;
      totalDartsThrown += darts;
      totalScore += score;
    }

    const high = match[`${sideKey}High`] ?? match.result?.[`${sideKey}High`];
    if (high && typeof high === 'object') {
      pl.total180s += Number(high['180'] ?? 0) || 0;
      pl.total100plus += Number(high['100+'] ?? 0) || 0;
      pl.total140plus += Number(high['140+'] ?? 0) || 0;
    }

    const hc = Number(match[`${sideKey}HighCheckout`] ?? match.result?.[`${sideKey}HighCheckout`] ?? 0) || 0;
    if (Number.isFinite(hc) && hc > pl.bestCheckout) pl.bestCheckout = hc;
  };

  const processLegDetails = (match) => {
    const legs = match.legDetails ?? match.result?.legDetails;
    if (!Array.isArray(legs)) return;

    for (const ld of legs) {
      const winnerKey = ld?.winnerKey;
      const darts = Number(ld?.darts ?? 0) || 0;
      if (!darts || !winnerKey) continue;

      const pid =
        winnerKey === 'p1'
          ? keyOf(match.player1Id, match.player1Name)
          : winnerKey === 'p2'
            ? keyOf(match.player2Id, match.player2Name)
            : null;
      const pname = winnerKey === 'p1' ? match.player1Name : match.player2Name;
      const pl = ensurePlayer(pid, pname);
      if (!pl) continue;

      if (darts < pl.bestLegDarts) {
        pl.bestLegDarts = darts;
      }
      if (darts < globalBestLegDarts) {
        globalBestLegDarts = darts;
      }
    }
  };

  for (const m of allMatches) {
    processPlayerFromMatch(m, 'p1');
    processPlayerFromMatch(m, 'p2');
    processLegDetails(m);
  }

  const playerStatsArr = Object.values(playerAgg)
    .map((p) => {
      const avg = p.totalDartsThrown > 0 ? (p.totalScore / p.totalDartsThrown) * 3 : 0;
      return {
        ...p,
        average: Number(avg.toFixed(2)),
        placement: placementById?.[String(p.id)] ?? undefined,
      };
    })
    .sort((a, b) => b.average - a.average);

  const top180s = Object.values(playerAgg)
    .sort((a, b) => b.total180s - a.total180s)
    .slice(0, 3)
    .map((p) => ({ name: p.name, count: p.total180s }));

  const topCheckouts = Object.values(playerAgg)
    .sort((a, b) => b.bestCheckout - a.bestCheckout)
    .slice(0, 3)
    .map((p) => ({ name: p.name, checkout: p.bestCheckout }));

  const bestLegsPlayers = [];
  for (const p of Object.values(playerAgg)) {
    if (p.bestLegDarts !== Infinity && p.bestLegDarts === globalBestLegDarts) {
      bestLegsPlayers.push({ name: p.name, darts: p.bestLegDarts });
    }
  }

  // Double percent nemáme v uložených datových strukturách; vracíme null, aby UI/volající mohli volitelně zobrazit.
  const topDoublePercent = [];

  const globalAverage = totalDartsThrown > 0 ? (totalScore / totalDartsThrown) * 3 : 0;

  return {
    globalAverage: Number(globalAverage.toFixed(2)),
    totalDartsThrown,
    top180s,
    topCheckouts,
    bestLegs: bestLegsPlayers.sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    topDoublePercent,
    playerStats: playerStatsArr,
  };
}

/**
 * Nejmenší mocnina dvou ≥ n (min. 2).
 */
function nextPowerOfTwo(n) {
  const x = Math.max(1, Math.floor(Number(n)) || 1);
  let p = 2;
  while (p < x) p *= 2;
  return p;
}

/**
 * Postupující s `groupRank` a `groupName`; řazení jen podle umístění ve skupině a abecedy skupin
 * (žádné porovnávání bodů napříč skupinami). Pořadí do šablony: A1, B1, C1… pak A2, B2…
 */
function collectPromotedPlayersRanked(groups, toTake, matches) {
  const groupMetas = (groups || []).map((g, gi) => {
    const groupId = g.groupId ?? g.id ?? `group-${gi}`;
    const groupName =
      g.name ??
      (typeof groupId === 'string' && groupId.length === 1 ? groupId : String.fromCharCode(65 + gi));
    const groupMatches = (matches || []).filter((m) => (m.groupId ?? m.group) === groupId);
    const standings = calculateGroupStandings(g.players || [], groupMatches)
      .filter((p) => !p?.isWithdrawn);
    return { groupName, standings };
  });

  const promoted = [];
  for (let rank = 0; rank < toTake; rank++) {
    let addedAtRank = 0;
    for (const gm of groupMetas) {
      const p = gm.standings[rank];
      if (p) {
        addedAtRank += 1;
        promoted.push({
          seed: `${gm.groupName}${rank + 1}`,
          playerId: p.id,
          playerName: p.name ?? p.id ?? '?',
          groupRank: rank + 1,
          groupName: gm.groupName,
        });
      }
    }
    if (addedAtRank === 0) break;
  }

  promoted.sort((a, b) => {
    if (a.groupRank !== b.groupRank) {
      return a.groupRank - b.groupRank;
    }
    return String(a.groupName ?? '').localeCompare(String(b.groupName ?? ''));
  });

  return promoted;
}

/**
 * Pro 8 skupin × 4 postupující (32 hráčů) přemapuje nasazení na listech pavouku tak,
 * že prvních 8 zápasů 1. kola je vždy 1. místo vs 4. místo (napříč skupinami),
 * zápasů 9–16 je vždy 2. vs 3. místo. Pořadí dvojic odpovídá „vlnovému“ modelu (8 terčů)
 * při zachování stejné šablony listů (strom KO se nemění).
 * @returns {Array<{playerId: string, playerName: string}>|null} pole indexované seedem 0…31 (= seed 1…32), nebo null
 */
function tryBuildWaveSplitSeedPlayers32(groups, matches) {
  const sorted = [...(groups || [])].sort((a, b) => {
    const ga = String(a.groupId ?? a.id ?? a.name ?? '');
    const gb = String(b.groupId ?? b.id ?? b.name ?? '');
    return ga.localeCompare(gb, 'cs', { sensitivity: 'base', numeric: true });
  });
  if (sorted.length !== 8) return null;

  const firsts = [];
  const seconds = [];
  const thirds = [];
  const fourths = [];

  for (const g of sorted) {
    const groupId = g.groupId ?? g.id;
    const gm = (matches || []).filter((m) => (m.groupId ?? m.group) === groupId);
    const standings = calculateGroupStandings(g.players || [], gm)
      .filter((p) => !p?.isWithdrawn);
    if (!standings[0] || !standings[1] || !standings[2] || !standings[3]) return null;
    const row = (p) => ({ playerId: p.id, playerName: p.name ?? p.id ?? '?' });
    firsts.push(row(standings[0]));
    seconds.push(row(standings[1]));
    thirds.push(row(standings[2]));
    fourths.push(row(standings[3]));
  }

  const seedToPlayer = new Array(32).fill(null);

  // Šablona 32: seed čísla v prvních 8 zápasech (podle listů) — vždy 1. vs 4. ze skupin (A–H po řadě).
  seedToPlayer[0] = firsts[0];
  seedToPlayer[31] = fourths[7];
  seedToPlayer[15] = firsts[1];
  seedToPlayer[16] = fourths[6];
  seedToPlayer[8] = firsts[2];
  seedToPlayer[23] = fourths[5];
  seedToPlayer[7] = firsts[3];
  seedToPlayer[24] = fourths[4];
  seedToPlayer[4] = firsts[4];
  seedToPlayer[27] = fourths[3];
  seedToPlayer[11] = firsts[5];
  seedToPlayer[20] = fourths[2];
  seedToPlayer[12] = firsts[6];
  seedToPlayer[19] = fourths[1];
  seedToPlayer[3] = firsts[7];
  seedToPlayer[28] = fourths[0];

  // Zápasy 9–16 listů: vždy 2. vs 3. místo
  seedToPlayer[2] = seconds[0];
  seedToPlayer[29] = thirds[7];
  seedToPlayer[13] = seconds[1];
  seedToPlayer[18] = thirds[6];
  seedToPlayer[10] = seconds[2];
  seedToPlayer[21] = thirds[5];
  seedToPlayer[5] = seconds[3];
  seedToPlayer[26] = thirds[4];
  seedToPlayer[6] = seconds[4];
  seedToPlayer[25] = thirds[3];
  seedToPlayer[9] = seconds[5];
  seedToPlayer[22] = thirds[2];
  seedToPlayer[14] = seconds[6];
  seedToPlayer[17] = thirds[1];
  seedToPlayer[1] = seconds[7];
  seedToPlayer[30] = thirds[0];

  if (seedToPlayer.some((v) => !v)) return null;
  return seedToPlayer;
}

function isBracketByeName(name) {
  return name === BRACKET_BYE_LABEL || String(name ?? '').includes(BRACKET_BYE_LABEL);
}

/** Čekající zápas se dvěma reálnými hráči (ne walkover slot). */
export function isRealPendingBracketMatch(m) {
  if (m.status !== 'pending') return false;
  if (!m.player1Id || !m.player2Id) return false;
  if (isBracketByeName(m.player1Name) || isBracketByeName(m.player2Name)) return false;
  return true;
}

/**
 * Zástupný počtář (čeká na neexistujícího „proherce“ z BYE apod.) — musí se nahradit reálným hráčem z poolu nebo ručně.
 * Podporuje i legacy `match.refereeId === 'waiting'`.
 */
export function isBracketRefereePlaceholder(ref, refereeIdLegacy) {
  const legId = refereeIdLegacy ?? ref?.id;
  if (legId != null && String(legId).trim() !== '') {
    const low = String(legId).toLowerCase();
    if (low === 'waiting' || low === 'pending') return true;
  }
  const nm = String(ref?.name ?? '').trim();
  if (!nm) return false;
  if (/čeká\s+na\s+proherce/i.test(nm)) return true;
  if (/waiting\s+for\s+loser/i.test(nm)) return true;
  if (/oczekiwanie\s+na\s+przegranego/i.test(nm)) return true;
  return false;
}

/** Dokončený feeder zápas, ze kterého nelze vzít „proherce“ (BYE / volný los — žádný reálný soupeř). */
function isBracketFeederWithoutPlayableLoser(feeder) {
  if (!feeder) return true;
  if (feeder.isBye === true) return true;
  if (feeder.player1Id === 'BYE' || feeder.player2Id === 'BYE') return true;
  if (feeder.status !== 'completed') return false;
  const p1Real =
    feeder.player1Id != null &&
    feeder.player1Id !== '' &&
    !isBracketByeName(feeder.player1Name);
  const p2Real =
    feeder.player2Id != null &&
    feeder.player2Id !== '' &&
    !isBracketByeName(feeder.player2Name);
  if (!p1Real || !p2Real) return true;
  return false;
}

function winnerFromBracketMatch(m) {
  if (m.status !== 'completed' || m.winnerId == null) return null;
  const id = m.winnerId;
  if (m.player1Id === id) {
    const nm = m.player1Name;
    if (nm && !isBracketByeName(nm)) return { id, name: nm };
  }
  if (m.player2Id === id) {
    const nm = m.player2Name;
    if (nm && !isBracketByeName(nm)) return { id, name: nm };
  }
  const name =
    m.player1Id === id ? m.player1Name : m.player2Id === id ? m.player2Name : m.player1Name ?? m.player2Name;
  return { id, name: name ?? '?' };
}

function tryAutoCompleteBracketBye(m) {
  if (m.status !== 'pending') return false;
  const bye1 = m.player1Id == null && isBracketByeName(m.player1Name);
  const bye2 = m.player2Id == null && isBracketByeName(m.player2Name);
  const real1 = m.player1Id != null;
  const real2 = m.player2Id != null;
  if (bye1 && real2) {
    m.status = 'completed';
    m.winnerId = m.player2Id;
    m.score = m.score && typeof m.score === 'object' ? { ...m.score } : { p1: 0, p2: 0 };
    return true;
  }
  if (bye2 && real1) {
    m.status = 'completed';
    m.winnerId = m.player1Id;
    m.score = m.score && typeof m.score === 'object' ? { ...m.score } : { p1: 0, p2: 0 };
    return true;
  }
  return false;
}

/**
 * Propaguje vítěze z hotových zápasů (vč. BYE) do dalších kol a doplňuje řetězové BYE.
 * Očekává strukturu, kde zápas i v kole r+1 je napájen ze zápasů 2i a 2i+1 v kole r.
 */
export function propagateBracketWinnersInPlace(rounds) {
  if (!Array.isArray(rounds) || rounds.length < 2) return;
  const maxIter = Math.max(16, rounds.length * 8);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let r = 0; r < rounds.length - 1; r++) {
      const curr = rounds[r].matches;
      const next = rounds[r + 1].matches;
      for (let i = 0; i < next.length; i++) {
        const dest = next[i];
        const L = curr[i * 2];
        const Rgt = curr[i * 2 + 1];
        if (L?.status === 'completed' && L.winnerId != null) {
          const w = winnerFromBracketMatch(L);
          if (w && dest.player1Id !== w.id) {
            dest.player1Id = w.id;
            dest.player1Name = w.name;
            changed = true;
          }
        }
        if (Rgt?.status === 'completed' && Rgt.winnerId != null) {
          const w = winnerFromBracketMatch(Rgt);
          if (w && dest.player2Id !== w.id) {
            dest.player2Id = w.id;
            dest.player2Name = w.name;
            changed = true;
          }
        }
      }
    }
    for (const round of rounds) {
      for (const m of round.matches) {
        if (tryAutoCompleteBracketBye(m)) changed = true;
      }
    }
    if (!changed) break;
  }
}

/**
 * Hluboká kopie pavouku + propagace (pro setState po změně zápasu).
 */
export function propagateBracketWinners(bracketRounds) {
  if (!Array.isArray(bracketRounds) || bracketRounds.length === 0) return bracketRounds;
  const rounds = bracketRounds.map((round) => ({
    ...round,
    matches: round.matches.map((m) => ({
      ...m,
      score: m.score && typeof m.score === 'object' ? { ...m.score } : { p1: 0, p2: 0 },
    })),
  }));
  propagateBracketWinnersInPlace(rounds);
  return rounds;
}

/**
 * Terče v jednom kole: v původním pořadí zápasů přiřadí 1…N (modulo) jen nedohraným reálným zápasům
 * (pending, dva hráči, ne BYE). Sekvence vždy začíná terčem 1.
 */
export function autoAssignSequentialBoardsToRound(roundMatches, availableBoards) {
  if (!Array.isArray(roundMatches)) return roundMatches;
  const nb = Math.max(1, Math.floor(Number(availableBoards)) || 1);
  const newMatches = roundMatches.map((m) => ({ ...m }));
  // Ruční override (admin) má prioritu: zamčené terče nepřepisovat.
  const lockedBoards = new Set();
  for (const m of newMatches) {
    if (!isRealPendingBracketMatch(m)) continue;
    if (!m.boardLocked) continue;
    const b = Number(m.board);
    if (Number.isFinite(b) && b >= 1 && b <= nb) lockedBoards.add(b);
  }

  // Obsazené terče navíc: probíhající zápasy.
  const occupiedBoards = new Set([...lockedBoards]);
  for (const m of newMatches) {
    if (!m || m.isBye) continue;
    if (m.status !== 'playing') continue;
    const b = Number(m.board);
    if (Number.isFinite(b) && b >= 1 && b <= nb) occupiedBoards.add(b);
  }

  // Volné terče pro frontu (1..nb bez obsazených).
  const freeBoards = [];
  for (let b = 1; b <= nb; b++) {
    if (!occupiedBoards.has(b)) freeBoards.push(b);
  }

  // Pro pending zápasy bez locku:
  // - pokud už mají board a je volný, ponecháme ho
  // - pokud board nemají (nebo není volný), přiřadíme první volný terč
  // - zbytek zůstane striktně v queue: board=null
  for (let i = 0; i < newMatches.length; i++) {
    const m = newMatches[i];
    if (!isRealPendingBracketMatch(m)) continue;
    if (m.boardLocked) continue;

    const existing =
      m.board != null && m.board !== '' && Number.isFinite(Number(m.board)) ? Number(m.board) : null;

    if (existing != null) {
      const idx = freeBoards.indexOf(existing);
      if (idx >= 0) {
        freeBoards.splice(idx, 1);
        newMatches[i] = { ...m, board: existing };
        continue;
      }
      // existing není volný (kolize se starým přiřazením) => přemapujeme do fronty
    }

    if (freeBoards.length === 0) {
      newMatches[i] = { ...m, board: null };
      continue;
    }

    const next = freeBoards.shift();
    if (next == null) {
      newMatches[i] = { ...m, board: null };
      continue;
    }
    newMatches[i] = { ...m, board: next };
  }

  return newMatches;
}

/**
 * Alias pro zpětnou kompatibilitu – stejná logika jako {@link autoAssignSequentialBoardsToRound}.
 */
export function autoAssignRoundBoards(roundMatches, activeBoardsCount) {
  return autoAssignSequentialBoardsToRound(roundMatches, activeBoardsCount);
}

/**
 * Celý pavouk: u každého kola `round.boardsCount` nebo výchozí `defaultBoardsPerRound`.
 */
export function autoAssignBracketBoards(bracket, defaultBoardsPerRound) {
  const def = Math.max(1, Math.floor(Number(defaultBoardsPerRound)) || 1);
  if (!Array.isArray(bracket)) return bracket;
  return bracket.map((round) => {
    const nb =
      round.boardsCount != null && Number(round.boardsCount) >= 1
        ? Math.max(1, Math.floor(Number(round.boardsCount)))
        : def;
    return {
      ...round,
      matches: autoAssignRoundBoards(round.matches, nb),
    };
  });
}

/**
 * Doplní terč jen u reálných pending zápasů bez `board`; cyklus podle kola.
 */
export function assignMissingBracketBoards(bracket, defaultBoards) {
  const def = Math.max(1, Math.floor(Number(defaultBoards)) || 1);
  if (!Array.isArray(bracket)) return bracket;
  return bracket.map((round) => {
    const nb =
      round.boardsCount != null && Number(round.boardsCount) >= 1
        ? Math.max(1, Math.floor(Number(round.boardsCount)))
        : def;
    let seq = 0;
    return {
      ...round,
      matches: round.matches.map((m) => {
        const hasBoard = m.board != null && Number.isFinite(Number(m.board)) && Number(m.board) >= 1;
        if (m.status !== 'pending' || hasBoard || !isRealPendingBracketMatch(m)) return { ...m };
        const board = (seq % nb) + 1;
        seq += 1;
        return { ...m, board };
      }),
    };
  });
}

/**
 * Počet vítězných legů pro kolo pavouku (0 = první kolo).
 * Pokud je nastaveno předkolo ({@link prelimLegs}), první kolo použije tento počet;
 * další kola pokračují od {@link baseLegs} s krokem +1 (jako „hlavní“ pavouk).
 */
export function getBracketWinLegsForRound(roundIndex, baseLegs = 3, prelimLegs) {
  const base = Math.max(1, Math.floor(Number(baseLegs)) || 3);
  const ri = Math.max(0, Math.floor(Number(roundIndex)) || 0);
  const prelim =
    prelimLegs != null && Number.isFinite(Number(prelimLegs)) && Number(prelimLegs) > 0
      ? Math.max(1, Math.floor(Number(prelimLegs)))
      : null;
  if (prelim != null && ri === 0) return prelim;
  if (prelim != null && ri >= 1) return base + (ri - 1);
  return base + ri;
}

/**
 * Vygeneruje strukturu KO pavouka s oficiálním nasazením a podporou volných losů.
 * @param {Array<{groupId?: string, id?: string, name?: string, players: Array}>} groups
 * @param {number|'all'} promotersCount
 * @param {number} baseLegs – základ počtu legů v hlavní části pavouku (po předkole +1 na kolo)
 * @param {Array} matches
 * @param {number|null|undefined} [prelimLegs] – pokud je číslo &gt; 0, první kolo použije tento počet legů (předkolo)
 * @returns {Array<{round: number, matches: Array<{id: string, status: string, winLegs: number, ...}>}>}
 */
export function generateBracketStructure(groups, promotersCount, baseLegs = 3, matches = [], prelimLegs = null) {
  const toTakeRaw = promotersCount === 'all' ? Number.MAX_SAFE_INTEGER : Number(promotersCount);
  const toTake = Number.isFinite(toTakeRaw) && toTakeRaw > 0 ? Math.floor(toTakeRaw) : 0;
  if (!Array.isArray(groups) || groups.length === 0 || toTake <= 0) {
    return [];
  }

  /** Pořadí seedů 1…P: groupRank, pak abeceda skupiny (viz collectPromotedPlayersRanked). */
  const promotedPlayers = collectPromotedPlayersRanked(groups, toTake, matches);
  if (promotedPlayers.length === 0) return [];

  const P = promotedPlayers.length;
  /** Kapacita pavouka = nejbližší vyšší mocnina 2 (např. 13 → 16). Počet BYE = bracketSize − P. */
  const bracketSize = nextPowerOfTwo(P);

  const template = getBracketSeedingTemplate(bracketSize);
  if (!template || template.length !== bracketSize) {
    return [];
  }

  const waveSeedPlayers =
    bracketSize === 32 && P === 32 ? tryBuildWaveSplitSeedPlayers32(groups, matches) : null;

  /**
   * Nasazení: šablona řadí do 1. kola dvojice (1 vs 16), (8 vs 9), … tak, aby 1 a 2 byly v opačných polovinách.
   * Pro P < bracketSize jsou pozice pro chybějící nejslabší nasazení (P+1 … bracketSize) prázdné = BYE.
   * Nejlepší hráči (nasazení 1…P) obsadí čísla 1…P; párování 1 vs (chybějící 16), 2 vs (chybějící 15), …
   * dá volný los přesně nejvýše nasazeným (celkem bracketSize − P postupů bez boje).
   */
  const initialSlots = template.map((seedNum) => {
    if (seedNum <= P) {
      const pp = waveSeedPlayers
        ? waveSeedPlayers[seedNum - 1]
        : promotedPlayers[seedNum - 1];
      if (!pp) {
        return { id: `bye-${seedNum}`, isBye: true, name: BRACKET_BYE_LABEL };
      }
      return {
        isBye: false,
        playerId: pp.playerId,
        playerName: pp.playerName,
      };
    }
    return { id: `bye-${seedNum}`, isBye: true, name: BRACKET_BYE_LABEL };
  });

  const rounds = [];

  // Kolo 1: sousední dvojice [0][1], [2][3], … podle číselné šablony
  const r1Matches = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const s1 = initialSlots[i * 2];
    const s2 = initialSlots[i * 2 + 1];
    const p1IsBye = s1.isBye;
    const p2IsBye = s2.isBye;

    let status = 'pending';
    let winnerId = null;
    let player1Id = null;
    let player2Id = null;
    let player1Name = null;
    let player2Name = null;

    if (p1IsBye && p2IsBye) {
      status = 'pending';
    } else if (p1IsBye) {
      status = 'completed';
      winnerId = s2.playerId;
      player1Id = null;
      player2Id = s2.playerId;
      player1Name = BRACKET_BYE_LABEL;
      player2Name = s2.playerName;
    } else if (p2IsBye) {
      status = 'completed';
      winnerId = s1.playerId;
      player1Id = s1.playerId;
      player2Id = null;
      player1Name = s1.playerName;
      player2Name = BRACKET_BYE_LABEL;
    } else {
      player1Id = s1.playerId;
      player2Id = s2.playerId;
      player1Name = s1.playerName;
      player2Name = s2.playerName;
    }

    r1Matches.push({
      id: `r1-m${i}`,
      status,
      player1Id,
      player2Id,
      winnerId,
      score: { p1: 0, p2: 0 },
      player1Name: player1Name ?? null,
      player2Name: player2Name ?? null,
      winLegs: getBracketWinLegsForRound(0, baseLegs, prelimLegs),
    });
  }
  rounds.push({ round: 1, matches: r1Matches });

  // Další kola (2, 3, ...) – prázdné zápasy čekající na vítěze
  let prevCount = r1Matches.length;
  let roundNum = 2;
  while (prevCount > 1) {
    const matchCount = prevCount / 2;
    const roundMatches = [];
    const roundIndex = roundNum - 1; // 0 = 1. kolo, 1 = 2. kolo, …
    for (let i = 0; i < matchCount; i++) {
      roundMatches.push({
        id: `r${roundNum}-m${i}`,
        status: 'pending',
        player1Id: null,
        player2Id: null,
        score: { p1: 0, p2: 0 },
        player1Name: null,
        player2Name: null,
        winLegs: getBracketWinLegsForRound(roundIndex, baseLegs, prelimLegs),
      });
    }
    rounds.push({ round: roundNum, matches: roundMatches });
    prevCount = matchCount;
    roundNum++;
  }

  propagateBracketWinnersInPlace(rounds);
  return rounds;
}

/** Min / max hráčů ve skupině (turnajové pravidlo). */
export const GROUP_SIZE_MIN = 3;
export const GROUP_SIZE_MAX = 6;

/**
 * Rozdělení hráčů do g skupin: část skupin má ⌊n/g⌋+1, zbytek ⌊n/g⌋ (max. rozdíl 1).
 */
export function getGroupSplit(playerCount, numGroups) {
  const n = Math.max(0, Math.floor(Number(playerCount) || 0));
  const g = Math.max(1, Math.floor(Number(numGroups) || 1));
  const base = Math.floor(n / g);
  const rem = n % g;
  const minSize = base;
  const maxSize = rem === 0 ? base : base + 1;
  return { n, g, base, rem, minSize, maxSize };
}

/** Platné rozdělení: žádná skupina pod 3 ani nad 6, rozdíl velikostí nejvýše 1. */
export function isAllowedGroupSplit(playerCount, numGroups) {
  const s = getGroupSplit(playerCount, numGroups);
  if (s.n < GROUP_SIZE_MIN) return false;
  if (s.minSize < GROUP_SIZE_MIN) return false;
  if (s.maxSize > GROUP_SIZE_MAX) return false;
  if (s.maxSize - s.minSize > 1) return false;
  return true;
}

/** Všechny počty skupin, které u daného n splní pravidla velikosti skupin. */
export function listValidGroupCounts(playerCount) {
  const n = Math.max(0, Math.floor(Number(playerCount) || 0));
  const out = [];
  for (let g = 1; g <= Math.max(1, n); g++) {
    if (isAllowedGroupSplit(n, g)) out.push(g);
  }
  return out;
}

/**
 * Textace postupu do pavouka při smíšených velikostech skupin (např. část po 4, část po 3).
 * @returns {{ key: string, params?: Record<string, string|number> }}
 */
export function getGroupAdvancementPhraseKey(playerCount, numGroups, advancePerGroup) {
  const n = Math.max(0, Number(playerCount) || 0);
  const g = Math.max(1, Number(numGroups) || 1);
  if (advancePerGroup === 'all') return { key: 'tournAdvancePhraseAll' };
  const adv = Number(advancePerGroup);
  if (!Number.isFinite(adv)) return { key: 'tournAdvancePhraseUniform', params: { adv: '?', size: '?' } };
  const { base, rem, minSize, maxSize } = getGroupSplit(n, g);
  if (rem === 0) {
    if (adv >= minSize) return { key: 'tournAdvancePhraseEveryoneSize', params: { size: minSize } };
    return { key: 'tournAdvancePhraseUniform', params: { adv, size: minSize } };
  }
  const big = maxSize;
  const small = minSize;
  if (adv === small) {
    return { key: 'tournAdvancePhraseSplitSmallAll', params: { adv, big, small } };
  }
  return { key: 'tournAdvancePhraseMixed', params: { adv, big, small } };
}

export function applyAdvancementPhrase(t, phrase) {
  const { key, params = {} } = phrase;
  let s = t(key) || key;
  for (const [k, v] of Object.entries(params)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return s;
}

/** Kolik hráčů celkem postoupí do pavouka (číslo ≤ velikost nejmenší skupiny). */
export function countPlayersAdvancingFromGroups(playerCount, numGroups, advancePerGroup) {
  const n = Math.max(0, Number(playerCount) || 0);
  const g = Math.max(1, Number(numGroups) || 1);
  if (advancePerGroup === 'all') return n;
  const adv = Number(advancePerGroup);
  if (!Number.isFinite(adv) || adv < 1) return 0;
  const { minSize } = getGroupSplit(n, g);
  const capped = Math.min(adv, minSize);
  return g * capped;
}

/**
 * Vygeneruje až 3 varianty turnaje — pouze rozdělení, kde každá skupina má 3–6 hráčů
 * a rozdíl velikostí skupin je nejvýše 1. Postup „ze skupiny“ nikdy nepřesáhne velikost nejmenší skupiny.
 * @param {number} playerCount
 * @returns {Array<{id: string, labelKey: string, numGroups: number, advancePerGroup: number|'all', totalAdvancees: number, needsBye: boolean}>}
 */
export function generateTournamentVariants(playerCount, totalBoards = null) {
  const n = Math.max(0, Number(playerCount) || 0);
  if (n < GROUP_SIZE_MIN) return [];

  const validGs = listValidGroupCounts(n);
  if (validGs.length === 0) return [];

  const isPower2 = (x) => x > 0 && (x & (x - 1)) === 0;
  const boardGroups = Number(totalBoards);
  const boardG = Number.isFinite(boardGroups) && boardGroups >= 1 ? Math.floor(boardGroups) : null;
  const hasValidBoardGroups = boardG != null && validGs.includes(boardG);

  const preferredGroups = [4, 8];
  const minGroupsForMaxSize = Math.ceil(n / GROUP_SIZE_MAX);

  const candidates = [];

  for (const g of validGs) {
    const minSz = Math.floor(n / g);
    for (const adv of [2, 3, 4]) {
      if (adv <= minSz) {
        candidates.push({
          numGroups: g,
          advancePerGroup: adv,
          totalAdvancees: g * adv,
        });
      }
    }
    candidates.push({
      numGroups: g,
      advancePerGroup: 'all',
      totalAdvancees: n,
    });
  }

  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = `${c.numGroups}-${c.advancePerGroup}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...c, needsBye: !isPower2(c.totalAdvancees) });
  }

  const withScore = unique.map((c) => {
    const split = getGroupSplit(n, c.numGroups);
    const boardBonus = hasValidBoardGroups && c.numGroups === boardG ? -3 : 0;
    const preferredPenalty = preferredGroups.includes(c.numGroups) ? 0 : 1.5;
    const minGPenalty = c.numGroups === minGroupsForMaxSize ? -0.5 : 0;
    const byePenalty = c.needsBye ? 1 : 0;
    const allPenalty = c.advancePerGroup === 'all' ? 1.5 : 0;
    const sizeCenter = (split.minSize + split.maxSize) / 2;
    const sizePenalty = Math.abs(sizeCenter - 4) * 0.35;
    return {
      ...c,
      score:
        preferredPenalty +
        byePenalty +
        allPenalty +
        sizePenalty +
        boardBonus +
        minGPenalty,
    };
  });

  withScore.sort(
    (a, b) =>
      a.score - b.score ||
      a.numGroups - b.numGroups ||
      String(a.advancePerGroup).localeCompare(String(b.advancePerGroup))
  );

  const picked = withScore.slice(0, Math.min(3, withScore.length));
  const labels = ['tournVariantFast', 'tournVariantStandard', 'tournVariantLong'];
  const ids = ['A', 'B', 'C'];
  return picked.map((p, i) => ({
    id: ids[i],
    labelKey: labels[i],
    numGroups: p.numGroups,
    advancePerGroup: p.advancePerGroup,
    totalAdvancees: p.totalAdvancees,
    needsBye: p.needsBye,
  }));
}

/**
 * Odhad celkového času turnaje (skupiny + KO pavouk).
 * @param {{ players: Array, format: string, groupLegs?: number, groups?: Array }} opts
 * @param {{ advancePerGroup: number|'all', bracketKoLegs?: number, numGroups?: number, numBoards?: number }} bracketOpts
 * @returns {{ totalMs: number, groupsMs: number, bracketMs: number }}
 */
export function estimateTotalTournamentTime(opts, bracketOpts = {}) {
  const players = opts?.players || [];
  const format = opts?.format || 'groups_bracket';
  const groupLegs = opts?.groupLegs ?? 3;
  const bracketLegs = bracketOpts?.bracketKoLegs ?? opts?.bracketLegs ?? 3;
  const advancePerGroup = bracketOpts?.advancePerGroup ?? 2;
  const numBoards = bracketOpts?.numBoards ?? opts?.numBoards ?? 99;

  const avgLegMs = DEFAULT_LEG_TIME_MS;
  const maxLegsGroup = Math.max(1, 2 * groupLegs - 1);
  const maxLegsBracket = Math.max(1, 2 * bracketLegs - 1);

  let groupsMs = 0;
  let bracketMs = 0;

  if (isTournamentGroupsThenBracketFormat(format) && players.length >= GROUP_SIZE_MIN) {
    const playersWithIds = players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }));
    const nTot = playersWithIds.length;
    let numGroups = bracketOpts?.numGroups;
    if (!isAllowedGroupSplit(nTot, numGroups)) {
      const valid = listValidGroupCounts(nTot);
      numGroups = valid[0] ?? Math.max(1, Math.ceil(nTot / GROUP_SIZE_MAX));
    }
    if (isAllowedGroupSplit(nTot, numGroups)) {
      const groups = distributePlayersToFixedGroups(playersWithIds, numGroups);
      let totalGroupMatches = 0;
      for (const g of groups) {
        const n = (g.players || []).length;
        totalGroupMatches += (n * (n - 1)) / 2;
      }
      const baseGroupsMs = totalGroupMatches * maxLegsGroup * avgLegMs;
      const boardFactor = numBoards > 0 ? Math.max(1, Math.ceil(numGroups / numBoards)) : 1;
      groupsMs = baseGroupsMs * boardFactor;

      const totalAdvancees = countPlayersAdvancingFromGroups(nTot, numGroups, advancePerGroup);
      const bracketMatches = Math.max(0, totalAdvancees - 1);
      bracketMs = bracketMatches * maxLegsBracket * avgLegMs;
    }
  } else if (isTournamentBracketOnlyFormat(format) && players.length >= 2) {
    bracketMs = (players.length - 1) * maxLegsBracket * avgLegMs;
  }

  return {
    totalMs: groupsMs + bracketMs,
    groupsMs,
    bracketMs,
  };
}

/**
 * Globální radar vytížení (cross-round): hráči, kteří NESMÍ být vybráni jako počtář,
 * protože už hrají / jsou check-in / nebo už mají fyzicky přidělený terč v libovolném kole pavouka.
 */
function getRoundBusyPlayerIds(bracketRounds, roundIndex) {
  const s = new Set();
  for (const round of bracketRounds || []) {
    const matches = round?.matches || [];
    for (const m of matches) {
      if (!m || m.isBye) continue;
      const st = m.status;
      // Hotové zápasy nesmí držet hráče jako „obsazené“ — jinak poraženci z QF apod.
      // nemohou být přiřazeni jako počtáři v dalším kole (terč zůstává v datech).
      if (st === 'completed' || st === 'walkover') continue;
      const tabletCheckedIn = m.tabletStatus === 'checked_in';
      const hasBoard = m.board !== null && m.board !== undefined && m.board !== '';
      if (
        !(
          st === 'playing' ||
          st === 'in_progress' ||
          tabletCheckedIn ||
          (st === 'pending' && hasBoard)
        )
      ) {
        continue;
      }
      const p1 = m.player1Id ?? m.p1Id;
      const p2 = m.player2Id ?? m.p2Id;
      if (p1 && !isBracketByeName(m.player1Name)) s.add(p1);
      if (p2 && !isBracketByeName(m.player2Name)) s.add(p2);
    }
  }
  return s;
}

/** Jen hráči, kteří v kole právě HRAJÍ (playing) — pending mohou pískat na jiném terči (fronta). */
function getRoundPlayingOnlyPlayerIds(bracketRounds, roundIndex) {
  const s = new Set();
  const matches = bracketRounds[roundIndex]?.matches || [];
  for (const m of matches) {
    if (!m || m.isBye) continue;
    if (m.status !== 'playing') continue;
    if (m.player1Id && !isBracketByeName(m.player1Name)) s.add(m.player1Id);
    if (m.player2Id && !isBracketByeName(m.player2Name)) s.add(m.player2Id);
  }
  return s;
}

function findGroupByBoardNumber(groups, boardRaw) {
  if (boardRaw == null || boardRaw === '') return null;
  const b = String(boardRaw).trim();
  for (const g of groups || []) {
    const boards = Array.isArray(g.boards) ? g.boards : [];
    for (const x of boards) {
      if (String(x).trim() === b) return g;
    }
  }
  return null;
}

/** Poslední neodstoupivší hráč v pořadí skupiny (tabulka: nejlepší první). */
function getLastPlaceGroupPlayer(group, groupMatchesAll) {
  if (!group?.groupId) return null;
  const gm = (groupMatchesAll || []).filter((m) => (m.groupId ?? m.group) === group.groupId);
  const standings = calculateGroupStandings(group.players || [], gm);
  for (let i = standings.length - 1; i >= 0; i--) {
    const p = standings[i];
    if (p.isWithdrawn) continue;
    return { id: p.id, name: p.name ?? p.id };
  }
  return null;
}

/** Hráči, kteří v dané skupině nepostoupili (od indexu advance výše v tabulce). */
function buildNonAdvancerPool(groups, promotersCount, groupMatchesAll) {
  const pool = [];
  for (const g of groups || []) {
    const players = g.players || [];
    const gs = players.length;
    const advN =
      promotersCount === 'all'
        ? gs
        : Math.max(0, Math.min(gs, Number(promotersCount) || 2));
    const gm = (groupMatchesAll || []).filter((m) => (m.groupId ?? m.group) === g.groupId);
    const standings = calculateGroupStandings(players, gm);
    for (let i = advN; i < standings.length; i++) {
      const p = standings[i];
      if (p.isWithdrawn) continue;
      pool.push({ id: p.id, name: p.name ?? p.id });
    }
  }
  return pool;
}

/** Všichni účastníci zápasu (pavouk + případné cloud aliasy). */
function getBracketMatchParticipantIds(match) {
  const s = new Set();
  if (!match) return s;
  for (const key of ['player1Id', 'player2Id', 'p1Id', 'p2Id']) {
    const v = match[key];
    if (v != null && v !== '') s.add(v);
  }
  return s;
}

/** Zápas bez dvou reálných hráčů (BYE / volný los) — nehraje se, počtář se neobsazuje. */
function isRoundZeroNonPhysicalBracketMatch(m) {
  if (!m) return true;
  if (m.isBye === true) return true;
  const p1Real = m.player1Id != null && !isBracketByeName(m.player1Name);
  const p2Real = m.player2Id != null && !isBracketByeName(m.player2Name);
  return !(p1Real && p2Real);
}

function refereePassesRoundGuard(refId, match, roundBusyIds, withdrawnIds, usedReferees) {
  const id = refId == null ? null : refId;
  if (id == null) return false;
  if (withdrawnIds.has(id)) return false;
  if (usedReferees.has(id)) return false;
  if (roundBusyIds.has(id)) return false;
  if (getBracketMatchParticipantIds(match).has(id)) return false;
  return true;
}

/**
 * Robustní počítadlo zátěže: spočítá, kolikrát hráč figuruje jako počtář napříč CELÝM pavoukem.
 * Bere v potaz `match.referee.id|name`, i legacy `match.refereeId`.
 */
function getPlayerRefereeCount(playerId, bracketRounds) {
  if (playerId == null || playerId === '' || !Array.isArray(bracketRounds)) return 0;
  let n = 0;
  for (const r of bracketRounds) {
    for (const m of r?.matches || []) {
      if (!m) continue;
      if (isBracketRefereePlaceholder(m.referee, m.refereeId)) continue;
      const rid = m.refereeId ?? (m.referee?.id ?? m.referee?.name);
      if (rid == null || rid === '') continue;
      if (rid === playerId) n += 1;
    }
  }
  return n;
}

/**
 * Postupující z BYE v 1. kole (pořadí podle zápasů v kole — odpovídá listům pavouka).
 * seedIdx = pořadí nasazení 0… (z registrace / skupiny).
 */
function collectRound0ByeWalkoverRefCandidates(bracketRounds, seedRankById) {
  const r0 = bracketRounds?.[0]?.matches;
  if (!Array.isArray(r0)) return [];
  const out = [];
  for (const m of r0) {
    if (!m || m.status !== 'completed' || m.isBye) continue;
    const bye1 = m.player1Id == null && isBracketByeName(m.player1Name);
    const bye2 = m.player2Id == null && isBracketByeName(m.player2Name);
    let wid = null;
    let wname = null;
    if (bye1 && m.player2Id != null && m.winnerId === m.player2Id) {
      wid = m.player2Id;
      wname = m.player2Name;
    } else if (bye2 && m.player1Id != null && m.winnerId === m.player1Id) {
      wid = m.player1Id;
      wname = m.player1Name;
    }
    if (wid == null) continue;
    const seedIdx = seedRankById?.[wid] ?? 999;
    out.push({ id: wid, name: wname ?? wid, seedIdx });
  }
  return out;
}

function getPlayerPendingRound0Match(playerId, roundMatches) {
  if (playerId == null) return null;
  for (const m of roundMatches || []) {
    if (!m || m.status !== 'pending' || m.isBye) continue;
    if (m.player1Id === playerId || m.player2Id === playerId) return m;
  }
  return null;
}

export const updateBracketReferees = (
  bracket,
  groups,
  promotersCount,
  availableBoards = 1,
  groupMatchesAll = [],
  registeredPlayersForDirectKo = null,
  prelimLegs = null
) => {
  if (!bracket || bracket.length === 0) return bracket;
  const newBracket = JSON.parse(JSON.stringify(bracket));

  const hasPrelimBracketRound =
    prelimLegs != null && Number.isFinite(Number(prelimLegs)) && Number(prelimLegs) > 0;
  /** Široký pool (skupiny, všichni vyřazení, …) jen v předkole + max prvním kole hlavního pavouka. */
  const broadRefPoolThroughRound = hasPrelimBracketRound ? 1 : 0;

  const playerStats = {};
  const withdrawnIds = new Set();
  if ((groups || []).length > 0) {
    (groups || []).forEach((g) => {
      (g.players || []).forEach((p, idx) => {
        const pid = p.id || p.name;
        playerStats[pid] = { rank: idx + 1, legDiff: p.legDifference || 0 };
        if (p?.isWithdrawn) withdrawnIds.add(pid);
      });
    });
  } else if (Array.isArray(registeredPlayersForDirectKo) && registeredPlayersForDirectKo.length > 0) {
    registeredPlayersForDirectKo.forEach((p, idx) => {
      const pid = p.id ?? p.name;
      if (pid == null) return;
      playerStats[pid] = { rank: idx + 1, legDiff: p.legDifference || 0 };
      if (p?.isWithdrawn) withdrawnIds.add(pid);
    });
  }

  const getLoserScore = (match) => {
    if (
      !match ||
      match.status !== 'completed' ||
      match.isBye ||
      isBracketFeederWithoutPlayableLoser(match) ||
      !match.player1Id ||
      !match.player2Id ||
      match.player1Id === 'BYE' ||
      match.player2Id === 'BYE' ||
      isBracketByeName(match.player1Name) ||
      isBracketByeName(match.player2Name)
    ) {
      return null;
    }
    const p1L = Number(match.score?.p1 ?? match.score1 ?? match.legsP1 ?? 0);
    const p2L = Number(match.score?.p2 ?? match.score2 ?? match.legsP2 ?? 0);

    let loserId = null;
    let loserName = null;
    if (match.winnerId != null) {
      loserId =
        match.winnerId === match.player1Id
          ? match.player2Id
          : match.winnerId === match.player2Id
            ? match.player1Id
            : null;
    }
    if (!loserId) {
      loserId = p1L > p2L ? match.player2Id : match.player1Id;
    }
    if (!loserId) return null;
    if (withdrawnIds.has(loserId)) return null;
    loserName =
      loserId === match.player1Id ? (match.player1Name ?? loserId) : (match.player2Name ?? loserId);

    const stats = playerStats[loserId] || { rank: 1, legDiff: 0 };
    return {
      loser: { id: loserId, name: loserName },
      legs: Math.min(Number.isFinite(p1L) ? p1L : 0, Number.isFinite(p2L) ? p2L : 0),
      rank: stats.rank,
      diff: stats.legDiff,
    };
  };

  const usedReferees = new Set();
  // Intra-loop lock: zabrání přiřazení stejného počtáře více zápasům v rámci jednoho běhu/smyčky.
  const assignedRefsInThisRun = new Set();
  const currentlyPlayingIds = new Set();
  let activeBoardsUsed = 0;
  const boardCap = Math.max(1, Math.floor(Number(availableBoards)) || 1);

  const seedRankById = {};
  if (Array.isArray(registeredPlayersForDirectKo)) {
    registeredPlayersForDirectKo.forEach((p, i) => {
      const pid = p.id ?? p.name;
      if (pid != null) seedRankById[pid] = i;
    });
  }

  const getSeedIdx = (playerId) => {
    if (playerId == null) return 999;
    const fromReg = seedRankById[playerId];
    if (fromReg != null) return fromReg;
    const fromGroups = playerStats[playerId]?.rank;
    if (fromGroups != null) return fromGroups;
    return 999;
  };

  const getNameById = (playerId) => {
    if (playerId == null) return null;
    if (Array.isArray(registeredPlayersForDirectKo)) {
      const p = registeredPlayersForDirectKo.find((x) => (x?.id ?? x?.name) === playerId);
      if (p) return p.name ?? p.id ?? playerId;
    }
    for (const g of groups || []) {
      const p = (g.players || []).find((x) => (x?.id ?? x?.name) === playerId);
      if (p) return p.name ?? p.id ?? playerId;
    }
    for (const r of newBracket || []) {
      for (const m of r?.matches || []) {
        if (!m) continue;
        if (m.player1Id === playerId) return m.player1Name ?? playerId;
        if (m.player2Id === playerId) return m.player2Name ?? playerId;
      }
    }
    return playerId;
  };

  const isPlayablePending = (match) =>
    match &&
    match.status === 'pending' &&
    !match.isBye &&
    match.board != null &&
    match.board !== '' &&
    Number.isFinite(Number(match.board)) &&
    match.player1Id &&
    match.player2Id &&
    !isBracketByeName(match.player1Name) &&
    !isBracketByeName(match.player2Name);

  // Eliminated pool: všichni hráči, kteří už v pavouku prohráli (single-elim) — kandidáti na počtáře.
  const eliminatedIds = new Set();
  for (let ri = 0; ri < newBracket.length; ri++) {
    const roundMatches = newBracket[ri]?.matches || [];
    for (const m of roundMatches) {
      if (!m || m.isBye || isBracketFeederWithoutPlayableLoser(m)) continue;
      const loserData = getLoserScore(m);
      const lid = loserData?.loser?.id ?? loserData?.loser?.name;
      if (lid != null) eliminatedIds.add(lid);
    }
  }

  const collectByeRoundCandidateIds = (roundIndex) => {
    const out = new Set();
    const roundMatches = newBracket?.[roundIndex]?.matches || [];
    for (const m of roundMatches) {
      if (!m || m.status !== 'completed' || m.isBye) continue;
      const bye1 = m.player1Id == null && isBracketByeName(m.player1Name);
      const bye2 = m.player2Id == null && isBracketByeName(m.player2Name);
      if (!bye1 && !bye2) continue;
      const w = winnerFromBracketMatch(m);
      if (w?.id != null) out.add(w.id);
    }
    return out;
  };

  const pickFairRefereeFromPool = ({
    poolIds,
    feederLoserIds,
    match,
    roundBusyIds,
    usedRefereesLocal,
    assignedRefsInThisRunLocal,
  }) => {
    const viable = Array.from(poolIds)
      .filter((id) => {
        if (assignedRefsInThisRunLocal?.has(id)) return false;
        return refereePassesRoundGuard(id, match, roundBusyIds, withdrawnIds, usedRefereesLocal);
      })
      .map((id) => ({
        id,
        name: getNameById(id) ?? id,
        workload: getPlayerRefereeCount(id, newBracket),
        seedIdx: getSeedIdx(id),
        isFeederLoser: feederLoserIds?.has(id) ?? false,
      }));

    if (!viable.length) return null;
    viable.sort((a, b) => {
      if (a.workload !== b.workload) return a.workload - b.workload;
      // Tie-breaker: může preferovat feeder-poraženého nebo horší nasazení.
      if (a.isFeederLoser !== b.isFeederLoser) return a.isFeederLoser ? -1 : 1;
      if (a.seedIdx !== b.seedIdx) return b.seedIdx - a.seedIdx;
      return String(a.id).localeCompare(String(b.id));
    });
    return { id: viable[0].id, name: viable[0].name };
  };

  const selectBestRefereeFromPool = pickFairRefereeFromPool;

  const registerPickedReferee = (chosenRef) => {
    const rid = chosenRef?.id ?? chosenRef?.name;
    if (rid == null || rid === '') return;
    usedReferees.add(rid);
    if (chosenRef?.name != null && chosenRef.name !== rid) usedReferees.add(chosenRef.name);
  };

  // 1. Zmapování zápasů, které UŽ SE HRAJÍ
  newBracket.forEach((round) => {
    (round?.matches || []).forEach((match) => {
      if (match?.status === 'playing' && !match.isBye) {
        if (match.player1Id) currentlyPlayingIds.add(match.player1Id);
        if (match.player2Id) currentlyPlayingIds.add(match.player2Id);
        if (match.referee && !isBracketRefereePlaceholder(match.referee, match.refereeId)) {
          usedReferees.add(match.referee.id || match.referee.name);
        }
        activeBoardsUsed++;
      }
    });
  });

  // 2. Hlavní přiřazování s dynamickým limitem terčů
  newBracket.forEach((round, roundIndex) => {
    const roundMatches = round?.matches || [];
    const roundBusyIds = getRoundBusyPlayerIds(newBracket, roundIndex);
    const roundPlayingOnlyIds = getRoundPlayingOnlyPlayerIds(newBracket, roundIndex);
    const nonAdvPoolR0 =
      roundIndex === 0 ? buildNonAdvancerPool(groups, promotersCount, groupMatchesAll) : [];
    const byeRoundIds = collectByeRoundCandidateIds(roundIndex);

    roundMatches.forEach((match, matchIndex) => {
      if (roundIndex === 0 && isRoundZeroNonPhysicalBracketMatch(match)) {
        match.referee = null;
        match.board = null;
        return;
      }

      // STRIKTNÍ JIT PRAVIDLO: bez fyzicky přiděleného terče nesmí mít zápas počtáře.
      // (Zápasy ve frontě zůstávají čisté a nevyčerpávají usedReferees; BYE zápasy jsou řešené výše.)
      if (match?.status === 'pending' && (!match.board || match.board === null)) {
        match.referee = null;
        return;
      }

      // Striktní fronta: pokud zápas nemá terč, nesmí mít ani počtáře.
      if (match?.status === 'pending' && (match.board == null || match.board === '')) {
        match.referee = null;
        return;
      }

      if (!isPlayablePending(match)) return;

      if (isBracketRefereePlaceholder(match?.referee, match?.refereeId)) {
        match.referee = null;
        delete match.refereeId;
        delete match.refereeName;
      }

      // Pokud je počtář předvyplněný (např. JIT), ale guard neprojde, uvolni a vyber fallback.
      if (match.referee) {
        const refId = match.referee.id ?? match.referee.name;
        if (!refereePassesRoundGuard(refId, match, roundBusyIds, withdrawnIds, usedReferees)) {
          match.referee = null;
        } else {
          // Už přiřazený validní počtář musí blokovat další přiřazení v tomto běhu.
          if (refId != null) assignedRefsInThisRun.add(refId);
          return;
        }
      }

      // Fyzický limit terčů
      if (activeBoardsUsed >= boardCap) return;

      const useBroadRefPool = roundIndex <= broadRefPoolThroughRound;

      // Bazén kandidátů: v pozdějších kolech přednostně proherci z předchozího kola (feeder),
      // širší pool jen v předkole + prvním kole hlavního draw.
      const poolIds = new Set();
      const feederLoserIds = new Set();

      // (a) Poražený z feeder zápasu / přítoků (pokud existuje).
      if (roundIndex > 0) {
        const prevRoundMatches = newBracket[roundIndex - 1]?.matches || [];
        const feeder1 = prevRoundMatches[matchIndex * 2];
        const feeder2 = prevRoundMatches[matchIndex * 2 + 1];
        const l1 =
          feeder1 && !isBracketFeederWithoutPlayableLoser(feeder1) ? getLoserScore(feeder1) : null;
        const l2 =
          feeder2 && !isBracketFeederWithoutPlayableLoser(feeder2) ? getLoserScore(feeder2) : null;
        const lid1 = l1?.loser?.id ?? l1?.loser?.name;
        const lid2 = l2?.loser?.id ?? l2?.loser?.name;
        if (lid1 != null) {
          poolIds.add(lid1);
          feederLoserIds.add(lid1);
        }
        if (lid2 != null) {
          poolIds.add(lid2);
          feederLoserIds.add(lid2);
        }
        const prevByeWinners = collectByeRoundCandidateIds(roundIndex - 1);
        for (const id of prevByeWinners) poolIds.add(id);
      }

      // (b)(c) + nepostupující ze skupin: ve „širokém“ režimu hned; jinak jen BYE v aktuálním kole zde.
      for (const id of byeRoundIds) poolIds.add(id);

      if (useBroadRefPool) {
        for (const id of eliminatedIds) poolIds.add(id);
        if (roundIndex === 0) {
          for (const p of nonAdvPoolR0) {
            const id = p?.id ?? p?.name;
            if (id != null) poolIds.add(id);
          }
          const byeRefCandidates = collectRound0ByeWalkoverRefCandidates(newBracket, seedRankById);
          for (const c of byeRefCandidates || []) {
            if (c?.id != null) poolIds.add(c.id);
          }
        }
      }

      const pickRef = () =>
        selectBestRefereeFromPool({
          poolIds,
          feederLoserIds,
          match,
          roundBusyIds,
          usedRefereesLocal: usedReferees,
          assignedRefsInThisRunLocal: assignedRefsInThisRun,
        });

      let chosenRef = pickRef();

      if (!chosenRef && !useBroadRefPool) {
        for (const id of eliminatedIds) poolIds.add(id);
        if (roundIndex === 0) {
          for (const p of nonAdvPoolR0) {
            const id = p?.id ?? p?.name;
            if (id != null) poolIds.add(id);
          }
          const byeRefCandidates = collectRound0ByeWalkoverRefCandidates(newBracket, seedRankById);
          for (const c of byeRefCandidates || []) {
            if (c?.id != null) poolIds.add(c.id);
          }
        }
        chosenRef = pickRef();
      }

      if (chosenRef) {
        match.referee = chosenRef;
        assignedRefsInThisRun.add(chosenRef.id);
        registerPickedReferee(chosenRef);
        currentlyPlayingIds.add(match.player1Id);
        currentlyPlayingIds.add(match.player2Id);
        activeBoardsUsed++;
      }
    });
  });

  return newBracket;
};
