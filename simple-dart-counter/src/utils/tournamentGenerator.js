/**
 * Čisté pomocné funkce pro generování turnajových skupin a rozpisu zápasů.
 */

/**
 * Seřadí hráče podle rankingu (nejlepší první).
 * Nižší číslo rankingu = lepší hráč (např. 1 = mistr).
 * Hráči bez rankingu se řadí abecedně podle jména.
 */
function sortPlayers(players) {
  const withIds = players.map((p, i) => ({
    ...p,
    id: p.id ?? `p${i + 1}`,
  }));

  return [...withIds].sort((a, b) => {
    const ra = a.ranking;
    const rb = b.ranking;
    const hasA = ra != null && !Number.isNaN(ra);
    const hasB = rb != null && !Number.isNaN(rb);

    if (hasA && hasB) return ra - rb; // nižší ranking = lepší
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    const nameA = String(a.name ?? '').toLowerCase();
    const nameB = String(b.name ?? '').toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return 0;
  });
}

/**
 * Rozdělí hráče do skupin metodou Snake seeding.
 * @param {Array<{id?: string, name: string, ranking?: number}>} players - pole hráčů
 * @param {number} groupSize - preferovaná velikost skupiny (počet hráčů ve skupině)
 * @returns {Array<{groupId: string, players: Array}>} pole skupin
 */
export function distributePlayersToGroups(players, groupSize) {
  if (!players || players.length === 0) return [];
  if (groupSize < 1) groupSize = 1;

  const sorted = sortPlayers(players);
  const numGroups = Math.ceil(sorted.length / groupSize);
  if (numGroups < 1) return [];

  const groups = Array.from({ length: numGroups }, (_, i) => ({
    groupId: String.fromCharCode(65 + i),
    players: [],
  }));

  sorted.forEach((player, i) => {
    const round = Math.floor(i / numGroups);
    const posInRound = i % numGroups;
    const groupIndex = round % 2 === 0 ? posInRound : numGroups - 1 - posInRound;
    groups[groupIndex].players.push(player);
  });

  return groups;
}

/**
 * Rozdělí hráče do přesně zadaného počtu skupin cyklicky (karetní distribuce).
 * Garantuje, že existuje právě numGroups skupin.
 * @param {Array<{id?: string, name: string, ranking?: number}>} players
 * @param {number} numGroups
 * @returns {Array<{groupId: string, players: Array, matches: Array, id: string, name: string}>}
 */
export function distributePlayersToFixedGroups(players, numGroups) {
  if (!players || players.length === 0) return [];
  const sorted = sortPlayers(players);
  const gCount = Math.max(1, Number(numGroups) || 1);

  const groups = Array.from({ length: gCount }, (_, i) => ({
    id: `group-${i}`,
    groupId: String.fromCharCode(65 + i),
    name: String.fromCharCode(65 + i),
    players: [],
    matches: [],
  }));

  sorted.forEach((player, index) => {
    groups[index % gCount].players.push(player);
  });

  return groups;
}

/**
 * Předepsané pořadí zápasů ve skupině (round robin).
 * Index hráče 0 = nasazení 1 (nejlepší), …, n-1 = nasazení n.
 * Každý záznam: { i1, i2, ref } = zápas i1+1 vs i2+1, počtář hráč ref+1.
 */
const GROUP_ROUND_ROBIN_SCHEDULE = {
  3: [
    { i1: 0, i2: 2, ref: 1 },
    { i1: 1, i2: 2, ref: 0 },
    { i1: 0, i2: 1, ref: 2 },
  ],
  4: [
    { i1: 0, i2: 3, ref: 2 },
    { i1: 1, i2: 2, ref: 3 },
    { i1: 0, i2: 2, ref: 1 },
    { i1: 1, i2: 3, ref: 2 },
    { i1: 0, i2: 1, ref: 3 },
    { i1: 2, i2: 3, ref: 0 },
  ],
  5: [
    { i1: 0, i2: 4, ref: 2 },
    { i1: 1, i2: 3, ref: 0 },
    { i1: 2, i2: 4, ref: 1 },
    { i1: 0, i2: 3, ref: 4 },
    { i1: 1, i2: 2, ref: 3 },
    { i1: 3, i2: 4, ref: 1 },
    { i1: 0, i2: 2, ref: 3 },
    { i1: 1, i2: 4, ref: 0 },
    { i1: 2, i2: 3, ref: 4 },
    { i1: 0, i2: 1, ref: 2 },
  ],
  6: [
    { i1: 0, i2: 5, ref: 2 },
    { i1: 1, i2: 4, ref: 3 },
    { i1: 2, i2: 3, ref: 1 },
    { i1: 0, i2: 4, ref: 5 },
    { i1: 1, i2: 3, ref: 0 },
    { i1: 2, i2: 4, ref: 5 },
    { i1: 3, i2: 5, ref: 1 },
    { i1: 0, i2: 2, ref: 4 },
    { i1: 1, i2: 5, ref: 2 },
    { i1: 3, i2: 4, ref: 0 },
    { i1: 1, i2: 2, ref: 5 },
    { i1: 0, i2: 3, ref: 4 },
    { i1: 2, i2: 5, ref: 3 },
    { i1: 0, i2: 1, ref: 4 },
    { i1: 4, i2: 5, ref: 3 },
  ],
};

