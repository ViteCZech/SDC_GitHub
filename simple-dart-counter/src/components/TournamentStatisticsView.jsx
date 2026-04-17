import React, { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { calculateTournamentStats } from '../utils/tournamentLogic';
import { translations } from '../translations';

const getSafeAvg = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

const TournamentStatisticsView = ({
  tournamentData,
  tournamentGroups = [],
  tournamentMatches = [],
  tournamentBracket = [],
  lang = 'cs',
}) => {
  const t = (key) => {
    if (!key) return undefined;
    const val = (() => {
      const s = String(key);
      const parts = s.split('.');
      if (parts.length === 2) {
        const [ns, k] = parts;
        return translations?.[lang]?.[ns]?.[k];
      }
      return translations?.[lang]?.[s];
    })();
    return val != null ? val : undefined;
  };

  const stats = useMemo(() => {
    try {
      return calculateTournamentStats(tournamentGroups, tournamentBracket, tournamentMatches);
    } catch (e) {
      return null;
    }
  }, [tournamentGroups, tournamentBracket, tournamentMatches]);

  const top180s = stats?.top180s ?? [];
  const topCheckouts = stats?.topCheckouts ?? [];
  const bestLegs = stats?.bestLegs ?? [];
  const playerStats = stats?.playerStats ?? [];

  const isEmpty = !top180s.length && !topCheckouts.length && !bestLegs.length && !playerStats.length;

  return (
    <div className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 p-4 pb-24">
      <div className="w-full max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-widest uppercase text-emerald-400">
              {t('stats.title') || t('tournTabStatistiky') || t('stepperStatistiky') || 'Statistiky'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              {tournamentData?.name ? tournamentData.name : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 text-slate-300 shrink-0" />
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
              {t('globalAverage') || 'Turnajový průměr'}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <div className="font-mono text-3xl font-black text-amber-400">
                {stats ? getSafeAvg(stats.globalAverage).toFixed(2) : '0.00'}
              </div>
              <div className="text-xs text-slate-500 font-semibold">Ø</div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
              {t('totalDarts') || 'Celkem šipek'}
            </div>
            <div className="mt-2 font-mono text-3xl font-black text-slate-200">
              {stats ? Number(stats.totalDartsThrown ?? stats.totalDarts ?? 0) : 0}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                {t('top180s') || 'Nejvíce 180'}
              </div>
            </div>
            {top180s.length ? (
              <div className="mt-3 space-y-2">
                {top180s.map((x) => (
                  <div key={x.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-200 truncate">{x.name}</span>
                    <span className="font-mono text-amber-400 font-bold">{x.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t('noRecords') || 'Zatím žádné záznamy'}</p>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
              {t('topCheckouts') || 'Nejvyšší zavření'}
            </div>
            {topCheckouts.length ? (
              <div className="mt-3 space-y-2">
                {topCheckouts.map((x) => (
                  <div key={x.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-200 truncate">{x.name}</span>
                    <span className="font-mono text-emerald-400 font-bold">{x.checkout}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t('noRecords') || 'Zatím žádné záznamy'}</p>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
              {t('stats.bestLeg') || 'Nejlepší legy'}
            </div>
            {bestLegs.length ? (
              <div className="mt-3 space-y-2">
                {bestLegs.map((x) => (
                  <div key={x.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-200 truncate">{x.name}</span>
                    <span className="font-mono text-purple-400 font-bold">{x.darts}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t('noRecords') || 'Zatím žádné záznamy'}</p>
            )}
          </div>
        </section>

        <section className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
              {t('playerStats') || 'Hráči'}
            </div>
            <div className="text-xs text-slate-500">
              {isEmpty ? '' : t('sortedByPlacement') || 'Seřazeno dle umístění'}
            </div>
          </div>

          {playerStats.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-2 py-2 font-bold">{t('stats.rank') || '#'}</th>
                    <th className="px-2 py-2 font-bold">{t('stats.player') || 'Hráč'}</th>
                    <th className="px-2 py-2 font-bold text-right">{t('stats.avg') || 'Ø'}</th>
                    <th className="px-2 py-2 font-bold text-right">{t('top180s') || '180'}</th>
                    <th className="px-2 py-2 font-bold text-right">{t('stats100p') || '100+'}</th>
                    <th className="px-2 py-2 font-bold text-right">{t('stats140p') || '140+'}</th>
                    <th className="px-2 py-2 font-bold text-right">{t('stats.highCheck') || 'High Check'}</th>
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map((p, idx) => (
                    <tr key={p.id || p.name} className="border-t border-slate-800">
                      <td className="px-2 py-2 font-mono text-slate-400">{p.placement ?? idx + 1}</td>
                      <td className="px-2 py-2 text-slate-200 truncate max-w-[220px]">{p.name}</td>
                      <td className="px-2 py-2 font-mono text-right text-amber-400 font-bold">
                        {Number(p.average ?? 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-2 font-mono text-right text-yellow-400 font-bold">{p.total180s ?? 0}</td>
                      <td className="px-2 py-2 font-mono text-right text-slate-300">{p.total100plus ?? 0}</td>
                      <td className="px-2 py-2 font-mono text-right text-slate-300">{p.total140plus ?? 0}</td>
                      <td className="px-2 py-2 font-mono text-right text-emerald-400 font-bold">{p.bestCheckout ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('noRecords') || 'Zatím žádné záznamy'}</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default TournamentStatisticsView;

