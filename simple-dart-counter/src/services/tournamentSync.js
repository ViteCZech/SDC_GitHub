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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../firebase';

const COLLECTION = 'active_tournaments';
const PAST_COLLECTION = 'past_tournaments';
const FUNCTIONS_REGION = 'europe-west1';

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
  if (m.id != null && String(m.id) !== '') return `mid:${m.id}`;
  return `g:${m.groupId ?? m.group}-${m.player1Id}-${m.player2Id}-${m.round ?? 'x'}`;
}

/** Všechny možné klíče zápasu — kvůli matchId vs id mezi adminem a tabletem. */
function groupMatchKeys(m) {
  if (!m) return [];
  const keys = [];
  if (m.matchId != null && String(m.matchId) !== '') keys.push(`mid:${String(m.matchId)}`);
  if (m.id != null && String(m.id) !== '') keys.push(`mid:${String(m.id)}`);
  keys.push(`g:${m.groupId ?? m.group}-${m.player1Id}-${m.player2Id}-${m.round ?? 'x'}`);
  // bez round (někdy chybí na jedné straně)
  keys.push(`g:${m.groupId ?? m.group}-${m.player1Id}-${m.player2Id}`);
  return [...new Set(keys.filter(Boolean))];
}

function bracketMatchKey(m) {
  if (!m) return '';
  const id = m.id ?? m.matchId;
  if (id != null && String(id) !== '') return `bid:${id}`;
  return '';
}

