import { isTeamPlayer } from './doublesSeeding.js';

/**
 * Horší hráč z páru jako počtář (osoba, ne tým).
 * 1) nižší průměr v daném zápase
 * 2) nižší turnajový průměr
 * 3) horší ČP dvojice (vyšší číslo ranku)
 */

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {object} match */
export function membersMapFromMatch(match) {
  const raw = match?.result?.members ?? match?.members;
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

/**
 * @param {string} memberId
 * @param {object} match
 */
export function memberMatchAvg(memberId, match) {
  const map = membersMapFromMatch(match);
  if (!map || memberId == null) return null;
  const row = map[memberId] ?? Object.values(map).find((m) => String(m?.id) === String(memberId));
  if (!row) return null;
  const avg = numOrNull(row.avg);
  if (avg != null) return avg;
  const darts = numOrNull(row.darts);
  const score = numOrNull(row.score);
  if (darts != null && darts > 0 && score != null) return (score / darts) * 3;
  return null;
}

/**
 * @param {string} memberId
 * @param {object[]} matches
 */
export function memberTournamentAvg(memberId, matches) {
  if (memberId == null || !Array.isArray(matches)) return null;
  let score = 0;
  let darts = 0;
  for (const m of matches) {
    if (m?.status !== 'completed' && m?.status !== 'walkover') continue;
    const map = membersMapFromMatch(m);
    if (!map) continue;
    const row = map[memberId] ?? Object.values(map).find((x) => String(x?.id) === String(memberId));
    if (!row || row.isBust) continue;
    const d = numOrNull(row.darts) || 0;
    const s = numOrNull(row.score);
    if (d > 0 && s != null) {
      darts += d;
      score += s;
    } else {
      const avg = numOrNull(row.avg);
      if (avg != null && d > 0) {
        darts += d;
        score += (avg / 3) * d;
      }
    }
  }
  return darts > 0 ? (score / darts) * 3 : null;
}

function compareWorseFirst(a, b) {
  if (a.matchAvg != null && b.matchAvg != null && a.matchAvg !== b.matchAvg) return a.matchAvg - b.matchAvg;
  if (a.matchAvg != null && b.matchAvg == null) return -1;
  if (a.matchAvg == null && b.matchAvg != null) return 1;
  if (a.tourAvg != null && b.tourAvg != null && a.tourAvg !== b.tourAvg) return a.tourAvg - b.tourAvg;
  if (a.tourAvg != null && b.tourAvg == null) return -1;
  if (a.tourAvg == null && b.tourAvg != null) return 1;
  if (a.doublesRank != null && b.doublesRank != null && a.doublesRank !== b.doublesRank) {
    return b.doublesRank - a.doublesRank;
  }
  if (a.doublesRank != null && b.doublesRank == null) return 1;
  if (a.doublesRank == null && b.doublesRank != null) return -1;
  return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'cs');
}

/**
 * @param {object} team slot (tým nebo jednotlivec)
 * @param {{ match?: object, matches?: object[], usedIds?: Set<string>|string[] }} [opts]
 * @returns {{ id: string, name: string }|null}
 */
export function pickWorsePlayerFromTeam(team, opts = {}) {
  if (!team) return null;
  if (!isTeamPlayer(team)) {
    const id = team.id ?? team.name;
    if (id == null || id === '') return null;
    return { id, name: String(team.name ?? id) };
  }

  const used = opts.usedIds
    ? opts.usedIds instanceof Set
      ? opts.usedIds
      : new Set(opts.usedIds)
    : null;

  const scored = (team.members || []).slice(0, 2).map((m, i) => ({
    id: m.id ?? `${team.id}-m${i}`,
    name: String(m.name ?? m.id ?? ''),
    matchAvg: memberMatchAvg(m.id, opts.match),
    tourAvg: memberTournamentAvg(m.id, opts.matches),
    doublesRank: numOrNull(m.doublesRank),
  }));

  if (scored.length === 0) {
    return { id: team.id, name: String(team.name ?? team.id) };
  }

  const available = used ? scored.filter((s) => !used.has(s.id) && !used.has(String(s.id))) : scored;
  const pool = available.length > 0 ? available : scored;
  pool.sort(compareWorseFirst);
  const pick = pool[0];
  return { id: pick.id, name: pick.name };
}

/**
 * Najdi slot (tým/hráč) podle id ve skupinách a plochém soupisce.
 */
export function findSlotById(playerId, groups = [], extraPlayers = []) {
  if (playerId == null || playerId === '') return null;
  const id = String(playerId);
  const lists = [
    extraPlayers,
    ...((groups || []).map((g) => g.players)),
  ];
  for (const list of lists) {
    const hit = (list || []).find((x) => String(x?.id ?? '') === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Počtář jako osoba: u týmu horší člen, jinak původní slot.
 */
export function resolveRefereePerson(slotOrId, opts = {}) {
  const slot =
    slotOrId && typeof slotOrId === 'object' && (slotOrId.members || slotOrId.id)
      ? slotOrId
      : findSlotById(slotOrId?.id ?? slotOrId, opts.groups, opts.players);
  if (!slot) {
    const id = slotOrId?.id ?? slotOrId;
    const name = slotOrId?.name ?? id;
    if (id == null || id === '') return null;
    return { id, name: String(name ?? id) };
  }
  return pickWorsePlayerFromTeam(slot, opts);
}

/**
 * Do busy množiny přidej i členy týmů, které zrovna hrají.
 * @param {Set<string>} busyIds
 * @param {object[]} groups
 * @param {object[]} [extraPlayers]
 */
export function expandBusyIdsWithTeamMembers(busyIds, groups, extraPlayers = []) {
  const next = busyIds instanceof Set ? busyIds : new Set(busyIds || []);
  for (const id of [...next]) {
    const slot = findSlotById(id, groups, extraPlayers);
    if (!isTeamPlayer(slot)) continue;
    for (const m of slot.members || []) {
      if (m?.id != null) next.add(m.id);
    }
  }
  return next;
}
