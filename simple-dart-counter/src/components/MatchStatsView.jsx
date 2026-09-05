import React, { useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle, Home, RefreshCw, RotateCcw, Trophy, Undo2,
} from 'lucide-react';
import { translations } from '../translations';
import { calculateStats, doublesResultExtras, getTranslatedName } from '../utils/matchStats';

export default function MatchStatsView({ data, onClose, onBack, title, lang, onStartMatch, isTournamentMode, onTournamentMatchComplete, onUndoAndResume }) {
    const t = (k) => translations[lang]?.[k] || k;
    const [savingMatch, setSavingMatch] = useState(false);
    const [saveError, setSaveError] = useState(null); // string | null
    const [pendingSavePayload, setPendingSavePayload] = useState(null); // { matchId, resultData } | null
    const isP1 = data.matchWinner === 'p1';
    const displayP1Name = getTranslatedName(data.p1Name, true, lang);
    
    // Přidání obtížnosti Bota k zobrazenému jménu ve statistikách
    const displayP2Name = getTranslatedName(data.p2Name, false, lang) + (data.isBot ? ` [${data.botLevel === 'custom' ? `AVG ${data.botAvg}` : (translations[lang]?.[`diff${data.botLevel.charAt(0).toUpperCase() + data.botLevel.slice(1)}`] || data.botLevel)}]` : '');
    
    const winColorText = isP1 ? 'text-emerald-500' : 'text-purple-500';
    const winColorBg = isP1 ? 'from-emerald-500/20 to-emerald-600/10' : 'from-purple-500/20 to-purple-600/10';
    const winBorder = isP1 ? 'border-emerald-500/50' : 'border-purple-500/50';

    let cP1Mpr = '0.00', cP2Mpr = '0.00';
    if (data.gameType === 'cricket' && data.completedLegs && data.completedLegs.length > 0) {
        let p1Marks = 0, p2Marks = 0, p1Darts = 0, p2Darts = 0;
        data.completedLegs.forEach(leg => {
            leg.history.forEach(d => {
                if (d.player === 'p1') { p1Darts++; if(d.target !== 0) p1Marks += d.multiplier; }
                else { p2Darts++; if(d.target !== 0) p2Marks += d.multiplier; }
            });
        });
        if (p1Darts > 0) cP1Mpr = ((p1Marks / p1Darts) * 3).toFixed(2);
        if (p2Darts > 0) cP2Mpr = ((p2Marks / p2Darts) * 3).toFixed(2);
    }

    const stats = data.gameType !== 'cricket' ? calculateStats(data.completedLegs, displayP1Name, displayP2Name) : null;
    const isMultiSet = (data.matchSets || 1) > 1;
    const mainP1 = isMultiSet ? (data.p1Sets || 0) : (data.setScores?.[0]?.p1 ?? data.p1Legs ?? 0);
    const mainP2 = isMultiSet ? (data.p2Sets || 0) : (data.setScores?.[0]?.p2 ?? data.p2Legs ?? 0);
    const legsBreakdown = isMultiSet && data.setScores?.length ? `(${data.setScores.map(s => `${s.p1}:${s.p2}`).join(', ')})` : '';

    const buildTournamentSavePayload = () => {
      const fr = data?.finalResult;
      const p1Legs = Number(fr?.player1?.legsWon ?? data?.p1Legs) || 0;
      const p2Legs = Number(fr?.player2?.legsWon ?? data?.p2Legs) || 0;
      const statsPayload =
        stats && data?.gameType !== 'cricket'
          ? {
              p1Avg: stats.p1Avg,
              p2Avg: stats.p2Avg,
              p1DartsTotal: stats.p1DartsTotal,
              p2DartsTotal: stats.p2DartsTotal,
              p1High: stats.p1High,
              p2High: stats.p2High,
              p1HighCheckout: stats.p1HighCheckout,
              p2HighCheckout: stats.p2HighCheckout,
              legDetails: stats.legDetails,
            }
          : {};
      return {
        matchId: data?.tournamentMatchId ?? data?.id,
        resultData: { p1Legs, p2Legs, ...statsPayload, ...doublesResultExtras(data) },
      };
    };

    const runTournamentSave = async (payload) => {
      if (!payload || savingMatch) return;
      setSavingMatch(true);
      setSaveError(null);
      try {
        await onTournamentMatchComplete?.(payload.matchId, payload.resultData);
        setPendingSavePayload(null);
      } catch (error) {
        console.error('KRITICKÁ CHYBA PŘI ULOŽENÍ ZÁPASU:', error);
        const msg = String(
          error?.message ||
            error ||
            translations[lang]?.tablet?.saveMatchError ||
            'Uložení zápasu selhalo.'
        );
        setSaveError(msg);
        setPendingSavePayload(payload);
        // Zůstat na obrazovce se skóre — nepřesměrovávat
      } finally {
        setSavingMatch(false);
      }
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 fixed inset-0 z-[1000] overflow-hidden">
            {saveError && (
              <div
                className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4 bg-black/80"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="match-save-error-title"
              >
                <div className="w-full max-w-md rounded-2xl border-2 border-red-500/60 bg-slate-900 shadow-2xl p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        id="match-save-error-title"
                        className="text-lg font-black text-white tracking-tight"
                      >
                        {t('tournSaveMatchErrorTitle') || 'Chyba při ukládání zápasu'}
                      </h3>
                      <p className="text-sm text-red-200 mt-2 leading-snug break-words whitespace-pre-wrap">
                        {`${t('tournSaveMatchErrorPrefix') || 'Chyba při ukládání zápasu:'} ${saveError}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={savingMatch}
                      onClick={() =>
                        runTournamentSave(pendingSavePayload || buildTournamentSavePayload())
                      }
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${savingMatch ? 'animate-spin' : ''}`} />
                      {savingMatch
                        ? t('tournSavingMatch') || 'UKLÁDÁM…'
                        : t('tournSaveMatchRetry') || 'Zkusit znovu'}
                    </button>
                    <button
                      type="button"
                      disabled={savingMatch}
                      onClick={() => setSaveError(null)}
                      className="w-full py-3.5 px-4 rounded-xl font-bold text-sm border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    >
                      {t('tournSaveMatchCloseError') || 'Zavřít'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="relative z-20 flex items-center justify-center w-full px-4 pb-4 border-b shrink-0 pt-14 sm:p-4 bg-slate-950 border-slate-900/50">
                <div className="absolute z-50 flex gap-2 mt-5 -translate-y-1/2 left-4 top-1/2 sm:mt-0">
                    <button onClick={onBack || onClose} className="p-2 transition-colors border rounded-lg shadow-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700"><ArrowLeft className="w-5 h-5" /></button>
                    <button onClick={onClose} className="p-2 transition-colors border rounded-lg shadow-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700">
                      <Home className="w-5 h-5" />
                    </button>
                </div>
                <div className="w-full text-center">
                    <h2 className={`text-xl sm:text-2xl font-bold uppercase tracking-widest leading-none ${winColorText}`}>{title}</h2>
                    <div className="text-xs sm:text-sm text-slate-500">{data.date}</div>
                </div>
            </div>
            
            <div className="flex-1 w-full overflow-x-hidden overflow-y-auto bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800">
                <div className="w-full max-w-4xl p-4 pb-12 mx-auto space-y-4 md:space-y-3 landscape:space-y-2">
                    <div className="flex justify-center landscape:py-0">
                        <div className={`bg-gradient-to-br ${winColorBg} border ${winBorder} rounded-xl px-6 py-3 flex items-center gap-3 shadow-lg animate-pulse landscape:py-2 landscape:px-4`}>
                            <Trophy className={`w-8 h-8 ${winColorText} landscape:w-6 landscape:h-6`} />
                            <div className="text-center">
                                <div className={`text-[10px] uppercase font-bold tracking-widest ${isP1 ? 'text-emerald-300' : 'text-purple-300'}`}>{t('matchWinner')}</div>
                                <div className="text-2xl font-black text-white landscape:text-xl">{isP1 ? displayP1Name : displayP2Name}</div>
                            </div>
                        </div>
                    </div>

                    {/* Celkové výsledky – v landscape dva sloupce vedle sebe */}
                    <div className={`grid w-full gap-3 landscape:grid-cols-2 landscape:gap-4 md:grid-cols-2`}>
                        <div className="p-3 text-center border rounded-xl bg-slate-900 border-slate-800 landscape:p-2">
                            <div className="mb-1 text-xs font-bold text-slate-400">{displayP1Name}</div>
                            <div className={`text-3xl font-black landscape:text-2xl ${isP1 ? 'text-emerald-500' : 'text-slate-600'}`}>{mainP1}</div>
                            <div className="text-xs font-mono text-slate-500">{isMultiSet ? `S | L ${data.p1Legs || 0}` : 'LEGS'}</div>
                        </div>
                        <div className="p-3 text-center border rounded-xl bg-slate-900 border-slate-800 landscape:p-2">
                            <div className="mb-1 text-xs font-bold text-slate-400">{displayP2Name}</div>
                            <div className={`text-3xl font-black landscape:text-2xl ${!isP1 ? 'text-purple-500' : 'text-slate-600'}`}>{mainP2}</div>
                            <div className="text-xs font-mono text-slate-500">{isMultiSet ? `S | L ${data.p2Legs || 0}` : 'LEGS'}</div>
                        </div>
                    </div>
                    {legsBreakdown && <div className="text-sm font-mono text-slate-400 text-center landscape:text-xs">{legsBreakdown}</div>}

                    {data.gameType === 'cricket' ? (
                        <div className={`flex justify-around w-full p-4 border shadow-md bg-slate-900 rounded-xl border-slate-800 landscape:p-2`}>
                            <div className="text-center"><div className="mb-1 text-xs font-bold tracking-widest uppercase text-slate-500 landscape:text-[10px]">MPR</div><div className="font-mono text-3xl font-black text-emerald-400 landscape:text-2xl">{cP1Mpr}</div></div>
                            <div className="text-center"><div className="mb-1 text-xs font-bold tracking-widest uppercase text-slate-500 landscape:text-[10px]">MPR</div><div className="font-mono text-3xl font-black text-purple-400 landscape:text-2xl">{cP2Mpr}</div></div>
                        </div>
                    ) : (
                        <>
                            {/* Kompaktní 3-sloupcový grid: Průměr | Šipky (legs) | Zavření */}
                            <div className="grid grid-cols-1 gap-2 landscape:grid-cols-3 landscape:gap-3 md:grid-cols-3">
                                <div className="p-3 border rounded-lg bg-slate-900 border-slate-800 landscape:p-2">
                                    <div className="mb-1 text-[10px] font-bold text-center text-slate-500 uppercase tracking-wider">{t('avg3')}</div>
                                    <div className="flex justify-between font-mono text-lg font-bold landscape:text-base"><span className="text-emerald-400">{stats.p1Avg.toFixed(1)}</span><span className="text-purple-400">{stats.p2Avg.toFixed(1)}</span></div>
                                </div>
                                <div className="p-3 border rounded-lg bg-slate-900 border-slate-800 landscape:p-2">
                                    <div className="mb-1 text-[10px] font-bold text-center text-slate-500 uppercase tracking-wider">{t('detailDarts')}</div>
                                    <div className="flex justify-between font-mono text-lg font-bold landscape:text-base">
                                        <span className="text-emerald-400">{stats.p1DartsTotal ?? '-'}</span>
                                        <span className="text-purple-400">{stats.p2DartsTotal ?? '-'}</span>
                                    </div>
                                </div>
                                <div className="p-3 border rounded-lg bg-slate-900 border-slate-800 landscape:p-2">
                                    <div className="mb-1 text-[10px] font-bold text-center text-slate-500 uppercase tracking-wider">{t('highestCheckout')}</div>
                                    <div className="flex justify-between font-mono text-lg font-bold landscape:text-base"><span className="text-emerald-400">{stats.p1HighCheckout}</span><span className="text-purple-400">{stats.p2HighCheckout}</span></div>
                                </div>
                            </div>
                            {data.members && typeof data.members === 'object' && (
                              <div className="w-full overflow-hidden border rounded-lg bg-slate-900 border-slate-800">
                                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800">
                                  {t('doublesMembersAvg')}
                                </div>
                                <div className="divide-y divide-slate-800">
                                  {Object.values(data.members).map((m) => (
                                    <div key={m.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                                      <span className={`font-bold truncate ${m.side === 'p1' ? 'text-emerald-400' : 'text-purple-400'}`}>
                                        {m.name}
                                      </span>
                                      <span className="font-mono text-slate-200">{Number(m.avg || 0).toFixed(1)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="w-full overflow-hidden border rounded-lg bg-slate-900 border-slate-800">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-[10px] uppercase bg-slate-800 text-slate-400"><tr><th className="px-2 py-1.5 landscape:px-2 landscape:py-1">#</th><th className="px-2 py-1.5 landscape:px-2 landscape:py-1">{t('detailWinner')}</th><th className="px-2 py-1.5 text-center landscape:px-2 landscape:py-1">{t('detailDarts')}</th><th className="px-2 py-1.5 text-right landscape:px-2 landscape:py-1">{t('detailCheckout')}</th><th className="px-2 py-1.5 text-right landscape:px-2 landscape:py-1">{t('detailAvg')}</th></tr></thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {stats.legDetails.map(l => {
                                            const rowColor = l.winnerKey === 'p1' ? 'text-emerald-400' : 'text-purple-400';
                                            return (
                                                <tr key={l.index}>
                                                    <td className="px-2 py-1.5 font-bold text-slate-500 landscape:py-1">{l.index}</td>
                                                    <td className={`px-2 py-1.5 font-bold landscape:py-1 ${rowColor}`}>{l.winner}</td>
                                                    <td className={`px-2 py-1.5 text-center font-mono landscape:py-1 ${rowColor}`}>{l.darts}</td>
                                                    <td className={`px-2 py-1.5 text-right font-mono landscape:py-1 ${rowColor}`}>{l.checkout || '-'}</td>
                                                    <td className={`px-2 py-1.5 text-right font-mono landscape:py-1 ${rowColor}`}>{l.avg.toFixed(1)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    
                    {/* Tlačítka: turnajový režim vs. běžná hra */}
                    <div className="flex flex-col gap-2 mt-6">
                        {isTournamentMode ? (
                            <>
                                <button
                                    type="button"
                                    disabled={savingMatch}
                                    onClick={() => runTournamentSave(buildTournamentSavePayload())}
                                    className="flex items-center justify-center w-full gap-3 py-4 text-lg font-black text-white transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 rounded-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <CheckCircle className="w-6 h-6" />{' '}
                                    {savingMatch
                                      ? t('tournSavingMatch') || 'UKLÁDÁM…'
                                      : t('tournSaveMatch') || 'ULOŽIT ZÁPAS'}
                                </button>
                                <button
                                    type="button"
                                    onClick={onUndoAndResume}
                                    className="flex items-center justify-center w-full gap-3 py-4 text-lg font-black transition-all rounded-xl border-2 bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500 active:scale-95"
                                >
                                    <Undo2 className="w-6 h-6" /> {t('tournBackToGame') || 'ZPĚT DO HRY / OPRAVIT'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={onStartMatch} className="flex items-center justify-center w-full gap-3 py-4 text-lg font-black text-white transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 rounded-xl active:scale-95">
                                    <RotateCcw className="w-6 h-6" /> {t('rematch')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
