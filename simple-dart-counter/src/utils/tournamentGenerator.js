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
 * Vygeneruje Round Robin zápasy pro jednu skupinu. Počtář (chalker) je vždy jen z hráčů této skupiny,
 * s rotací podle počtu odpočítaných zápasů (tie-break: horší nasazení = vyšší index v poli).
 *
 * @param {Array<{id?: string, name?: string, ranking?: number}>} groupPlayers - pořadí pole = nasazení (0 = jednička)
 * @param {string} groupId - ID skupiny (např. 'A')
 * @returns {Array<object>} zápasy s player1Id, player2Id, chalkerId, groupId, id, round, status
 */
export function generateGroupMatches(groupPlayers, groupId) {
  if (!groupPlayers || groupPlayers.length < 2) return [];

  const players = groupPlayers.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }));

  if (players.length === 2) {
    const [a, b] = players;
    return [
      {
        player1Id: a.id,
        player2Id: b.id,
        chalkerId: null,
        groupId,
        id: `${groupId}-r1-${a.id}-${b.id}`,
        round: 1,
        status: 'pending',
      },
    ];
  }

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
    const name = chosen.name != null && String(chosen.name).trim() !== '' ? String(chosen.name) : String(chosen.id);
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
