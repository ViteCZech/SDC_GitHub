import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');

/**
 * Veřejný náhled stavu přihlášky podle ID (hráč ho má v localStorage).
 * Nevrací e-mail / telefon.
 */
export const lookupStoredRegistration = onCall(
  {
    region: 'europe-west1',
    invoker: 'public',
    cors: true,
  },
  async (request) => {
    const tournamentId = String(request.data?.tournamentId ?? '').trim();
    const registrationId = String(request.data?.registrationId ?? '').trim();
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
    const player = (data.player ?? {}) as { name?: string };
    const payment = (data.payment ?? {}) as {
      variableSymbol?: string | null;
      method?: string | null;
      amount?: number | null;
    };

    return {
      registrationId: snap.id,
      status: String(data.status ?? ''),
      playerName: player.name ? String(player.name) : null,
      variableSymbol: payment.variableSymbol ?? null,
      paymentMethod: payment.method ?? null,
      amount: payment.amount ?? null,
    };
  }
);