function findCloudGroupMatch(cloudByKey, local) {
  for (const k of groupMatchKeys(local)) {
    const hit = cloudByKey.get(k);
    if (hit) return hit;
  }
  return null;
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
  let groupMatches = Array.isArray(safeState.groupMatches) ? safeState.groupMatches : [];
  let tournamentBracket = Array.isArray(safeState.tournamentBracket)
    ? safeState.tournamentBracket
    : [];

  // Drž top-level `groups` a `tournamentData.groups` ve shodě (tablet bere obojí).
  const tournamentDataSynced =
    tournamentData && groups.length > 0
      ? { ...tournamentData, groups }
      : tournamentData;

  const ref = doc(db, COLLECTION, id);

  // Než admin přepíše dokument, slouč výsledky z tabletu z aktuálního cloudu
  // (zabrání race: starý lokální stav přepíše právě uložený výsledek z tabletu).
  try {
    const existing = await getDoc(ref);
    const exists = typeof existing.exists === 'function' ? existing.exists() : existing.exists;
    if (exists) {
      const cloud = existing.data() || {};
      groupMatches = mergeAdminGroupMatchesFromTabletCloud(
        groupMatches,
        Array.isArray(cloud.groupMatches) ? cloud.groupMatches : []
      );
      tournamentBracket = mergeAdminBracketFromTabletCloud(
        tournamentBracket,
        Array.isArray(cloud.tournamentBracket) ? cloud.tournamentBracket : []
      );
    }
  } catch (err) {
    console.warn('syncTournamentToCloud: cloud merge before write failed', err);
  }

  const status = deriveTournamentStatus({
    tournamentData: tournamentDataSynced,
    groupMatches,
    tournamentBracket,
  });

  const withMeta = {
    tournamentData: tournamentDataSynced,
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
 * Tablet: aktualizace zápasu přes Cloud Function (bez Google loginu).
 * Ověření PIN + volitelné heslo terče probíhá na serveru.
 * @param {string} pin
 * @param {'group'|'bracket'} matchType
 * @param {string} matchId
 * @param {Record<string, unknown>} matchUpdates
 * @param {{ tabletPassword?: string }} [opts]
 */
/**
 * Tablet: označí terč jako online po naskenování QR (Cloud Function, bez Google loginu).
 * @param {string} pin
 * @param {string|number} board
 * @param {string} token
 */
export async function registerTabletBoardOnline(pin, board, token) {
  if (!app) throw new Error('Firebase app není dostupná.');
  const id = String(pin ?? '').trim();
  if (!/^\d{4}$/.test(id)) throw new Error('Neplatný PIN turnaje.');
  const boardStr = String(board ?? '').replace(/\D/g, '').slice(0, 2);
  const boardNum = parseInt(boardStr, 10);
  if (!Number.isFinite(boardNum) || boardNum < 1) throw new Error('Neplatné číslo terče.');
  const authToken = String(token ?? '').trim();
  if (!authToken) throw new Error('Chybí autorizační token.');

  const functions = getFunctions(app, FUNCTIONS_REGION);
  const fn = httpsCallable(functions, 'registerTabletBoardOnline');
  try {
    await fn({ pin: id, board: boardStr, token: authToken });
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err ? String(err.message) : '';
    const clean = message
      .replace(/^Firebase:\s*/i, '')
      .replace(/^functions\/[a-z-]+:\s*/i, '')
      .trim();
    throw new Error(clean || 'Nepodařilo se potvrdit připojení tabletu.');
  }
}

export async function updateCloudMatchFromTablet(pin, matchType, matchId, matchUpdates, opts = {}) {
  if (!app) throw new Error('Firebase app není dostupná.');
  const id = String(pin ?? '').trim();
  if (!/^\d{4}$/.test(id)) throw new Error('Neplatný PIN turnaje.');
  const mt = matchType === 'bracket' ? 'bracket' : matchType === 'group' ? 'group' : null;
  if (!mt) throw new Error('Neplatný typ zápasu.');
  const mid = String(matchId ?? '').trim();
  if (!mid) throw new Error('Chybí ID zápasu.');
  const rawPatches = matchUpdates && typeof matchUpdates === 'object' ? matchUpdates : {};
  const patches = stripUndefinedDeep(rawPatches);
  if (!patches || typeof patches !== 'object' || Object.keys(patches).length === 0) {
    throw new Error('Chybí data zápasu.');
  }

  const functions = getFunctions(app, FUNCTIONS_REGION);
  const fn = httpsCallable(functions, 'submitTabletMatchUpdate');
  try {
    await fn({
      pin: id,
      matchType: mt,
      matchId: mid,
      matchUpdates: patches,
      tabletPassword: String(opts.tabletPassword ?? '').trim().slice(0, 5) || undefined,
      board: opts.board != null ? String(opts.board).replace(/\D/g, '').slice(0, 2) : undefined,
      boardToken: String(opts.boardToken ?? '').trim() || undefined,
    });
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message =
      err && typeof err === 'object' && 'message' in err ? String(err.message) : '';
    const clean = message
      .replace(/^Firebase:\s*/i, '')
      .replace(/^functions\/[a-z-]+:\s*/i, '')
      .trim();
    const error = new Error(clean || 'Uložení zápasu do cloudu selhalo.');
    error.code = code.replace(/^functions\//, '') || 'tablet_match_update_failed';
    throw error;
  }
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
  if (
    JSON.stringify(local?.tabletCheckInPresent ?? null) !==
    JSON.stringify(merged?.tabletCheckInPresent ?? null)
  ) {
    return false;
  }
  if (
    JSON.stringify(local?.tabletTimeoutRoleWarningCounts ?? null) !==
    JSON.stringify(merged?.tabletTimeoutRoleWarningCounts ?? null)
  ) {
    return false;
  }
  if ((local?.tabletTimeoutWarningCount ?? null) !== (merged?.tabletTimeoutWarningCount ?? null)) {
    return false;
  }
  if (
    (local?.tabletTimeoutAdminAckedCount ?? null) !== (merged?.tabletTimeoutAdminAckedCount ?? null)
  ) {
    return false;
  }
  if (
    JSON.stringify(local?.tabletCheckInResume ?? null) !==
    JSON.stringify(merged?.tabletCheckInResume ?? null)
  ) {
    return false;
  }
  return true;
}

/**
 * Sloučení tablet check-in / timeout polí z cloudu do lokálního zápasu (admin).
 * Ignoruje zastaralé timeout_warning, pokud admin už dané varování potvrdil.
 */
function applyTabletCheckInCloudPatch(local, cloud, patch) {
  const localAcked = Number(local.tabletTimeoutAdminAckedCount) || 0;
  const cloudAcked = Number(cloud.tabletTimeoutAdminAckedCount) || 0;
  const cloudWarn = Number(cloud.tabletTimeoutWarningCount) || 0;
  const localWarn = Number(local.tabletTimeoutWarningCount) || 0;

  if (cloudAcked > localAcked) {
    patch.tabletTimeoutAdminAckedCount = cloudAcked;
  }

  if (cloudWarn > localWarn) {
    patch.tabletTimeoutWarningCount = cloudWarn;
  }

  if (cloud.tabletTimeoutRoleWarningCounts && typeof cloud.tabletTimeoutRoleWarningCounts === 'object') {
    const lr = local.tabletTimeoutRoleWarningCounts || {};
    const cr = cloud.tabletTimeoutRoleWarningCounts;
    const mergedRoles = {
      p1: Math.max(Number(lr.p1) || 0, Number(cr.p1) || 0),
      p2: Math.max(Number(lr.p2) || 0, Number(cr.p2) || 0),
      referee: Math.max(Number(lr.referee) || 0, Number(cr.referee) || 0),
    };
    if (JSON.stringify(mergedRoles) !== JSON.stringify({
      p1: Number(lr.p1) || 0,
      p2: Number(lr.p2) || 0,
      referee: Number(lr.referee) || 0,
    })) {
      patch.tabletTimeoutRoleWarningCounts = mergedRoles;
    }
  }

  const effectiveAcked = Math.max(localAcked, cloudAcked, Number(patch.tabletTimeoutAdminAckedCount) || 0);
  const effectiveWarn = Math.max(localWarn, cloudWarn, Number(patch.tabletTimeoutWarningCount) || 0);

  if (cloud.tabletStatus === 'timeout_warning') {
    const warnLevel = effectiveWarn || 1;
    if (warnLevel > effectiveAcked) {
      patch.tabletStatus = 'timeout_warning';
      if (effectiveWarn > localWarn) patch.tabletTimeoutWarningCount = effectiveWarn;
      if (
        cloud.tabletCheckInPresent != null &&
        JSON.stringify(cloud.tabletCheckInPresent) !== JSON.stringify(local.tabletCheckInPresent ?? null)
      ) {
        patch.tabletCheckInPresent = cloud.tabletCheckInPresent;
      }
      if (cloud.tabletCheckInResume == null && local.tabletCheckInResume != null) {
        patch.tabletCheckInResume = null;
      }
    }
  } else if (cloud.tabletStatus != null && cloud.tabletStatus !== local.tabletStatus) {
    patch.tabletStatus = cloud.tabletStatus;
  }

  if (cloud.whoStarts != null && cloud.whoStarts !== local.whoStarts) {
    patch.whoStarts = cloud.whoStarts;
  }

  const localResumeToken = Number(local.tabletCheckInResume?.token) || 0;
  const cloudResumeToken = Number(cloud.tabletCheckInResume?.token) || 0;
  if (cloudResumeToken > localResumeToken) {
    patch.tabletCheckInResume = cloud.tabletCheckInResume;
  }

  if (
    cloud.tabletCheckInPresent != null &&
    cloud.tabletStatus !== 'timeout_warning' &&
    JSON.stringify(cloud.tabletCheckInPresent) !== JSON.stringify(local.tabletCheckInPresent ?? null)
  ) {
    patch.tabletCheckInPresent = cloud.tabletCheckInPresent;
  }
}

/**
 * Admin listener: sloučí do lokálních groupMatches dokončení a tablet pole z cloudu (bez přepisu celého turnaje).
 */
export function mergeAdminGroupMatchesFromTabletCloud(prevLocal, cloudList) {
  if (!Array.isArray(prevLocal) || !Array.isArray(cloudList)) return prevLocal;
  const cloudByKey = new Map();
  for (const m of cloudList) {
    for (const k of groupMatchKeys(m)) {
      if (k) cloudByKey.set(k, m);
    }
  }
  let changed = false;
  const next = prevLocal.map((local) => {
    const cloud = findCloudGroupMatch(cloudByKey, local);
    if (!cloud) return local;

    if (isCloudMatchTerminal(cloud)) {
      // Preferuj novější dokončení, pokud jsou obě strany hotové
      if (isCloudMatchTerminal(local)) {
        const lc = Number(local.completedAt) || 0;
        const cc = Number(cloud.completedAt) || 0;
        if (lc > cc) return local;
      }
      const merged = { ...local, ...cloud };
      if (groupCompletedMergeUnchanged(local, merged)) return local;
      changed = true;
      return merged;
    }

    // Cloud není hotový — lokální dokončený výsledek nesahej
    if (isCloudMatchTerminal(local)) return local;

    const patch = {};
    applyTabletCheckInCloudPatch(local, cloud, patch);
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
      const alt = m?.matchId != null && m?.id != null && String(m.matchId) !== String(m.id)
        ? `bid:${m.matchId}`
        : '';
      if (alt) cloudByKey.set(alt, m);
    }
  }
  let anyChanged = false;
  const next = prevLocal.map((round, ri) => {
    const cloudRound = cloudBracket[ri];
    if (!round?.matches || !cloudRound?.matches) return round;
    let roundChanged = false;
    const newMatches = round.matches.map((local) => {
      const k = bracketMatchKey(local);
      const cloud = k
        ? cloudByKey.get(k) ||
          (local.matchId != null ? cloudByKey.get(`bid:${local.matchId}`) : null) ||
          (local.id != null ? cloudByKey.get(`bid:${local.id}`) : null)
        : null;
      if (!cloud) return local;

      if (isCloudMatchTerminal(cloud)) {
        if (isCloudMatchTerminal(local)) {
          const lc = Number(local.completedAt) || 0;
          const cc = Number(cloud.completedAt) || 0;
          if (lc > cc) return local;
        }
        const merged = { ...local, ...cloud };
        if (groupCompletedMergeUnchanged(local, merged)) return local;
        roundChanged = true;
        return merged;
      }

      if (isCloudMatchTerminal(local)) return local;

      const patch = {};
      applyTabletCheckInCloudPatch(local, cloud, patch);
      // Admin / synchronizace: doplnění chybějícího soupeře v čekajícím zápase (např. ruční oprava v cloudu).
      const mergeMissingSlot = (idKey, nameKey, altIdKey, altNameKey) => {
        const lid = local[idKey] ?? local[altIdKey];
        const cid = cloud[idKey] ?? cloud[altIdKey];
        if ((lid != null && lid !== '') || cid == null || cid === '') return;
        patch[idKey] = cid;
        const cn = cloud[nameKey] ?? cloud[altNameKey];
        if (cn != null && cn !== '') patch[nameKey] = cn;
      };
      mergeMissingSlot('player1Id', 'player1Name', 'p1Id', 'p1Name');
      mergeMissingSlot('player2Id', 'player2Name', 'p2Id', 'p2Name');

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
 * Herní tablet: ověří PIN + volitelné heslo z `tournamentData.tabletPassword` ve stejném dokumentu Firestore.
 * Starší turnaje bez pole `tabletPassword` — stačí platný PIN (zpětná kompatibilita).
 * @param {string} pin
 * @param {string} [tabletPassword]
 * @returns {Promise<{ ok: boolean, reason?: 'not_found'|'bad_password'|'error' }>}
 */
export async function verifyTabletBoardAccess(pin, tabletPassword, opts = {}) {
  if (!db || !pin) return { ok: false, reason: 'error' };
  const id = String(pin).trim();
  if (!/^\d{4}$/.test(id)) return { ok: false, reason: 'not_found' };
  try {
    const ref = doc(db, COLLECTION, id);
    const docSnap = await getDoc(ref);
    const exists = typeof docSnap.exists === 'function' ? docSnap.exists() : docSnap.exists;
    if (!exists) return { ok: false, reason: 'not_found' };
    const raw = docSnap.data();
    const td = raw?.tournamentData;
    const board = String(opts.board ?? '').replace(/\D/g, '').slice(0, 2);
    const boardToken = String(opts.boardToken ?? '').trim();
    if (board && boardToken) {
      const tokens = td?.boardAuthTokens;
      if (tokens && typeof tokens === 'object' && tokens[board] != null) {
        if (String(tokens[board]).trim() === boardToken) return { ok: true };
        return { ok: false, reason: 'bad_password' };
      }
    }
    const expected =
      td && td.tabletPassword != null ? String(td.tabletPassword).trim().slice(0, 5) : '';
    if (expected === '') return { ok: true };
    const provided = String(tabletPassword ?? '').trim().slice(0, 5);
    if (provided !== expected) return { ok: false, reason: 'bad_password' };
    return { ok: true };
  } catch (err) {
    console.warn('verifyTabletBoardAccess:', err);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Živý poslech dokumentu turnaje. Při smazání nebo neexistenci dokumentu volá callback(null).
 * @param {string} pin
 * @param {(data: object|null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function listenToCloudTournament(pin, callback) {
  const notifyMissing = () => {
    try {
      callback(null);
    } catch {
      /* ignore */
    }
  };
  if (!db || !pin) {
    queueMicrotask(notifyMissing);
    return () => {};
  }
  const id = String(pin).trim();
  if (!/^\d{4}$/.test(id)) {
    queueMicrotask(notifyMissing);
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
      notifyMissing();
    }
  );
}
