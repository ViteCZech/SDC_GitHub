/**
 * Veřejná TV obrazovka haly: /tv/:pin
 * Pouze odvozuje read-only snapshot z dokumentu active_tournaments.
 */

import { resolveTotalBoards } from './tabletBoardQr.js';
import { pickParallelGroupMatches } from './groupParallelPlay.js';
import { formatRefereeNames, resolveRefereePerson } from './doublesReferee.js';
import { isTeamPlayer } from './doublesSeeding.js';
import { calculateGroupStandings, calculateTournamentStats } from './tournamentLogic.js';

export {
  buildVenueDisplayUrl,
  parseVenueDisplayRouteFromUrl,
  resolveVenueLang,
} from './venueDisplayRoutes.js';

export const VENUE_CAROUSEL_MS = 10_000;
export const VENUE_CALL_MS = 8_000;
/** Když Firestore v CI / offline neodpoví, nenechat TV viset na načítání. */
export const VENUE_LISTEN_TIMEOUT_MS = 8_000;
export const VENUE_GROUPS_PER_PAGE = 4;
export const VENUE_BOARDS_PER_PAGE = 6;
export const VENUE_BOARDS_PER_PAGE_WITH_BRACKET = 4;

/**
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
export function chunkVenuePages(items, size) {
  const list = Array.isArray(items) ? items : [];
  const n = Math.max(1, Number(size) || 1);
  if (list.length === 0) return [];
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** 1 terč = 1 sloupec, 2–4 = 2 sloupce, 5–6 = 3 sloupce (2×3). */
export function resolveVenueBoardColumns(count) {
  const n = Number(count) || 0;
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  return 3;
}

/** First-to X → Best of (2X − 1). */
export function venueBestOfFromWinLegs(winLegs) {
  const w = Math.max(1, Number(winLegs) || 1);
  return 2 * w - 1;
}

/**
 * @param {object|null|undefined} doc
 */
export function unpackCloudTournament(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const tournamentData = doc.tournamentData && typeof doc.tournamentData === 'object' ? doc.tournamentData : null;
  const groupsFromDoc = Array.isArray(doc.groups) ? doc.groups : [];
  const groupsFromTd = Array.isArray(tournamentData?.groups) ? tournamentData.groups : [];
  const groups = groupsFromDoc.length > 0 ? groupsFromDoc : groupsFromTd;
  return {
    tournamentData,
    groups,
    groupMatches: Array.isArray(doc.groupMatches) ? doc.groupMatches : [],
    tournamentBracket: Array.isArray(doc.tournamentBracket) ? doc.tournamentBracket : [],
    status: doc.status != null ? String(doc.status) : '',
    name: String(tournamentData?.name ?? doc.name ?? '').trim(),
  };
}

function matchIdOf(m) {
  if (!m) return '';
  const id = m.matchId ?? m.id;
  return id != null ? String(id) : '';
}

function isTerminal(m) {
  return m?.status === 'completed' || m?.status === 'walkover' || m?.walkover === true;
}

function isLive(m) {
  if (!m || m.isBye || isTerminal(m)) return false;
  return m.status === 'playing' || m.status === 'in_progress' || m.tabletStatus === 'checked_in';
}

function isPending(m) {
  return !!(m && !m.isBye && !isTerminal(m) && m.status === 'pending' && m.tabletStatus !== 'checked_in');
}

function findPlayerSlot(id, tournamentData, groups) {
  if (id == null || id === '') return null;
  const sid = String(id);
  const lists = [
    tournamentData?.players,
    ...(Array.isArray(groups) ? groups.map((g) => g?.players) : []),
    ...(Array.isArray(tournamentData?.groups) ? tournamentData.groups.map((g) => g?.players) : []),
  ];
  for (const list of lists) {
    const hit = (list || []).find((p) => String(p?.id ?? '') === sid);
    if (hit) return hit;
  }
  return null;
}

function resolveSlotName(id, tournamentData, groups) {
  const slot = findPlayerSlot(id, tournamentData, groups);
  const name = slot?.name;
  if (name != null && String(name).trim() !== '') return String(name).trim();
  return '';
}

function resolveMatchSideName(m, isP1, tournamentData, groups) {
  const raw = isP1
    ? (m?.player1Name != null && String(m.player1Name).trim()) || m?.p1Name
    : (m?.player2Name != null && String(m.player2Name).trim()) || m?.p2Name;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  const id = isP1 ? m?.player1Id : m?.player2Id;
  return resolveSlotName(id, tournamentData, groups) || (id != null && id !== '' ? String(id) : '—');
}

