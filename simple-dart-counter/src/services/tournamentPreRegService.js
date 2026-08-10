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
 */

/**
 * @typedef {Object} RegisterPlayerResult
 * @property {true} success
 * @property {string} registrationId
 * @property {'CONFIRMED'|'WAITLIST'} status
 * @property {string|null} variableSymbol
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
 * @param {string} tournamentId
 * @param {string} regId
 * @param {'CONFIRMED'|'WAITLIST'} previousStatus
 */
export async function cancelRegistration(tournamentId, regId, previousStatus) {
  await requireAdminAccess(tournamentId);
  await runTransaction(requireDb(), async (transaction) => {
    const regRef = doc(requireDb(), 'tournaments', tournamentId, 'registrations', regId);
    const tourRef = doc(requireDb(), 'tournaments', tournamentId);
    transaction.update(regRef, {
      status: 'CANCELLED',
      updatedAt: serverTimestamp(),
    });
    if (previousStatus === 'CONFIRMED') {
      transaction.update(tourRef, { 'counters.confirmed': increment(-1) });
    } else if (previousStatus === 'WAITLIST') {
      transaction.update(tourRef, { 'counters.waitlist': increment(-1) });
    }
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
 * Ruční registrace hráče adminem (přímý zápis do Firestore).
 * @param {string} tournamentId
 * @param {object} input
 */
export async function createManualRegistration(tournamentId, input) {
  await requireAdminAccess(tournamentId);

  return runTransaction(requireDb(), async (transaction) => {
    const tourRef = doc(requireDb(), 'tournaments', tournamentId);
    const tourSnap = await transaction.get(tourRef);
    if (!tourSnap.exists()) throw new Error(PREREG_NOT_FOUND);

    const tData = tourSnap.data();
    const currentConfirmed = tData.counters?.confirmed ?? 0;
    const maxCapacity = tData.meta?.capacity ?? null;
    const unlimited = maxCapacity == null || maxCapacity === 0;

    let newStatus = 'CONFIRMED';
    if (!unlimited && maxCapacity > 0 && currentConfirmed >= maxCapacity) {
      if (!tData.meta?.waitlistEnabled) {
        throw new Error('prereg_full');
      }
      newStatus = 'WAITLIST';
    }

    const regRef = doc(collection(requireDb(), 'tournaments', tournamentId, 'registrations'));
    const variableSymbol = buildVariableSymbol(tData.finance?.vsPrefix, regRef.id);
    const now = serverTimestamp();

    const playerName = input.playerName.trim();
    transaction.set(regRef, {
      id: regRef.id,
      player: {
        name: playerName,
        email: input.email?.trim()?.toLowerCase() || null,
        phone: input.phone?.trim() || null,
        csoRank: input.csoRank ?? null,
        csoPlayerId: input.csoPlayerId ?? null,
        nameKey: input.nameKey ?? null,
      },
      status: newStatus,
      payment: {
        method: input.paymentMethod ?? null,
        variableSymbol,
        amount: tData.finance?.entryFee ?? null,
        isPaid: !!input.isPaid,
        verifiedByAdmin: !!input.isPaid,
        verifiedAt: input.isPaid ? now : null,
      },
      attendance: {
        checkedIn: !!input.checkedIn,
        checkedInAt: input.checkedIn ? now : null,
      },
      createdAt: now,
      updatedAt: now,
      source: 'ADMIN_MANUAL',
    });

    if (newStatus === 'CONFIRMED') {
      transaction.update(tourRef, { 'counters.confirmed': increment(1) });
    } else {
      transaction.update(tourRef, { 'counters.waitlist': increment(1) });
    }

    return { registrationId: regRef.id, status: newStatus, variableSymbol };
  });
}

export async function markRegistrationPaid(tournamentId, regId, method) {
  await updateRegistration(tournamentId, regId, {
    'payment.isPaid': true,
    'payment.verifiedByAdmin': true,
    'payment.verifiedAt': serverTimestamp(),
    'payment.method': method,
  });
}

export async function toggleRegistrationCheckIn(tournamentId, regId, checkedIn) {
  await updateRegistration(tournamentId, regId, {
    'attendance.checkedIn': checkedIn,
    'attendance.checkedInAt': checkedIn ? serverTimestamp() : null,
  });
}
