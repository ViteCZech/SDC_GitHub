import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { app, auth, db } from '../firebase';

function requireAuthUid() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error(ONLINE_AUTH_FAILED);
  return uid;
}

export const ONLINE_GAMES_COLLECTION = 'onlineGames';
const FUNCTIONS_REGION = 'europe-west1';

async function sha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Stejný algoritmus jako Cloud Function `hashOnlinePin`. */
export async function hashOnlinePin(pin) {
  const digits = String(pin ?? '').replace(/\D/g, '').slice(0, 4);
  return sha256Hex(`sdc-online-pin:${digits}`);
}

/**
 * Poznámka pro vývojáře: až budete zpřísňovat Firestore Rules, nastavte pro kolekci
 * `onlineGames` podmínku `request.auth != null` (a případně další pravidla), aby
 * čtení/zápis vyžadoval platného uživatele — anonymní přihlášení z této služby
 * pak poskytne `request.auth.uid` bez nutnosti e-mailové registrace.
 */

/** Konzistentní kód chyby pro UI (překlady). */
export const ONLINE_JOIN_ERROR_NOT_AVAILABLE = 'game_not_available';
export const ONLINE_JOIN_ERROR_GUEST_NAME = 'guest_name_required';
/** Selhalo tiché přihlášení (síť, Firebase Auth, …). */
export const ONLINE_AUTH_FAILED = 'auth_failed';

/**
 * Zajistí anonymní Firebase Auth před operacemi s kolekcí `onlineGames`.
 * Nevolat mimo tento modul (offline režim a turnaje zůstávají bez Auth).
 */
async function ensureAnonymousAuth() {
  if (!auth) {
    throw new Error('no_db');
  }
  try {
    if (auth.currentUser) return;
    await signInAnonymously(auth);
  } catch (e) {
    console.warn('ensureAnonymousAuth', e);
    throw new Error(ONLINE_AUTH_FAILED);
  }
}

/**
 * Lidsky čitelný formát pro dokument (např. "501 DO" nebo "Cricket").
 */
export function buildGameFormatLabel({ gameType, startScore, outMode }) {
  if (gameType === 'cricket') return 'Cricket';
  const om =
    outMode === 'double' ? 'DO' : outMode === 'single' ? 'SO' : outMode === 'master' ? 'MO' : 'DO';
  const s = Number(startScore) || 501;
  return `${s} ${om}`;
}

function randomFourDigitPin() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

/**
 * Vytvoří záznam online hry ve Firestore.
 * @param {object} opts
 * @param {string} opts.hostName
 * @param {'x01'|'cricket'} opts.gameType
 * @param {number} opts.legs 1–30
 * @param {boolean} opts.isPublic
 * @param {number} [opts.startScore] pro X01
 * @param {'double'|'single'|'master'} [opts.outMode] pro X01
 * @param {'p1'|'p2'} [opts.startPlayer] kdo začíná první leg (p1 = hostitel, p2 = host)
 */
export async function createOnlineGame(opts) {
  if (!db) throw new Error('no_db');
  await ensureAnonymousAuth();
  const hostName = String(opts.hostName || '').trim() || 'Host';
  const gameType = opts.gameType === 'cricket' ? 'cricket' : 'x01';
  const legs = Math.min(30, Math.max(1, Math.floor(Number(opts.legs) || 1)));
  const isPublic = !!opts.isPublic;
  const startPlayer = opts.startPlayer === 'p2' ? 'p2' : 'p1';
  const startScore = gameType === 'x01' ? Number(opts.startScore) || 501 : null;
  const outMode =
    gameType === 'x01' && ['double', 'single', 'master'].includes(opts.outMode)
      ? opts.outMode
      : 'double';
  const gameFormat =
    gameType === 'cricket'
      ? 'Cricket'
      : buildGameFormatLabel({ gameType: 'x01', startScore, outMode });
  const pin = isPublic ? null : randomFourDigitPin();
  const pinHash = isPublic ? null : await hashOnlinePin(pin);
  const hostUid = requireAuthUid();

  const payload = {
    status: 'waiting',
    hostUid,
    isPublic,
    hostName,
    gameFormat,
    legs,
    gameType,
    startScore: gameType === 'x01' ? startScore : null,
    outMode: gameType === 'x01' ? outMode : null,
    startPlayer,
    createdAt: serverTimestamp(),
    heartbeatHost: serverTimestamp(),
    ...(isPublic ? {} : { pinHash }),
  };

  const ref = await addDoc(collection(db, ONLINE_GAMES_COLLECTION), payload);
  return {
    gameId: ref.id,
    pin,
    hostName,
    gameFormat,
    legs,
    isPublic,
    gameType,
    startScore: payload.startScore,
    outMode: payload.outMode,
    startPlayer: payload.startPlayer,
  };
}

/**
 * Živý seznam veřejných her ve stavu waiting.
 * @returns {import('firebase/firestore').Unsubscribe}
 */
