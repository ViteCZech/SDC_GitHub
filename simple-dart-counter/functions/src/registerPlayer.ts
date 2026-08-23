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
import { upsertPlayerRegistrationLink } from './playerRegLinks';
import {
  canAttachGoogleUserToRegistration,
  normalizeEmail,
  playerEmailOf,
} from './claimRegistration';
import { randomBytes } from 'crypto';
import {
  allowsPairing,
  canAppearInPartnerList,
  emptyPair,
  gendersCompatible,
  normalizeCompetitionType,
  normalizeFeeMode,
  normalizeGender,
  playerGenderOf,
  usesTeamCapacity,
} from './pairing';
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

type PlayerFields = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  csoPlayerId?: string | null;
  nameKey?: string | null;
  authUid?: string | null;
};

function playerPhoneOf(reg: Record<string, unknown>): string | null {
  const phone = (reg.player as PlayerFields | undefined)?.phone;
  const trimmed = typeof phone === 'string' ? phone.trim() : '';
  return trimmed || null;
}

function claimedResult(
  snap: FirebaseFirestore.QueryDocumentSnapshot,
  alreadyRegistered: boolean
): TxOk {
  const data = snap.data() ?? {};
  const payment = (data.payment ?? {}) as { variableSymbol?: string | null };
  const rawStatus = String(data.status ?? 'CONFIRMED');
  const status: RegisterPlayerResult['status'] =
    rawStatus === 'WAITLIST' || rawStatus === 'PENDING_PAYMENT' ? rawStatus : 'CONFIRMED';
  return {
    ok: true,
    result: {
      success: true,
      registrationId: snap.id,
      status,
      variableSymbol: payment.variableSymbol ?? null,
      alreadyRegistered,
    },
  };
}

