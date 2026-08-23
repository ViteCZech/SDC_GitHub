import { randomBytes } from 'crypto';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { ACTIVE_PREREG_STATUSES } from './playerIdentity';
import {
  allowsPairing,
  applyPairConfirm,
  applyPairDecline,
  canAppearInPartnerList,
  gendersCompatible,
  normalizeCompetitionType,
  normalizeGender,
  pairStatusOf,
  playerGenderOf,
  publicPairView,
  writePairInvite,
} from './pairing';
import type { PairActionPayload } from './types';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');

const CALLABLE = {
  region: 'europe-west1' as const,
  invoker: 'public' as const,
  cors: true,
};

function newInviteToken(): string {
  return randomBytes(16).toString('hex');
}

function assertOpen(tourData: FirebaseFirestore.DocumentData): void {
  if (String(tourData.status ?? '') !== 'REGISTRATION_OPEN') {
    throw new HttpsError('failed-precondition', 'Registrace do tohoto turnaje nejsou otevřeny.');
  }
}

function assertPairingTournament(tourData: FirebaseFirestore.DocumentData) {
  const type = normalizeCompetitionType(
    (tourData.meta as { competitionType?: unknown } | undefined)?.competitionType
  );
  if (!allowsPairing(type)) {
    throw new HttpsError('failed-precondition', 'Tento turnaj není ve formátu dvojic.');
  }
  return type;
}

/**
 * Seznam nespárovaných přihlášek — jen jméno a ID, bez e-mailu / telefonu.
 */
