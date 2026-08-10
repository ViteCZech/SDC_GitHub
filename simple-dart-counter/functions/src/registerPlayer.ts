import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import {
  ACTIVE_PREREG_STATUSES,
  normalizePlayerNameKey,
  playersAreSame,
  resolveCsoPlayerId,
} from './playerIdentity';
import { PLAYER_REG_LINKS_COLLECTION } from './playerRegLinks';
import type {
  PaymentMethod,
  RegisterPlayerPayload,
  RegisterPlayerResult,
  TournamentDocument,
} from './types';

/** Bezpečná inicializace — nesmí spadnout při dvojitém importu modulů. */
if (getApps().length === 0) {
  initializeApp();
}

/** Stejná pojmenovaná DB jako v klientovi (`src/firebase.js`). */
const db = getFirestore(getApp(), 'eur3');

const ACTIVE_REGISTRATION_STATUSES = ACTIVE_PREREG_STATUSES;

function normalizeEmail(email?: string): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

function buildVariableSymbol(prefix: string | undefined, registrationId: string): string {
  const digitsFromId = String(registrationId ?? '').replace(/\D/g, '');
  const suffix =
    digitsFromId.length >= 6
      ? digitsFromId.slice(-6)
      : String(Date.now() % 1_000_000).padStart(6, '0');
  const combined = `${prefix ?? ''}${suffix}`.replace(/\s/g, '');
  return combined.slice(0, 10) || String(Date.now()).slice(-6);
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

/**
 * HttpsError hozený uvnitř runTransaction se často zabalí do obecné chyby → klient vidí jen "internal".
 * Proto business chyby vracíme jako výsledek a po transakci je vyhodíme ven.
 */
type TxOk = { ok: true; result: RegisterPlayerResult };
type TxFail = { ok: false; code: HttpsError['code']; message: string };
type TxOutcome = TxOk | TxFail;

function fail(code: HttpsError['code'], message: string): TxFail {
  return { ok: false, code, message };
}

/**
 * Callable v2: onCall((request) => …) — data jsou v request.data
 * invoker: 'public' je nutné na Gen2/Cloud Run — jinak OPTIONS preflight bez CORS hlaviček
 * (typicky po přechodu Spark → Blaze / novém deployi).
 */
export const registerPlayer = onCall(
  {
    region: 'europe-west1',
    invoker: 'public',
    cors: true,
  },
  async (request): Promise<RegisterPlayerResult> => {
    try {
      const data = (request.data ?? {}) as RegisterPlayerPayload;
      const tournamentId = String(data.tournamentId ?? '').trim();
      const playerName = String(data.playerName ?? '').trim();
      const email = data.email;
      const phone = data.phone;
      const csoRank = data.csoRank;
      const csoPlayerIdInput = data.csoPlayerId ?? null;
      const paymentMethod = data.paymentMethod;
      const termsAccepted = !!data.termsAccepted;

      logger.info('registerPlayer request', {
        tournamentId: tournamentId || '(empty)',
        playerNameLen: playerName.length,
        hasEmail: !!email,
        paymentMethod: paymentMethod ?? null,
        termsAccepted,
      });

      if (!tournamentId || !playerName) {
        throw new HttpsError('invalid-argument', 'Jméno hráče a ID turnaje jsou povinné.');
      }

      const normalizedEmail = normalizeEmail(email);
      const nameKey = normalizePlayerNameKey(playerName);
      const csoPlayerId = resolveCsoPlayerId({
        name: playerName,
        csoPlayerId: csoPlayerIdInput,
      });

      const outcome = await db.runTransaction(async (transaction): Promise<TxOutcome> => {
        const tournamentRef = db.collection('tournaments').doc(tournamentId);
        const tournamentDoc = await transaction.get(tournamentRef);

        if (!tournamentDoc.exists) {
          return fail('not-found', 'Turnaj nebyl nalezen.');
        }

        const tData = (tournamentDoc.data() ?? {}) as TournamentDocument;
        const status = tData.status ?? null;
        const meta = tData.meta ?? {};
        const finance = tData.finance ?? {};
        const counters = tData.counters ?? {};

        const terms =
          typeof tData.termsAndConditions === 'string' ? tData.termsAndConditions.trim() : '';

        if (terms && !termsAccepted) {
          return fail(
            'failed-precondition',
            'Pro dokončení registrace je nutné souhlasit s podmínkami turnaje.'
          );
        }

        if (status !== 'REGISTRATION_OPEN') {
          return fail(
            'failed-precondition',
            `Registrace do tohoto turnaje nejsou otevřeny${status ? ` (stav: ${status})` : ''}.`
          );
        }

        if (isPastDeadline(meta.registrationDeadline)) {
          return fail('failed-precondition', 'Vypršel časový limit pro přihlášení.');
        }

        // Jednoduchý query (jen email) — bez composite indexu `email+status` uvnitř transakce
        if (normalizedEmail) {
          const duplicateQuery = tournamentRef
            .collection('registrations')
            .where('player.email', '==', normalizedEmail)
            .limit(20);
          const duplicateSnap = await transaction.get(duplicateQuery);
          const hasActive = duplicateSnap.docs.some((docSnap) =>
            ACTIVE_REGISTRATION_STATUSES.has(String(docSnap.data()?.status ?? ''))
          );
          if (hasActive) {
            return fail('already-exists', 'Na tento e-mail je již registrace podána.');
          }
        }

        // Duplicita jména / ČŠO ID (ranking se neporovnává)
        const regsSnap = await transaction.get(
          tournamentRef.collection('registrations').limit(500)
        );
        const candidate = { name: playerName, csoPlayerId };
        for (const docSnap of regsSnap.docs) {
          const reg = docSnap.data() ?? {};
          if (!ACTIVE_REGISTRATION_STATUSES.has(String(reg.status ?? ''))) continue;
          const p = (reg.player ?? {}) as {
            name?: string;
            csoPlayerId?: string | null;
            nameKey?: string | null;
          };
          const existing = {
            name: p.name,
            csoPlayerId: p.csoPlayerId ?? (p.nameKey ? `name:${p.nameKey}` : null),
          };
          if (playersAreSame(existing, candidate)) {
            return fail('already-exists', `PLAYER_NAME_DUPLICATE:${playerName}`);
          }
        }

        const currentConfirmed = Number(counters.confirmed ?? 0) || 0;
        const rawCapacity = meta.capacity;
        const parsedCapacity = rawCapacity == null ? null : Number(rawCapacity);
        const capacityNum =
          parsedCapacity != null && Number.isFinite(parsedCapacity) && parsedCapacity > 0
            ? parsedCapacity
            : null;

        let newStatus: 'CONFIRMED' | 'WAITLIST' = 'CONFIRMED';

        if (capacityNum != null && currentConfirmed >= capacityNum) {
          if (!meta.waitlistEnabled) {
            return fail('resource-exhausted', 'Kapacita turnaje je naplněna.');
          }
          newStatus = 'WAITLIST';
        }

        let resolvedPaymentMethod: PaymentMethod | null;
        try {
          resolvedPaymentMethod = validatePaymentMethod(finance, paymentMethod);
        } catch (e) {
          if (e instanceof HttpsError) {
            return fail(e.code, e.message);
          }
          throw e;
        }

        const entryFee = finance.entryFee ?? null;
        const regRef = tournamentRef.collection('registrations').doc();
        const variableSymbol = buildVariableSymbol(finance.vsPrefix, regRef.id);
        const now = FieldValue.serverTimestamp();

        const authUid =
          request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous'
            ? request.auth.uid
            : null;

        const newRegistration: Record<string, unknown> = {
          id: regRef.id,
          player: {
            name: playerName,
            email: normalizedEmail,
            phone: phone?.trim() || null,
            csoRank: csoRank ?? null,
            csoPlayerId: csoPlayerId ?? null,
            nameKey: nameKey || null,
            ...(authUid ? { authUid } : {}),
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
            updatedAt: now,
          });
        } else {
          transaction.update(tournamentRef, {
            'counters.waitlist': FieldValue.increment(1),
            updatedAt: now,
          });
        }

        return {
          ok: true,
          result: {
            success: true,
            registrationId: regRef.id,
            status: newStatus,
            variableSymbol,
          },
        };
      });

      if (!outcome.ok) {
        throw new HttpsError(outcome.code, outcome.message);
      }

      // Index pro hráčský přehled (bez collectionGroup — Enterprise Edition)
      try {
        const authUid =
          request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous'
            ? request.auth.uid
            : null;
        const linkId = `${tournamentId}_${outcome.result.registrationId}`;
        await db.collection(PLAYER_REG_LINKS_COLLECTION).doc(linkId).set(
          {
            tournamentId,
            registrationId: outcome.result.registrationId,
            authUid: authUid ?? null,
            email: normalizedEmail,
            status: outcome.result.status,
            playerName,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (linkErr) {
        logger.warn('player_registration_links write failed', {
          tournamentId,
          registrationId: outcome.result.registrationId,
          error: linkErr instanceof Error ? linkErr.message : String(linkErr),
        });
      }

      logger.info('registerPlayer success', {
        tournamentId,
        registrationId: outcome.result.registrationId,
        status: outcome.result.status,
      });

      return outcome.result;
    } catch (error) {
      logger.error('KRITICKÁ CHYBA v registerPlayer:', error);

      if (error instanceof HttpsError) {
        // Pro 'internal' Firebase klientům skrývá message — přemapujeme
        if (error.code === 'internal') {
          throw new HttpsError(
            'invalid-argument',
            `Chyba serveru: ${error.message || 'Registraci se nepodařilo uložit.'}`
          );
        }
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      // Záměrně nepoužíváme 'internal', aby se text dostal až na frontend
      throw new HttpsError('invalid-argument', `Chyba serveru: ${errorMessage}`);
    }
  }
);
