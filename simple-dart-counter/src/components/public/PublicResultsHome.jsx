import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, ChevronRight, Crown, Users } from 'lucide-react';
import { translations } from '../../translations';
import { useSyncAdapter } from '../../context/SyncAdapterContext';
import ContextHelpButton from '../ContextHelpButton';

function toLocaleDate(value, lang) {
  if (!value) return '—';
  const locale = lang === 'cs' ? 'cs-CZ' : lang === 'pl' ? 'pl-PL' : 'en-US';
  try {
    if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString(locale);
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(locale);
  } catch {}
  return '—';
}

function PublicTournamentCard({ row, lang, onOpen }) {
  const isLive = row.status === 'live' || row.status === 'running';
  return (
    <button
      type="button"
      onClick={() => onOpen?.(row.id)}
      className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:bg-slate-800 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
            isLive
              ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
              : 'text-slate-400 border-slate-700 bg-slate-800/70'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          {isLive ? 'LIVE' : 'FINISHED'}
        </span>
        <span className="text-[11px] text-slate-500 font-mono">{row.pin ? `PIN ${row.pin}` : row.id}</span>
      </div>

      <h3 className="mt-3 text-lg font-black text-slate-100 leading-tight">{row.name}</h3>
      {row.location ? <p className="text-sm text-slate-400 mt-1">{row.location}</p> : null}

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
        <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Datum</div>
          <div className="font-semibold text-slate-200 mt-1">{toLocaleDate(row.eventStartAt, lang)}</div>
        </div>
        <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Hráči</div>
          <div className="font-semibold text-slate-200 mt-1">{row.playersCount ?? 0}</div>
        </div>
        <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Zápasy</div>
          <div className="font-semibold text-slate-200 mt-1">{row.matchesCount ?? 0}</div>
        </div>
      </div>

      <div className="mt-3 inline-flex items-center gap-1.5 text-emerald-400 font-semibold text-sm">
        Detail turnaje <ChevronRight className="w-4 h-4" />
      </div>
    </button>
  );
}

export default function PublicResultsHome({
  lang = 'cs',
  onOpenTournament,
  onOpenTopPerformances,
  onOpenContextHelp,
}) {
  const syncAdapter = useSyncAdapter();
  const dict = translations?.[lang]?.publicResults ?? translations?.cs?.publicResults ?? {};
  const [feed, setFeed] = useState({ all: [], live: [], finished: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsub = syncAdapter.listenPublicFeed(
      (next) => {
        setError(null);
        setFeed(next);
        setLoading(false);
      },
      () => {
        setError(dict.loadError || 'Nepodařilo se načíst veřejné turnaje.');
        setLoading(false);
      }
    );
    return () => unsub?.();
  }, [dict.loadError, syncAdapter]);

  const summary = useMemo(() => {
    const starts = feed.all.reduce((sum, x) => sum + (Number(x.playersCount) || 0), 0);
    return {
      tournaments: feed.all.length,
      starts,
      live: feed.live.length,
    };
  }, [feed]);

  return (
    <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 p-4 pb-24">
      <div className="w-full max-w-5xl mx-auto space-y-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {dict.title || 'Veřejné turnajové statistiky'}
            </h1>
            <ContextHelpButton
              topicId="public-results"
              lang={lang}
              onOpenContextHelp={onOpenContextHelp}
            />
          </div>
          <p className="text-sm sm:text-base text-slate-400 mt-2">
            {dict.subtitle ||
              'Živé i odehrané turnaje na jednom místě. Otevřete detail turnaje pro zápasy, skupiny, pavouka a výsledky.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenTopPerformances?.()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-purple-500/40 bg-purple-50 text-purple-800 hover:bg-purple-100 transition-colors font-bold text-sm dark:bg-purple-500/10 dark:text-purple-200 dark:hover:bg-purple-500/20"
            >
              <Crown className="w-4 h-4" />
              {dict.topPerformancesCta || 'Top výkony'}
            </button>
          </div>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
              {dict.totalTournaments || 'Turnajů celkem'}
            </div>
            <div className="mt-2 text-2xl font-black text-slate-100">{summary.tournaments}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
              {dict.totalStarts || 'Startů celkem'}
            </div>
            <div className="mt-2 text-2xl font-black text-slate-100">{summary.starts}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
              {dict.liveNow || 'Hraje se teď'}
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-300">{summary.live}</div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-400 text-sm">
            {dict.loading || 'Načítám veřejné turnaje…'}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-600/40 bg-red-900/20 p-5 text-red-200 text-sm">
            {error}
          </div>
        ) : null}

        {!loading && !error && (
          <>
            <section>
              <h2 className="text-sm font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <Activity className="w-4 h-4" /> {dict.liveSection || 'Hraje se teď'}
              </h2>
              {feed.live.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">{dict.noLive || 'Momentálně neběží žádný turnaj.'}</p>
              ) : (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {feed.live.map((row) => (
                    <PublicTournamentCard key={row.id} row={row} lang={lang} onOpen={onOpenTournament} />
                  ))}
                </div>
              )}
            </section>

            <section className="pt-2">
              <h2 className="text-sm font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> {dict.finishedSection || 'Odehrané turnaje'}
              </h2>
              {feed.finished.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">{dict.noFinished || 'Zatím nejsou dostupné žádné odehrané turnaje.'}</p>
              ) : (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {feed.finished.map((row) => (
                    <PublicTournamentCard key={row.id} row={row} lang={lang} onOpen={onOpenTournament} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-2">
          <Users className="w-3.5 h-3.5" />
          {dict.feedHint || 'Data jsou průběžně aktualizována ze živých turnajů a veřejného archivu.'}
        </div>
      </div>
    </main>
  );
}
