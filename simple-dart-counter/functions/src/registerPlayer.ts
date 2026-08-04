import { initializeApp, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type {
  PaymentMethod,
  RegisterPlayerPayload,
  RegisterPlayerResult,
  TournamentDocument,
} from './types';

initializeApp();

/** Stejná pojmenovaná DB jako v klientovi (`src/firebase.js`). */
const db = getFirestore(getApp(), 'eur3');

const ACTIVE_REGISTRATION_STATUSES = ['CONFIRMED', 'WAITLIST', 'PENDING_PAYMENT'] as const;

function normalizeEmail(email?: string): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

function isUnlimitedCapacity(capacity: number | null | undefined): boolean {
  return capacity == null || capacity === 0;
}

function buildVariableSymbol(prefix: string | undefined, registrationId: string): string {
  const digitsFromId = registrationId.replace(/\D/g, '');
  const suffix =
    digitsFromId.length >= 6
      ? digitsFromId.slice(-6)
      : String(Date.now() % 1_000_000).padStart(6, '0');
  const combined = `${prefix ?? ''}${suffix}`.replace(/\s/g, '');
  return combined.slice(0, 10);
}

function validatePaymentMethod(
  finance: TournamentDocument['finance'],
  paymentMethod: PaymentMethod | null | undefined
): PaymentMethod | null {
  const configured = finance?.paymentMethods;
  if (!Array.isArray(configured) || configured.length === 0) {
    return paymentMethod ?? null;
  }
  if (!paymentMethod) {
    throw new HttpsError('invalid-argument', 'Vyberte způsob platby.');
  }
  if (!configured.includes(paymentMethod)) {
    throw new HttpsError('invalid-argument', 'Zvolený způsob platby není pro turnaj povolen.');
  }
  return paymentMethod;
}

export const registerPlayer = onCall(
  { region: 'europe-west1' },
  async (request): Promise<RegisterPlayerResult> => {
    const data = request.data as RegisterPlayerPayload;
    const {
      tournamentId,
      playerName,
      email,
      phone,
      csoRank,
      paymentMethod,
      termsAccepted = false,
    } = data;

    if (!tournamentId || !playerName?.trim()) {
      throw new HttpsError('invalid-argument', 'Jméno hráče a ID turnaje jsou povinné.');
    }

    const normalizedEmail = normalizeEmail(email);

    return db.runTransaction(async (transaction) => {
      const tournamentRef = db.collection('tournaments').doc(tournamentId);
      const tournamentDoc = await transaction.get(tournamentRef);

      if (!tournamentDoc.exists) {
        throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
      }

      const tData = tournamentDoc.data() as TournamentDocument;
      const terms = tData.termsAndConditions?.trim();

      if (terms && !termsAccepted) {
        throw new HttpsError(
          'failed-precondition',
          'Pro dokončení registrace je nutné souhlasit s podmínkami turnaje.'
        );
      }

      if (tData.status !== 'REGISTRATION_OPEN') {
        throw new HttpsError('failed-precondition', 'Registrace do tohoto turnaje nejsou otevřeny.');
      }

      const deadline = tData.meta?.registrationDeadline;
      if (deadline && typeof deadline.toDate === 'function' && new Date() > deadline.toDate()) {
        throw new HttpsError('failed-precondition', 'Vypršel časový limit pro přihlášení.');
      }

      if (normalizedEmail) {
        const duplicateQuery = tournamentRef
          .collection('registrations')
          .where('player.email', '==', normalizedEmail)
          .where('status', 'in', [...ACTIVE_REGISTRATION_STATUSES])
          .limit(1);
        const duplicateSnap = await transaction.get(duplicateQuery);
        if (!duplicateSnap.empty) {
          throw new HttpsError('already-exists', 'Na tento e-mail je již registrace podána.');
        }
      }

      const currentConfirmed = tData.counters?.confirmed ?? 0;
      const maxCapacity = tData.meta?.capacity ?? null;

      let newStatus: 'CONFIRMED' | 'WAITLIST' = 'CONFIRMED';

      if (!isUnlimitedCapacity(maxCapacity) && maxCapacity! > 0 && currentConfirmed >= maxCapacity!) {
        if (!tData.meta?.waitlistEnabled) {
          throw new HttpsError('resource-exhausted', 'Kapacita turnaje je naplněna.');
        }
        newStatus = 'WAITLIST';
      }

      const resolvedPaymentMethod = validatePaymentMethod(tData.finance, paymentMethod);
      const entryFee = tData.finance?.entryFee ?? null;

      const regRef = tournamentRef.collection('registrations').doc();
      const variableSymbol = buildVariableSymbol(tData.finance?.vsPrefix, regRef.id);

      const now = FieldValue.serverTimestamp();
      const newRegistration: Record<string, unknown> = {
        id: regRef.id,
        player: {
          name: playerName.trim(),
          email: normalizedEmail,
          phone: phone?.trim() || null,
          csoRank: csoRank ?? null,
        },
        status: newStatus,
        payment: {
          method: resolvedPaymentMethod,
          variableSymbol,
          amount: entryFee,
          isPaid: false,
          verifiedByAdmin: false,
        },
        attendance: {
          checkedIn: false,
        },
        createdAt: now,
        updatedAt: now,
        source: 'PUBLIC',
      };

      if (terms) {
        newRegistration.termsAcceptedAt = now;
      }

      transaction.set(regRef, newRegistration);

      if (newStatus === 'CONFIRMED') {
        transaction.update(tournamentRef, {
          'counters.confirmed': FieldValue.increment(1),
        });
      } else {
        transaction.update(tournamentRef, {
          'counters.waitlist': FieldValue.increment(1),
        });
      }

      return {
        success: true,
        registrationId: regRef.id,
        status: newStatus,
        variableSymbol,
      };
    });
  }
);
