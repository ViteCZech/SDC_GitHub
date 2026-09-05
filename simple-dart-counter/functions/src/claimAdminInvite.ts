import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { CALLABLE_PUBLIC, requireGoogleUid } from './authz';
import { ADMIN_PRIVATE_COLLECTION, ADMIN_SECRETS_DOC } from './tournamentSecrets';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');

type InviteTokens = Record<string, unknown>;

function inviteTokensOf(data: FirebaseFirestore.DocumentData | undefined): InviteTokens {
  const fromPrivate = (data?.inviteTokens ?? null) as InviteTokens | null;
  if (fromPrivate && typeof fromPrivate === 'object') return fromPrivate;
  return {};
}

async function loadInviteTokens(tournamentId: string): Promise<{
  tokens: InviteTokens;
  ownerUid: string | null;
}> {
  const tourSnap = await db.collection('tournaments').doc(tournamentId).get();
  if (!tourSnap.exists) {
    throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
  }
  const tour = tourSnap.data() ?? {};
  const ownerUid = typeof tour.admin?.ownerUid === 'string' ? tour.admin.ownerUid : null;

  const privateSnap = await db
    .collection('tournaments')
    .doc(tournamentId)
    .collection(ADMIN_PRIVATE_COLLECTION)
    .doc(ADMIN_SECRETS_DOC)
    .get();
  if (privateSnap.exists) {
    return { tokens: inviteTokensOf(privateSnap.data()), ownerUid };
  }

  const legacy = tour.admin?.inviteTokens;
  if (legacy && typeof legacy === 'object') {
    return { tokens: legacy as InviteTokens, ownerUid };
  }
  return { tokens: {}, ownerUid };
}

export const verifyAdminInvite = onCall(
  CALLABLE_PUBLIC,
  async (request): Promise<{ valid: boolean }> => {
    const tournamentId = String(request.data?.tournamentId ?? '').trim();
    const token = String(request.data?.token ?? '').trim();
    if (!tournamentId || !token) return { valid: false };
    try {
      const { tokens } = await loadInviteTokens(tournamentId);
      return { valid: !!tokens[token] };
    } catch (err) {
      if (err instanceof HttpsError && err.code === 'not-found') return { valid: false };
      throw err;
    }
  }
);

/**
 * Spolupořadatel se přidá po ověření invite tokenu (Google účet).
 */
export const claimAdminInvite = onCall(
  CALLABLE_PUBLIC,
  async (request): Promise<{ success: true; alreadyMember?: boolean }> => {
    const uid = requireGoogleUid(request);
    const tournamentId = String(request.data?.tournamentId ?? '').trim();
    const token = String(request.data?.token ?? '').trim();
    if (!tournamentId || !token) {
      throw new HttpsError('invalid-argument', 'Chybí turnaj nebo invite token.');
    }

    const { tokens, ownerUid } = await loadInviteTokens(tournamentId);
    if (!tokens[token]) {
      throw new HttpsError('permission-denied', 'Neplatný invite token.');
    }
    if (ownerUid === uid) {
      return { success: true, alreadyMember: true };
    }

    const tourRef = db.collection('tournaments').doc(tournamentId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(tourRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Turnaj nebyl nalezen.');
      }
      const data = snap.data() ?? {};
      const currentOwner = data.admin?.ownerUid;
      if (currentOwner === uid) return;
      const coAdmins = Array.isArray(data.admin?.coAdminUids)
        ? [...data.admin.coAdminUids]
        : [];
      if (coAdmins.includes(uid)) return;
      transaction.update(tourRef, {
        'admin.coAdminUids': [...coAdmins, uid],
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    logger.info('claimAdminInvite', { tournamentId, uid });
    return { success: true };
  }
);