export const listAvailablePartners = onCall(CALLABLE, async (request) => {
  const tournamentId = String(request.data?.tournamentId ?? '').trim();
  const excludeId = String(request.data?.excludeRegistrationId ?? '').trim();
  const requesterGender = normalizeGender(request.data?.gender);
  if (!tournamentId) {
    throw new HttpsError('invalid-argument', 'Chybí ID turnaje.');
  }

  const tourSnap = await db.collection('tournaments').doc(tournamentId).get();
  if (!tourSnap.exists) {
    throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
  }
  const tourData = tourSnap.data() ?? {};
  const type = assertPairingTournament(tourData);

  const regsSnap = await db
    .collection('tournaments')
    .doc(tournamentId)
    .collection('registrations')
    .limit(500)
    .get();

  const partners = regsSnap.docs
    .filter((docSnap) => {
      if (docSnap.id === excludeId) return false;
      const data = docSnap.data() ?? {};
      if (!canAppearInPartnerList(data)) return false;
      if (type === 'mixed' && requesterGender) {
        return gendersCompatible(type, requesterGender, playerGenderOf(data));
      }
      return true;
    })
    .map((docSnap) => ({
      registrationId: docSnap.id,
      name: String((docSnap.data()?.player as { name?: string } | undefined)?.name ?? '').trim(),
    }))
    .filter((row) => row.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  return { partners };
});

/**
 * Hráč vybere partnera ze seznamu — ten potvrzuje.
 */
export const requestPair = onCall(CALLABLE, async (request) => {
  const data = (request.data ?? {}) as PairActionPayload;
  const tournamentId = String(data.tournamentId ?? '').trim();
  const registrationId = String(data.registrationId ?? '').trim();
  const partnerRegistrationId = String(data.partnerRegistrationId ?? '').trim();

  if (!tournamentId || !registrationId || !partnerRegistrationId) {
    throw new HttpsError('invalid-argument', 'Chybí turnaj nebo partner.');
  }
  if (registrationId === partnerRegistrationId) {
    throw new HttpsError('invalid-argument', 'Nelze se spárovat sám se sebou.');
  }

  const outcome = await db.runTransaction(async (transaction) => {
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const selfRef = tournamentRef.collection('registrations').doc(registrationId);
    const partnerRef = tournamentRef.collection('registrations').doc(partnerRegistrationId);
    const [tourSnap, selfSnap, partnerSnap] = await Promise.all([
      transaction.get(tournamentRef),
      transaction.get(selfRef),
      transaction.get(partnerRef),
    ]);

    if (!tourSnap.exists) throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
    if (!selfSnap.exists || !partnerSnap.exists) {
      throw new HttpsError('not-found', 'Přihláška partnera nebyla nalezena.');
    }

    const tourData = tourSnap.data() ?? {};
    const selfData = selfSnap.data() ?? {};
    const partnerData = partnerSnap.data() ?? {};
    assertOpen(tourData);
    const type = assertPairingTournament(tourData);

    if (!ACTIVE_PREREG_STATUSES.has(String(selfData.status ?? ''))) {
      throw new HttpsError('failed-precondition', 'Vaše přihláška není aktivní.');
    }
    if (!canAppearInPartnerList(selfData)) {
      throw new HttpsError('failed-precondition', 'PAIR_NOT_AVAILABLE');
    }
    if (!canAppearInPartnerList(partnerData)) {
      throw new HttpsError('failed-precondition', 'PAIR_NOT_AVAILABLE');
    }
    if (!gendersCompatible(type, playerGenderOf(selfData), playerGenderOf(partnerData))) {
      throw new HttpsError('failed-precondition', 'PAIR_GENDER');
    }

    const now = FieldValue.serverTimestamp();
    const selfName = String((selfData.player as { name?: string } | undefined)?.name ?? '').trim();
    writePairInvite({
      transaction,
      requesterRef: selfRef,
      requesterName: selfName,
      targetRef: partnerRef,
      targetData: partnerData,
      initiatedBy: registrationId,
      inviteToken: newInviteToken(),
      now,
    });

    return publicPairView(registrationId, {
      ...selfData,
      pair: {
        status: 'PENDING_INVITE',
        partnerRegistrationId,
        partnerName: String((partnerData.player as { name?: string } | undefined)?.name ?? '').trim(),
        initiatedBy: registrationId,
      },
    });
  });

  logger.info('requestPair', { tournamentId, registrationId, partnerRegistrationId });
  return { success: true, pair: outcome };
});

export const confirmPair = onCall(CALLABLE, async (request) => {
  const tournamentId = String(request.data?.tournamentId ?? '').trim();
  const registrationId = String(request.data?.registrationId ?? '').trim();
  if (!tournamentId || !registrationId) {
    throw new HttpsError('invalid-argument', 'Chybí turnaj nebo ID přihlášky.');
  }

  const outcome = await db.runTransaction(async (transaction) => {
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const selfRef = tournamentRef.collection('registrations').doc(registrationId);
    const [tourSnap, selfSnap] = await Promise.all([
      transaction.get(tournamentRef),
      transaction.get(selfRef),
    ]);
    if (!tourSnap.exists) throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
    if (!selfSnap.exists) throw new HttpsError('not-found', 'Přihláška nebyla nalezena.');

    const tourData = tourSnap.data() ?? {};
    const selfData = selfSnap.data() ?? {};
    assertOpen(tourData);
    const type = assertPairingTournament(tourData);

    if (pairStatusOf(selfData) !== 'PENDING_INVITE') {
      throw new HttpsError('failed-precondition', 'PAIR_NOT_PENDING');
    }
    const initiatedBy = String(
      (selfData.pair as { initiatedBy?: string } | undefined)?.initiatedBy ?? ''
    );
    if (!initiatedBy || initiatedBy === registrationId) {
      throw new HttpsError('failed-precondition', 'PAIR_NOT_PENDING');
    }
    const partnerId = String(
      (selfData.pair as { partnerRegistrationId?: string } | undefined)?.partnerRegistrationId ?? ''
    ).trim();
    if (!partnerId) throw new HttpsError('failed-precondition', 'PAIR_NOT_PENDING');

    const partnerRef = tournamentRef.collection('registrations').doc(partnerId);
    const partnerSnap = await transaction.get(partnerRef);
    if (!partnerSnap.exists) throw new HttpsError('not-found', 'Přihláška partnera nebyla nalezena.');
    const partnerData = partnerSnap.data() ?? {};
    if (pairStatusOf(partnerData) !== 'PENDING_INVITE') {
      throw new HttpsError('failed-precondition', 'PAIR_NOT_AVAILABLE');
    }
    if (!gendersCompatible(type, playerGenderOf(selfData), playerGenderOf(partnerData))) {
      throw new HttpsError('failed-precondition', 'PAIR_GENDER');
    }

    try {
      applyPairConfirm({
        transaction,
        tournamentRef,
        tourData,
        aRef: selfRef,
        aData: selfData,
        bRef: partnerRef,
        bData: partnerData,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'PAIR_CAPACITY') {
        throw new HttpsError('resource-exhausted', 'Kapacita turnaje je naplněna.');
      }
      throw e;
    }

    return { partnerName: String((partnerData.player as { name?: string } | undefined)?.name ?? '') };
  });

  logger.info('confirmPair', { tournamentId, registrationId });
  return { success: true, pairStatus: 'CONFIRMED', partnerName: outcome.partnerName };
});

export const declinePair = onCall(CALLABLE, async (request) => {
  const tournamentId = String(request.data?.tournamentId ?? '').trim();
  const registrationId = String(request.data?.registrationId ?? '').trim();
  if (!tournamentId || !registrationId) {
    throw new HttpsError('invalid-argument', 'Chybí turnaj nebo ID přihlášky.');
  }

  await db.runTransaction(async (transaction) => {
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const selfRef = tournamentRef.collection('registrations').doc(registrationId);
    const [tourSnap, selfSnap] = await Promise.all([
      transaction.get(tournamentRef),
      transaction.get(selfRef),
    ]);
    if (!tourSnap.exists) throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
    if (!selfSnap.exists) throw new HttpsError('not-found', 'Přihláška nebyla nalezena.');

    const tourData = tourSnap.data() ?? {};
    const selfData = selfSnap.data() ?? {};
    assertOpen(tourData);
    assertPairingTournament(tourData);

    if (pairStatusOf(selfData) !== 'PENDING_INVITE') {
      throw new HttpsError('failed-precondition', 'PAIR_NOT_PENDING');
    }
    const partnerId = String(
      (selfData.pair as { partnerRegistrationId?: string } | undefined)?.partnerRegistrationId ?? ''
    ).trim();
    if (!partnerId) throw new HttpsError('failed-precondition', 'PAIR_NOT_PENDING');

    const partnerRef = tournamentRef.collection('registrations').doc(partnerId);
    const partnerSnap = await transaction.get(partnerRef);
    if (!partnerSnap.exists) {
      transaction.update(selfRef, {
        pair: {
          status: 'NONE',
          partnerRegistrationId: null,
          partnerName: null,
          pendingName: null,
          initiatedBy: null,
          inviteToken: null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    applyPairDecline({
      transaction,
      actorRef: selfRef,
      actorData: selfData,
      partnerRef,
      partnerData: partnerSnap.data() ?? {},
    });
  });

  logger.info('declinePair', { tournamentId, registrationId });
  return { success: true };
});
