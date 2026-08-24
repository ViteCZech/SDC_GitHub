import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { translations } from '../translations';
import { listenToCloudTournament } from '../services/tournamentSync';
import {
  VENUE_CALL_MS,
  VENUE_CAROUSEL_MS,
  VENUE_LISTEN_TIMEOUT_MS,
  boardsOccupancySignature,
  buildVenueDisplayModel,
  detectVenueMatchCalls,
} from '../utils/venueDisplay';
import { calculateGroupStandings } from '../utils/tournamentLogic';

function tv(lang, key) {
  return translations[lang]?.venueDisplay?.[key] ?? translations.cs?.venueDisplay?.[key] ?? key;
}

function tt(lang, key, fallback = key) {
  return translations[lang]?.[key] ?? translations.cs?.[key] ?? fallback;
}

function matchIdOf(m) {
  if (!m) return '';
  const id = m.matchId ?? m.id;
  return id != null ? String(id) : '';
}

function isTerminalMatch(m) {
  return m?.status === 'completed' || m?.status === 'walkover' || m?.walkover === true;
}

function toFiniteNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function resolvePlayerName(raw, side, playerNameById) {
  const rawName = side === 1
    ? raw?.player1Name ?? raw?.p1Name
    : raw?.player2Name ?? raw?.p2Name;
  const trimmedRaw = String(rawName ?? '').trim();
  if (trimmedRaw) return trimmedRaw;
  const pid = side === 1 ? raw?.player1Id : raw?.player2Id;
  const fromMap = pid != null ? playerNameById.get(String(pid)) : '';
  return fromMap || (pid != null && String(pid).trim() ? String(pid).trim() : '—');
}

function resolveRefereeName(raw, playerNameById) {
  const explicit = raw?.referee?.name ?? raw?.refereeName;
  if (String(explicit ?? '').trim()) return String(explicit).trim();
  const refId = raw?.referee?.id ?? raw?.refereeId ?? raw?.chalkerId;
  if (refId == null || String(refId).trim() === '') return '';
  return playerNameById.get(String(refId)) || String(refId);
}

function resolveLegs(raw, fallback) {
  const r = raw?.result && typeof raw.result === 'object' ? raw.result : {};
  const p1 = toFiniteNumber(r.p1Legs ?? raw?.legsP1 ?? raw?.score1 ?? raw?.score?.p1 ?? fallback?.legsP1);
  const p2 = toFiniteNumber(r.p2Legs ?? raw?.legsP2 ?? raw?.score2 ?? raw?.score?.p2 ?? fallback?.legsP2);
  return {
    p1: p1 ?? 0,
    p2: p2 ?? 0,
  };
}

function resolveSets(raw) {
  const p1 = toFiniteNumber(raw?.p1Sets ?? raw?.result?.p1Sets);
  const p2 = toFiniteNumber(raw?.p2Sets ?? raw?.result?.p2Sets);
  const setScores = Array.isArray(raw?.setScores)
    ? raw.setScores
    : Array.isArray(raw?.result?.setScores)
      ? raw.result.setScores
      : [];
  return {
    hasSets: (p1 != null && p2 != null) || setScores.length > 0,
    p1: p1 ?? 0,
    p2: p2 ?? 0,
    setScores,
  };
}

function resolveAverages(raw) {
  const p1 = toFiniteNumber(raw?.p1Avg ?? raw?.result?.p1Avg);
  const p2 = toFiniteNumber(raw?.p2Avg ?? raw?.result?.p2Avg);
  return {
    p1: p1 != null && p1 > 0 ? p1 : null,
    p2: p2 != null && p2 > 0 ? p2 : null,
  };
}

function avgText(val) {
  return Number.isFinite(val) ? Number(val).toFixed(2) : '—';
}

function resolveMissingPresence(raw, names, lang) {
  if (!raw || raw.tabletStatus !== 'timeout_warning') return [];
  const present = raw.tabletCheckInPresent;
  const labels = [];
  const p1Name = names?.player1Name || tv(lang, 'player');
  const p2Name = names?.player2Name || tv(lang, 'player');
  const refereeName = names?.refereeName || tv(lang, 'referee');
  const addIfMissing = (isPresent, label) => {
    if (isPresent) return;
    labels.push(label);
  };

  if (present && typeof present === 'object') {
    addIfMissing(!!present.p1, p1Name);
    addIfMissing(!!present.p2, p2Name);
    addIfMissing(!!present.referee, refereeName);
    return labels;
  }

  return [p1Name, p2Name, refereeName];
}

