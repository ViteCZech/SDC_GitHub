import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CALLABLE_PUBLIC } from './authz';
import { assertPlayerActor } from './playerActor';
import { publicPairView } from './pairing';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');

/**
 * Veřejný náhled stavu přihlášky podle ID (hráč ho má v localStorage).
 * Nevrací e-mail / telefon.
 */
export const lookupStoredRegistration = onCall(
  CALLABLE_PUBLIC,
  async (request) => {
    const tournamentId = String(request.data?.tournamentId ?? '').trim();
    const registrationId = String(request.data?.registrationId ?? '').trim();
    const cancelToken = String(request.data?.cancelToken ?? '').trim();
    if (!tournamentId || !registrationId) {
      throw new HttpsError('invalid-argument', 'Chybí turnaj nebo ID přihlášky.');
    }

    const snap = await db
      .collection('tournaments')
      .doc(tournamentId)
      .collection('registrations')
      .doc(registrationId)
      .get();

    if (!snap.exists) {
      throw new HttpsError('not-found', 'Přihláška nebyla nalezena.');
    }

    const data = snap.data() ?? {};
    assertPlayerActor(data, request, cancelToken);

    const player = (data.player ?? {}) as { name?: string; gender?: string | null };
    const payment = (data.payment ?? {}) as {
      variableSymbol?: string | null;
      method?: string | null;
      amount?: number | null;
      isPaid?: boolean;
      refundDue?: boolean;
      refundedAt?: unknown;
    };

    return {
      registrationId: snap.id,
      status: String(data.status ?? ''),
      playerName: player.name ? String(player.name) : null,
      variableSymbol: payment.variableSymbol ?? null,
      paymentMethod: payment.method ?? null,
      amount: payment.amount ?? null,
      isPaid: !!payment.isPaid,
      refundDue: !!payment.isPaid && !!payment.refundDue && payment.refundedAt == null,
      gender: player.gender ?? null,
      pair: publicPairView(snap.id, data),
    };
  }
);
