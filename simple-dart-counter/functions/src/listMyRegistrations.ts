import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { PLAYER_REG_LINKS_COLLECTION } from './playerRegLinks';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');

const PUBLIC_CATALOG_STATUSES = [
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
  'FINISHED',
];

type MyRegistrationItem = {
  tournamentId: string;
  registrationId: string;
  status: string;
  playerName: string | null;
  email: string | null;
  variableSymbol: string | null;
  isPaid: boolean;
  checkedIn: boolean;
  tournament: {
    id: string;
    status: string | null;
    meta: Record<string, unknown> | null;
    finance: Record<string, unknown> | null;
    counters: Record<string, unknown> | null;
    visibility: Record<string, unknown> | null;
  } | null;
};

function normalizeEmail(email?: string | null): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function sanitizeTournament(
  id: string,
  data: DocumentData | undefined
): MyRegistrationItem['tournament'] {
  if (!data) return null;
  const status = data.status != null ? String(data.status) : null;
  if (status === 'DRAFT') return null;
  const meta = { ...((data.meta as Record<string, unknown>) ?? {}) };
  const startsIso = toIsoOrNull(meta.startsAt);
  if (startsIso) meta.startsAt = startsIso;
  else delete meta.startsAt;
  return {
    id,
    status,
    meta,
    finance: (data.finance as Record<string, unknown>) ?? null,
    counters: (data.counters as Record<string, unknown>) ?? null,
    visibility: (data.visibility as Record<string, unknown>) ?? null,
  };
}

function startsAtMs(meta: Record<string, unknown> | null | undefined): number {
  const iso = toIsoOrNull(meta?.startsAt);
  if (!iso) return 0;
  return new Date(iso).getTime() || 0;
}

function itemKey(tournamentId: string, registrationId: string): string {
  return `${tournamentId}_${registrationId}`;
}

async function loadItemFromRegistration(
  tournamentId: string,
  regSnap: DocumentSnapshot
): Promise<MyRegistrationItem | null> {
  if (!regSnap.exists) return null;
  const data = regSnap.data() ?? {};
  const status = String(data.status ?? '');
  if (status === 'CANCELLED' || status === 'NO_SHOW') return null;

  const tourSnap = await db.collection('tournaments').doc(tournamentId).get();
  const tournament = sanitizeTournament(tournamentId, tourSnap.data());
  if (!tournament) return null;

  const player = (data.player ?? {}) as {
    name?: string;
    email?: string | null;
  };
  const payment = (data.payment ?? {}) as {
    variableSymbol?: string | null;
    isPaid?: boolean;
  };
  const attendance = (data.attendance ?? {}) as { checkedIn?: boolean };

  return {
    tournamentId,
    registrationId: regSnap.id,
    status,
    playerName: player.name ? String(player.name) : null,
    email: player.email ? String(player.email) : null,
    variableSymbol: payment.variableSymbol ?? null,
    isPaid: !!payment.isPaid,
    checkedIn: !!attendance.checkedIn,
    tournament,
  };
}

/**
 * Hráčský přehled přihlášek.
 * Enterprise Edition neumožňuje fieldOverrides / collectionGroup single-field indexy,
 * proto:
 * 1) top-level `player_registration_links` (rychlá cesta),
 * 2) fallback: podkolekce registrací u veřejných turnajů (starší přihlášky).
 */
export const listMyRegistrations = onCall(
  {
    region: 'europe-west1',
    invoker: 'public',
    cors: true,
  },
  async (request): Promise<{ items: MyRegistrationItem[] }> => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Pro přehled přihlášek se přihlaste účtem Google.'
      );
    }

    const uid = request.auth.uid;
    const tokenEmail = normalizeEmail(
      (request.auth.token?.email as string | undefined) ?? null
    );
    const isAnonymous = request.auth.token?.firebase?.sign_in_provider === 'anonymous';

    if (isAnonymous) {
      throw new HttpsError(
        'failed-precondition',
        'Pro přehled přihlášek použijte účet Google (ne anonymní přihlášení).'
      );
    }

    logger.info('listMyRegistrations', {
      uid,
      hasEmail: !!tokenEmail,
    });

    try {
      const found = new Map<string, MyRegistrationItem>();

      // 1) Rychlý index
      const linkSnaps: QueryDocumentSnapshot[] = [];
      const byUid = await db
        .collection(PLAYER_REG_LINKS_COLLECTION)
        .where('authUid', '==', uid)
        .limit(100)
        .get();
      linkSnaps.push(...byUid.docs);

      if (tokenEmail) {
        const byEmail = await db
          .collection(PLAYER_REG_LINKS_COLLECTION)
          .where('email', '==', tokenEmail)
          .limit(100)
          .get();
        linkSnaps.push(...byEmail.docs);
      }

      for (const link of linkSnaps) {
        const L = link.data() ?? {};
        const tournamentId = String(L.tournamentId ?? '');
        const registrationId = String(L.registrationId ?? '');
        if (!tournamentId || !registrationId) continue;
        const key = itemKey(tournamentId, registrationId);
        if (found.has(key)) continue;

        const regSnap = await db
          .collection('tournaments')
          .doc(tournamentId)
          .collection('registrations')
          .doc(registrationId)
          .get();
        if (!regSnap.exists) continue;
        const item = await loadItemFromRegistration(tournamentId, regSnap);
        if (item) found.set(key, item);
      }

      // 2) Fallback pro starší registrace bez linku — jen veřejný katalog
      const tours = await db
        .collection('tournaments')
        .where('visibility.isPublic', '==', true)
        .where('status', 'in', PUBLIC_CATALOG_STATUSES)
        .limit(80)
        .get();

      for (const tourDoc of tours.docs) {
        const tournamentId = tourDoc.id;
        const regCol = tourDoc.ref.collection('registrations');

        const addFromQuery = async (field: string, value: string) => {
          const snap = await regCol.where(field, '==', value).limit(5).get();
          for (const regSnap of snap.docs) {
            const key = itemKey(tournamentId, regSnap.id);
            if (found.has(key)) continue;
            const item = await loadItemFromRegistration(tournamentId, regSnap);
            if (item) found.set(key, item);
          }
        };

        await addFromQuery('player.authUid', uid);
        if (tokenEmail) {
          await addFromQuery('player.email', tokenEmail);
        }
      }

      const items = [...found.values()];
      items.sort((a, b) => {
        const ma = startsAtMs(a.tournament?.meta);
        const mb = startsAtMs(b.tournament?.meta);
        if (ma && mb) return ma - mb;
        if (ma) return -1;
        if (mb) return 1;
        return String(a.tournament?.meta?.name ?? '').localeCompare(
          String(b.tournament?.meta?.name ?? ''),
          'cs'
        );
      });

      return { items };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('listMyRegistrations failed', { uid, error: message });
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', message);
    }
  }
);
