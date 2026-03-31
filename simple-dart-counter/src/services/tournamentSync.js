import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = 'active_tournaments';
const PAST_COLLECTION = 'past_tournaments';

function isMatchTerminal(m) {
  const s = m?.status;
  return s === 'completed' || s === 'walkover' || m?.walkover === true;
}

/**
 * Odvození stavu turnaje pro cloud: příprava (jen draft), běží, nebo dokončen.
 */
function deriveTournamentStatus({ tournamentData, groupMatches, tournamentBracket }) {
  if (!tournamentData) return 'preparing';
  const gm = Array.isArray(groupMatches) ? groupMatches : [];
  const bracketMatches = Array.isArray(tournamentBracket)
    ? tournamentBracket.flatMap((r) => (Array.isArray(r?.matches) ? r.matches : []))
    : [];
  const allMatches = [...gm, ...bracketMatches];
  if (allMatches.length === 0) return 'running';
  const allDone = allMatches.every(isMatchTerminal);
  return allDone ? 'finished' : 'running';
}

/** Hluboká kopie přes JSON – vyhodí undefined v objektech (Firestore je nepodporuje). */
function cloneJsonSafe(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch (e) {
    console.warn('cloneJsonSafe:', e);
    return fallback;
  }
}

/** Odstraní undefined z vnořených objektech (Firestore). */
function stripUndefinedDeep(val) {
  if (val === undefined) return undefined;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((x) => stripUndefinedDeep(x));
  }
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    if (v === undefined) continue;
    const nv = stripUndefinedDeep(v);
    if (nv !== undefined) out[k] = nv;
  }
  return out;
}

function groupMatchKey(m) {
  if (!m) return '';
  if (m.matchId != null && String(m.matchId) !== '') return `mid:${m.matchId}`;
  return `g:${m.groupId ?? m.group}-${m.player1Id}-${m.player2Id}-${m.round ?? 'x'}`;
}

function bracketMatchKey(m) {
  if (!m) return '';
  const id = m.id ?? m.matchId;
  if (id != null && String(id) !== '') return `bid:${id}`;
  return '';
}

function findGroupMatchIndex(matches, matchId) {
  if (!Array.isArray(matches)) return -1;
  const want = String(matchId ?? '').trim();
  if (!want) return -1;
  return matches.findIndex((m) => {
    const mid = m.matchId ?? m.id;
    return mid != null && String(mid) === want;
  });
}

function findBracketMatchLoc(bracket, matchId) {
  if (!Array.isArray(bracket)) return null;
  const want = String(matchId ?? '').trim();
  if (!want) return null;
  for (let ri = 0; ri < bracket.length; ri++) {
    const list = bracket[ri]?.matches;
    if (!Array.isArray(list)) continue;
    const mi = list.findIndex((m) => {
      const id = m.id ?? m.matchId;
      return id != null && String(id) === want;
    });
    if (mi >= 0) return { roundIndex: ri, matchIndex: mi };
  }
  return null;
}

/**
 * @param {string} pin – ID dokumentu (4místný PIN)
 * @param {{ tournamentData?: object|null, groups?: array, groupMatches?: array, tournamentBracket?: array }} tournamentState
 */
export async function syncTournamentToCloud(pin, tournamentState) {
  if (!db || !pin) return;
  const id = String(pin).trim();
  if (!/^\d{4}$/.test(id)) return;

  const safeState = cloneJsonSafe(tournamentState, {});
  if (!safeState || typeof safeState !== 'object') return;

  const tournamentData = safeState.tournamentData ?? null;
  const groups = Array.isArray(safeState.groups) ? safeState.groups : [];
  const groupMatches = Array.isArray(safeState.groupMatches) ? safeState.groupMatches : [];
  const tournamentBracket = Array.isArray(safeState.tournamentBracket)
    ? safeState.tournamentBracket
    : [];

  const status = deriveTournamentStatus({
    tournamentData,
    groupMatches,
    tournamentBracket,
  });

  const ref = doc(db, COLLECTION, id);
  const withMeta = {
    tournamentData,
    groups,
    groupMatches,
    tournamentBracket,
    status,
    lastUpdated: new Date().toISOString(),
  };

  const payload = cloneJsonSafe(withMeta, null);
  if (payload == null) return;

  await setDoc(ref, payload, { merge: true });
}

/**
 * Smaže aktivní turnaj v cloudu (např. při ukončení administrátorem).
 */
export async function deleteCloudTournament(pin) {
  if (!db || !pin) return;
  const id = String(pin).trim();
  if (!/^\d{4}$/.test(id)) return;
  const ref = doc(db, COLLECTION, id);
  await deleteDoc(ref);
}

/**
 * Uloží dokončený turnaj do `past_tournaments` a teprve poté smaže `active_tournaments/{pin}`.
 * @param {string} userId
 * @param {string} pin
 * @param {string} name
 * @param {{ tournamentData?: object|null, groups?: array, groupMatches?: array, tournamentBracket?: array }} fullData
 */