export function subscribePublicWaitingGames(onList, onError) {
  if (!db) {
    onList([]);
    return () => {};
  }
  const q = query(
    collection(db, ONLINE_GAMES_COLLECTION),
    where('status', '==', 'waiting'),
    where('isPublic', '==', true)
  );
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((g) => {
          // Lobby filter: nezobrazovat waiting hry, jejichž host se 30s neozval.
          const hb = g?.heartbeatHost?.toMillis?.();
          if (typeof hb !== 'number' || Number.isNaN(hb)) return false;
          return now - hb <= 30000;
        });
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      onList(list);
    },
    (err) => {
      console.error('subscribePublicWaitingGames', err);
      if (onError) onError(err);
      onList([]);
    }
  );
}

/**
 * Najde první čekající soukromou hru podle 4místného PIN.
 */
export async function findWaitingGameByPin(pinRaw) {
  if (!app) return null;
  await ensureAnonymousAuth();
  const pin = String(pinRaw || '').replace(/\D/g, '').slice(0, 4);
  if (pin.length !== 4) return null;
  try {
    const fn = httpsCallable(getFunctions(app, FUNCTIONS_REGION), 'lookupPrivateOnlineGame');
    const result = await fn({ pin });
    const game = result?.data?.game;
    return game && game.id ? { ...game, pin } : null;
  } catch (err) {
    console.warn('findWaitingGameByPin', err);
    return null;
  }
}

/**
 * Atomicky připojí hosta jako druhého hráče (guest).
 * @returns {Promise<object>} Sloučená data dokumentu po zápisu (včetně `id` = gameId).
 */
export async function joinOnlineGame(gameId, guestName, pinRaw = '') {
  if (!db) throw new Error('no_db');
  await ensureAnonymousAuth();
  const id = String(gameId || '').trim();
  if (!id) throw new Error(ONLINE_JOIN_ERROR_NOT_AVAILABLE);
  const guest = String(guestName || '').trim();
  if (!guest) throw new Error(ONLINE_JOIN_ERROR_GUEST_NAME);
  const pin = String(pinRaw || '').replace(/\D/g, '').slice(0, 4);

  if (pin.length === 4) {
    if (!app) throw new Error('no_db');
    try {
      const fn = httpsCallable(getFunctions(app, FUNCTIONS_REGION), 'joinPrivateOnlineGame');
      const result = await fn({ gameId: id, guestName: guest, pin });
      const game = result?.data?.game;
      if (!game || !game.id) throw new Error(ONLINE_JOIN_ERROR_NOT_AVAILABLE);
      return game;
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
      if (code.includes('not-found') || code.includes('failed-precondition') || code.includes('permission-denied')) {
        throw new Error(ONLINE_JOIN_ERROR_NOT_AVAILABLE);
      }
      if (code.includes('invalid-argument')) throw new Error(ONLINE_JOIN_ERROR_GUEST_NAME);
      throw new Error(ONLINE_JOIN_ERROR_NOT_AVAILABLE);
    }
  }

  const ref = doc(db, ONLINE_GAMES_COLLECTION, id);

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error(ONLINE_JOIN_ERROR_NOT_AVAILABLE);
    }
    const prev = snap.data();
    if (prev.status !== 'waiting' || prev.isPublic !== true) {
      throw new Error(ONLINE_JOIN_ERROR_NOT_AVAILABLE);
    }
    if (prev.guestUid != null && String(prev.guestUid).length > 0) {
      throw new Error(ONLINE_JOIN_ERROR_NOT_AVAILABLE);
    }
    const guestUid = requireAuthUid();
    if (prev.hostUid != null && prev.hostUid === guestUid) {
      throw new Error(ONLINE_JOIN_ERROR_NOT_AVAILABLE);
    }
    transaction.update(ref, {
      status: 'playing',
      guestName: guest,
      guestUid,
      joinedAt: serverTimestamp(),
    });
    return {
      id,
      ...prev,
      status: 'playing',
      guestName: guest,
      guestUid,
    };
  });
}

/**
 * Sleduje jeden dokument online hry (host v čekárně).
 * @returns {import('firebase/firestore').Unsubscribe}
 */
export function subscribeOnlineGame(gameId, onData, onError) {
  if (!db || !gameId) {
    onData(null);
    return () => {};
  }
  const ref = doc(db, ONLINE_GAMES_COLLECTION, String(gameId));
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData({ id: snap.id, ...snap.data() });
    },
    (err) => {
      console.error('subscribeOnlineGame', err);
      if (onError) onError(err);
      onData(null);
    }
  );
}

