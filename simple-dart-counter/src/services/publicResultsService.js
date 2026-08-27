import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const PUBLIC_COLLECTION = 'public_tournaments';
const ACTIVE_COLLECTION = 'active_tournaments';

function toMillis(tsLike) {
  if (!tsLike) return 0;
  if (typeof tsLike?.toMillis === 'function') return tsLike.toMillis();
  if (typeof tsLike?.toDate === 'function') return tsLike.toDate().getTime();
  if (typeof tsLike === 'number') return tsLike;
  if (typeof tsLike === 'string') {
    const ms = Date.parse(tsLike);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function normalizeName(rawName) {
  const trimmed = String(rawName ?? '').trim();
  return trimmed || '(bez názvu)';
}

function getPlayersCount(data) {
  if (Array.isArray(data?.groups)) {
    return data.groups.reduce((sum, g) => sum + (Array.isArray(g?.players) ? g.players.length : 0), 0);
  }
  if (Array.isArray(data?.tournamentData?.players)) return data.tournamentData.players.length;
  if (Array.isArray(data?.players)) return data.players.length;
  return 0;
}

function getMatchesCount(data) {
  const groupMatches = Array.isArray(data?.groupMatches) ? data.groupMatches.length : 0;
  const bracketMatches = Array.isArray(data?.tournamentBracket)
    ? data.tournamentBracket.reduce(
        (sum, r) => sum + (Array.isArray(r?.matches) ? r.matches.length : 0),
        0
      )
    : 0;
  return groupMatches + bracketMatches;
}

function normalizePublicDoc(id, raw) {
  const docData = raw && typeof raw === 'object' ? raw : {};
  const fallback = docData.snapshot && typeof docData.snapshot === 'object' ? docData.snapshot : docData;
  const tournamentData =
    docData.tournamentData ??
    fallback.tournamentData ??
    {};
  const groups = Array.isArray(docData.groups)
    ? docData.groups
    : Array.isArray(fallback.groups)
      ? fallback.groups
      : [];
  const groupMatches = Array.isArray(docData.groupMatches)
    ? docData.groupMatches
    : Array.isArray(fallback.groupMatches)
      ? fallback.groupMatches
      : [];
  const tournamentBracket = Array.isArray(docData.tournamentBracket)
    ? docData.tournamentBracket
    : Array.isArray(fallback.tournamentBracket)
      ? fallback.tournamentBracket
      : [];
  const status = String(docData.status ?? 'finished');
  const pin = String(docData.pin ?? tournamentData.pin ?? '').trim();
  const eventStartAt =
    docData.eventStartAt ??
    tournamentData?.startedAt ??
    tournamentData?.meta?.startedAt ??
    tournamentData?.meta?.startsAt ??
    null;
  const updatedAt = docData.updatedAt ?? null;

  return {
    id,
    pin,
    status,
    source: String(docData.source ?? 'public'),
    name: normalizeName(docData.name ?? tournamentData.name ?? tournamentData.tournamentName),
    location: String(docData.location ?? tournamentData?.venueName ?? '').trim(),
    eventStartAt,
    updatedAt,
    playersCount: Number(docData.playersCount ?? getPlayersCount({ groups, tournamentData })) || 0,
    matchesCount:
      Number(
        docData.matchesCount ??
          getMatchesCount({ groupMatches, tournamentBracket })
      ) || 0,
    tournamentData,
    groups,
    groupMatches,
    tournamentBracket,
  };
}

function normalizeActiveDoc(pin, raw) {
  const tournamentData = raw?.tournamentData ?? {};
  const groups = Array.isArray(raw?.groups) ? raw.groups : [];
  const groupMatches = Array.isArray(raw?.groupMatches) ? raw.groupMatches : [];
  const tournamentBracket = Array.isArray(raw?.tournamentBracket) ? raw.tournamentBracket : [];
  return {
    id: `live-${pin}`,
    pin: String(pin),
    status: 'live',
    source: 'active-fallback',
    name: normalizeName(tournamentData?.name ?? tournamentData?.tournamentName),
    location: String(tournamentData?.venueName ?? '').trim(),
    eventStartAt:
      tournamentData?.startedAt ??
      tournamentData?.meta?.startedAt ??
      tournamentData?.meta?.startsAt ??
      null,
    updatedAt: raw?.lastUpdated ?? null,
    playersCount: getPlayersCount({ groups, tournamentData }),
    matchesCount: getMatchesCount({ groupMatches, tournamentBracket }),
    tournamentData,
    groups,
    groupMatches,
    tournamentBracket,
  };
}

function sortByRelevance(a, b) {
  const aLive = a.status === 'live' || a.status === 'running';
  const bLive = b.status === 'live' || b.status === 'running';
  if (aLive !== bLive) return aLive ? -1 : 1;
  const aMs = Math.max(toMillis(a.updatedAt), toMillis(a.eventStartAt));
  const bMs = Math.max(toMillis(b.updatedAt), toMillis(b.eventStartAt));
  return bMs - aMs;
}

function groupFeed(rows) {
  const sorted = [...rows].sort(sortByRelevance);
  const live = sorted.filter((x) => x.status === 'live' || x.status === 'running');
  const finished = sorted.filter((x) => !(x.status === 'live' || x.status === 'running'));
  return { all: sorted, live, finished };
}

export function listenPublicResultsFeed(callback, onError) {
  if (!db) {
    queueMicrotask(() => callback(groupFeed([])));
    return () => {};
  }

  const publicMap = new Map();
  const activeMap = new Map();

  const emit = () => {
    const merged = new Map(publicMap);
    for (const [id, row] of activeMap.entries()) {
      const hasPublicWithPin = Array.from(merged.values()).some(
        (x) => x.pin && row.pin && String(x.pin) === String(row.pin)
      );
      if (!hasPublicWithPin) merged.set(id, row);
    }
    callback(groupFeed(Array.from(merged.values())));
  };

  const unsubPublic = onSnapshot(
    collection(db, PUBLIC_COLLECTION),
    (snap) => {
      publicMap.clear();
      for (const d of snap.docs) {
        publicMap.set(d.id, normalizePublicDoc(d.id, d.data() || {}));
      }
      emit();
    },
    (err) => {
      console.warn('listenPublicResultsFeed public snapshot error:', err);
      onError?.(err);
    }
  );

  const unsubActive = onSnapshot(
    collection(db, ACTIVE_COLLECTION),
    (snap) => {
      activeMap.clear();
      for (const d of snap.docs) {
        activeMap.set(`live-${d.id}`, normalizeActiveDoc(d.id, d.data() || {}));
      }
      emit();
    },
    (err) => {
      console.warn('listenPublicResultsFeed active snapshot error:', err);
      onError?.(err);
    }
  );

  return () => {
    try {
      unsubPublic?.();
    } catch {}
    try {
      unsubActive?.();
    } catch {}
  };
}

export async function getPublicResultById(resultId) {
  const id = String(resultId ?? '').trim();
  if (!id || !db) return null;

  try {
    const publicSnap = await getDoc(doc(db, PUBLIC_COLLECTION, id));
    const exists = typeof publicSnap.exists === 'function' ? publicSnap.exists() : publicSnap.exists;
    if (exists) return normalizePublicDoc(id, publicSnap.data() || {});
  } catch (err) {
    console.warn('getPublicResultById public read failed:', err);
  }

  const activePin = (() => {
    const live = id.match(/^live-(\d{4})$/i);
    if (live?.[1]) return live[1];
    if (/^\d{4}$/.test(id)) return id;
    return null;
  })();

  if (!activePin) return null;

  try {
    const activeSnap = await getDoc(doc(db, ACTIVE_COLLECTION, activePin));
    const exists = typeof activeSnap.exists === 'function' ? activeSnap.exists() : activeSnap.exists;
    if (!exists) return null;
    return normalizeActiveDoc(activePin, activeSnap.data() || {});
  } catch (err) {
    console.warn('getPublicResultById active fallback failed:', err);
    return null;
  }
}
