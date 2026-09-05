import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { CALLABLE_PUBLIC, hashOnlinePin, requireAuthUid } from './authz';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');
const COLLECTION = 'onlineGames';

function publicWaitingFields(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    hostName: String(data.hostName ?? ''),
    gameFormat: String(data.gameFormat ?? ''),
    legs: Number(data.legs) || 1,
    gameType: data.gameType === 'cricket' ? 'cricket' : 'x01',
    startScore: data.startScore ?? null,
    outMode: data.outMode ?? null,
    startPlayer: data.startPlayer === 'p2' ? 'p2' : 'p1',
    isPublic: false,
    status: 'waiting',
  };
}

async function findWaitingPrivateByPin(pin: string) {
  const pinHash = hashOnlinePin(pin);
  const byHash = await db
    .collection(COLLECTION)
    .where('status', '==', 'waiting')
    .where('isPublic', '==', false)
    .where('pinHash', '==', pinHash)
    .limit(1)
    .get();
  if (!byHash.empty) return byHash.docs[0];

  const legacy = await db
    .collection(COLLECTION)
    .where('status', '==', 'waiting')
    .where('pin', '==', pin)
    .limit(1)
    .get();
  return legacy.empty ? null : legacy.docs[0];
}

export const lookupPrivateOnlineGame = onCall(
  CALLABLE_PUBLIC,
  async (request) => {
    requireAuthUid(request);
    const pin = String(request.data?.pin ?? '').replace(/\D/g, '').slice(0, 4);
    if (pin.length !== 4) return { game: null };
    const docSnap = await findWaitingPrivateByPin(pin);
    if (!docSnap) return { game: null };
    return { game: publicWaitingFields(docSnap.id, docSnap.data() ?? {}) };
  }
);

/**
 * Připojí hosta do soukromé lobby. PIN se ověřuje na serveru, dokument čekající hry není listovatelný.
 */
export const joinPrivateOnlineGame = onCall(
  CALLABLE_PUBLIC,
  async (request) => {
    const uid = requireAuthUid(request);
    const pin = String(request.data?.pin ?? '').replace(/\D/g, '').slice(0, 4);
    const guestName = String(request.data?.guestName ?? '').trim();
    const gameId = String(request.data?.gameId ?? '').trim();
    if (pin.length !== 4) {
      throw new HttpsError('not-found', 'game_not_available');
    }
    if (!guestName) {
      throw new HttpsError('invalid-argument', 'guest_name_required');
    }

    const found = await findWaitingPrivateByPin(pin);
    if (!found) {
      throw new HttpsError('not-found', 'game_not_available');
    }
    if (gameId && found.id !== gameId) {
      throw new HttpsError('not-found', 'game_not_available');
    }
    if (found.data()?.hostUid === uid) {
      throw new HttpsError('failed-precondition', 'game_not_available');
    }

    const ref = found.ref;
    const merged = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'game_not_available');
      }
      const prev = snap.data() ?? {};
      if (prev.status !== 'waiting' || prev.isPublic === true) {
        throw new HttpsError('failed-precondition', 'game_not_available');
      }
      if (prev.guestUid) {
        throw new HttpsError('failed-precondition', 'game_not_available');
      }
      if (prev.hostUid === uid) {
        throw new HttpsError('failed-precondition', 'game_not_available');
      }
      const expectedHash = hashOnlinePin(pin);
      const legacyPin = String(prev.pin ?? '').replace(/\D/g, '').slice(0, 4);
      if (String(prev.pinHash ?? '') !== expectedHash && legacyPin !== pin) {
        throw new HttpsError('permission-denied', 'game_not_available');
      }
      transaction.update(ref, {
        status: 'playing',
        guestName,
        guestUid: uid,
        joinedAt: FieldValue.serverTimestamp(),
      });
      return {
        id: ref.id,
        ...prev,
        status: 'playing',
        guestName,
        guestUid: uid,
      };
    });

    logger.info('joinPrivateOnlineGame', { gameId: merged.id });
    const { pinHash: _pinHash, pin: _pin, ...safe } = merged as Record<string, unknown>;
    return { game: { ...safe, id: merged.id } };
  }
);
