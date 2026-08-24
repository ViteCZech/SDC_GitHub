import { doc, getDoc, setDoc, collection, onSnapshot, runTransaction, serverTimestamp, Timestamp, updateDoc, increment, query, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db, auth } from '../firebase';
import {
  generateInviteToken,
  getAdminInviteUrl,
  getPublicRegistrationUrl,
  hashAdminPin,
} from '../utils/preregAdmin';
import { buildCzechBankAccount } from '../utils/bankAccount';
import { findDuplicateRegistration } from '../utils/playerIdentity';

/** Region musí odpovídat nasazení Cloud Functions (`functions/src/registerPlayer.ts`). */
const FUNCTIONS_REGION = 'europe-west1';

export const PREREG_NOT_FOUND = 'prereg_tournament_not_found';
export const PREREG_NO_DB = 'prereg_no_db';
export const PREREG_REGISTRATION_FAILED = 'prereg_registration_failed';

function requireDb() {
  if (!db) throw new Error(PREREG_NO_DB);
  return db;
}

function requireApp() {
  if (!app) throw new Error(PREREG_NO_DB);
  return app;
}

/**
 * Odstraní citlivá admin pole před vrácením klientovi.
 * @param {Record<string, unknown>} data
 */
function sanitizePublicTournament(data) {
  const copy = { ...data };
  if (copy.admin && typeof copy.admin === 'object') {
    const { adminPinHash, inviteTokens, ...safeAdmin } = copy.admin;
    copy.admin = safeAdmin;
  }
  return copy;
}

/**
 * Načte veřejná data turnaje pro registraci / čekárnu.
 * Firestore rules: read povolen pro status != DRAFT.
 *
 * @param {string} tournamentId
 * @returns {Promise<import('../types/tournamentPreReg.d.ts').TournamentPreRegDocument & { id: string }>}
 */
export async function getPublicTournamentData(tournamentId) {
  const id = String(tournamentId ?? '').trim();
  if (!id) throw new Error(PREREG_NOT_FOUND);

  const docRef = doc(requireDb(), 'tournaments', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error(PREREG_NOT_FOUND);
  }

  const data = sanitizePublicTournament(docSnap.data());
  return {
    id: docSnap.id,
    ...data,
  };
}

/**
 * @typedef {Object} RegisterPlayerPayload
 * @property {string} tournamentId
 * @property {string} playerName
 * @property {string} [email]
 * @property {string} [phone]
 * @property {number|null} [csoRank]
 * @property {string|null} [csoPlayerId]
 * @property {'QR'|'CASH'|null} [paymentMethod]
 * @property {boolean} [termsAccepted]
 * @property {'M'|'F'|null} [gender]
 * @property {string} [partnerRegistrationId]
 * @property {string} [partnerName]
 */

/**
 * @typedef {Object} RegisterPlayerResult
 * @property {true} success
 * @property {string} registrationId
 * @property {'CONFIRMED'|'WAITLIST'|'PENDING_PAYMENT'} status
 * @property {string|null} variableSymbol
 * @property {boolean} [alreadyRegistered]
 */

/**
 * Volání backendové Cloud Function pro bezpečnou registraci hráče.
 *
 * @param {RegisterPlayerPayload} payload
 * @returns {Promise<RegisterPlayerResult>}
 */
