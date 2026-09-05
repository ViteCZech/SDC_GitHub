import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { CALLABLE_PUBLIC } from './authz';
import { validateTabletAuth } from './tabletAuth';
import { loadTabletAuthForPin } from './tournamentSecrets';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');

type Payload = {
  pin?: string;
  tabletPassword?: string;
  board?: string | number;
  boardToken?: string;
};

/**
 * Tablet / hub: ověří PIN + token nebo heslo bez čtení tajemství z veřejného dokumentu.
 */
export const verifyTabletBoardAccess = onCall(
  CALLABLE_PUBLIC,
  async (
    request
  ): Promise<{ ok: boolean; reason?: 'not_found' | 'bad_password' }> => {
    const data = (request.data ?? {}) as Payload;
    const pin = String(data.pin ?? '').trim();
    if (!/^\d{4}$/.test(pin)) {
      return { ok: false, reason: 'not_found' };
    }

    const snap = await db.collection('active_tournaments').doc(pin).get();
    if (!snap.exists) {
      return { ok: false, reason: 'not_found' };
    }

    const td = (snap.data()?.tournamentData ?? null) as {
      boardAuthTokens?: Record<string, string>;
      tabletPassword?: string;
    } | null;
    const board = String(data.board ?? '').replace(/\D/g, '').slice(0, 2);
    const boardToken = String(data.boardToken ?? '').trim();
    const tabletPassword = String(data.tabletPassword ?? '').trim().slice(0, 5);
    const authSource = await loadTabletAuthForPin(db, pin, td);
    if (!validateTabletAuth(authSource, board, boardToken, tabletPassword)) {
      return { ok: false, reason: 'bad_password' };
    }
    return { ok: true };
  }
);
