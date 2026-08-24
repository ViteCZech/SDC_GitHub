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
  tabletPassword?: string;
  status?: 'online' | 'offline';
};

function validateBoardAuth(
  td: { boardAuthTokens?: Record<string, string>; tabletPassword?: string } | null,
  board: string,
  token: string,
  tabletPassword?: string
): boolean {
  const boardToken = String(token ?? '').trim();
  const providedPassword = String(tabletPassword ?? '').trim().slice(0, 5);
  const expectedPassword =
    td && td.tabletPassword != null ? String(td.tabletPassword).trim().slice(0, 5) : '';
  const tokens = td?.boardAuthTokens;
  if (tokens && typeof tokens === 'object' && tokens[board] != null) {
    if (String(tokens[board]).trim() === boardToken) return true;
    if (expectedPassword && providedPassword && providedPassword === expectedPassword) return true;
    return false;
  }

  if (expectedPassword === '') return true;
  return providedPassword !== '' && providedPassword === expectedPassword;
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
    const tabletPassword = String(data.tabletPassword ?? '').trim().slice(0, 5);
    const status = data.status === 'offline' ? 'offline' : 'online';

    if (!/^\d{4}$/.test(pin)) {
      throw new HttpsError('invalid-argument', 'Neplatný PIN turnaje.');
    }
    const boardNum = parseInt(boardRaw, 10);
    if (!Number.isFinite(boardNum) || boardNum < 1 || boardNum > 99) {
      throw new HttpsError('invalid-argument', 'Neplatné číslo terče.');
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

    if (!validateBoardAuth(td, board, token, tabletPassword)) {
      throw new HttpsError('permission-denied', 'Neplatný token pro tento terč.');
    }

    const totalBoards = Number(td?.totalBoards ?? td?.numBoards ?? 0) || 0;
    if (totalBoards > 0 && boardNum > totalBoards) {
      throw new HttpsError('invalid-argument', 'Číslo terče překračuje kapacitu turnaje.');
    }

    await ref.update({
      [`boardStatuses.${board}.status`]: status,
      [`boardStatuses.${board}.lastSeen`]: FieldValue.serverTimestamp(),
    });

    logger.info('registerTabletBoardOnline ok', { pin, board, status });
    return { success: true };
  }
);
