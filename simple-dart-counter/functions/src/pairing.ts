import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { ACTIVE_PREREG_STATUSES } from './playerIdentity';

export type CompetitionType = 'singles' | 'doubles' | 'mixed' | 'random_doubles';
export type PairStatus =
  | 'NONE'
  | 'WAITING_PARTNER'
  | 'PENDING_INVITE'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'BROKEN';
export type PlayerGender = 'M' | 'F';
export type FeeMode = 'pair' | 'split';

export function normalizeCompetitionType(raw: unknown): CompetitionType {
  const v = String(raw ?? 'singles');
  if (v === 'doubles' || v === 'mixed' || v === 'random_doubles') return v;
  return 'singles';
}

export function allowsPairing(type: CompetitionType): boolean {
  return type === 'doubles' || type === 'mixed';
}

export function usesTeamCapacity(type: CompetitionType): boolean {
  return type === 'doubles' || type === 'mixed';
}

export function normalizeGender(raw: unknown): PlayerGender | null {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (v === 'M' || v === 'F') return v;
  return null;
}

export function normalizeFeeMode(raw: unknown): FeeMode {
  return String(raw ?? '') === 'pair' ? 'pair' : 'split';
}

export function parseCapacity(meta: { capacity?: unknown } | undefined): number | null {
  const raw = meta?.capacity;
  const n = raw == null ? null : Number(raw);
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function occupiedSlots(tour: FirebaseFirestore.DocumentData): number {
  const type = normalizeCompetitionType(
    (tour.meta as { competitionType?: unknown } | undefined)?.competitionType
  );
  const counters = (tour.counters ?? {}) as { confirmed?: unknown; confirmedTeams?: unknown };
  if (usesTeamCapacity(type)) {
    return Number(counters.confirmedTeams ?? 0) || 0;
  }
  return Number(counters.confirmed ?? 0) || 0;
}

export function pairStatusOf(reg: FirebaseFirestore.DocumentData | undefined): PairStatus {
  const s = String((reg?.pair as { status?: unknown } | undefined)?.status ?? 'NONE');
  if (
    s === 'WAITING_PARTNER' ||
    s === 'PENDING_INVITE' ||
    s === 'CONFIRMED' ||
    s === 'DECLINED' ||
    s === 'BROKEN'
  ) {
    return s;
  }
  return 'NONE';
}

export function canAppearInPartnerList(reg: FirebaseFirestore.DocumentData): boolean {
  if (!ACTIVE_PREREG_STATUSES.has(String(reg.status ?? ''))) return false;
  const st = pairStatusOf(reg);
  return st !== 'CONFIRMED' && st !== 'PENDING_INVITE';
}

export function gendersCompatible(
  compType: CompetitionType,
  g1: PlayerGender | null,
  g2: PlayerGender | null
): boolean {
  if (compType !== 'mixed') return true;
  if (!g1 || !g2) return false;
  return (g1 === 'M' && g2 === 'F') || (g1 === 'F' && g2 === 'M');
}

export function playerGenderOf(reg: FirebaseFirestore.DocumentData | undefined): PlayerGender | null {
  return normalizeGender((reg?.player as { gender?: unknown } | undefined)?.gender);
}

export function emptyPair(): {
  status: 'NONE';
  partnerRegistrationId: null;
  partnerName: null;
  pendingName: null;
  initiatedBy: null;
  inviteToken: null;
} {
  return {
    status: 'NONE',
    partnerRegistrationId: null,
    partnerName: null,
    pendingName: null,
    initiatedBy: null,
    inviteToken: null,
  };
}

export function createdAtMs(data: FirebaseFirestore.DocumentData | undefined): number {
  const raw = data?.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (raw && typeof raw.toMillis === 'function') return raw.toMillis();
  if (raw && typeof raw.seconds === 'number') return raw.seconds * 1000;
  return 0;
}

export function publicPairView(regId: string, reg: FirebaseFirestore.DocumentData) {
  const pair = (reg.pair ?? {}) as {
    partnerRegistrationId?: string | null;
    partnerName?: string | null;
    pendingName?: string | null;
    initiatedBy?: string | null;
  };
  const status = pairStatusOf(reg);
  const initiatedBy = pair.initiatedBy ? String(pair.initiatedBy) : null;
  return {
    status,
    partnerRegistrationId: pair.partnerRegistrationId ? String(pair.partnerRegistrationId) : null,
    partnerName: pair.partnerName || pair.pendingName || null,
    pendingName: pair.pendingName || null,
    initiatedBy,
    canConfirm: status === 'PENDING_INVITE' && !!initiatedBy && initiatedBy !== regId,
    canDecline: status === 'PENDING_INVITE',
    canRequestPartner: status === 'NONE' || status === 'WAITING_PARTNER' || status === 'DECLINED' || status === 'BROKEN',
  };
}

function playerNameOf(reg: FirebaseFirestore.DocumentData | undefined): string {
  return String((reg?.player as { name?: unknown } | undefined)?.name ?? '').trim();
}

export function writePairInvite(args: {
  transaction: Transaction;
  requesterRef: DocumentReference;
  requesterName: string;
  targetRef: DocumentReference;
  targetData: FirebaseFirestore.DocumentData;
  initiatedBy: string;
  inviteToken: string;
  now: FirebaseFirestore.FieldValue;
}): void {
  const { transaction, requesterRef, requesterName, targetRef, targetData, initiatedBy, inviteToken, now } =
    args;
  const targetName = playerNameOf(targetData);
  transaction.update(requesterRef, {
    pair: {
      status: 'PENDING_INVITE',
      partnerRegistrationId: targetRef.id,
      partnerName: targetName || null,
      pendingName: null,
      initiatedBy,
      inviteToken,
    },
    updatedAt: now,
  });
  transaction.update(targetRef, {
    pair: {
      status: 'PENDING_INVITE',
      partnerRegistrationId: requesterRef.id,
      partnerName: requesterName || null,
      pendingName: null,
      initiatedBy,
      inviteToken,
    },
    updatedAt: now,
  });
}

export function applyPairConfirm(args: {
  transaction: Transaction;
  tournamentRef: DocumentReference;
  tourData: FirebaseFirestore.DocumentData;
  aRef: DocumentReference;
  aData: FirebaseFirestore.DocumentData;
  bRef: DocumentReference;
  bData: FirebaseFirestore.DocumentData;
}): { waitlisted: boolean } {
  const { transaction, tournamentRef, tourData, aRef, aData, bRef, bData } = args;
  const meta = (tourData.meta ?? {}) as {
    waitlistEnabled?: boolean;
    competitionType?: unknown;
    capacity?: unknown;
  };
  const finance = (tourData.finance ?? {}) as { feeMode?: unknown };
  const type = normalizeCompetitionType(meta.competitionType);
  const cap = parseCapacity(meta);
  const occupied = occupiedSlots(tourData);
  const now = FieldValue.serverTimestamp();

  let waitlisted = false;
  const counterUpdate: Record<string, unknown> = { updatedAt: now };

  if (usesTeamCapacity(type) && cap != null && occupied >= cap) {
    if (!meta.waitlistEnabled) {
      throw new Error('PAIR_CAPACITY');
    }
    waitlisted = true;
  }

  const aName = playerNameOf(aData);
  const bName = playerNameOf(bData);
  const pairConfirmed = {
    status: 'CONFIRMED' as const,
    pendingName: null,
    initiatedBy: (aData.pair as { initiatedBy?: string } | undefined)?.initiatedBy ?? aRef.id,
    inviteToken: (aData.pair as { inviteToken?: string } | undefined)?.inviteToken ?? null,
  };

  const aPatch: Record<string, unknown> = {
    pair: {
      ...pairConfirmed,
      partnerRegistrationId: bRef.id,
      partnerName: bName || null,
    },
    updatedAt: now,
  };
  const bPatch: Record<string, unknown> = {
    pair: {
      ...pairConfirmed,
      partnerRegistrationId: aRef.id,
      partnerName: aName || null,
    },
    updatedAt: now,
  };

  if (waitlisted) {
    let confirmedDelta = 0;
    let waitlistDelta = 0;
    if (String(aData.status ?? '') === 'CONFIRMED') {
      confirmedDelta -= 1;
      waitlistDelta += 1;
    } else if (String(aData.status ?? '') !== 'WAITLIST') {
      waitlistDelta += 1;
    }
    if (String(bData.status ?? '') === 'CONFIRMED') {
      confirmedDelta -= 1;
      waitlistDelta += 1;
    } else if (String(bData.status ?? '') !== 'WAITLIST') {
      waitlistDelta += 1;
    }
    aPatch.status = 'WAITLIST';
    bPatch.status = 'WAITLIST';
    if (confirmedDelta !== 0) counterUpdate['counters.confirmed'] = FieldValue.increment(confirmedDelta);
    if (waitlistDelta !== 0) counterUpdate['counters.waitlist'] = FieldValue.increment(waitlistDelta);
  } else if (usesTeamCapacity(type)) {
    counterUpdate['counters.confirmedTeams'] = FieldValue.increment(1);
  }

  if (normalizeFeeMode(finance.feeMode) === 'pair') {
    const laterIsA = createdAtMs(aData) > createdAtMs(bData);
    const laterData = laterIsA ? aData : bData;
    const laterPatch = laterIsA ? aPatch : bPatch;
    const paid = !!((laterData.payment ?? {}) as { isPaid?: boolean }).isPaid;
    if (!paid) {
      laterPatch['payment.amount'] = 0;
    }
  }

  transaction.update(aRef, aPatch);
  transaction.update(bRef, bPatch);
  transaction.update(tournamentRef, counterUpdate);
  return { waitlisted };
}

export function applyPairDecline(args: {
  transaction: Transaction;
  actorRef: DocumentReference;
  actorData: FirebaseFirestore.DocumentData;
  partnerRef: DocumentReference;
  partnerData: FirebaseFirestore.DocumentData;
}): void {
  const { transaction, actorRef, actorData, partnerRef, partnerData } = args;
  const now = FieldValue.serverTimestamp();
  const initiatedBy = String(
    (actorData.pair as { initiatedBy?: string } | undefined)?.initiatedBy ??
      (partnerData.pair as { initiatedBy?: string } | undefined)?.initiatedBy ??
      ''
  );
  const actorIsInitiator = initiatedBy === actorRef.id;

  if (actorIsInitiator) {
    transaction.update(actorRef, { pair: emptyPair(), updatedAt: now });
    transaction.update(partnerRef, { pair: emptyPair(), updatedAt: now });
    return;
  }

  transaction.update(partnerRef, {
    pair: {
      status: 'DECLINED',
      partnerRegistrationId: actorRef.id,
      partnerName: playerNameOf(actorData) || null,
      pendingName: null,
      initiatedBy,
      inviteToken: null,
    },
    updatedAt: now,
  });
  transaction.update(actorRef, { pair: emptyPair(), updatedAt: now });
}

export function findOldestWaitlistPair(
  waitlistDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): { a: FirebaseFirestore.QueryDocumentSnapshot; b: FirebaseFirestore.QueryDocumentSnapshot } | null {
  const sorted = [...waitlistDocs].sort((x, y) => createdAtMs(x.data()) - createdAtMs(y.data()));
  const seen = new Set<string>();
  for (const docSnap of sorted) {
    if (seen.has(docSnap.id)) continue;
    const data = docSnap.data() ?? {};
    if (pairStatusOf(data) !== 'CONFIRMED') continue;
    const partnerId = String(
      (data.pair as { partnerRegistrationId?: string } | undefined)?.partnerRegistrationId ?? ''
    ).trim();
    if (!partnerId || partnerId === docSnap.id) continue;
    const partner = waitlistDocs.find((d) => d.id === partnerId);
    if (!partner || pairStatusOf(partner.data()) !== 'CONFIRMED') continue;
    seen.add(docSnap.id);
    seen.add(partner.id);
    return { a: docSnap, b: partner };
  }
  return null;
}