/** Jednorázové načtení dokumentu (např. ověření po join). */
export async function getOnlineGameById(gameId) {
  if (!db || !gameId) return null;
  await ensureAnonymousAuth();
  const ref = doc(db, ONLINE_GAMES_COLLECTION, String(gameId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Heartbeat pro detekci přítomnosti hráče (Reconnecting fáze 1).
 * @param {string} gameId
 * @param {'p1'|'p2'} role host = p1, guest = p2
 */
export async function updateHeartbeat(gameId, role) {
  if (!db) throw new Error('no_db');
  await ensureAnonymousAuth();
  const id = String(gameId || '').trim();
  if (!id) throw new Error('no_db');
  const ref = doc(db, ONLINE_GAMES_COLLECTION, id);
  const field = role === 'p2' ? 'heartbeatGuest' : 'heartbeatHost';
  await updateDoc(ref, {
    [field]: serverTimestamp(),
  });
}

/**
 * Uloží herní stav do dokumentu online hry (X01: gameState + setScores v stateObject).
 */
export async function updateGameState(gameId, stateObject) {
  if (!db) throw new Error('no_db');
  const id = String(gameId || '').trim();
  if (!id) throw new Error('no_db');
  const ref = doc(db, ONLINE_GAMES_COLLECTION, id);
  await updateDoc(ref, {
    liveGameState: stateObject,
    liveStateUpdatedAt: serverTimestamp(),
  });
}

/**
 * Ukončí online zápas (handshake po X01). Obě strany pak poslouchají `status === 'completed'`.
 * @param {string} gameId
 * @param {object | null} pendingMatchRecordForHistory záznam pro historii (zapisuje poražený při potvrzení)
 */
export async function completeOnlineGameSession(gameId, pendingMatchRecordForHistory = null) {
  if (!db) throw new Error('no_db');
  await ensureAnonymousAuth();
  const id = String(gameId || '').trim();
  if (!id) throw new Error('no_db');
  const ref = doc(db, ONLINE_GAMES_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { alreadyDone: true };
  const prevStatus = snap.data()?.status;
  if (prevStatus === 'completed' || prevStatus === 'obsolete' || prevStatus === 'abandoned') {
    return { alreadyDone: true };
  }
  const payload = {
    status: 'completed',
    liveGameState: deleteField(),
    liveStateUpdatedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  };
  if (pendingMatchRecordForHistory != null) {
    payload.pendingMatchRecordForHistory = pendingMatchRecordForHistory;
  }
  await updateDoc(ref, payload);
  return { alreadyDone: false };
}

/**
 * Úprava toho, kdo začíná první leg (po domluvě obou hráčů v zápase).
 * @param {string} gameId
 * @param {'p1'|'p2'} startPlayer
 */
export async function updateOnlineGameStartPlayer(gameId, startPlayer) {
  if (!db) throw new Error('no_db');
  await ensureAnonymousAuth();
  const id = String(gameId || '').trim();
  if (!id) throw new Error('no_db');
  const sp = startPlayer === 'p2' ? 'p2' : 'p1';
  const ref = doc(db, ONLINE_GAMES_COLLECTION, id);
  await updateDoc(ref, {
    startPlayer: sp,
  });
}

/**
 * Úmyslné opuštění rozjetého online zápasu (bez „ztráty spojení“).
 * @param {string} gameId
 * @param {'p1'|'p2'} myRole
 */
export async function abandonOnlineGameSession(gameId, myRole) {
  if (!db) throw new Error('no_db');
  await ensureAnonymousAuth();
  const id = String(gameId || '').trim();
  if (!id) throw new Error('no_db');
  const abandonedBy = myRole === 'p2' ? 'p2' : 'p1';
  const ref = doc(db, ONLINE_GAMES_COLLECTION, id);
  await updateDoc(ref, {
    status: 'abandoned',
    abandonedBy,
    abandonedAt: serverTimestamp(),
    liveGameState: deleteField(),
    liveStateUpdatedAt: serverTimestamp(),
  });
}

/**
 * Úmyslný úklid při opuštění online režimu.
 * - waiting: smaže dokument (nezůstává viset v lobby)
 * - playing / cokoliv jiného: označí `status: obsolete` (neplatný zápas)
 */
export async function cancelOnlineGame(gameId) {
  if (!db) throw new Error('no_db');
  await ensureAnonymousAuth();
  const id = String(gameId || '').trim();
  if (!id) throw new Error('no_db');
  const ref = doc(db, ONLINE_GAMES_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev = snap.data();
  if (prev?.status === 'waiting') {
    await deleteDoc(ref);
    return;
  }
  await updateDoc(ref, {
    status: 'obsolete',
    obsoleteAt: serverTimestamp(),
    liveGameState: deleteField(),
    liveStateUpdatedAt: serverTimestamp(),
  });
}

/**
 * Real-time sledování pole liveGameState na dokumentu online hry.
 * @returns {import('firebase/firestore').Unsubscribe}
 */
export function subscribeToGameState(gameId, onStateChange, onError) {
  if (!db || !gameId) {
    onStateChange(null);
    return () => {};
  }
  const ref = doc(db, ONLINE_GAMES_COLLECTION, String(gameId));
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onStateChange(null);
        return;
      }
      const data = snap.data();
      onStateChange(data?.liveGameState ?? null);
    },
    (err) => {
      console.error('subscribeToGameState', err);
      if (onError) onError(err);
      onStateChange(null);
    }
  );
}