export async function registerPlayerApi(payload) {
  const tournamentId = String(payload?.tournamentId ?? '').trim();
  if (!tournamentId) {
    const error = new Error('Chybí ID turnaje (tournamentId).');
    error.code = 'invalid-argument';
    throw error;
  }

  const functions = getFunctions(requireApp(), FUNCTIONS_REGION);
  const registerFn = httpsCallable(functions, 'registerPlayer');

  try {
    const result = await registerFn({
      ...payload,
      tournamentId,
      playerName: String(payload?.playerName ?? '').trim(),
    });
    return /** @type {RegisterPlayerResult} */ (result.data);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message =
      err && typeof err === 'object' && 'message' in err ? String(err.message) : '';

    const error = new Error(message || PREREG_REGISTRATION_FAILED);
    error.code = code.replace(/^functions\//, '') || PREREG_REGISTRATION_FAILED;
    throw error;
  }
}

/**
 * Přihlášky přihlášeného hráče (Cloud Function — collectionGroup).
 * @returns {Promise<Array<object>>}
 */
export async function listMyRegistrationsApi() {
  const functions = getFunctions(requireApp(), FUNCTIONS_REGION);
  const fn = httpsCallable(functions, 'listMyRegistrations');
  try {
    const result = await fn({});
    const items = /** @type {{ items?: object[] }} */ (result.data)?.items;
    return Array.isArray(items) ? items : [];
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message =
      err && typeof err === 'object' && 'message' in err ? String(err.message) : '';
    const error = new Error(message || 'list_my_registrations_failed');
    error.code = code.replace(/^functions\//, '') || 'list_my_registrations_failed';
    throw error;
  }
}

function callPreRegFunction(name, payload) {
  const functions = getFunctions(requireApp(), FUNCTIONS_REGION);
  return httpsCallable(functions, name)(payload);
}

/**
 * Nespárovaní hráči (jen jména) pro výběr partnera.
 * @param {string} tournamentId
 * @param {{ excludeRegistrationId?: string, gender?: 'M'|'F'|null }} [opts]
 */
export async function listAvailablePartnersApi(tournamentId, opts = {}) {
  try {
    const result = await callPreRegFunction('listAvailablePartners', {
      tournamentId: String(tournamentId ?? '').trim(),
      excludeRegistrationId: opts.excludeRegistrationId || undefined,
      gender: opts.gender || undefined,
    });
    const partners = /** @type {{ partners?: Array<{ registrationId: string, name: string }> }} */ (
      result.data
    )?.partners;
    return Array.isArray(partners) ? partners : [];
  } catch (err) {
    const error = new Error(err?.message || 'list_partners_failed');
    error.code = String(err?.code ?? '').replace(/^functions\//, '') || 'list_partners_failed';
    throw error;
  }
}

/**
 * @param {string} tournamentId
 * @param {string} registrationId
 * @param {string} partnerRegistrationId
 */
export async function requestPairApi(tournamentId, registrationId, partnerRegistrationId) {
  try {
    const result = await callPreRegFunction('requestPair', {
      tournamentId: String(tournamentId ?? '').trim(),
      registrationId: String(registrationId ?? '').trim(),
      partnerRegistrationId: String(partnerRegistrationId ?? '').trim(),
    });
    return result.data;
  } catch (err) {
    const error = new Error(err?.message || 'request_pair_failed');
    error.code = String(err?.code ?? '').replace(/^functions\//, '') || 'request_pair_failed';
    throw error;
  }
}

/** @param {string} tournamentId @param {string} registrationId */
export async function confirmPairApi(tournamentId, registrationId) {
  try {
    const result = await callPreRegFunction('confirmPair', {
      tournamentId: String(tournamentId ?? '').trim(),
      registrationId: String(registrationId ?? '').trim(),
    });
    return result.data;
  } catch (err) {
    const error = new Error(err?.message || 'confirm_pair_failed');
    error.code = String(err?.code ?? '').replace(/^functions\//, '') || 'confirm_pair_failed';
    throw error;
  }
}

/** @param {string} tournamentId @param {string} registrationId */
export async function declinePairApi(tournamentId, registrationId) {
  try {
    const result = await callPreRegFunction('declinePair', {
      tournamentId: String(tournamentId ?? '').trim(),
      registrationId: String(registrationId ?? '').trim(),
    });
    return result.data;
  } catch (err) {
    const error = new Error(err?.message || 'decline_pair_failed');
    error.code = String(err?.code ?? '').replace(/^functions\//, '') || 'decline_pair_failed';
    throw error;
  }
}

/** Hráč stornuje vlastní přihlášku (Cloud Function). */
export async function unregisterPlayerApi(tournamentId, registrationId) {
  const functions = getFunctions(requireApp(), FUNCTIONS_REGION);
  const fn = httpsCallable(functions, 'unregisterPlayer');
  try {
    const result = await fn({
      tournamentId: String(tournamentId ?? '').trim(),
      registrationId: String(registrationId ?? '').trim(),
    });
    return /** @type {{ success: true, status: 'CANCELLED', refundDue: boolean, waitlistPromoted: boolean }} */ (
      result.data
    );
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message =
      err && typeof err === 'object' && 'message' in err ? String(err.message) : '';
    const error = new Error(message || 'unregister_failed');
    error.code = code.replace(/^functions\//, '') || 'unregister_failed';
    throw error;
  }
}

/**
 * Stav přihlášky podle ID z localStorage (bez e-mailu / telefonu).
 * @param {string} tournamentId
 * @param {string} registrationId
 */
export async function lookupStoredRegistrationApi(tournamentId, registrationId) {
  const functions = getFunctions(requireApp(), FUNCTIONS_REGION);
  const fn = httpsCallable(functions, 'lookupStoredRegistration');
  const result = await fn({
    tournamentId: String(tournamentId ?? '').trim(),
    registrationId: String(registrationId ?? '').trim(),
  });
  return /** @type {object} */ (result.data);
}

function requireAuthUid() {
  const uid = auth?.currentUser?.uid;
  if (!uid || auth?.currentUser?.isAnonymous) {
    throw new Error('prereg_auth_required');
  }
  return uid;
}

function requireOwnerUid() {
  return requireAuthUid();
}

/**
 * @param {string} tournamentId
 * @returns {Promise<string>}
 */
async function requireAdminAccess(tournamentId) {
  const uid = requireAuthUid();
  const docRef = doc(requireDb(), 'tournaments', tournamentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) throw new Error(PREREG_NOT_FOUND);

  const data = docSnap.data();
  const ownerUid = data.admin?.ownerUid;
  const coAdmins = Array.isArray(data.admin?.coAdminUids) ? data.admin.coAdminUids : [];
  if (ownerUid !== uid && !coAdmins.includes(uid)) {
    throw new Error('prereg_access_denied');
  }
  return uid;
}

/**
 * Ověří invite token proti dokumentu turnaje (veřejné read pro non-DRAFT).
 * @param {string} tournamentId
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function verifyAdminInviteToken(tournamentId, token) {
  const id = String(tournamentId ?? '').trim();
  const inviteToken = String(token ?? '').trim();
  if (!id || !inviteToken) return false;

  const docSnap = await getDoc(doc(requireDb(), 'tournaments', id));
  if (!docSnap.exists()) return false;

  const inviteTokens = docSnap.data()?.admin?.inviteTokens;
  return !!(inviteTokens && typeof inviteTokens === 'object' && inviteTokens[inviteToken]);
}

/**
 * Přidá přihlášeného uživatele mezi spolupořadatele po ověření invite tokenu.
 * @param {string} tournamentId
 * @param {string} token
 */
export async function claimAdminInviteAccess(tournamentId, token) {
  const uid = requireAuthUid();
  const id = String(tournamentId ?? '').trim();
  const inviteToken = String(token ?? '').trim();
  if (!id || !inviteToken) throw new Error('prereg_invalid_invite');

  await runTransaction(requireDb(), async (transaction) => {
    const tourRef = doc(requireDb(), 'tournaments', id);
    const tourSnap = await transaction.get(tourRef);
    if (!tourSnap.exists()) throw new Error(PREREG_NOT_FOUND);

    const data = tourSnap.data();
    if (!data.admin?.inviteTokens?.[inviteToken]) {
      throw new Error('prereg_invalid_invite');
    }

    const ownerUid = data.admin?.ownerUid;
    if (ownerUid === uid) return;

    const coAdmins = Array.isArray(data.admin?.coAdminUids) ? [...data.admin.coAdminUids] : [];
    if (coAdmins.includes(uid)) return;

    transaction.update(tourRef, {
      'admin.coAdminUids': [...coAdmins, uid],
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * @returns {Promise<Array<object>>}
 */
let ownerTournamentsInflight = null;
let ownerTournamentsInflightUid = null;

export async function listOwnerTournaments() {
  const uid = requireOwnerUid();

  if (ownerTournamentsInflight && ownerTournamentsInflightUid === uid) {
    return ownerTournamentsInflight;
  }

  ownerTournamentsInflightUid = uid;
  ownerTournamentsInflight = (async () => {
    try {
      const q = query(
        collection(requireDb(), 'tournaments'),
        where('admin.ownerUid', '==', uid)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      return list;
    } finally {
      ownerTournamentsInflight = null;
      ownerTournamentsInflightUid = null;
    }
  })();

  return ownerTournamentsInflight;
}

/**
 * Veřejný katalog — turnaje s visibility.isPublic == true (bez citlivých admin polí).
 * Status musí být v query (ne jen client filter), jinak rules odmítnou celý list.
 * @returns {Promise<Array<object>>}
 */
const PUBLIC_CATALOG_STATUSES = [
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
  'FINISHED',
];

export async function getPublicTournamentsList() {
  const q = query(
    collection(requireDb(), 'tournaments'),
    where('visibility.isPublic', '==', true),
    where('status', 'in', PUBLIC_CATALOG_STATUSES)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...sanitizePublicTournament(d.data()),
  }));
}

/**
 * Vrátí správcovský invite odkaz (existující nebo nově vygenerovaný token).
 * @param {string} tournamentId
 * @returns {Promise<string>}
 */
export async function getAdminInviteLinkForTournament(tournamentId) {
  await requireAdminAccess(tournamentId);
  const uid = requireAuthUid();
  const docRef = doc(requireDb(), 'tournaments', tournamentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) throw new Error(PREREG_NOT_FOUND);

  const data = docSnap.data();
  if (data.admin?.ownerUid !== uid) {
    const tokens = data.admin?.inviteTokens ?? {};
    const existing = Object.keys(tokens)[0];
    if (existing) return getAdminInviteUrl(tournamentId, existing);
    throw new Error('prereg_access_denied');
  }

  const tokens = data.admin?.inviteTokens ?? {};
  let token = Object.keys(tokens)[0];
  if (!token) {
    token = generateInviteToken();
    await updateDoc(docRef, {
      [`admin.inviteTokens.${token}`]: { createdAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    });
  }
  return getAdminInviteUrl(tournamentId, token);
}

/**
 * Smaže turnaj včetně všech registrací. Pouze vlastník (admin.ownerUid).
 * @param {string} tournamentId
 */
export async function deletePreRegTournament(tournamentId) {
  const uid = requireAuthUid();
  const id = String(tournamentId ?? '').trim();
  if (!id) throw new Error(PREREG_NOT_FOUND);

  const tourRef = doc(requireDb(), 'tournaments', id);
  const tourSnap = await getDoc(tourRef);
  if (!tourSnap.exists()) throw new Error(PREREG_NOT_FOUND);
  if (tourSnap.data()?.admin?.ownerUid !== uid) {
    throw new Error('prereg_access_denied');
  }

  const regSnap = await getDocs(collection(requireDb(), 'tournaments', id, 'registrations'));
  const regDocs = regSnap.docs;
  for (let i = 0; i < regDocs.length; i += 500) {
    const batch = writeBatch(requireDb());
    regDocs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  await deleteDoc(tourRef);
}

/**
 * @param {string} tournamentId
 * @returns {Promise<object>}
 */
export async function getOwnerTournamentData(tournamentId) {
  await requireAdminAccess(tournamentId);
  const docRef = doc(requireDb(), 'tournaments', tournamentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) throw new Error(PREREG_NOT_FOUND);
  return { id: docSnap.id, ...docSnap.data() };
}

/**
 * @param {object} input
 * @returns {Promise<{ tournamentId: string, publicUrl: string, adminInviteUrl: string, inviteToken: string }>}
 */
export async function createPreRegTournament(input) {
  const ownerUid = requireOwnerUid();
  const tournamentId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const adminPinHash = input.adminPin ? await hashAdminPin(input.adminPin) : null;
  const inviteToken = generateInviteToken();

  const bankParts = {
    accountPrefix: input.accountPrefix ?? null,
    accountNumber: input.accountNumber ?? null,
    bankCode: input.bankCode ?? null,
  };
  const accountCombined = buildCzechBankAccount(bankParts);

  const docData = {
    status: 'REGISTRATION_OPEN',
    meta: {
      name: input.name?.trim() || null,
      venue: input.venue ?? null,
      location: {
        city: input.locationCity?.trim() || null,
        venueName: input.locationVenueName?.trim() || null,
        region: input.locationRegion?.trim() || null,
      },
      startsAt: input.startsAt ? Timestamp.fromDate(input.startsAt) : null,
      capacity: input.capacity ?? null,
      waitlistEnabled: !!input.waitlistEnabled,
      competitionType: input.competitionType || 'singles',
      capacityUnit: input.capacityUnit || 'players',
      registrationDeadline: input.registrationDeadline
        ? Timestamp.fromDate(input.registrationDeadline)
        : null,
    },
    visibility: {
      isPublic: input.isPublic !== false,
    },
    finance: {
      entryFee: input.entryFee ?? null,
      currency: 'CZK',
      paymentMethods: Array.isArray(input.paymentMethods) ? input.paymentMethods : [],
      payoutPercent: input.payoutPercent ?? null,
      addedSponsorMoney: input.addedSponsorMoney ?? null,
      vsPrefix: input.vsPrefix ?? null,
      feeMode: input.feeMode === 'pair' ? 'pair' : 'split',
      bankInfo: {
        accountPrefix: bankParts.accountPrefix,
        accountNumber: bankParts.accountNumber,
        bankCode: bankParts.bankCode,
        accountNumberCombined: accountCombined,
        bic: input.bic ?? null,
      },
    },
    termsAndConditions: input.termsAndConditions ?? null,
    admin: {
      ownerUid,
      adminPinHash,
      inviteTokens: {
        [inviteToken]: {
          createdAt: serverTimestamp(),
        },
      },
    },
    counters: {
      confirmed: 0,
      waitlist: 0,
      pendingPayment: 0,
      confirmedTeams: 0,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(requireDb(), 'tournaments', tournamentId), docData);

  return {
    tournamentId,
    inviteToken,
    publicUrl: getPublicRegistrationUrl(tournamentId),
    adminInviteUrl: getAdminInviteUrl(tournamentId, inviteToken),
  };
}

/**
 * @param {string} tournamentId
 * @param {(registrations: object[]) => void} callback
 * @returns {() => void}
 */
export function listenToRegistrations(tournamentId, callback) {
  const col = collection(requireDb(), 'tournaments', tournamentId, 'registrations');
  return onSnapshot(col, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    callback(list);
  });
}

/**
 * @param {string} tournamentId
 * @param {string} regId
 * @param {object} patch
 */
export async function updateRegistration(tournamentId, regId, patch) {
  await requireAdminAccess(tournamentId);
  await updateDoc(doc(requireDb(), 'tournaments', tournamentId, 'registrations', regId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin potvrdí dvojici okamžitě (obejde pozvánku).
 * @param {string} tournamentId
 * @param {string} regId
 * @param {string} partnerRegId
 */
export async function adminConfirmPair(tournamentId, regId, partnerRegId) {
  await requireAdminAccess(tournamentId);
  if (!regId || !partnerRegId || regId === partnerRegId) {
    throw new Error('prereg_pair_invalid');
  }
  const dbInst = requireDb();
  await runTransaction(dbInst, async (transaction) => {
    const aRef = doc(dbInst, 'tournaments', tournamentId, 'registrations', regId);
    const bRef = doc(dbInst, 'tournaments', tournamentId, 'registrations', partnerRegId);
    const tourRef = doc(dbInst, 'tournaments', tournamentId);
    const [aSnap, bSnap, tourSnap] = await Promise.all([
      transaction.get(aRef),
      transaction.get(bRef),
      transaction.get(tourRef),
    ]);
    if (!aSnap.exists() || !bSnap.exists() || !tourSnap.exists()) {
      throw new Error(PREREG_NOT_FOUND);
    }
    const a = aSnap.data() ?? {};
    const b = bSnap.data() ?? {};
    const tour = tourSnap.data() ?? {};
    const aPair = String(a.pair?.status ?? 'NONE');
    const bPair = String(b.pair?.status ?? 'NONE');
    if (aPair === 'CONFIRMED' || bPair === 'CONFIRMED') {
      throw new Error('prereg_pair_taken');
    }
    const type = tour.meta?.competitionType;
    const teamCapacity = type === 'doubles' || type === 'mixed';
    const occupied = Number(tour.counters?.confirmedTeams ?? 0) || 0;
    const cap = tour.meta?.capacity == null ? null : Number(tour.meta.capacity);
    const unlimited = cap == null || !Number.isFinite(cap) || cap <= 0;
    if (teamCapacity && !unlimited && occupied >= cap) {
      throw new Error('prereg_restore_capacity_full');
    }
    const now = serverTimestamp();
    const aName = String(a.player?.name ?? '').trim();
    const bName = String(b.player?.name ?? '').trim();
    const pairBase = {
      status: 'CONFIRMED',
      pendingName: null,
      initiatedBy: regId,
      inviteToken: null,
    };
    transaction.update(aRef, {
      pair: { ...pairBase, partnerRegistrationId: partnerRegId, partnerName: bName || null },
      updatedAt: now,
    });
    transaction.update(bRef, {
      pair: { ...pairBase, partnerRegistrationId: regId, partnerName: aName || null },
      updatedAt: now,
    });
    if (teamCapacity) {
      transaction.update(tourRef, {
        'counters.confirmedTeams': increment(1),
        updatedAt: now,
      });
    }
  });
}

function createdAtMs(data) {
  const raw = data?.createdAt;
  if (raw && typeof raw.toMillis === 'function') return raw.toMillis();
  if (raw && typeof raw.seconds === 'number') return raw.seconds * 1000;
  return 0;
}

/**
 * @param {string} tournamentId
 * @param {string} regId
 * @param {'CONFIRMED'|'WAITLIST'|'PENDING_PAYMENT'} [_previousStatus]
 */
export async function cancelRegistration(tournamentId, regId, _previousStatus) {
  await requireAdminAccess(tournamentId);
  const dbInst = requireDb();
  const regsSnap = await getDocs(collection(dbInst, 'tournaments', tournamentId, 'registrations'));
  const waitlistIds = regsSnap.docs
    .filter((d) => d.id !== regId && String(d.data()?.status ?? '') === 'WAITLIST')
    .sort((a, b) => createdAtMs(a.data()) - createdAtMs(b.data()))
    .map((d) => d.id);

  await runTransaction(dbInst, async (transaction) => {
    const regRef = doc(dbInst, 'tournaments', tournamentId, 'registrations', regId);
    const tourRef = doc(dbInst, 'tournaments', tournamentId);
    const [regSnap, tourSnap] = await Promise.all([
      transaction.get(regRef),
      transaction.get(tourRef),
    ]);
    if (!regSnap.exists() || !tourSnap.exists()) throw new Error(PREREG_NOT_FOUND);

    const current = String(regSnap.data()?.status ?? '');
    if (current === 'CANCELLED') return;

    const paid = !!regSnap.data()?.payment?.isPaid;
    const pairStatus = String(regSnap.data()?.pair?.status ?? '');
    const freedTeamSlot =
      current === 'CONFIRMED' &&
      pairStatus === 'CONFIRMED' &&
      (tourSnap.data()?.meta?.competitionType === 'doubles' ||
        tourSnap.data()?.meta?.competitionType === 'mixed');
    const partnerId = String(regSnap.data()?.pair?.partnerRegistrationId ?? '').trim();
    const partnerRef = partnerId
      ? doc(dbInst, 'tournaments', tournamentId, 'registrations', partnerId)
      : null;
    const partnerSnap = partnerRef ? await transaction.get(partnerRef) : null;

    let promoteRef = null;
    const waitlistEnabled = !!tourSnap.data()?.meta?.waitlistEnabled;
    if (current === 'CONFIRMED' && waitlistEnabled && waitlistIds[0]) {
      const wRef = doc(dbInst, 'tournaments', tournamentId, 'registrations', waitlistIds[0]);
      const wSnap = await transaction.get(wRef);
      if (wSnap.exists() && String(wSnap.data()?.status ?? '') === 'WAITLIST') {
        promoteRef = wRef;
      }
    }

    const patch = {
      status: 'CANCELLED',
      cancelledBy: 'ADMIN',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (paid) patch['payment.refundDue'] = true;
    transaction.update(regRef, patch);

    if (partnerSnap?.exists()) {
      transaction.update(partnerSnap.ref, {
        'pair.status': 'BROKEN',
        updatedAt: serverTimestamp(),
      });
    }

    const counters = { updatedAt: serverTimestamp() };
    if (current === 'CONFIRMED') {
      if (promoteRef) {
        transaction.update(promoteRef, { status: 'CONFIRMED', updatedAt: serverTimestamp() });
        counters['counters.waitlist'] = increment(-1);
      } else {
        counters['counters.confirmed'] = increment(-1);
        if (freedTeamSlot) counters['counters.confirmedTeams'] = increment(-1);
      }
    } else if (current === 'WAITLIST') {
      counters['counters.waitlist'] = increment(-1);
    } else if (current === 'PENDING_PAYMENT') {
      counters['counters.pendingPayment'] = increment(-1);
    }
    transaction.update(tourRef, counters);
  });
}

/**
 * Obnoví stornovanou přihlášku na CONFIRMED, PENDING_PAYMENT nebo WAITLIST.
 * Při plné kapacitě a volbě CONFIRMED přesune na WAITLIST (pokud je zapnutý).
 * @param {string} tournamentId
 * @param {string} regId
 * @param {'CONFIRMED'|'PENDING_PAYMENT'} targetStatus
 * @returns {Promise<{ status: string }>}
 */
export async function restoreCancelledRegistration(tournamentId, regId, targetStatus) {
  await requireAdminAccess(tournamentId);
  const wanted = targetStatus === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT' : 'CONFIRMED';

  const regsSnap = await getDocs(collection(requireDb(), 'tournaments', tournamentId, 'registrations'));
  const regs = regsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const currentReg = regs.find((r) => r.id === regId);
  if (!currentReg) throw new Error(PREREG_NOT_FOUND);
  if (String(currentReg.status ?? '') !== 'CANCELLED') {
    throw new Error('prereg_restore_not_cancelled');
  }
  const player = currentReg.player ?? {};
  const dup = findDuplicateRegistration(
    regs.filter((r) => r.id !== regId),
    {
      name: player.name,
      csoPlayerId:
        player.csoPlayerId ?? (player.nameKey ? `name:${player.nameKey}` : null),
    }
  );
  if (dup) throw new Error('prereg_restore_duplicate_active');

  return runTransaction(requireDb(), async (transaction) => {
    const regRef = doc(requireDb(), 'tournaments', tournamentId, 'registrations', regId);
    const tourRef = doc(requireDb(), 'tournaments', tournamentId);
    const [regSnap, tourSnap] = await Promise.all([
      transaction.get(regRef),
      transaction.get(tourRef),
    ]);
    if (!regSnap.exists()) throw new Error(PREREG_NOT_FOUND);
    if (!tourSnap.exists()) throw new Error(PREREG_NOT_FOUND);

    const current = String(regSnap.data()?.status ?? '');
    if (current !== 'CANCELLED') {
      throw new Error('prereg_restore_not_cancelled');
    }

    const tour = tourSnap.data() ?? {};
    const teamCapacity =
      tour.meta?.competitionType === 'doubles' || tour.meta?.competitionType === 'mixed';
    const occupied = teamCapacity
      ? Number(tour.counters?.confirmedTeams ?? 0) || 0
      : Number(tour.counters?.confirmed ?? 0) || 0;
    const rawCap = tour.meta?.capacity;
    const cap = rawCap == null ? null : Number(rawCap);
    const unlimited = cap == null || !Number.isFinite(cap) || cap <= 0;
    const waitlistEnabled = !!tour.meta?.waitlistEnabled;

    let next = wanted;
    if (wanted === 'CONFIRMED' && !teamCapacity && !unlimited && occupied >= cap) {
      if (!waitlistEnabled) {
        throw new Error('prereg_restore_capacity_full');
      }
      next = 'WAITLIST';
    }

    transaction.update(regRef, {
      status: next,
      cancelledBy: null,
      cancelledAt: null,
      'payment.refundDue': false,
      'payment.refundedAt': null,
      updatedAt: serverTimestamp(),
    });
    if (next === 'CONFIRMED') {
      transaction.update(tourRef, { 'counters.confirmed': increment(1), updatedAt: serverTimestamp() });
    } else if (next === 'WAITLIST') {
      transaction.update(tourRef, { 'counters.waitlist': increment(1), updatedAt: serverTimestamp() });
    } else {
      transaction.update(tourRef, { 'counters.pendingPayment': increment(1), updatedAt: serverTimestamp() });
    }
    return { status: next };
  });
}

function buildVariableSymbol(prefix, registrationId) {
  const digitsFromId = registrationId.replace(/\D/g, '');
  const suffix =
    digitsFromId.length >= 6
      ? digitsFromId.slice(-6)
      : String(Date.now() % 1_000_000).padStart(6, '0');
  return `${prefix ?? ''}${suffix}`.replace(/\s/g, '').slice(0, 10);
}

/**
 * Ruční registrace hráče adminem (Cloud Function se serverovou kontrolou duplicit).
 * @param {string} tournamentId
 * @param {object} input
 */
export async function createManualRegistration(tournamentId, input) {
  const id = String(tournamentId ?? '').trim();
  if (!id) throw new Error(PREREG_NOT_FOUND);

  const functions = getFunctions(requireApp(), FUNCTIONS_REGION);
  const fn = httpsCallable(functions, 'createManualRegistration');

  try {
    const result = await fn({
      tournamentId: id,
      playerName: String(input?.playerName ?? '').trim(),
      email: input?.email ?? null,
      phone: input?.phone ?? null,
      csoRank: input?.csoRank ?? null,
      csoPlayerId: input?.csoPlayerId ?? null,
      nameKey: input?.nameKey ?? null,
      paymentMethod: input?.paymentMethod ?? null,
      isPaid: !!input?.isPaid,
      checkedIn: !!input?.checkedIn,
      duplicateOk: !!input?.duplicateOk,
      source: input?.source ?? 'ADMIN_MANUAL',
      forceConfirmed: !!input?.forceConfirmed,
    });
    return /** @type {{ registrationId: string, status: string, variableSymbol: string }} */ (
      result.data
    );
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const message =
      err && typeof err === 'object' && 'message' in err ? String(err.message) : '';
    const error = new Error(message || PREREG_REGISTRATION_FAILED);
    error.code = code.replace(/^functions\//, '') || PREREG_REGISTRATION_FAILED;
    throw error;
  }
}

/**
 * Jednorázové načtení přihlášek turnaje pro admin workflow.
 * @param {string} tournamentId
 * @returns {Promise<object[]>}
 */
export async function listTournamentRegistrations(tournamentId) {
  const id = String(tournamentId ?? '').trim();
  if (!id) throw new Error(PREREG_NOT_FOUND);
  await requireAdminAccess(id);
  const snap = await getDocs(collection(requireDb(), 'tournaments', id, 'registrations'));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
  return list;
}

export async function markRegistrationPaid(tournamentId, regId, method) {
  await updateRegistration(tournamentId, regId, {
    'payment.isPaid': true,
    'payment.verifiedByAdmin': true,
    'payment.verifiedAt': serverTimestamp(),
    'payment.method': method,
    'payment.refundDue': false,
  });
}

export async function markRegistrationRefunded(tournamentId, regId) {
  await updateRegistration(tournamentId, regId, {
    'payment.refundDue': false,
    'payment.refundedAt': serverTimestamp(),
    'payment.refundedByAdminUid': requireAuthUid(),
  });
}

export async function toggleRegistrationCheckIn(tournamentId, regId, checkedIn) {
  await updateRegistration(tournamentId, regId, {
    'attendance.checkedIn': checkedIn,
    'attendance.checkedInAt': checkedIn ? serverTimestamp() : null,
  });
}
