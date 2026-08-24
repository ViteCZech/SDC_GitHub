import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { translations } from '../translations';
import { listenToCloudTournament } from '../services/tournamentSync';
import {
  VENUE_CALL_MS,
  VENUE_CAROUSEL_MS,
  VENUE_LISTEN_TIMEOUT_MS,
  boardsOccupancySignature,
  buildVenueDisplayModel,
  detectVenueMatchCalls,
  playVenueGong,
} from '../utils/venueDisplay';
import { calculateGroupStandings } from '../utils/tournamentLogic';

function tv(lang, key) {
  return translations[lang]?.venueDisplay?.[key] ?? translations.cs?.venueDisplay?.[key] ?? key;
}

function boardGridStyle(boardCount) {
  const count = Math.max(1, Number(boardCount) || 1);
  const cols = Math.max(1, Math.ceil(count / 2));
  return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
}

function groupsGridClass(count) {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-2';
  return 'grid-cols-3';
}

function BoardCard({ board, lang, boardCount }) {
  const cur = board.current;
  const next = board.next;
  const hasManyBoards = boardCount >= 7;
  const compact = boardCount >= 8;
  const titleCls = hasManyBoards ? 'text-base xl:text-lg' : 'text-lg xl:text-2xl';
  const scoreCls = compact ? 'text-xl xl:text-2xl' : hasManyBoards ? 'text-2xl xl:text-3xl' : 'text-3xl xl:text-4xl';
  const nowCls = compact ? 'text-lg xl:text-xl' : hasManyBoards ? 'text-xl xl:text-2xl' : 'text-2xl xl:text-3xl';
  const prepCls = compact ? 'text-sm xl:text-base' : hasManyBoards ? 'text-base xl:text-lg' : 'text-lg xl:text-xl';
  const refereeName = cur?.refereeName || next?.refereeName || '—';

  return (
    <article
      className={`flex h-full min-h-[190px] flex-col rounded-2xl border px-4 py-3 ${
        cur?.playing
          ? 'border-amber-400/70 bg-slate-900'
          : cur
            ? 'border-emerald-500/60 bg-slate-900'
            : 'border-slate-800 bg-slate-900/95'
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className={`font-black uppercase tracking-wider text-amber-300 leading-tight ${titleCls}`}>
          {tv(lang, 'board')} {board.board}
        </h2>
        {cur ? (
          <p className={`font-mono font-black tabular-nums text-white leading-tight shrink-0 ${scoreCls}`}>
            {cur.legsP1} : {cur.legsP2}
          </p>
        ) : (
          <p className={`text-slate-600 font-black uppercase tracking-wider leading-tight ${compact ? 'text-sm' : 'text-base xl:text-lg'}`}>
            {tv(lang, 'free')}
          </p>
        )}
      </header>

      <div className="mt-3 flex-1 min-h-0 flex flex-col justify-between gap-3">
        <section className="min-h-0">
          <p className="text-[11px] uppercase tracking-wider font-black text-slate-500 leading-tight">
            {cur?.playing ? tv(lang, 'nowPlaying') : tv(lang, 'prepare')}
          </p>
          {cur ? (
            <p className={`mt-1 font-black text-white leading-tight truncate block ${nowCls}`}>
              {cur.player1Name} <span className="text-slate-500">{tv(lang, 'vs')}</span> {cur.player2Name}
            </p>
          ) : (
            <p className={`mt-1 font-black text-slate-600 uppercase leading-tight ${compact ? 'text-base' : 'text-lg xl:text-xl'}`}>
              {tv(lang, 'free')}
            </p>
          )}
        </section>

        <section className="min-h-0">
          <p className="text-[10px] uppercase tracking-wider font-black text-emerald-400 leading-tight">
            {tv(lang, 'upNext')}
          </p>
          {next ? (
            <p className={`mt-1 font-semibold text-slate-200 leading-tight truncate block ${prepCls}`}>
              {next.player1Name} <span className="text-slate-500">{tv(lang, 'vs')}</span> {next.player2Name}
            </p>
          ) : (
            <p className="mt-1 text-xs font-semibold uppercase text-slate-600 leading-tight">
              {tv(lang, 'preparing')}
            </p>
          )}
        </section>

        <p className="text-gray-400 text-sm leading-tight truncate block border-t border-slate-800 pt-2">
          <span className="font-black uppercase tracking-wider text-slate-500 mr-2">{tv(lang, 'referee')}:</span>
          <span className="font-bold">{refereeName}</span>
        </p>
      </div>
    </article>
  );
}

function GroupsSlide({ groups, lang }) {
  if (!groups.length) {
    return (
      <p className="m-auto text-2xl font-black text-slate-600 uppercase tracking-widest">
        {tv(lang, 'preparing')}
      </p>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto h-full min-h-0">
      <div className={`grid gap-6 min-h-0 h-full ${groupsGridClass(groups.length)}`}>
        {groups.map((g) => (
          <section key={g.groupId} className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 px-4 py-3">
            <h2 className="text-lg xl:text-xl font-black uppercase tracking-wider text-emerald-400 mb-2">
            {g.name}
            </h2>
            <div className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-9" />
                  <col />
                  <col className="w-12" />
                  <col className="w-[4.25rem]" />
                  <col className="w-[4.5rem]" />
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
                    <tr key={row.id ?? row.name} className="border-t border-slate-800 text-sm">
                      <td className="py-1.5 px-2 text-slate-300 font-mono tabular-nums">{idx + 1}</td>
                      <td className="py-1.5 px-2 min-w-0">
                        <span className="block truncate text-slate-100 font-semibold leading-tight">{row.name}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-amber-400 font-mono font-bold tabular-nums">
                        {row.points ?? row.matchesWon}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-200 font-mono tabular-nums">
                        {row.legsWon}:{row.legsLost}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300 font-mono tabular-nums">
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
  const [slideIdx, setSlideIdx] = useState(0);
  const [callQueue, setCallQueue] = useState([]);
  const [soundOn, setSoundOn] = useState(false);
  const audioCtxRef = useRef(null);
  const prevBoardsRef = useRef(null);
  const skipFirstCallRef = useRef(true);

  useEffect(() => {
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

  useEffect(() => {
    if (!model?.boards) return;
    const prev = prevBoardsRef.current;
    prevBoardsRef.current = model.boards;
    if (skipFirstCallRef.current) {
      skipFirstCallRef.current = false;
      return;
    }
    if (boardsOccupancySignature(prev) === model.signature) return;
    setSlideIdx(0);
    const calls = detectVenueMatchCalls(prev, model.boards);
    if (calls.length > 0) {
      setCallQueue((q) => [...q, ...calls]);
    }
  }, [model]);

  const activeCall = callQueue[0] ?? null;

  useEffect(() => {
    if (!activeCall) return undefined;
    if (soundOn) playVenueGong(audioCtxRef.current);
    const id = window.setTimeout(() => {
      setCallQueue((q) => q.slice(1));
    }, VENUE_CALL_MS);
    return () => window.clearTimeout(id);
  }, [activeCall, soundOn]);

  const slides = useMemo(() => {
    const out = [{ type: 'boards' }];
    if (groupsData.length > 0) out.push({ type: 'groups' });
    return out;
  }, [groupsData.length]);
  const canRotate = !activeCall && slides.length > 1;
  const slideSafeIdx = slideIdx % slides.length;
  const slide = slides[slideSafeIdx];

  useEffect(() => {
    if (!canRotate) return undefined;
    const id = window.setInterval(() => {
      setSlideIdx((i) => i + 1);
    }, VENUE_CAROUSEL_MS);
    return () => window.clearInterval(id);
  }, [canRotate, model?.signature, slides.length]);

  const enableSound = async () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        setSoundOn(true);
        return;
      }
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
      setSoundOn(true);
    } catch {
      setSoundOn(true);
    }
  };

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

        {model && slide?.type === 'boards' ? (
          model.boards.length === 0 ? (
            <p className="m-auto text-3xl font-black text-slate-600 uppercase tracking-widest">{tv(lang, 'preparing')}</p>
          ) : (
            <div className="w-full max-w-7xl mx-auto flex-1 min-h-0">
              <div
                className="grid gap-6 h-full auto-rows-fr"
                style={boardGridStyle(model.boards.length)}
              >
                {model.boards.map((b) => (
                  <BoardCard
                    key={b.board}
                    board={b}
                    lang={lang}
                    boardCount={model.boards.length}
                  />
                ))}
              </div>
            </div>
          )
        ) : null}

        {model && slide?.type === 'groups' ? <GroupsSlide groups={groupsData} lang={lang} /> : null}
      </main>

      <CallOverlay call={activeCall} lang={lang} />

      <button
        type="button"
        onClick={() => {
          if (soundOn) {
            setSoundOn(false);
            return;
          }
          void enableSound();
        }}
        className="fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-white hover:border-slate-500"
      >
        {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
        {soundOn ? tv(lang, 'soundOn') : tv(lang, 'activateSound')}
      </button>
    </div>
  );
}