function resolveRegistrationCsoPlayerId(
  playerName: string,
  csoPlayerIdInput: string | null | undefined
): string | null {
  if (csoPlayerIdInput === null) return null;
  return resolveCsoPlayerId({
    name: playerName,
    csoPlayerId: csoPlayerIdInput,
  });
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
      const csoPlayerIdInput = data.csoPlayerId;
      const paymentMethod = data.paymentMethod;
      const termsAccepted = !!data.termsAccepted;
      const gender = normalizeGender(data.gender);
      const partnerRegistrationId = String(data.partnerRegistrationId ?? '').trim();
      const partnerName = String(data.partnerName ?? '').trim();

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
      const tokenEmail = normalizeEmail(
        (request.auth?.token?.email as string | undefined) ?? null
      );
      const authUid =
        request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous'
          ? request.auth.uid
          : null;
      const myEmail = normalizedEmail || tokenEmail;
      const nameKey = normalizePlayerNameKey(playerName);
      const csoPlayerId = resolveRegistrationCsoPlayerId(playerName, csoPlayerIdInput);

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

        // Duplicita e-mailu / jména / ČŠO — Google uživatel si může přivlastnit admin zápis.
        const regsSnap = await transaction.get(
          tournamentRef.collection('registrations').limit(500)
        );
        const emailsToMatch = new Set(
          [normalizedEmail, tokenEmail].filter((v): v is string => !!v)
        );
        const candidate = { name: playerName, csoPlayerId };
        let emailDup: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        let nameDup: FirebaseFirestore.QueryDocumentSnapshot | null = null;

        for (const docSnap of regsSnap.docs) {
          const reg = docSnap.data() ?? {};
          if (!ACTIVE_REGISTRATION_STATUSES.has(String(reg.status ?? ''))) continue;
          const p = (reg.player ?? {}) as PlayerFields;
          const existingEmail = playerEmailOf(reg);
          if (existingEmail && emailsToMatch.has(existingEmail)) {
            emailDup = docSnap;
            break;
          }
          const existing = {
            name: p.name,
            csoPlayerId: p.csoPlayerId ?? (p.nameKey ? `name:${p.nameKey}` : null),
          };
          if (!nameDup && playersAreSame(existing, candidate)) {
            nameDup = docSnap;
          }
        }

        const attachExisting = (
          dupSnap: FirebaseFirestore.QueryDocumentSnapshot,
          conflictMessage: string,
          reason: 'email' | 'identity'
        ): TxOutcome => {
          const reg = dupSnap.data() ?? {};
          if (!canAttachGoogleUserToRegistration(reg, authUid, myEmail, reason, csoPlayerId)) {
            return fail('already-exists', conflictMessage);
          }
          const nowTs = FieldValue.serverTimestamp();
          const patch: Record<string, unknown> = {
            updatedAt: nowTs,
            'player.authUid': authUid,
          };
          if (myEmail && !playerEmailOf(reg)) patch['player.email'] = myEmail;
          const submittedPhone = phone?.trim() || null;
          if (submittedPhone && !playerPhoneOf(reg)) patch['player.phone'] = submittedPhone;
          transaction.update(dupSnap.ref, patch);
          return claimedResult(dupSnap, true);
        };

        if (emailDup) {
          return attachExisting(emailDup, 'Na tento e-mail je již registrace podána.', 'email');
        }
        if (nameDup) {
          return attachExisting(nameDup, `PLAYER_NAME_DUPLICATE:${playerName}`, 'identity');
        }

        const competitionType = normalizeCompetitionType(
          (meta as { competitionType?: unknown }).competitionType
        );
        const pairingOn = allowsPairing(competitionType);
        const teamCapacity = usesTeamCapacity(competitionType);

        if (competitionType === 'mixed' && !gender) {
          return fail('invalid-argument', 'GENDER_REQUIRED');
        }

        let partnerSnap: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        if (pairingOn && partnerRegistrationId) {
          partnerSnap = regsSnap.docs.find((d) => d.id === partnerRegistrationId) ?? null;
          if (!partnerSnap) {
            return fail('not-found', 'Vybraný partner nebyl nalezen.');
          }
          const partnerData = partnerSnap.data() ?? {};
          if (!canAppearInPartnerList(partnerData)) {
            return fail('failed-precondition', 'PAIR_NOT_AVAILABLE');
          }
          if (!gendersCompatible(competitionType, gender, playerGenderOf(partnerData))) {
            return fail('failed-precondition', 'PAIR_GENDER');
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

        // Dvojice / mix: sólo místo nebere. Kapacitu kontroluje až potvrzení páru.
        if (!teamCapacity && capacityNum != null && currentConfirmed >= capacityNum) {
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
        const feeMode = normalizeFeeMode((finance as { feeMode?: unknown }).feeMode);
        const amount =
          pairingOn && feeMode === 'pair' && partnerSnap ? 0 : entryFee;
        const regRef = tournamentRef.collection('registrations').doc();
        const variableSymbol = buildVariableSymbol(finance.vsPrefix, regRef.id);
        const now = FieldValue.serverTimestamp();

        const newRegistration: Record<string, unknown> = {
          id: regRef.id,
          player: {
            name: playerName,
            email: normalizedEmail,
            phone: phone?.trim() || null,
            csoRank: csoRank ?? null,
            csoPlayerId: csoPlayerId ?? null,
            nameKey: nameKey || null,
            gender: gender,
            ...(authUid ? { authUid } : {}),
          },
          status: newStatus,
          payment: {
            method: resolvedPaymentMethod,
            variableSymbol,
            amount,
            isPaid: false,
            verifiedByAdmin: false,
          },
          attendance: {
            checkedIn: false,
          },
          pair: pairingOn
            ? partnerName && !partnerSnap
              ? {
                  status: 'WAITING_PARTNER',
                  partnerRegistrationId: null,
                  partnerName: null,
                  pendingName: partnerName,
                  initiatedBy: regRef.id,
                  inviteToken: null,
                }
              : emptyPair()
            : emptyPair(),
          createdAt: now,
          updatedAt: now,
          source: 'PUBLIC',
        };

        if (terms) {
          newRegistration.termsAcceptedAt = now;
        }

        if (pairingOn && partnerSnap) {
          const inviteToken = randomBytes(16).toString('hex');
          const targetName = String(
            ((partnerSnap.data()?.player ?? {}) as { name?: string }).name ?? ''
          ).trim();
          newRegistration.pair = {
            status: 'PENDING_INVITE',
            partnerRegistrationId: partnerSnap.id,
            partnerName: targetName || null,
            pendingName: null,
            initiatedBy: regRef.id,
            inviteToken,
          };
          transaction.set(regRef, newRegistration);
          transaction.update(partnerSnap.ref, {
            pair: {
              status: 'PENDING_INVITE',
              partnerRegistrationId: regRef.id,
              partnerName: playerName,
              pendingName: null,
              initiatedBy: regRef.id,
              inviteToken,
            },
            updatedAt: now,
          });
        } else {
          transaction.set(regRef, newRegistration);
        }

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
        await upsertPlayerRegistrationLink(db, {
          tournamentId,
          registrationId: outcome.result.registrationId,
          authUid: authUid ?? null,
          email: myEmail,
          status: outcome.result.status,
          playerName,
          nameKey: nameKey || null,
        });
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
        alreadyRegistered: !!outcome.result.alreadyRegistered,
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
