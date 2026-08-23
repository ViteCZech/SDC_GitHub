import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { translations } from '../translations';
import { listenToCloudTournament } from '../services/tournamentSync';
import {
  VENUE_CALL_MS,
  VENUE_CAROUSEL_MS,
  boardsOccupancySignature,
  buildVenueDisplayModel,
  detectVenueMatchCalls,
  playVenueGong,
} from '../utils/venueDisplay';

function tv(lang, key) {
  return translations[lang]?.venueDisplay?.[key] ?? translations.cs?.venueDisplay?.[key] ?? key;
}

function boardGridClass(n) {
  if (n <= 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-2';
  if (n <= 4) return 'grid-cols-2';
  if (n <= 6) return 'grid-cols-3';
  return 'grid-cols-4';
}

function BoardCard({ board, lang, huge }) {
  const cur = board.current;
  const nameCls = huge ? 'text-5xl xl:text-7xl' : 'text-3xl xl:text-5xl';
  return (
    <article
      className={`flex min-h-0 flex-col rounded-3xl border-2 px-5 py-4 ${
        cur?.playing
          ? 'border-amber-400 bg-slate-900 shadow-[0_0_40px_rgba(251,191,36,0.18)]'
          : cur
            ? 'border-emerald-500/70 bg-slate-900'
            : 'border-slate-800 bg-slate-950'
      }`}
    >
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="font-black uppercase tracking-[0.25em] text-amber-400 text-2xl xl:text-4xl">
          {tv(lang, 'board')} {board.board}
        </h2>
        {cur ? (
          <p className={`font-mono font-black tabular-nums text-white ${huge ? 'text-6xl xl:text-8xl' : 'text-4xl xl:text-6xl'}`}>
            {cur.legsP1}:{cur.legsP2}
          </p>
        ) : (
          <p className="text-slate-600 font-black uppercase tracking-widest text-xl">{tv(lang, 'free')}</p>
        )}
      </header>

      {cur ? (
        <div className="mt-4 flex-1 flex flex-col justify-center min-h-0">
          <p className="text-[11px] xl:text-sm font-black uppercase tracking-[0.35em] text-slate-500">
            {cur.playing ? tv(lang, 'nowPlaying') : tv(lang, 'prepare')}
          </p>
          <p className={`mt-1 font-black leading-tight text-white break-words ${nameCls}`}>
            {cur.player1Name}
            <span className="mx-3 text-slate-500 font-bold">{tv(lang, 'vs')}</span>
            {cur.player2Name}
          </p>
          {cur.refereeName ? (
            <p className="mt-3 text-xl xl:text-3xl font-bold text-slate-300">
              <span className="text-slate-500 font-black uppercase tracking-widest text-sm xl:text-lg mr-2">
                {tv(lang, 'referee')}
              </span>
              {cur.refereeName}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 flex-1 flex items-center">
          <p className="text-4xl xl:text-6xl font-black text-slate-700 uppercase tracking-widest">{tv(lang, 'free')}</p>
        </div>
      )}

      {board.next ? (
        <footer className="mt-4 pt-3 border-t border-slate-800">
          <p className="text-[11px] xl:text-sm font-black uppercase tracking-[0.3em] text-emerald-400">
            {tv(lang, 'upNext')}
          </p>
          <p className="mt-1 text-2xl xl:text-4xl font-black text-slate-100 leading-tight break-words">
            {board.next.player1Name}
            <span className="mx-2 text-slate-500">{tv(lang, 'vs')}</span>
            {board.next.player2Name}
          </p>
          {board.next.refereeName ? (
            <p className="mt-1 text-lg xl:text-2xl font-bold text-slate-400">
              {tv(lang, 'referee')}: {board.next.refereeName}
            </p>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

function GroupsSlide({ standings, lang }) {
  return (
    <div className={`grid gap-6 min-h-0 flex-1 ${standings.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {standings.map((g) => (
        <section key={g.groupId} className="min-h-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 px-6 py-5">
          <h2 className="text-3xl xl:text-5xl font-black uppercase tracking-widest text-emerald-400 mb-4">
            {g.name}
          </h2>
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-500 text-sm xl:text-xl uppercase tracking-widest">
                <th className="pb-2 font-black">#</th>
                <th className="pb-2 font-black">{tv(lang, 'player')}</th>
                <th className="pb-2 font-black text-right">{tv(lang, 'pts')}</th>
                <th className="pb-2 font-black text-right">{tv(lang, 'legs')}</th>
                <th className="pb-2 font-black text-right">{tv(lang, 'avg')}</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((row, idx) => (
                <tr key={row.id ?? row.name} className="border-t border-slate-800">
                  <td className="py-2 pr-3 font-mono text-2xl xl:text-4xl font-black text-slate-400">{idx + 1}</td>
                  <td className="py-2 text-2xl xl:text-4xl font-black text-white">{row.name}</td>
                  <td className="py-2 text-right font-mono text-2xl xl:text-4xl font-black text-amber-400">
                    {row.points ?? row.matchesWon}
                  </td>
                  <td className="py-2 text-right font-mono text-2xl xl:text-4xl font-bold text-slate-200">
                    {row.legsWon}:{row.legsLost}
                  </td>
                  <td className="py-2 text-right font-mono text-2xl xl:text-4xl font-bold text-slate-300">
                    {Number(row.average ?? 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function StatsSlide({ title, rows, valueKey }) {
  return (
    <section className="flex-1 flex flex-col justify-center rounded-3xl border border-slate-800 bg-slate-900 px-10 py-8">
      <h2 className="text-3xl xl:text-5xl font-black uppercase tracking-[0.25em] text-amber-400">{title}</h2>
      <ol className="mt-10 space-y-6">
        {rows.map((row, idx) => (
          <li key={`${row.name}-${idx}`} className="flex items-center justify-between gap-8">
            <span className="text-4xl xl:text-7xl font-black text-white truncate">{row.name}</span>
            <span className="font-mono text-5xl xl:text-8xl font-black text-amber-400 tabular-nums">
              {row[valueKey]}
            </span>
          </li>
        ))}
      </ol>
    </section>
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
    return listenToCloudTournament(pin, (data) => {
      setDoc(data ?? null);
    });
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

  const slides = model?.slides ?? [{ type: 'boards' }];
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

  return (
    <div className="flex flex-col w-full h-[100dvh] bg-black text-white overflow-hidden select-none">
      <header className="shrink-0 flex items-center justify-between gap-4 px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-slate-900">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">{tv(lang, 'title')}</p>
          <h1 className="text-2xl xl:text-4xl font-black truncate">{statusLine}</h1>
        </div>
        {pin ? (
          <p className="font-mono text-xl xl:text-3xl font-black tracking-[0.3em] text-yellow-400">{pin}</p>
        ) : null}
      </header>

      <main className="flex-1 min-h-0 p-4 xl:p-6 flex flex-col">
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
            <div className={`grid gap-4 xl:gap-5 flex-1 min-h-0 ${boardGridClass(model.boards.length)}`}>
              {model.boards.map((b) => (
                <BoardCard key={b.board} board={b} lang={lang} huge={model.boards.length <= 2} />
              ))}
            </div>
          )
        ) : null}

        {model && slide?.type === 'groups' ? <GroupsSlide standings={slide.standings} lang={lang} /> : null}
        {model && slide?.type === 'top180s' ? (
          <StatsSlide title={tv(lang, 'top180s')} rows={slide.rows} valueKey="count" />
        ) : null}
        {model && slide?.type === 'topCheckouts' ? (
          <StatsSlide title={tv(lang, 'topCheckouts')} rows={slide.rows} valueKey="checkout" />
        ) : null}
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