export async function archivePastTournamentAndDeleteActive(userId, pin, name, fullData) {
  if (!db || !userId) throw new Error('archivePastTournament: missing db or userId');
  const id = String(pin).trim();
  if (!/^\d{4}$/.test(id)) throw new Error('archivePastTournament: invalid PIN');

  const safeData = cloneJsonSafe(fullData, null);
  if (safeData == null || typeof safeData !== 'object') {
    throw new Error('archivePastTournament: invalid data');
  }

  const payload = stripUndefinedDeep({
    // Backward compatibility: keep `userId`, but new field is `ownerId`.
    ownerId: userId,
    userId,
    date: Timestamp.now(),
    name: String(name || '').trim() || '(bez názvu)',
    data: safeData,
  });
  if (!payload) throw new Error('archivePastTournament: empty payload');

  await addDoc(collection(db, PAST_COLLECTION), payload);
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Tablet: načte dokument, najde zápas ve skupině nebo pavoukovi, sloučí matchUpdates do objektu zápasu a uloží celý dokument.
 * @param {string} pin
 * @param {'group'|'bracket'} matchType
 * @param {string} matchId
 * @param {Record<string, unknown>} matchUpdates
 */
export async function updateCloudMatchFromTablet(pin, matchType, matchId, matchUpdates) {
  if (!db || !pin) return;
  const id = String(pin).trim();
  if (!/^\d{4}$/.test(id)) return;
  const rawPatches = matchUpdates && typeof matchUpdates === 'object' ? matchUpdates : {};
  const patches = stripUndefinedDeep(rawPatches);
  if (!patches || typeof patches !== 'object' || Object.keys(patches).length === 0) return;

  const ref = doc(db, COLLECTION, id);
  const docSnap = await getDoc(ref);
  const exists = typeof docSnap.exists === 'function' ? docSnap.exists() : docSnap.exists;
  if (!exists) {
    console.warn('updateCloudMatchFromTablet: document missing', id);
    return;
  }

  const raw = docSnap.data();
  const tournamentData = raw.tournamentData ?? null;
  let groupMatches = Array.isArray(raw.groupMatches) ? cloneJsonSafe(raw.groupMatches, []) : [];
  let tournamentBracket = Array.isArray(raw.tournamentBracket)
    ? cloneJsonSafe(raw.tournamentBracket, [])
    : [];

  if (matchType === 'group') {
    const idx = findGroupMatchIndex(groupMatches, matchId);
    if (idx < 0) {
      console.warn('updateCloudMatchFromTablet: group match not found', matchId);
      return;
    }
    groupMatches = groupMatches.map((m, i) => (i === idx ? { ...m, ...patches } : m));
  } else if (matchType === 'bracket') {
    const loc = findBracketMatchLoc(tournamentBracket, matchId);
    if (!loc) {
      console.warn('updateCloudMatchFromTablet: bracket match not found', matchId);
      return;
    }
    tournamentBracket = tournamentBracket.map((round, ri) => {
      if (ri !== loc.roundIndex) return round;
      const matches = (round.matches || []).map((m, mi) =>
        mi === loc.matchIndex ? { ...m, ...patches } : m
      );
      return { ...round, matches };
    });
  } else {
    console.warn('updateCloudMatchFromTablet: invalid matchType', matchType);
    return;
  }

  const groups = Array.isArray(raw.groups) ? raw.groups : [];
  const status = deriveTournamentStatus({
    tournamentData,
    groupMatches,
    tournamentBracket,
  });

  const payload = cloneJsonSafe(
    {
      ...raw,
      tournamentData,
      groups,
      groupMatches,
      tournamentBracket,
      status,
      lastUpdated: new Date().toISOString(),
    },
    null
  );
  if (payload == null) return;
  await setDoc(ref, payload);
}

function isCloudMatchTerminal(m) {
  const s = m?.status;
  return s === 'completed' || s === 'walkover' || m?.walkover === true;
}

/** Porovnání polí, která tablet posílá u dokončeného zápasu (bez zbytečného přerenderu). */
function groupCompletedMergeUnchanged(local, merged) {
  const keys = [
    'status',
    'winnerId',
    'p1Sets',
    'p2Sets',
    'score1',
    'score2',
    'legsP1',
    'legsP2',
    'p1Avg',
    'p2Avg',
    'p1DartsTotal',
    'p2DartsTotal',
    'p1High',
    'p2High',
    'p1HighCheckout',
    'p2HighCheckout',
    'completedAt',
    'tabletStatus',
    'whoStarts',
    'isWalkover',
    'withdrawnPlayerId',
  ];
  for (const k of keys) {
    if ((local?.[k] ?? null) !== (merged?.[k] ?? null)) return false;
  }
  if (JSON.stringify(local?.result ?? null) !== JSON.stringify(merged?.result ?? null)) return false;
  if (JSON.stringify(local?.score ?? null) !== JSON.stringify(merged?.score ?? null)) return false;
  if (JSON.stringify(local?.legDetails ?? null) !== JSON.stringify(merged?.legDetails ?? null)) return false;
  return true;
}

/**
 * Admin listener: sloučí do lokálních groupMatches dokončení a tablet pole z cloudu (bez přepisu celého turnaje).
 */
export function mergeAdminGroupMatchesFromTabletCloud(prevLocal, cloudList) {
  if (!Array.isArray(prevLocal) || !Array.isArray(cloudList)) return prevLocal;
  const cloudByKey = new Map();
  for (const m of cloudList) {
    cloudByKey.set(groupMatchKey(m), m);
  }
  let changed = false;
  const next = prevLocal.map((local) => {
    const key = groupMatchKey(local);
    const cloud = cloudByKey.get(key);
    if (!cloud) return local;

    if (isCloudMatchTerminal(cloud)) {
      const merged = { ...local, ...cloud };
      if (groupCompletedMergeUnchanged(local, merged)) return local;
      changed = true;
      return merged;
    }

    const patch = {};
    if (cloud.tabletStatus != null && cloud.tabletStatus !== local.tabletStatus) {
      patch.tabletStatus = cloud.tabletStatus;
    }
    if (cloud.whoStarts != null && cloud.whoStarts !== local.whoStarts) {
      patch.whoStarts = cloud.whoStarts;
    }
    if (Object.keys(patch).length === 0) return local;
    changed = true;
    return { ...local, ...patch };
  });
  return changed ? next : prevLocal;
}

/**
 * Admin listener: stejné pro zápasy v pavouku (klíč podle id / matchId).
 */
export function mergeAdminBracketFromTabletCloud(prevLocal, cloudBracket) {
  if (!Array.isArray(prevLocal) || !Array.isArray(cloudBracket)) return prevLocal;
  const cloudByKey = new Map();
  for (const round of cloudBracket) {
    for (const m of round?.matches || []) {
      const k = bracketMatchKey(m);
      if (k) cloudByKey.set(k, m);
    }
  }
  let anyChanged = false;
  const next = prevLocal.map((round, ri) => {
    const cloudRound = cloudBracket[ri];
    if (!round?.matches || !cloudRound?.matches) return round;
    let roundChanged = false;
    const newMatches = round.matches.map((local) => {
      const k = bracketMatchKey(local);
      const cloud = k ? cloudByKey.get(k) : null;
      if (!cloud) return local;

      if (isCloudMatchTerminal(cloud)) {
        const merged = { ...local, ...cloud };
        if (groupCompletedMergeUnchanged(local, merged)) return local;
        roundChanged = true;
        return merged;
      }

      const patch = {};
      if (cloud.tabletStatus != null && cloud.tabletStatus !== local.tabletStatus) {
        patch.tabletStatus = cloud.tabletStatus;
      }
      if (cloud.whoStarts != null && cloud.whoStarts !== local.whoStarts) {
        patch.whoStarts = cloud.whoStarts;
      }
      if (Object.keys(patch).length === 0) return local;
      roundChanged = true;
      return { ...local, ...patch };
    });
    if (!roundChanged) return round;
    anyChanged = true;
    return { ...round, matches: newMatches };
  });
  return anyChanged ? next : prevLocal;
}


/**
 * Ověří, zda v cloudu existuje aktivní turnaj s daným PINem.
 * @param {string} pin
 * @returns {Promise<boolean>}
 */
export async function verifyTournamentPin(pin) {
  if (!db || !pin) return false;
  const id = String(pin).trim();
  if (!/^\d{4}$/.test(id)) return false;
  try {
    const ref = doc(db, COLLECTION, id);
    const docSnap = await getDoc(ref);
    const exists = typeof docSnap.exists === 'function' ? docSnap.exists() : docSnap.exists;
    return !!exists;
  } catch (err) {
    console.warn('verifyTournamentPin:', err);
    return false;
  }
}

/**
 * Živý poslech dokumentu turnaje. Při smazání nebo neexistenci dokumentu volá callback(null).
 * @param {string} pin
 * @param {(data: object|null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function listenToCloudTournament(pin, callback) {
  if (!db || !pin) {
    return () => {};
  }
  const id = String(pin).trim();
  if (!/^\d{4}$/.test(id)) {
    return () => {};
  }
  const ref = doc(db, COLLECTION, id);
  return onSnapshot(
    ref,
    (docSnap) => {
      const exists = typeof docSnap.exists === 'function' ? docSnap.exists() : docSnap.exists;
      if (!exists) {
        callback(null);
        return;
      }
      callback(docSnap.data());
    },
    (err) => {
      console.warn('listenToCloudTournament snapshot error:', err);
    }
  );
}
