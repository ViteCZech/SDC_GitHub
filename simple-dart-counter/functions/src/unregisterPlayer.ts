import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { PLAYER_REG_LINKS_COLLECTION } from './playerRegLinks';
import { applyRegistrationCancel, isCancellableStatus } from './registrationCancel';
import { CALLABLE_PUBLIC } from './authz';
import { assertPlayerActor } from './playerActor';
import type { UnregisterPlayerResult } from './types';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');

type TxOk = { ok: true; result: UnregisterPlayerResult };
type TxFail = { ok: false; code: HttpsError['code']; message: string };
type TxOutcome = TxOk | TxFail;

function fail(code: HttpsError['code'], message: string): TxFail {
  return { ok: false, code, message };
}

/**
 * Hráč stornuje vlastní přihlášku (před losem / jen při REGISTRATION_OPEN).
 * Identita: registrationId z localStorage, nebo Google authUid / e-mail.
 */
export const unregisterPlayer = onCall(
  CALLABLE_PUBLIC,
  async (request): Promise<UnregisterPlayerResult> => {
    const tournamentId = String(request.data?.tournamentId ?? '').trim();
    const registrationId = String(request.data?.registrationId ?? '').trim();
    const cancelToken = String(request.data?.cancelToken ?? '').trim();

    if (!tournamentId || !registrationId) {
      throw new HttpsError('invalid-argument', 'Chybí turnaj nebo ID přihlášky.');
    }

    const outcome = await db.runTransaction(async (transaction): Promise<TxOutcome> => {
      const tournamentRef = db.collection('tournaments').doc(tournamentId);
      const regRef = tournamentRef.collection('registrations').doc(registrationId);
      const [tourSnap, regSnap] = await Promise.all([
        transaction.get(tournamentRef),
        transaction.get(regRef),
      ]);

      if (!tourSnap.exists) return fail('not-found', 'Turnaj nebyl nalezen.');
      if (!regSnap.exists) return fail('not-found', 'Přihláška nebyla nalezena.');

      const tourData = tourSnap.data() ?? {};
      const regData = regSnap.data() ?? {};
      const status = String(regData.status ?? '');

      if (status === 'CANCELLED') {
        const paid = !!((regData.payment ?? {}) as { isPaid?: boolean }).isPaid;
        const refundDue = paid && !((regData.payment ?? {}) as { refundedAt?: unknown }).refundedAt;
        return {
          ok: true,
          result: {
            success: true,
            status: 'CANCELLED',
            refundDue,
            waitlistPromoted: false,
          },
        };
      }

      if (String(tourData.status ?? '') !== 'REGISTRATION_OPEN') {
        return fail(
          'failed-precondition',
          'Odhlásit se lze jen dokud jsou registrace otevřené.'
        );
      }

      if (!isCancellableStatus(status)) {
        return fail('failed-precondition', 'Tuto přihlášku nelze stornovat.');
      }

      try {
        assertPlayerActor(regData, request, cancelToken);
      } catch (err) {
        if (err instanceof HttpsError) {
          return fail(err.code, err.message);
        }
        throw err;
      }

      const pair = (regData.pair ?? {}) as { partnerRegistrationId?: string | null };
      const partnerId = String(pair.partnerRegistrationId ?? '').trim();
      const partnerSnap = partnerId
        ? await transaction.get(tournamentRef.collection('registrations').doc(partnerId))
        : null;

      const waitlistSnap = await transaction.get(
        tournamentRef.collection('registrations').where('status', '==', 'WAITLIST').limit(80)
      );

      const applied = applyRegistrationCancel({
        transaction,
        tournamentRef,
        regRef,
        tourData,
        regData,
        cancelledBy: 'PLAYER',
        waitlistDocs: waitlistSnap.docs,
        partnerSnap,
      });

      return {
        ok: true,
        result: {
          success: true,
          status: 'CANCELLED',
          refundDue: applied.refundDue,
          waitlistPromoted: applied.waitlistPromoted,
        },
      };
    });

    if (!outcome.ok) {
      throw new HttpsError(outcome.code, outcome.message);
    }

    try {
      const linkId = `${tournamentId}_${registrationId}`;
      await db.collection(PLAYER_REG_LINKS_COLLECTION).doc(linkId).set(
        {
          status: 'CANCELLED',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (linkErr) {
      logger.warn('player_registration_links cancel update failed', {
        tournamentId,
        registrationId,
        error: linkErr instanceof Error ? linkErr.message : String(linkErr),
      });
    }

    logger.info('unregisterPlayer success', {
      tournamentId,
      registrationId,
      refundDue: outcome.result.refundDue,
      waitlistPromoted: outcome.result.waitlistPromoted,
    });

    return outcome.result;
  }
);
