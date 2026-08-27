import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Crown, Flame, Gauge, Target } from 'lucide-react';
import { translations } from '../../translations';
import { listenPublicResultsFeed } from '../../services/publicResultsService';
import { calculateTournamentStats } from '../../utils/tournamentLogic';

function PerformanceCard({ title, subtitle, value, by, tournamentName, onOpenTournament, tournamentId, accent }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{title}</div>
      <div className={`mt-2 text-3xl font-black ${accent}`}>{value}</div>
      <p className="mt-2 text-sm text-slate-300">
        <span className="font-semibold">{by}</span>
      </p>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      {tournamentName ? (
        <button
          type="button"
          onClick={() => tournamentId && onOpenTournament?.(tournamentId)}
          className="mt-3 text-xs font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
        >
          {tournamentName}
        </button>
      ) : null}
    </article>
  );
}

export default function PublicTopPerformancesView({
  lang = 'cs',
  onBack,
  onOpenTournament,
}) {
  const dict = translations?.[lang]?.publicResults ?? translations?.cs?.publicResults ?? {};
  const [feed, setFeed] = useState({ all: [], live: [], finished: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = listenPublicResultsFeed((next) => {
      setFeed(next);
      setLoading(false);
    });
    return () => unsub?.();
  }, []);

  const best = useMemo(() => {
    const candidates = feed.finished.length ? feed.finished : feed.all;

    let best180 = null;
    let bestAvg = null;
    let bestCheckout = null;

    for (const row of candidates) {
      const stats = calculateTournamentStats(row.groups || [], row.tournamentBracket || [], row.groupMatches || []);

      const top180 = Array.isArray(stats?.top180s) ? stats.top180s[0] : null;
      if (top180 && Number(top180.count) > 0) {
        if (!best180 || Number(top180.count) > Number(best180.count)) {
          best180 = { ...top180, tournamentId: row.id, tournamentName: row.name };
        }
      }

      const gAvg = Number(stats?.globalAverage ?? 0);
      if (Number.isFinite(gAvg) && gAvg > 0) {
        if (!bestAvg || gAvg > Number(bestAvg.avg)) {
          const leader = Array.isArray(stats?.playerStats) ? stats.playerStats[0] : null;
          bestAvg = {
            avg: gAvg,
            player: leader?.name || row.name,
            tournamentId: row.id,
            tournamentName: row.name,
          };
        }
      }

      const checkout = Array.isArray(stats?.topCheckouts) ? stats.topCheckouts[0] : null;
      if (checkout && Number(checkout.checkout) > 0) {
        if (!bestCheckout || Number(checkout.checkout) > Number(bestCheckout.checkout)) {
          bestCheckout = { ...checkout, tournamentId: row.id, tournamentName: row.name };
        }
      }
    }

    return { best180, bestAvg, bestCheckout };
  }, [feed]);

  return (
    <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 p-4 pb-24">
      <div className="w-full max-w-5xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => onBack?.()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
        >
          <ChevronLeft className="w-4 h-4" />
          {dict.backToList || 'Zpět na turnaje'}
        </button>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <Crown className="w-7 h-7 text-purple-300" />
            {dict.topTitle || 'Top výkony'}
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            {dict.topSubtitle ||
              'Nejlepší výkony napříč veřejně dostupnými turnaji. Výpočty vycházejí z uložených zápasových statistik.'}
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
            {dict.loading || 'Načítám data…'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <PerformanceCard
              title={dict.best180Title || 'Nejvíce 180'}
              subtitle={dict.best180Subtitle || 'Počet maximálních náhozů v turnaji'}
              value={best.best180 ? `${best.best180.count}×` : '—'}
              by={best.best180?.name || '—'}
              tournamentName={best.best180?.tournamentName || ''}
              tournamentId={best.best180?.tournamentId || ''}
              onOpenTournament={onOpenTournament}
              accent="text-yellow-300"
            />
            <PerformanceCard
              title={dict.bestAvgTitle || 'Nejlepší turnajový průměr'}
              subtitle={dict.bestAvgSubtitle || 'Globální průměr turnaje'}
              value={best.bestAvg ? Number(best.bestAvg.avg).toFixed(2) : '—'}
              by={best.bestAvg?.player || '—'}
              tournamentName={best.bestAvg?.tournamentName || ''}
              tournamentId={best.bestAvg?.tournamentId || ''}
              onOpenTournament={onOpenTournament}
              accent="text-emerald-300"
            />
            <PerformanceCard
              title={dict.bestCheckoutTitle || 'Nejvyšší zavření'}
              subtitle={dict.bestCheckoutSubtitle || 'Nejvyšší checkout zaznamenaný v turnaji'}
              value={best.bestCheckout ? String(best.bestCheckout.checkout) : '—'}
              by={best.bestCheckout?.name || '—'}
              tournamentName={best.bestCheckout?.tournamentName || ''}
              tournamentId={best.bestCheckout?.tournamentId || ''}
              onOpenTournament={onOpenTournament}
              accent="text-purple-300"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-500">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-300" />
            {dict.topHintLive || 'Průběžně se propisují i běžící turnaje.'}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-300" />
            {dict.topHintAvg || 'Průměry vycházejí z uloženého počtu šipek a skóre.'}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-300" />
            {dict.topHintCheckout || 'Checkout rekord používá nejvyšší zaznamenané zavření.'}
          </div>
        </div>
      </div>
    </main>
  );
}