function resolveRefereeName(m, tournamentData, groups, groupPlayers = []) {
  const formatted = formatRefereeNames(m);
  if (formatted) return formatted;
  const chalkerId = m?.chalkerId ?? m?.referee?.id ?? m?.refereeId;
  if (chalkerId == null || chalkerId === '') return '';
  const slot =
    (groupPlayers || []).find((p) => String(p?.id ?? '') === String(chalkerId)) ||
    findPlayerSlot(chalkerId, tournamentData, groups);
  if (isTeamPlayer(slot)) {
    const person = resolveRefereePerson(slot, {});
    if (person?.name) return String(person.name);
  }
  if (slot?.name != null && String(slot.name).trim() !== '') return String(slot.name).trim();
  return resolveSlotName(chalkerId, tournamentData, groups);
}

function readLegs(m) {
  const r = m?.result && typeof m.result === 'object' ? m.result : {};
  const p1 = Number(r.p1Legs ?? m?.legsP1 ?? m?.score1 ?? m?.score?.p1 ?? 0) || 0;
  const p2 = Number(r.p2Legs ?? m?.legsP2 ?? m?.score2 ?? m?.score?.p2 ?? 0) || 0;
  return { p1, p2 };
}

function groupsFinished(groups, groupMatches) {
  if (!Array.isArray(groups) || groups.length === 0) return true;
  return groups.every((g) => {
    const gm = (groupMatches || []).filter((m) => (m.groupId ?? m.group) === g.groupId);
    return gm.length > 0 && gm.every(isTerminal);
  });
}

function summarizeMatch(m, tournamentData, groups, groupPlayers) {
  if (!m) return null;
  const legs = readLegs(m);
  return {
    matchId: matchIdOf(m),
    status: String(m.status || 'pending'),
    tabletStatus: m.tabletStatus != null ? String(m.tabletStatus) : '',
    player1Name: resolveMatchSideName(m, true, tournamentData, groups),
    player2Name: resolveMatchSideName(m, false, tournamentData, groups),
    refereeName: resolveRefereeName(m, tournamentData, groups, groupPlayers) || '',
    legsP1: legs.p1,
    legsP2: legs.p2,
    playing: isLive(m),
  };
}

function pickCurrentAndNext(ordered, tournamentData, groups, groupPlayers) {
  const currentRaw = ordered.find((m) => isLive(m)) || ordered.find((m) => isPending(m)) || null;
  const currentId = matchIdOf(currentRaw);
  const nextRaw =
    ordered.find((m) => isPending(m) && matchIdOf(m) !== currentId) || null;
  return {
    current: summarizeMatch(currentRaw, tournamentData, groups, groupPlayers),
    next: summarizeMatch(nextRaw, tournamentData, groups, groupPlayers),
  };
}

function matchesOnBoardFromBracket(tournamentBracket, board) {
  const b = String(board);
  const out = [];
  for (const round of tournamentBracket || []) {
    for (const m of round?.matches || []) {
      if (!m || m.isBye || !m.player1Id || !m.player2Id) continue;
      if (String(m.board ?? '').trim() !== b) continue;
      out.push(m);
    }
  }
  return out;
}

function matchesOnBoardFromGroup(group, groupMatches, board) {
  const b = String(board);
  const gms = (groupMatches || [])
    .filter((m) => (m.groupId ?? m.group) === group.groupId && m && !m.isBye && m.player1Id && m.player2Id)
    .slice()
    .sort((a, c) => (a.round ?? 0) - (c.round ?? 0));
  const groupBoards = (group.boards || []).map((x) => String(x).trim()).filter(Boolean);
  if (groupBoards.length <= 1) return gms;

  const selected = pickParallelGroupMatches(gms, groupBoards.length);
  const boardIdx = groupBoards.indexOf(b);
  const byBoard = gms.filter((m) => String(m.board ?? '').trim() === b);
  if (byBoard.length > 0) {
    const extra = selected.filter((m) => {
      const assigned = String(m.board ?? '').trim();
      return !assigned && matchIdOf(m) && !byBoard.some((x) => matchIdOf(x) === matchIdOf(m));
    });
    const indexed = boardIdx >= 0 ? selected[boardIdx] : null;
    const merged = [...byBoard];
    if (indexed && !merged.some((x) => matchIdOf(x) === matchIdOf(indexed))) merged.push(indexed);
    for (const m of extra) merged.push(m);
    return merged;
  }
  const picked = boardIdx >= 0 ? selected[boardIdx] : selected[0];
  if (!picked) return [];
  return [picked, ...gms.filter((m) => isPending(m) && matchIdOf(m) !== matchIdOf(picked))];
}

/**
 * @param {object|null|undefined} unpacked
 * @returns {Array<{ board: number, current: object|null, next: object|null }>}
 */
