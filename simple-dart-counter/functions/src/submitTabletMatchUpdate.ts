import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(getApp(), 'eur3');
const COLLECTION = 'active_tournaments';

type MatchType = 'group' | 'bracket';

type SubmitPayload = {
  pin?: string;
  tabletPassword?: string;
  matchType?: MatchType;
  matchId?: string;
  matchUpdates?: Record<string, unknown>;
};

function cloneJsonSafe<T>(value: T, fallback: T): T {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback)) as T;
  } catch {
    return fallback;
  }
}

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

function isMatchTerminal(m: { status?: string; walkover?: boolean } | null | undefined): boolean {
  const s = m?.status;
  return s === 'completed' || s === 'walkover' || m?.walkover === true;
}

function deriveTournamentStatus(args: {
  tournamentData: unknown;
  groupMatches: unknown[];
  tournamentBracket: unknown[];
}): string {
  if (!args.tournamentData) return 'preparing';
  const gm = Array.isArray(args.groupMatches) ? args.groupMatches : [];
  const bracketMatches = Array.isArray(args.tournamentBracket)
    ? args.tournamentBracket.flatMap((r) => {
        const matches = (r as { matches?: unknown[] })?.matches;
        return Array.isArray(matches) ? matches : [];
      })
    : [];
  const allMatches = [...gm, ...bracketMatches] as Array<{ status?: string; walkover?: boolean }>;
  if (allMatches.length === 0) return 'running';
  return allMatches.every(isMatchTerminal) ? 'finished' : 'running';
}

function findGroupMatchIndex(matches: unknown[], matchId: string): number {
  if (!Array.isArray(matches)) return -1;
  const want = String(matchId ?? '').trim();
  if (!want) return -1;
  return matches.findIndex((m) => {
    const row = m as { matchId?: string; id?: string };
    const mid = row.matchId ?? row.id;
    return mid != null && String(mid) === want;
  });
}

function findBracketMatchLoc(
  bracket: unknown[],
  matchId: string
): { roundIndex: number; matchIndex: number } | null {
  if (!Array.isArray(bracket)) return null;
  const want = String(matchId ?? '').trim();
  if (!want) return null;
  for (let ri = 0; ri < bracket.length; ri++) {
    const list = (bracket[ri] as { matches?: unknown[] })?.matches;
    if (!Array.isArray(list)) continue;
    const mi = list.findIndex((m) => {
      const row = m as { id?: string; matchId?: string };
      const id = row.id ?? row.matchId;
      return id != null && String(id) === want;
    });
    if (mi >= 0) return { roundIndex: ri, matchIndex: mi };
  }
  return null;
}

/**
 * Herní tablet: zápis stavu/výsledku zápasu bez Google loginu.
 * Ověření: platný PIN + (pokud je nastavené) heslo terče z tournamentData.tabletPassword.
 */
export const submitTabletMatchUpdate = onCall(
  {
    region: 'europe-west1',
    invoker: 'public',
    cors: true,
  },
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

    // Bezpečnost: tablet nesmí přes matchUpdates přepsat celý dokument turnaje.
    // Pozn.: `status` u zápasu je povolené (completed / playing / …).
    const forbidden = ['tournamentData', 'groups', 'groupMatches', 'tournamentBracket'];
    for (const key of forbidden) {
      if (Object.prototype.hasOwnProperty.call(patches, key)) {
        throw new HttpsError('invalid-argument', 'Nepovolená pole v aktualizaci zápasu.');
      }
    }

    const ref = db.collection(COLLECTION).doc(pin);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Turnaj s tímto PINem nebyl nalezen.');
    }

    const raw = snap.data() ?? {};
    const td = (raw.tournamentData ?? null) as { tabletPassword?: string } | null;
    const expected =
      td && td.tabletPassword != null ? String(td.tabletPassword).trim().slice(0, 5) : '';
    if (expected !== '') {
      const provided = String(data.tabletPassword ?? '').trim().slice(0, 5);
      if (provided !== expected) {
        throw new HttpsError('permission-denied', 'Neplatné heslo pro herní tablet.');
      }
    }

    let groupMatches: unknown[] = Array.isArray(raw.groupMatches)
      ? cloneJsonSafe(raw.groupMatches, [])
      : [];
    let tournamentBracket: unknown[] = Array.isArray(raw.tournamentBracket)
      ? cloneJsonSafe(raw.tournamentBracket, [])
      : [];

    if (matchType === 'group') {
      const idx = findGroupMatchIndex(groupMatches, matchId);
      if (idx < 0) {
        throw new HttpsError('not-found', 'Zápas ve skupinách nebyl nalezen.');
      }
      groupMatches = groupMatches.map((m, i) =>
        i === idx ? { ...(m as object), ...patches } : m
      );
    } else {
      const loc = findBracketMatchLoc(tournamentBracket, matchId);
      if (!loc) {
        throw new HttpsError('not-found', 'Zápas v pavouku nebyl nalezen.');
      }
      tournamentBracket = tournamentBracket.map((round, ri) => {
        if (ri !== loc.roundIndex) return round;
        const r = round as { matches?: unknown[] };
        const matches = (r.matches || []).map((m, mi) =>
          mi === loc.matchIndex ? { ...(m as object), ...patches } : m
        );
        return { ...r, matches };
      });
    }

    const tournamentData = raw.tournamentData ?? null;
    const groups = Array.isArray(raw.groups) ? raw.groups : [];
    const status = deriveTournamentStatus({
      tournamentData,
      groupMatches,
      tournamentBracket,
    });

    const payload = cloneJsonSafe(
      {
        ...raw,
        tournamentData,
        groups,
        groupMatches,
        tournamentBracket,
        status,
        lastUpdated: new Date().toISOString(),
      },
      null
    );
    if (payload == null) {
      throw new HttpsError('internal', 'Nepodařilo se připravit data pro uložení.');
    }

    await ref.set(payload);

    logger.info('submitTabletMatchUpdate ok', {
      pin,
      matchType,
      matchId,
      keys: Object.keys(patches),
    });

    return { success: true };
  }
);
