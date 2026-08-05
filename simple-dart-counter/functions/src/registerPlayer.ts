import { initializeApp, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
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
  finance: TournamentDocument['finance'] | undefined,
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

/** Bezpečně přečte deadline Timestamp / Date / ISO string. */
function isPastDeadline(deadline: unknown): boolean {
  if (deadline == null) return false;
  try {
    let d: Date | null = null;
    if (typeof deadline === 'object' && deadline !== null && 'toDate' in deadline) {
      const td = (deadline as { toDate?: () => Date }).toDate;
      if (typeof td === 'function') d = td.call(deadline);
    } else if (deadline instanceof Date) {
      d = deadline;
    } else if (typeof deadline === 'string' || typeof deadline === 'number') {
      d = new Date(deadline);
    }
    if (!d || Number.isNaN(d.getTime())) return false;
    return new Date() > d;
  } catch {
    return false;
  }
}

export const registerPlayer = onCall(
  { region: 'europe-west1' },
  async (request): Promise<RegisterPlayerResult> => {
    try {
      const data = (request.data ?? {}) as RegisterPlayerPayload;
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

      return await db.runTransaction(async (transaction) => {
        const tournamentRef = db.collection('tournaments').doc(String(tournamentId).trim());
        const tournamentDoc = await transaction.get(tournamentRef);

        if (!tournamentDoc.exists) {
          throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
        }

        const tData = (tournamentDoc.data() ?? {}) as TournamentDocument;
        const status = tData.status ?? null;
        const meta = tData.meta ?? {};
        const finance = tData.finance ?? {};
        const counters = tData.counters ?? {};

        const terms =
          typeof tData.termsAndConditions === 'string' ? tData.termsAndConditions.trim() : '';

        if (terms && !termsAccepted) {
          throw new HttpsError(
            'failed-precondition',
            'Pro dokončení registrace je nutné souhlasit s podmínkami turnaje.'
          );
        }

        if (status !== 'REGISTRATION_OPEN') {
          throw new HttpsError(
            'failed-precondition',
            `Registrace do tohoto turnaje nejsou otevřeny${status ? ` (stav: ${status})` : ''}.`
          );
        }

        if (isPastDeadline(meta.registrationDeadline)) {
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

        const currentConfirmed = Number(counters.confirmed ?? 0) || 0;
        const rawCapacity = meta.capacity;
        const parsedCapacity =
          rawCapacity == null ? null : Number(rawCapacity);
        const capacityNum =
          parsedCapacity != null && Number.isFinite(parsedCapacity) && parsedCapacity > 0
            ? parsedCapacity
            : null;

        let newStatus: 'CONFIRMED' | 'WAITLIST' = 'CONFIRMED';

        if (capacityNum != null && currentConfirmed >= capacityNum) {
          if (!meta.waitlistEnabled) {
            throw new HttpsError('resource-exhausted', 'Kapacita turnaje je naplněna.');
          }
          newStatus = 'WAITLIST';
        }

        const resolvedPaymentMethod = validatePaymentMethod(finance, paymentMethod);
        const entryFee = finance.entryFee ?? null;

        const regRef = tournamentRef.collection('registrations').doc();
        const variableSymbol = buildVariableSymbol(finance.vsPrefix, regRef.id);

        const now = FieldValue.serverTimestamp();
        const newRegistration: Record<string, unknown> = {
          id: regRef.id,
          player: {
            name: String(playerName).trim(),
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

        // counters mohou v dokumentu chybět — increment je vytvoří
        if (newStatus === 'CONFIRMED') {
          transaction.update(tournamentRef, {
            'counters.confirmed': FieldValue.increment(1),
            updatedAt: now,
          });
        } else {
          transaction.update(tournamentRef, {
            'counters.waitlist': FieldValue.increment(1),
            updatedAt: now,
          });
        }

        return {
          success: true as const,
          registrationId: regRef.id,
          status: newStatus,
          variableSymbol,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        logger.error('Chyba při registraci hráče (HttpsError):', {
          code: error.code,
          message: error.message,
        });
        throw error;
      }

      logger.error('Chyba při registraci hráče:', error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String((error as { message: unknown }).message)
            : '';
      throw new HttpsError(
        'internal',
        message || 'Registraci se nepodařilo uložit.'
      );
    }
  }
);
