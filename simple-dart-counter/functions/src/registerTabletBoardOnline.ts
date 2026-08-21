import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');
const COLLECTION = 'active_tournaments';

type RegisterPayload = {
  pin?: string;
  board?: string | number;
  token?: string;
};

function validateBoardAuth(
  td: { boardAuthTokens?: Record<string, string>; tabletPassword?: string } | null,
  board: string,
  token: string,
  tabletPassword?: string
): boolean {
  const boardToken = String(token ?? '').trim();
  const tokens = td?.boardAuthTokens;
  if (tokens && typeof tokens === 'object' && tokens[board] != null) {
    return String(tokens[board]).trim() === boardToken;
  }

  const expected =
    td && td.tabletPassword != null ? String(td.tabletPassword).trim().slice(0, 5) : '';
  if (expected === '') return true;
  const provided = String(tabletPassword ?? '').trim().slice(0, 5);
  return provided !== '' && provided === expected;
}

/**
 * Herní tablet: označí terč jako online po naskenování QR (bez Google loginu).
 */
export const registerTabletBoardOnline = onCall(
  {
    region: 'europe-west1',
    invoker: 'public',
    cors: true,
  },
  async (request): Promise<{ success: true }> => {
    const data = (request.data ?? {}) as RegisterPayload;
    const pin = String(data.pin ?? '').trim();
    const boardRaw = String(data.board ?? '').replace(/\D/g, '').slice(0, 2);
    const token = String(data.token ?? '').trim();

    if (!/^\d{4}$/.test(pin)) {
      throw new HttpsError('invalid-argument', 'Neplatný PIN turnaje.');
    }
    const boardNum = parseInt(boardRaw, 10);
    if (!Number.isFinite(boardNum) || boardNum < 1 || boardNum > 99) {
      throw new HttpsError('invalid-argument', 'Neplatné číslo terče.');
    }
    if (!token) {
      throw new HttpsError('invalid-argument', 'Chybí autorizační token.');
    }

    const board = String(boardNum);
    const ref = db.collection(COLLECTION).doc(pin);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Turnaj s tímto PINem nebyl nalezen.');
    }

    const raw = snap.data() ?? {};
    const td = (raw.tournamentData ?? null) as {
      boardAuthTokens?: Record<string, string>;
      tabletPassword?: string;
      totalBoards?: number;
      numBoards?: number;
    } | null;

    if (!validateBoardAuth(td, board, token)) {
      throw new HttpsError('permission-denied', 'Neplatný token pro tento terč.');
    }

    const totalBoards = Number(td?.totalBoards ?? td?.numBoards ?? 0) || 0;
    if (totalBoards > 0 && boardNum > totalBoards) {
      throw new HttpsError('invalid-argument', 'Číslo terče překračuje kapacitu turnaje.');
    }

    await ref.update({
      [`boardStatuses.${board}.status`]: 'online',
      [`boardStatuses.${board}.lastSeen`]: FieldValue.serverTimestamp(),
    });

    logger.info('registerTabletBoardOnline ok', { pin, board });
    return { success: true };
  }
);
