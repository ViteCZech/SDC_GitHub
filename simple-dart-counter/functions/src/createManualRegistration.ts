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
import { normalizeCompetitionType, usesTeamCapacity } from './pairing';
import type {
  CreateManualRegistrationPayload,
  CreateManualRegistrationResult,
  PaymentMethod,
  TournamentDocument,
} from './types';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');
const ACTIVE_REGISTRATION_STATUSES = ACTIVE_PREREG_STATUSES;

function buildVariableSymbol(prefix: string | undefined, registrationId: string): string {
  const digitsFromId = String(registrationId ?? '').replace(/\D/g, '');
  const suffix =
    digitsFromId.length >= 6
      ? digitsFromId.slice(-6)
      : String(Date.now() % 1_000_000).padStart(6, '0');
  const combined = `${prefix ?? ''}${suffix}`.replace(/\s/g, '');
  return combined.slice(0, 10) || String(Date.now()).slice(-6);
}

function resolveStoredCsoPlayerId(
  playerName: string,
  csoPlayerIdInput: string | null | undefined
): string | null {
  if (csoPlayerIdInput === null) return null;
  return resolveCsoPlayerId({
    name: playerName,
    csoPlayerId: csoPlayerIdInput,
  });
}

async function assertTournamentAdmin(tournamentId: string, uid: string): Promise<TournamentDocument> {
  const tourRef = db.collection('tournaments').doc(tournamentId);
  const tourSnap = await tourRef.get();
  if (!tourSnap.exists) {
    throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
  }
  const tData = (tourSnap.data() ?? {}) as TournamentDocument & {
    admin?: { ownerUid?: string; coAdminUids?: string[] };
  };
  const ownerUid = tData.admin?.ownerUid;
  const coAdmins = Array.isArray(tData.admin?.coAdminUids) ? tData.admin.coAdminUids : [];
  if (ownerUid !== uid && !coAdmins.includes(uid)) {
    throw new HttpsError('permission-denied', 'Nemáte oprávnění spravovat tento turnaj.');
  }
  return tData;
}

/**
 * Ruční registrace hráče adminem se serverovou kontrolou duplicit.
 */
export const createManualRegistration = onCall(
  {
    region: 'europe-west1',
    invoker: 'public',
    cors: true,
  },
  async (request): Promise<CreateManualRegistrationResult> => {
    const uid = request.auth?.uid;
    if (!uid || request.auth?.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated', 'Pro ruční registraci se musíte přihlásit.');
    }

    const data = (request.data ?? {}) as CreateManualRegistrationPayload;
    const tournamentId = String(data.tournamentId ?? '').trim();
    const playerName = String(data.playerName ?? '').trim();
    const duplicateOk = !!data.duplicateOk;

    if (!tournamentId || !playerName) {
      throw new HttpsError('invalid-argument', 'Jméno hráče a ID turnaje jsou povinné.');
    }

    await assertTournamentAdmin(tournamentId, uid);
    const nameKey = normalizePlayerNameKey(playerName);
    const csoPlayerId = resolveStoredCsoPlayerId(
      playerName,
      Object.prototype.hasOwnProperty.call(data, 'csoPlayerId') ? data.csoPlayerId : undefined
    );

    const tourRef = db.collection('tournaments').doc(tournamentId);
    const result = await db.runTransaction(async (transaction) => {
      const tourSnap = await transaction.get(tourRef);
      if (!tourSnap.exists) {
        throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
      }

      const fresh = (tourSnap.data() ?? {}) as TournamentDocument;
      const currentConfirmed = Number(fresh.counters?.confirmed ?? 0) || 0;
      const maxCapacity = fresh.meta?.capacity ?? null;
      const unlimited = maxCapacity == null || maxCapacity === 0;
      const teamCapacity = usesTeamCapacity(
        normalizeCompetitionType((fresh.meta as { competitionType?: unknown } | undefined)?.competitionType)
      );

      let newStatus: 'CONFIRMED' | 'WAITLIST' = 'CONFIRMED';
      if (
        !teamCapacity &&
        !unlimited &&
        Number(maxCapacity) > 0 &&
        currentConfirmed >= Number(maxCapacity)
      ) {
        if (!fresh.meta?.waitlistEnabled) {
          throw new HttpsError('resource-exhausted', 'Kapacita turnaje je naplněna.');
        }
        newStatus = 'WAITLIST';
      }

      if (!duplicateOk) {
        const regsSnap = await transaction.get(tourRef.collection('registrations').limit(500));
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
            throw new HttpsError('already-exists', `PLAYER_NAME_DUPLICATE:${playerName}`);
          }
        }
      }

      const regRef = tourRef.collection('registrations').doc();
      const variableSymbol = buildVariableSymbol(fresh.finance?.vsPrefix, regRef.id);
      const now = FieldValue.serverTimestamp();
      const paymentMethod = (data.paymentMethod ?? null) as PaymentMethod | null;
      const isPaid = !!data.isPaid;
      const checkedIn = !!data.checkedIn;

      transaction.set(regRef, {
        id: regRef.id,
        player: {
          name: playerName,
          email: data.email?.trim()?.toLowerCase() || null,
          phone: data.phone?.trim() || null,
          csoRank: data.csoRank ?? null,
          csoPlayerId,
          nameKey: data.nameKey ?? (nameKey || null),
        },
        status: newStatus,
        payment: {
          method: paymentMethod,
          variableSymbol,
          amount: fresh.finance?.entryFee ?? null,
          isPaid,
          verifiedByAdmin: isPaid,
          verifiedAt: isPaid ? now : null,
        },
        attendance: {
          checkedIn,
          checkedInAt: checkedIn ? now : null,
        },
        createdAt: now,
        updatedAt: now,
        source: 'ADMIN_MANUAL',
      });

      if (newStatus === 'CONFIRMED') {
        transaction.update(tourRef, {
          'counters.confirmed': FieldValue.increment(1),
          updatedAt: now,
        });
      } else {
        transaction.update(tourRef, {
          'counters.waitlist': FieldValue.increment(1),
          updatedAt: now,
        });
      }

      return {
        registrationId: regRef.id,
        status: newStatus,
        variableSymbol,
      };
    });

    logger.info('createManualRegistration success', {
      tournamentId,
      registrationId: result.registrationId,
      status: result.status,
      duplicateOk,
    });

    return result;
  }
);