function matchStatusPriority(match) {
  const status = String(match?.status ?? '').toLowerCase();
  if (status === 'playing' || status === 'in_progress') return 0;
  if (String(match?.tabletStatus ?? '') === 'checked_in') return 1;
  if (status === 'pending') return 2;
  if (status === 'completed' || status === 'walkover') return 4;
  return 3;
}

function matchStatusLabel(match, lang) {
  const status = String(match?.status ?? '').toLowerCase();
  if (status === 'playing' || status === 'in_progress') return tv(lang, 'statusPlaying');
  if (status === 'completed' || status === 'walkover') return tv(lang, 'statusDone');
  if (String(match?.tabletStatus ?? '') === 'checked_in') return tv(lang, 'statusReady');
  return tv(lang, 'statusPending');
}

function renderSetBreakdown(setScores) {
  if (!Array.isArray(setScores) || setScores.length === 0) return null;
  return setScores
    .map((setScore) => {
      const p1 = toFiniteNumber(setScore?.p1);
      const p2 = toFiniteNumber(setScore?.p2);
      if (p1 == null || p2 == null) return null;
      return `${p1}:${p2}`;
    })
    .filter(Boolean)
    .join(' · ');
}

function resolveGroupsColumns(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

function resolveGroupsPageSize(groupsData) {
  const total = Array.isArray(groupsData) ? groupsData.length : 0;
  if (total <= 0) return 0;
  const maxRows = (groupsData || []).reduce((max, g) => Math.max(max, g?.rows?.length || 0), 0);
  if (maxRows >= 8) return 4;
  if (maxRows >= 6) return 6;
  return 8;
}

function chunkGroups(groups, size) {
  if (!Array.isArray(groups) || size <= 0) return [];
  const out = [];
  for (let i = 0; i < groups.length; i += size) {
    out.push(groups.slice(i, i + size));
  }
  return out;
}

function buildVenueDevMockDoc() {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const groups = letters.map((letter, idx) => {
    const basePlayers = Array.from({ length: idx === 0 ? 8 : 4 }, (_v, pIdx) => {
      const id = `g${letter}-p${pIdx + 1}`;
      return {
        id,
        name: `${letter} Hráč ${pIdx + 1} Dlouhé Příjmení`,
      };
    });
    return {
      groupId: letter,
      name: `Skupina ${letter}`,
      boards: [((idx % 4) + 1)],
      players: basePlayers,
    };
  });
  const groupMatches = [
    {
      matchId: 'm-a-1',
      groupId: 'A',
      board: 1,
      status: 'playing',
      tabletStatus: 'timeout_warning',
      tabletCheckInPresent: { p1: true, p2: false, referee: false },
      player1Id: 'gA-p1',
      player2Id: 'gA-p2',
      referee: { name: 'A Hráč 3' },
      result: { p1Legs: 1, p2Legs: 1, p1Avg: 66.14, p2Avg: 62.01 },
      p1Avg: 66.14,
      p2Avg: 62.01,
    },
    {
      matchId: 'm-a-2',
      groupId: 'A',
      board: 1,
      status: 'pending',
      player1Id: 'gA-p4',
      player2Id: 'gA-p5',
      referee: { name: 'A Hráč 6' },
    },
    {
      matchId: 'm-b-1',
      groupId: 'B',
      board: 2,
      status: 'playing',
      tabletStatus: 'checked_in',
      player1Id: 'gB-p1',
      player2Id: 'gB-p2',
      referee: { name: 'B Hráč 3' },
      result: { p1Legs: 2, p2Legs: 0, p1Avg: 71.44, p2Avg: 57.3 },
      p1Avg: 71.44,
      p2Avg: 57.3,
    },
    {
      matchId: 'm-c-1',
      groupId: 'C',
      board: 3,
      status: 'pending',
      player1Id: 'gC-p1',
      player2Id: 'gC-p2',
      referee: { name: 'C Hráč 3' },
    },
    {
      matchId: 'm-d-1',
      groupId: 'D',
      board: 4,
      status: 'completed',
      player1Id: 'gD-p1',
      player2Id: 'gD-p2',
      referee: { name: 'D Hráč 3' },
      result: { p1Legs: 2, p2Legs: 1, p1Avg: 63.9, p2Avg: 60.7 },
    },
  ];
  const tournamentBracket = [
    {
      round: 1,
      matches: [
        {
          id: 'b-qf-1',
          board: 1,
          status: 'playing',
          player1Id: 'gA-p1',
          player2Id: 'gB-p1',
          referee: { name: 'E Hráč 1' },
          p1Sets: 1,
          p2Sets: 0,
          setScores: [{ p1: 2, p2: 1 }, { p1: 1, p2: 0 }],
          score: { p1: 1, p2: 0 },
          p1Avg: 74.12,
          p2Avg: 68.87,
        },
        {
          id: 'b-qf-2',
          board: 2,
          status: 'pending',
          tabletStatus: 'timeout_warning',
          tabletCheckInPresent: { p1: false, p2: true, referee: true },
          player1Id: 'gC-p1',
          player2Id: 'gD-p1',
          referee: { name: 'F Hráč 1' },
          score: { p1: 0, p2: 0 },
        },
      ],
    },
    {
      round: 2,
      matches: [
        {
          id: 'b-sf-1',
          board: 3,
          status: 'pending',
          player1Name: 'Vítěz QF1',
          player2Name: 'Vítěz QF2',
          referee: { name: 'Čeká na poraženého' },
          score: { p1: 0, p2: 0 },
        },
      ],
    },
    {
      round: 3,
      matches: [
        {
          id: 'b-final-1',
          board: 1,
          status: 'pending',
          player1Name: 'Vítěz SF1',
          player2Name: 'Vítěz SF2',
          refereeName: 'Čeká na poraženého',
          score: { p1: 0, p2: 0 },
        },
      ],
    },
  ];
  return {
    status: 'running',
    tournamentData: {
      name: 'TV Demo Open',
      numBoards: 4,
      prelimLegs: 3,
      groups,
    },
    groups,
    groupMatches,
    tournamentBracket,
  };
}

function shouldUseVenueDevMock(pin, invalidPin) {
  if (!import.meta.env.DEV || invalidPin || !pin || typeof window === 'undefined') return false;
  try {
    const search = new URLSearchParams(window.location.search || '');
    return search.get('mock') === '1';
  } catch {
    return false;
  }
}

function TwoLineName({ text, className = '' }) {
  return (
    <span
      className={className}
      style={{
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </span>
  );
}

function LiveMatchCard({ board, lang }) {
  const match = board.current || board.next;
  if (!match) return null;
  const isNow = !!board.current;
  const scoreMain = match.hasSets
    ? `${match.p1Sets} : ${match.p2Sets}`
    : `${match.legsP1} : ${match.legsP2}`;
  const scoreSub = match.hasSets ? `${tv(lang, 'legs')}: ${match.legsP1}:${match.legsP2}` : null;
  const setBreakdown = renderSetBreakdown(match.setScores);
  return (
    <article
      className={`rounded-xl border px-3 py-3 ${
        match.playing
          ? 'border-amber-400/70 bg-slate-900'
          : isNow
            ? 'border-emerald-500/60 bg-slate-900'
            : 'border-slate-800 bg-slate-900/95'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            {tv(lang, 'board')} {board.board} · {isNow ? tv(lang, 'nowPlaying') : tv(lang, 'upNext')}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
            {matchStatusLabel(match, lang)}
          </p>
        </div>
        <div className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-right">
          <p className="font-mono text-2xl font-black leading-tight tabular-nums text-white">{scoreMain}</p>
          {scoreSub ? <p className="font-mono text-[10px] font-bold tabular-nums text-slate-400">{scoreSub}</p> : null}
        </div>
      </header>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TwoLineName text={match.player1Name} className="text-sm xl:text-base font-black text-slate-100 leading-tight min-h-[2.5rem]" />
        <span className="text-[10px] xl:text-xs font-black uppercase tracking-widest text-slate-500">{tv(lang, 'vs')}</span>
        <TwoLineName text={match.player2Name} className="text-sm xl:text-base font-black text-slate-100 leading-tight text-right min-h-[2.5rem]" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-800 pt-2 text-xs xl:text-sm">
        <p className="text-slate-400">
          <span className="font-black uppercase tracking-wider text-slate-500">{tv(lang, 'referee')}:</span>{' '}
          <span className="font-semibold text-slate-200">{match.refereeName || '—'}</span>
        </p>
        <p className="font-mono tabular-nums text-slate-300">
          {tv(lang, 'avg')}: {avgText(match.p1Avg)} / {avgText(match.p2Avg)}
        </p>
      </div>

      {setBreakdown ? (
        <p className="mt-2 text-[11px] font-mono text-slate-400">
          {tv(lang, 'sets')}: {setBreakdown}
        </p>
      ) : null}

      {match.missingPresence.length > 0 ? (
        <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-900/30 px-2.5 py-2 text-[11px] text-amber-100">
          <p className="flex items-center gap-1 font-black uppercase tracking-wider">
            <AlertTriangle className="h-3.5 w-3.5" />
            {tv(lang, 'presenceWarning')}
          </p>
          <p className="mt-1 leading-snug">
            {match.missingPresence.join(', ')}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function GroupsSlide({ groups, lang, blockIndex = 0, blockCount = 1 }) {
  if (!groups.length) {
    return (
      <p className="m-auto text-2xl font-black text-slate-600 uppercase tracking-widest text-center px-4">
        {tv(lang, 'preparing')}
      </p>
    );
  }

  const groupColumns = resolveGroupsColumns(groups.length);
  return (
    <div className="w-full h-full min-h-0 flex flex-col">
      {blockCount > 1 ? (
        <div className="shrink-0 mb-2 text-right">
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
            {tv(lang, 'groupsPage')} {blockIndex + 1}/{blockCount}
          </span>
        </div>
      ) : null}
      <div
        className="grid gap-4 min-h-0 h-full auto-rows-fr"
        style={{ gridTemplateColumns: `repeat(${groupColumns}, minmax(0, 1fr))` }}
      >
        {groups.map((g) => (
          <section key={g.groupId} className="h-full min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 px-3 py-3">
            <h2 className="text-base xl:text-lg font-black uppercase tracking-wider text-emerald-400 mb-2">
              {g.name}
            </h2>
            <div className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-9" />
                  <col />
                  <col className="w-12 xl:w-14" />
                  <col className="w-[4.25rem]" />
                  <col className="w-[4.75rem]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-700 text-slate-500 text-[10px] uppercase tracking-wider">
                    <th className="py-1.5 px-2 font-black">#</th>
                    <th className="py-1.5 px-2 font-black">{tv(lang, 'player')}</th>
                    <th className="py-1.5 px-2 font-black text-right">{tv(lang, 'pts')}</th>
                    <th className="py-1.5 px-2 font-black text-right">{tv(lang, 'legs')}</th>
                    <th className="py-1.5 px-2 font-black text-right">{tv(lang, 'avg')}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((row, idx) => (
                    <tr key={row.id ?? row.name} className="border-t border-slate-800 text-xs xl:text-sm">
                      <td className="py-1.5 px-2 text-slate-300 font-mono tabular-nums align-top">{idx + 1}</td>
                      <td className="py-1.5 px-2 min-w-0">
                        <TwoLineName
                          text={row.name}
                          className="text-slate-100 font-semibold leading-tight min-h-[2.15rem]"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right text-amber-400 font-mono font-bold tabular-nums align-top">
                        {row.points ?? row.matchesWon}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-200 font-mono tabular-nums align-top">
                        {row.legsWon}:{row.legsLost}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300 font-mono tabular-nums align-top">
                        {Number(row.average ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CallOverlay({ call, lang }) {
  if (!call) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black px-8 text-center"
      role="alert"
    >
      <p className="font-black uppercase tracking-[0.4em] text-amber-400 text-4xl sm:text-6xl xl:text-8xl">
        {tv(lang, 'callBoard').replace('{n}', String(call.board))}
      </p>
      <p className="mt-8 font-black text-white leading-tight text-4xl sm:text-6xl xl:text-8xl break-words max-w-[96vw]">
        {call.player1Name}
        <span className="mx-4 text-slate-500">{tv(lang, 'vs')}</span>
        {call.player2Name}
      </p>
      {call.refereeName ? (
        <p className="mt-8 text-slate-300 font-bold text-2xl sm:text-4xl xl:text-6xl">
          ({tv(lang, 'referee')}: {call.refereeName})
        </p>
      ) : null}
    </div>
  );
}

/**
 * Kiosk TV obrazovka — jen čte active_tournaments/{pin}.
 */
export default function VenueDisplayView({ pin, lang = 'cs', invalidPin = false }) {
  const [doc, setDoc] = useState(undefined);
  const [screenIdx, setScreenIdx] = useState(0);
  const [callQueue, setCallQueue] = useState([]);
  const prevBoardsRef = useRef(null);
  const skipFirstCallRef = useRef(true);

  useEffect(() => {
    if (shouldUseVenueDevMock(pin, invalidPin)) {
      setDoc(buildVenueDevMockDoc());
      return undefined;
    }
    if (invalidPin || !pin) {
      setDoc(null);
      return undefined;
    }
    setDoc(undefined);
    const unsub = listenToCloudTournament(pin, (data) => {
      setDoc(data ?? null);
    });
    const timeoutId = window.setTimeout(() => {
      setDoc((prev) => (prev === undefined ? null : prev));
    }, VENUE_LISTEN_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeoutId);
      unsub?.();
    };
  }, [pin, invalidPin]);

  useEffect(() => {
    let wakeLock = null;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        /* battery saver / permission */
      }
    };
    const release = async () => {
      try {
        if (wakeLock) await wakeLock.release();
      } catch {
        /* ignore */
      }
      wakeLock = null;
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') acquire();
      else release();
    };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      release();
    };
  }, []);

  const model = useMemo(() => (doc ? buildVenueDisplayModel(doc) : null), [doc]);

  const playerNameById = useMemo(() => {
    const byId = new Map();
    const pushList = (list) => {
      for (const p of list || []) {
        const id = p?.id;
        const name = p?.name;
        if (id == null || !String(id).trim()) continue;
        if (name == null || !String(name).trim()) continue;
        byId.set(String(id), String(name).trim());
      }
    };
    const unpacked = model?.unpacked;
    pushList(unpacked?.tournamentData?.players);
    pushList((unpacked?.groups || []).flatMap((g) => g?.players || []));
    pushList((unpacked?.tournamentData?.groups || []).flatMap((g) => g?.players || []));
    return byId;
  }, [model]);

  const rawMatchById = useMemo(() => {
    const byId = new Map();
    const add = (m) => {
      const id = matchIdOf(m);
      if (id) byId.set(id, m);
    };
    const unpacked = model?.unpacked;
    for (const m of unpacked?.groupMatches || []) add(m);
    for (const round of unpacked?.tournamentBracket || []) {
      for (const m of round?.matches || []) add(m);
    }
    return byId;
  }, [model]);

  const hydrateDisplayMatch = (summary) => {
    if (!summary) return null;
    const raw = rawMatchById.get(summary.matchId) || null;
    const names = {
      player1Name: summary.player1Name || resolvePlayerName(raw, 1, playerNameById),
      player2Name: summary.player2Name || resolvePlayerName(raw, 2, playerNameById),
      refereeName: summary.refereeName || resolveRefereeName(raw, playerNameById),
    };
    const legs = resolveLegs(raw, summary);
    const sets = resolveSets(raw);
    const averages = resolveAverages(raw);
    return {
      ...summary,
      ...names,
      legsP1: legs.p1,
      legsP2: legs.p2,
      hasSets: sets.hasSets,
      p1Sets: sets.p1,
      p2Sets: sets.p2,
      setScores: sets.setScores,
      p1Avg: averages.p1,
      p2Avg: averages.p2,
      status: String(raw?.status ?? summary.status ?? 'pending'),
      tabletStatus: String(raw?.tabletStatus ?? summary.tabletStatus ?? ''),
      missingPresence: resolveMissingPresence(raw, names, lang),
      playing:
        summary.playing ||
        raw?.status === 'playing' ||
        raw?.status === 'in_progress' ||
        raw?.tabletStatus === 'checked_in',
    };
  };

  const enrichedBoards = useMemo(() => {
    if (!model?.boards?.length) return [];
    return model.boards.map((board) => ({
      ...board,
      current: hydrateDisplayMatch(board.current),
      next: hydrateDisplayMatch(board.next),
    }));
  }, [model, rawMatchById, playerNameById, lang]);

  const liveMatches = useMemo(() => {
    return enrichedBoards
      .map((board) => ({
        board: board.board,
        current: board.current,
        next: board.next,
      }))
      .filter((entry) => entry.current || entry.next)
      .sort((a, b) => {
        const aMatch = a.current || a.next;
        const bMatch = b.current || b.next;
        const statusDiff = matchStatusPriority(aMatch) - matchStatusPriority(bMatch);
        if (statusDiff !== 0) return statusDiff;
        return Number(a.board) - Number(b.board);
      });
  }, [enrichedBoards]);

  const groupsData = useMemo(() => {
    const unpacked = model?.unpacked;
    if (!unpacked?.groups?.length) return [];
    const gm = Array.isArray(unpacked.groupMatches) ? unpacked.groupMatches : [];
    return unpacked.groups
      .map((g) => {
        const groupId = g.groupId ?? g.id ?? g.name ?? '';
        const rows = calculateGroupStandings(
          Array.isArray(g.players) ? g.players : [],
          gm.filter((m) => String(m.groupId ?? m.group ?? '') === String(groupId))
        );
        return {
          groupId: String(groupId),
          name: String(g.name || `${tv(lang, 'group')} ${groupId}`),
          rows,
        };
      })
      .filter((g) => g.groupId && g.rows.length > 0);
  }, [model, lang]);
  const groupsPageSize = useMemo(() => resolveGroupsPageSize(groupsData), [groupsData]);
  const groupSlides = useMemo(() => {
    const pageSize = groupsPageSize;
    if (!pageSize) return [];
    const blocks = chunkGroups(groupsData, pageSize);
    return blocks.map((groups, index) => ({
      type: 'groups',
      groups,
      blockIndex: index,
      blockCount: blocks.length,
    }));
  }, [groupsData, groupsPageSize]);

  const bracketOverview = useMemo(() => {
    const unpacked = model?.unpacked;
    const rounds = Array.isArray(unpacked?.tournamentBracket) ? unpacked.tournamentBracket : [];
    if (rounds.length === 0) {
      return {
        hasBracket: false,
        phaseName: '',
        roundIndex: 0,
        roundCount: 0,
        completedMatches: 0,
        totalMatches: 0,
        matches: [],
      };
    }
    const normalizedRounds = rounds.map((round, roundIndex) => {
      const matches = (round?.matches || []).filter((m) => {
        if (!m || m.isBye) return false;
        const hasP1 = m.player1Id != null || String(m.player1Name ?? m.p1Name ?? '').trim() !== '';
        const hasP2 = m.player2Id != null || String(m.player2Name ?? m.p2Name ?? '').trim() !== '';
        return hasP1 && hasP2;
      });
      return { roundIndex, matches };
    });
    const totalMatches = normalizedRounds.reduce((sum, round) => sum + round.matches.length, 0);
    const completedMatches = normalizedRounds.reduce(
      (sum, round) => sum + round.matches.filter((m) => isTerminalMatch(m)).length,
      0
    );

    let activeRoundIndex = normalizedRounds.findIndex((round) =>
      round.matches.some((m) => !isTerminalMatch(m))
    );
    if (activeRoundIndex < 0) activeRoundIndex = Math.max(0, normalizedRounds.length - 1);
    const activeRound = normalizedRounds[activeRoundIndex];
    const openMatches = (activeRound?.matches || []).filter((m) => !isTerminalMatch(m));
    const sourceMatches = openMatches.length > 0 ? openMatches : (activeRound?.matches || []);
    const matches = sourceMatches
      .map((raw) => {
        const names = {
          player1Name: resolvePlayerName(raw, 1, playerNameById),
          player2Name: resolvePlayerName(raw, 2, playerNameById),
          refereeName: resolveRefereeName(raw, playerNameById),
        };
        const legs = resolveLegs(raw);
        const sets = resolveSets(raw);
        const averages = resolveAverages(raw);
        return {
          ...raw,
          ...names,
          legsP1: legs.p1,
          legsP2: legs.p2,
          hasSets: sets.hasSets,
          p1Sets: sets.p1,
          p2Sets: sets.p2,
          setScores: sets.setScores,
          p1Avg: averages.p1,
          p2Avg: averages.p2,
          status: String(raw?.status ?? 'pending'),
          tabletStatus: String(raw?.tabletStatus ?? ''),
          missingPresence: resolveMissingPresence(raw, names, lang),
        };
      })
      .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b))
      .slice(0, 8);

    const totalRounds = normalizedRounds.length;
    const prelimLegs = unpacked?.tournamentData?.prelimLegs;
    const phaseName = (() => {
      if (activeRoundIndex === 0 && prelimLegs != null && Number(prelimLegs) > 0) {
        return tt(lang, 'tournPrelimLabel', 'Předkolo');
      }
      const diff = totalRounds - activeRoundIndex;
      if (diff === 1) return tt(lang, 'tournRoundFinal', 'Finále');
      if (diff === 2) return tt(lang, 'tournRoundSemi', 'Semifinále');
      if (diff === 3) return tt(lang, 'tournRoundQuarter', 'Čtvrtfinále');
      const key = tt(lang, 'tournRoundLastN', 'Top {n}');
      return String(key).replace('{n}', String(Math.pow(2, diff)));
    })();

    return {
      hasBracket: true,
      phaseName,
      roundIndex: activeRoundIndex,
      roundCount: totalRounds,
      completedMatches,
      totalMatches,
      matches,
    };
  }, [model, playerNameById, lang]);

  useEffect(() => {
    if (!model?.boards) return;
    const prev = prevBoardsRef.current;
    prevBoardsRef.current = model.boards;
    if (skipFirstCallRef.current) {
      skipFirstCallRef.current = false;
      return;
    }
    if (boardsOccupancySignature(prev) === model.signature) return;
    setScreenIdx(0);
    const calls = detectVenueMatchCalls(prev, model.boards);
    if (calls.length > 0) {
      setCallQueue((q) => [...q, ...calls]);
    }
  }, [model]);

  const activeCall = callQueue[0] ?? null;

  useEffect(() => {
    if (!activeCall) return undefined;
    const id = window.setTimeout(() => {
      setCallQueue((q) => q.slice(1));
    }, VENUE_CALL_MS);
    return () => window.clearTimeout(id);
  }, [activeCall]);

  const slides = useMemo(() => {
    const out = [];
    if (groupSlides.length > 0) out.push(...groupSlides);
    out.push({ type: 'live' });
    return out;
  }, [groupSlides]);

  const activeSlide = slides[screenIdx % slides.length];

  useEffect(() => {
    setScreenIdx(0);
  }, [slides.length, model?.signature]);

  useEffect(() => {
    if (activeCall || slides.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setScreenIdx((i) => i + 1);
    }, VENUE_CAROUSEL_MS);
    return () => window.clearInterval(id);
  }, [activeCall, slides.length, model?.signature]);

  const statusLine = invalidPin
    ? tv(lang, 'invalidPin')
    : doc === undefined
      ? tv(lang, 'loading')
      : doc === null
        ? tv(lang, 'notFound')
        : model?.status === 'finished'
          ? tv(lang, 'finished')
          : model?.name || tv(lang, 'title');

  const showEmpty = invalidPin || doc === null;
  const showLoading = !invalidPin && doc === undefined;
  const viewState = showEmpty ? 'empty' : showLoading ? 'loading' : 'ready';

  return (
    <div
      data-testid="venue-display"
      className="flex flex-col w-full h-[100dvh] bg-black text-white overflow-hidden select-none"
    >
      <header className="shrink-0 flex items-center justify-between gap-4 px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-slate-900">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">{tv(lang, 'title')}</p>
          <h1 className="text-2xl xl:text-4xl font-black truncate">{statusLine}</h1>
        </div>
        {pin ? (
          <p className="font-mono text-xl xl:text-3xl font-black tracking-[0.3em] text-yellow-400">{pin}</p>
        ) : null}
      </header>

      <main
        className="flex-1 min-h-0 p-4 xl:p-6 flex flex-col"
        data-testid="venue-display-status"
        data-state={viewState}
      >
        {showLoading ? (
          <p className="m-auto text-4xl font-black text-slate-600 uppercase tracking-widest">{tv(lang, 'loading')}</p>
        ) : null}

        {showEmpty ? (
          <p className="m-auto text-4xl xl:text-6xl font-black text-slate-400 text-center px-6">{statusLine}</p>
        ) : null}

        {model && activeSlide?.type === 'groups' ? (
          <section className="w-full h-full min-h-0 rounded-2xl border border-slate-800 bg-slate-950/85 p-3 xl:p-4 flex flex-col">
            <div className="mb-3 flex items-start justify-between gap-3 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                  {tv(lang, 'groups')}
                </p>
                <h2 className="text-lg xl:text-2xl font-black text-white">{tv(lang, 'groupTables')}</h2>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                {tv(lang, 'groupsPerScreen').replace('{n}', String(groupsPageSize || 0))}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <GroupsSlide
                groups={activeSlide.groups}
                lang={lang}
                blockIndex={activeSlide.blockIndex}
                blockCount={activeSlide.blockCount}
              />
            </div>
          </section>
        ) : null}

        {model && activeSlide?.type === 'live' ? (
          <div className="w-full h-full min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 xl:gap-6">
            <section className="min-h-0 rounded-2xl border border-slate-800 bg-slate-950/85 p-3 xl:p-4 flex flex-col">
              <div className="mb-3 shrink-0">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                  {tv(lang, 'liveMatches')}
                </p>
                <h2 className="text-lg xl:text-2xl font-black text-white">{tv(lang, 'currentBoards')}</h2>
              </div>
              <div className="min-h-0 flex-1 overflow-auto space-y-3 pr-1">
                {liveMatches.length > 0 ? (
                  liveMatches.map((board) => (
                    <LiveMatchCard key={board.board} board={board} lang={lang} />
                  ))
                ) : (
                  <p className="m-auto text-center text-xl font-black text-slate-600 uppercase tracking-widest">
                    {tv(lang, 'preparing')}
                  </p>
                )}
              </div>
            </section>

            <section className="min-h-0 rounded-2xl border border-slate-800 bg-slate-950/85 p-3 xl:p-4 flex flex-col">
              <div className="mb-3 shrink-0">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                  {tv(lang, 'bracket')}
                </p>
                <h2 className="text-lg xl:text-2xl font-black text-white">
                  {bracketOverview.hasBracket ? bracketOverview.phaseName : tv(lang, 'waitingForBracket')}
                </h2>
                {bracketOverview.hasBracket ? (
                  <p className="mt-1 text-xs text-slate-400 font-semibold">
                    {tv(lang, 'phaseRound')
                      .replace('{round}', String(bracketOverview.roundIndex + 1))
                      .replace('{total}', String(bracketOverview.roundCount))}
                    {' · '}
                    {tv(lang, 'phaseProgress')
                      .replace('{done}', String(bracketOverview.completedMatches))
                      .replace('{all}', String(bracketOverview.totalMatches))}
                  </p>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-auto space-y-3 pr-1">
                {!bracketOverview.hasBracket ? (
                  <p className="m-auto text-center text-xl font-black text-slate-600 uppercase tracking-widest">
                    {tv(lang, 'waitingForBracket')}
                  </p>
                ) : bracketOverview.matches.length === 0 ? (
                  <p className="m-auto text-center text-lg font-black text-slate-500 uppercase tracking-wider">
                    {tv(lang, 'noActiveBracketMatches')}
                  </p>
                ) : (
                  bracketOverview.matches.map((match, idx) => {
                    const scoreMain = match.hasSets
                      ? `${match.p1Sets} : ${match.p2Sets}`
                      : `${match.legsP1} : ${match.legsP2}`;
                    const scoreSub = match.hasSets ? `${tv(lang, 'legs')}: ${match.legsP1}:${match.legsP2}` : null;
                    const setBreakdown = renderSetBreakdown(match.setScores);
                    return (
                      <article key={match.id ?? match.matchId ?? `${idx}-${match.player1Name}-${match.player2Name}`} className="rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-3">
                        <header className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                              {tv(lang, 'board')} {match.board ?? '—'}
                            </p>
                            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
                              {matchStatusLabel(match, lang)}
                            </p>
                          </div>
                          <div className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-right">
                            <p className="font-mono text-xl font-black leading-tight tabular-nums text-white">
                              {scoreMain}
                            </p>
                            {scoreSub ? (
                              <p className="font-mono text-[10px] font-bold tabular-nums text-slate-400">
                                {scoreSub}
                              </p>
                            ) : null}
                          </div>
                        </header>
                        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <TwoLineName text={match.player1Name} className="text-sm font-black text-slate-100 min-h-[2.2rem]" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{tv(lang, 'vs')}</span>
                          <TwoLineName text={match.player2Name} className="text-sm font-black text-slate-100 text-right min-h-[2.2rem]" />
                        </div>
                        <div className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-300 flex items-center justify-between gap-3">
                          <p>
                            <span className="font-black uppercase tracking-wider text-slate-500">{tv(lang, 'referee')}:</span>{' '}
                            <span className="font-semibold text-slate-200">{match.refereeName || '—'}</span>
                          </p>
                          <p className="font-mono tabular-nums">
                            {tv(lang, 'avg')}: {avgText(match.p1Avg)} / {avgText(match.p2Avg)}
                          </p>
                        </div>
                        {setBreakdown ? (
                          <p className="mt-2 text-[11px] font-mono text-slate-400">
                            {tv(lang, 'sets')}: {setBreakdown}
                          </p>
                        ) : null}
                        {match.missingPresence.length > 0 ? (
                          <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-900/30 px-2.5 py-2 text-[11px] text-amber-100">
                            <p className="flex items-center gap-1 font-black uppercase tracking-wider">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {tv(lang, 'presenceWarning')}
                            </p>
                            <p className="mt-1 leading-snug">
                              {match.missingPresence.join(', ')}
                            </p>
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        ) : null}
      </main>

      <CallOverlay call={activeCall} lang={lang} />
    </div>
  );
}
