import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { ACTIVE_PREREG_STATUSES } from './playerIdentity';

export type CancelledBy = 'PLAYER' | 'ADMIN';

export type ApplyCancelResult = {
  previousStatus: string;
  refundDue: boolean;
  waitlistPromoted: boolean;
  promotedRegistrationId: string | null;
};

function createdAtMs(data: FirebaseFirestore.DocumentData | undefined): number {
  const raw = data?.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (raw && typeof raw.toMillis === 'function') return raw.toMillis();
  if (raw && typeof raw.seconds === 'number') return raw.seconds * 1000;
  return 0;
}

/**
 * Storno přihlášky uvnitř existující transakce.
 * Všechny čtení (turnaj, přihláška, waitlist, partner) musí proběhnout před voláním.
 */
export function applyRegistrationCancel(args: {
  transaction: Transaction;
  tournamentRef: DocumentReference;
  regRef: DocumentReference;
  tourData: FirebaseFirestore.DocumentData;
  regData: FirebaseFirestore.DocumentData;
  cancelledBy: CancelledBy;
  waitlistDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  partnerSnap?: FirebaseFirestore.DocumentSnapshot | null;
}): ApplyCancelResult {
  const { transaction, tournamentRef, regRef, tourData, regData, cancelledBy, waitlistDocs, partnerSnap } =
    args;

  const previousStatus = String(regData.status ?? '');
  const paid = !!((regData.payment ?? {}) as { isPaid?: boolean }).isPaid;
  const refundDue = paid;

  const waitlistEnabled = !!(tourData.meta as { waitlistEnabled?: boolean } | undefined)?.waitlistEnabled;
  let promoteSnap: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  if (previousStatus === 'CONFIRMED' && waitlistEnabled) {
    const sorted = [...waitlistDocs].sort((a, b) => createdAtMs(a.data()) - createdAtMs(b.data()));
    promoteSnap = sorted.find((d) => String(d.data()?.status ?? '') === 'WAITLIST') ?? null;
  }

  const now = FieldValue.serverTimestamp();
  const regUpdate: Record<string, unknown> = {
    status: 'CANCELLED',
    cancelledBy,
    cancelledAt: now,
    updatedAt: now,
  };
  if (refundDue) {
    regUpdate['payment.refundDue'] = true;
  }
  transaction.update(regRef, regUpdate);

  if (partnerSnap?.exists) {
    transaction.update(partnerSnap.ref, {
      'pair.status': 'BROKEN',
      updatedAt: now,
    });
  }

  const counterUpdate: Record<string, unknown> = { updatedAt: now };
  if (previousStatus === 'CONFIRMED') {
    if (promoteSnap) {
      transaction.update(promoteSnap.ref, {
        status: 'CONFIRMED',
        updatedAt: now,
      });
      counterUpdate['counters.waitlist'] = FieldValue.increment(-1);
    } else {
      counterUpdate['counters.confirmed'] = FieldValue.increment(-1);
    }
  } else if (previousStatus === 'WAITLIST') {
    counterUpdate['counters.waitlist'] = FieldValue.increment(-1);
  } else if (previousStatus === 'PENDING_PAYMENT') {
    counterUpdate['counters.pendingPayment'] = FieldValue.increment(-1);
  }
  transaction.update(tournamentRef, counterUpdate);

  return {
    previousStatus,
    refundDue,
    waitlistPromoted: !!promoteSnap,
    promotedRegistrationId: promoteSnap?.id ?? null,
  };
}

export function isCancellableStatus(status: string): boolean {
  return ACTIVE_PREREG_STATUSES.has(status);
}
