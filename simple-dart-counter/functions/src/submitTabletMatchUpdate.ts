import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { CALLABLE_PUBLIC } from './authz';
import { validateTabletAuth } from './tabletAuth';
import { loadTabletAuthForPin } from './tournamentSecrets';
import { buildTabletMatchDocPatch } from './tabletMatchPatch';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');
const COLLECTION = 'active_tournaments';

type MatchType = 'group' | 'bracket';

type SubmitPayload = {
  pin?: string;
  tabletPassword?: string;
  board?: string | number;
  boardToken?: string;
  matchType?: MatchType;
  matchId?: string;
  matchUpdates?: Record<string, unknown>;
};

function stripUndefinedDeep(val: unknown): unknown {
  if (val === undefined) return undefined;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((x) => stripUndefinedDeep(x));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (v === undefined) continue;
    const nv = stripUndefinedDeep(v);
    if (nv !== undefined) out[k] = nv;
  }
  return out;
}

/**
 * Herní tablet: zápis stavu/výsledku zápasu bez Google loginu.
 * Ověření: platný PIN + board token nebo neprázdné heslo (tajemství v tournament_secrets).
 * Zápis je transakce jen na groupMatches / tournamentBracket — nesahe na zbytek dokumentu.
 */
export const submitTabletMatchUpdate = onCall(
  CALLABLE_PUBLIC,
  async (request): Promise<{ success: true }> => {
    const data = (request.data ?? {}) as SubmitPayload;
    const pin = String(data.pin ?? '').trim();
    const matchType = data.matchType === 'bracket' ? 'bracket' : data.matchType === 'group' ? 'group' : null;
    const matchId = String(data.matchId ?? '').trim();
    const rawPatches =
      data.matchUpdates && typeof data.matchUpdates === 'object' ? data.matchUpdates : {};
    const patches = stripUndefinedDeep(rawPatches) as Record<string, unknown>;

    if (!/^\d{4}$/.test(pin)) {
      throw new HttpsError('invalid-argument', 'Neplatný PIN turnaje.');
    }
    if (!matchType) {
      throw new HttpsError('invalid-argument', 'Neplatný typ zápasu.');
    }
    if (!matchId) {
      throw new HttpsError('invalid-argument', 'Chybí ID zápasu.');
    }
    if (!patches || typeof patches !== 'object' || Object.keys(patches).length === 0) {
      throw new HttpsError('invalid-argument', 'Chybí data zápasu.');
    }

    const forbidden = ['tournamentData', 'groups', 'groupMatches', 'tournamentBracket'];
    for (const key of forbidden) {
      if (Object.prototype.hasOwnProperty.call(patches, key)) {
        throw new HttpsError('invalid-argument', 'Nepovolená pole v aktualizaci zápasu.');
      }
    }

    const ref = db.collection(COLLECTION).doc(pin);
    const authSnap = await ref.get();
    if (!authSnap.exists) {
      throw new HttpsError('not-found', 'Turnaj s tímto PINem nebyl nalezen.');
    }

    const authRaw = authSnap.data() ?? {};
    const td = (authRaw.tournamentData ?? null) as {
      tabletPassword?: string;
      boardAuthTokens?: Record<string, string>;
    } | null;
    const board = String(data.board ?? '').replace(/\D/g, '').slice(0, 2);
    const boardToken = String(data.boardToken ?? '').trim();
    const tabletPassword = String(data.tabletPassword ?? '').trim().slice(0, 5);
    const authSource = await loadTabletAuthForPin(db, pin, td);
    if (!validateTabletAuth(authSource, board, boardToken, tabletPassword)) {
      throw new HttpsError('permission-denied', 'Neplatné heslo pro herní tablet.');
    }

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          throw new HttpsError('not-found', 'Turnaj s tímto PINem nebyl nalezen.');
        }
        const raw = (snap.data() ?? {}) as Record<string, unknown>;
        let docPatch: ReturnType<typeof buildTabletMatchDocPatch>;
        try {
          docPatch = buildTabletMatchDocPatch({
            raw,
            matchType,
            matchId,
            patches,
          });
        } catch (err) {
          const code = err instanceof Error ? err.message : '';
          if (code === 'not-found-group') {
            throw new HttpsError('not-found', 'Zápas ve skupinách nebyl nalezen.');
          }
          if (code === 'not-found-bracket') {
            throw new HttpsError('not-found', 'Zápas v pavouku nebyl nalezen.');
          }
          throw err;
        }
        tx.update(ref, docPatch);
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw err;
    }

    logger.info('submitTabletMatchUpdate ok', {
      pin,
      matchType,
      matchId,
      keys: Object.keys(patches),
    });

    return { success: true };
  }
);