/** Fallback pro skupiny > 6 hráčů: stejné pořadí párů jako dřív + rotace počtáře podle zátěže. */
function generateGroupMatchesFallback(groupPlayers, groupId) {
  const players = groupPlayers.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }));
  const refereeCounts = {};
  players.forEach((p) => {
    refereeCounts[p.id] = 0;
  });
  const indexById = new Map(players.map((p, idx) => [p.id, idx]));

  const pairs = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairs.push({ p1: players[i], p2: players[j] });
    }
  }

  const n = players.length;
  const usedPairIdx = new Set();
  const orderedPairs = [];
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    if (i >= j) break;
    const idLo = players[i].id;
    const idHi = players[j].id;
    const found = pairs.findIndex(
      (pair) =>
        (pair.p1.id === idLo && pair.p2.id === idHi) || (pair.p1.id === idHi && pair.p2.id === idLo)
    );
    if (found >= 0 && !usedPairIdx.has(found)) {
      usedPairIdx.add(found);
      orderedPairs.push(pairs[found]);
    }
  }
  for (let k = 0; k < pairs.length; k++) {
    if (!usedPairIdx.has(k)) orderedPairs.push(pairs[k]);
  }

  const matches = orderedPairs.map(({ p1, p2 }) => {
    const p1Id = p1.id;
    const p2Id = p2.id;
    const eligible = players.filter((p) => p.id !== p1Id && p.id !== p2Id);
    eligible.sort((a, b) => {
      const ca = refereeCounts[a.id];
      const cb = refereeCounts[b.id];
      if (ca !== cb) return ca - cb;
      const ia = indexById.get(a.id) ?? 0;
      const ib = indexById.get(b.id) ?? 0;
      return ib - ia;
    });
    const chosen = eligible[0];
    refereeCounts[chosen.id] += 1;
    const name =
      chosen.name != null && String(chosen.name).trim() !== '' ? String(chosen.name) : String(chosen.id);
    return {
      player1Id: p1Id,
      player2Id: p2Id,
      chalkerId: chosen.id,
      refereeId: chosen.id,
      referee: { id: chosen.id, name },
      groupId,
    };
  });

  return matches.map((m, idx) => ({
    ...m,
    id: `${groupId}-r${idx + 1}-${m.player1Id}-${m.player2Id}`,
    round: idx + 1,
    status: 'pending',
  }));
}

/**
 * Vygeneruje Round Robin zápasy pro jednu skupinu v přesném pořadí (3–6 hráčů dle turnajového manuálu).
 * Počtář je vždy určený slotem v rozvrhu (nasazení 1 = nejlepší podle vstupního pole).
 *
 * @param {Array<{id?: string, name?: string, ranking?: number}>} groupPlayers - pořadí pole = nasazení (0 = jednička)
 * @param {string} groupId - ID skupiny (např. 'A')
 * @returns {Array<object>} zápasy s player1Id, player2Id, chalkerId, groupId, id, round, status
 */
export function generateGroupMatches(groupPlayers, groupId) {
  if (!groupPlayers || groupPlayers.length < 2) return [];

  const players = groupPlayers.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }));
  const n = players.length;

  if (n === 2) {
    const [a, b] = players;
    const chalkerId = null;
    return [
      {
        player1Id: a.id,
        player2Id: b.id,
        chalkerId,
        refereeId: chalkerId,
        referee: null,
        groupId,
        id: `${groupId}-r1-${a.id}-${b.id}`,
        round: 1,
        status: 'pending',
      },
    ];
  }

  const schedule = GROUP_ROUND_ROBIN_SCHEDULE[n];
  if (!schedule) {
    return generateGroupMatchesFallback(groupPlayers, groupId);
  }

  const matches = schedule.map((row, idx) => {
    const p1 = players[row.i1];
    const p2 = players[row.i2];
    const refP = players[row.ref];
    if (!p1 || !p2 || !refP) {
      return null;
    }
    const name =
      refP.name != null && String(refP.name).trim() !== '' ? String(refP.name) : String(refP.id);
    return {
      player1Id: p1.id,
      player2Id: p2.id,
      chalkerId: refP.id,
      refereeId: refP.id,
      referee: { id: refP.id, name },
      groupId,
      id: `${groupId}-r${idx + 1}-${p1.id}-${p2.id}`,
      round: idx + 1,
      status: 'pending',
    };
  });

  return matches.filter(Boolean);
}