export function buildVenueBoardSnapshots(unpacked) {
  if (!unpacked?.tournamentData) return [];
  const { tournamentData, groups, groupMatches, tournamentBracket } = unpacked;
  const total = resolveTotalBoards(tournamentData);
  if (total <= 0) return [];

  const inBracket = Array.isArray(tournamentBracket) && tournamentBracket.length > 0 && groupsFinished(groups, groupMatches);

  const boards = [];
  for (let n = 1; n <= total; n += 1) {
    const group = Array.isArray(groups)
      ? groups.find((gr) => Array.isArray(gr.boards) && gr.boards.some((x) => String(x).trim() === String(n)))
      : null;
    const groupPlayers = group?.players || [];
    let ordered = [];
    if (inBracket) {
      ordered = matchesOnBoardFromBracket(tournamentBracket, n);
    } else if (group) {
      ordered = matchesOnBoardFromGroup(group, groupMatches, n);
    }
    const pair = pickCurrentAndNext(ordered, tournamentData, groups, groupPlayers);
    boards.push({
      board: n,
      current: pair.current,
      next: pair.next,
    });
  }
  return boards;
}

/**
 * @param {Array<{ board: number, current?: { matchId?: string, status?: string }|null, next?: { matchId?: string }|null }>} boards
 */
export function boardsOccupancySignature(boards) {
  return (boards || [])
    .map((b) => `${b.board}:${b.current?.matchId || ''}:${b.current?.status || ''}:${b.next?.matchId || ''}`)
    .join('|');
}

/**
 * Nové volání jen když se na terči objeví jiný aktuální zápas.
 * @param {object[]} prevBoards
 * @param {object[]} nextBoards
 */
export function detectVenueMatchCalls(prevBoards, nextBoards) {
  const prevByBoard = new Map((prevBoards || []).map((b) => [String(b.board), b.current?.matchId || '']));
  const calls = [];
  for (const b of nextBoards || []) {
    const prevId = prevByBoard.get(String(b.board)) ?? '';
    const nextId = b.current?.matchId || '';
    if (!nextId || nextId === prevId) continue;
    calls.push({
      board: b.board,
      player1Name: b.current?.player1Name || '—',
      player2Name: b.current?.player2Name || '—',
      refereeName: b.current?.refereeName || '',
    });
  }
  return calls;
}

function chunk(arr, size) {
  const out = [];
  const n = Math.max(1, size);
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * @param {object|null|undefined} unpacked
 */
export function buildVenueCarouselSlides(unpacked) {
  const slides = [{ type: 'boards' }];
  if (!unpacked) return slides;

  const standings = (unpacked.groups || [])
    .map((g) => {
      const gm = (unpacked.groupMatches || []).filter((m) => (m.groupId ?? m.group) === g.groupId);
      return {
        groupId: g.groupId,
        name: String(g.name || g.label || g.groupId || ''),
        rows: calculateGroupStandings(g.players || [], gm),
      };
    })
    .filter((g) => Array.isArray(g.rows) && g.rows.length > 0);

  if (standings.length > 0) {
    const perSlide = standings.length <= 2 ? standings.length : 2;
    for (const batch of chunk(standings, perSlide)) {
      slides.push({ type: 'groups', standings: batch });
    }
  }

  let stats = null;
  try {
    stats = calculateTournamentStats(unpacked.groups, unpacked.tournamentBracket, unpacked.groupMatches);
  } catch {
    stats = null;
  }
  const top180s = (stats?.top180s || []).filter((x) => Number(x.count) > 0);
  if (top180s.length > 0) slides.push({ type: 'top180s', rows: top180s });
  const topCheckouts = (stats?.topCheckouts || []).filter((x) => Number(x.checkout) > 0);
  if (topCheckouts.length > 0) slides.push({ type: 'topCheckouts', rows: topCheckouts });
  return slides;
}

/**
 * @param {object|null|undefined} doc
 */
export function buildVenueDisplayModel(doc) {
  const unpacked = unpackCloudTournament(doc);
  if (!unpacked) return null;
  const boards = buildVenueBoardSnapshots(unpacked);
  return {
    unpacked,
    boards,
    slides: buildVenueCarouselSlides(unpacked),
    signature: boardsOccupancySignature(boards),
    name: unpacked.name,
    status: unpacked.status,
  };
}

/**
 * Krátký gong přes Web Audio (bez souboru — obejde autostop po gestu uživatele).
 * @param {AudioContext} audioCtx
 */
export function playVenueGong(audioCtx) {
  if (!audioCtx || typeof audioCtx.createOscillator !== 'function') return;
  if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
    void audioCtx.resume();
  }
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.38, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.55);
  master.connect(audioCtx.destination);

  for (const [freq, gain, detune] of [
    [392, 0.55, 0],
    [523.25, 0.32, 6],
    [784, 0.22, -4],
  ]) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.detune?.setValueAtTime?.(detune, now);
    g.gain.setValueAtTime(gain, now);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 1.6);
  }
}
