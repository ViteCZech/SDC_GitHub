import React, { useState } from 'react';
import { Cloud, User } from 'lucide-react';
import { translations } from '../translations';
import { calculateStats, getTranslatedName } from '../utils/matchStats';

export default function UserProfile({ user, matches, onLogout, onDeleteAccount, onLogin, lang, currentP1Name }) {
    const t = (k) => translations[lang]?.[k] || k;
    const [timeRange, setTimeRange] = useState('all');
    const [gameTab, setGameTab] = useState('x01');
   
    // Zápasy patří uživateli pokud:
    // - mají jeho UID v p1Id/p2Id (cloudové),
    // - nebo jsou čistě lokální (bez p1Id/p2Id) a shoduje se jméno hráče 1
    const myMatches = matches.filter(m => {
        if (m.p1Id === user.uid || m.p2Id === user.uid) return true;
        const isPureLocal = !m.p1Id && !m.p2Id;
        return isPureLocal && m.p1Name === currentP1Name;
    });
    
    const filteredMatches = myMatches.filter(m => {
        const isTargetGame = gameTab === 'x01' ? m.gameType !== 'cricket' : m.gameType === 'cricket';
        if (!isTargetGame) return false;
        if (timeRange === 'all') return true;
        const cutoff = Date.now() - (timeRange * 24 * 60 * 60 * 1000);
        return m.id >= cutoff;
    });

    let x01Wins = 0, total180s = 0, total140s = 0, total100s = 0, checkouts100plus = 0, highestCheckout = 0;
    let sumAvgs = 0, avgCount = 0, sumFirst9 = 0, first9Count = 0, sumCheckouts = 0, checkoutsCount = 0, x01LegsPlayed = 0, x01LegsWon = 0;
    const roundsDist = {};

    let cricWins = 0, cricLegsPlayed = 0, cricLegsWon = 0;
    let sumMarks = 0, sumCricDarts = 0;
    let whiteHorses = 0, highMarks = 0, goodMarks = 0;

    [...filteredMatches].reverse().forEach(m => {
        const isP1 = m.p1Id === user.uid || m.p1Name === currentP1Name;
        const myKey = isP1 ? 'p1' : 'p2';
        
        if (gameTab === 'x01') {
            if (m.matchWinner === myKey) x01Wins++;
            const name1 = getTranslatedName(m.p1Name, true, lang);
            const name2 = getTranslatedName(m.p2Name, false, lang);
            const stats = calculateStats(m.completedLegs, name1, name2);
            
            const myAvg = isP1 ? stats.p1Avg : stats.p2Avg;
            if (myAvg > 0) { sumAvgs += myAvg; avgCount++; }
            
            m.completedLegs.forEach(leg => {
                x01LegsPlayed++;
                if (leg.winner === myKey) x01LegsWon++;
                const myThrows = leg.history.filter(h => h.player === myKey);
                
                myThrows.forEach(th => {
                    if (th.score >= 180) total180s++;
                    else if (th.score >= 140) total140s++;
                    else if (th.score >= 100) total100s++;
                });
                const f9Throws = myThrows.slice(0, 3);
                const f9Score = f9Throws.reduce((a, b) => a + b.score, 0);
                const f9Darts = f9Throws.reduce((a, b) => a + (b.dartsUsed || 3), 0);
                if (f9Darts > 0) { sumFirst9 += (f9Score / f9Darts) * 3; first9Count++; }
                if (leg.winner === myKey) {
                    const winThrow = myThrows.find(th => th.remaining === 0 && !th.isBust);
                    if (winThrow) {
                        sumCheckouts += winThrow.score; checkoutsCount++;
                        if (winThrow.score > highestCheckout) highestCheckout = winThrow.score;
                        if (winThrow.score >= 100) checkouts100plus++;
                    }
                    const totalDarts = myThrows.reduce((a, b) => a + (b.dartsUsed || 3), 0);
                    const round = Math.ceil(totalDarts / 3);
                    roundsDist[round] = (roundsDist[round] || 0) + 1;
                }
            });
        } else {
            if (m.matchWinner === myKey) cricWins++;
            m.completedLegs.forEach(leg => {
                cricLegsPlayed++;
                if (leg.winner === myKey) cricLegsWon++;

                const myThrows = leg.history.filter(h => h.player === myKey);
                let currentRoundMarks = 0;

                myThrows.forEach((th, idx) => {
                    sumCricDarts++;
                    if (th.target !== 0) {
                        sumMarks += th.multiplier;
                        currentRoundMarks += th.multiplier;
                    }
                    if ((idx + 1) % 3 === 0 || idx === myThrows.length - 1) {
                        if (currentRoundMarks >= 9) whiteHorses++;
                        else if (currentRoundMarks >= 7) highMarks++;
                        else if (currentRoundMarks >= 5) goodMarks++;
                        currentRoundMarks = 0;
                    }
                });
            });
        }
    });

    const winRate = filteredMatches.length > 0 ? Math.round(((gameTab === 'x01' ? x01Wins : cricWins) / filteredMatches.length) * 100) : 0;
    const legWinRate = (gameTab === 'x01' ? x01LegsPlayed : cricLegsPlayed) > 0 ? Math.round(((gameTab === 'x01' ? x01LegsWon : cricLegsWon) / (gameTab === 'x01' ? x01LegsPlayed : cricLegsPlayed)) * 100) : 0;
    
    const overallAvg = avgCount > 0 ? (sumAvgs / avgCount).toFixed(1) : '0.0';
    const overallFirst9 = first9Count > 0 ? (sumFirst9 / first9Count).toFixed(1) : '0.0';
    const avgCheckout = checkoutsCount > 0 ? Math.round(sumCheckouts / checkoutsCount) : 0;
    let maxRoundCount = 0; Object.values(roundsDist).forEach(val => { if (val > maxRoundCount) maxRoundCount = val; });
    const overallMPR = sumCricDarts > 0 ? ((sumMarks / sumCricDarts) * 3).toFixed(2) : '0.00';

    const roundEntries = Object.entries(roundsDist)
        .map(([round, cnt]) => ({ round: parseInt(round, 10), count: cnt }))
        .filter(x => !Number.isNaN(x.round))
        .sort((a, b) => a.round - b.round);
    const totalCheckouts = roundEntries.reduce((a, b) => a + (b.count || 0), 0);

    return (
        <main className="relative z-10 flex-1 w-full overflow-y-auto bg-slate-950">
            <div className="flex flex-col w-full max-w-4xl xl:max-w-7xl gap-4 p-4 pb-24 mx-auto sm:p-6">
                
                <div className="flex items-center justify-between p-3 border shadow-md bg-slate-900 border-slate-800 rounded-xl sm:p-4">
                    <div className="flex items-center min-w-0 gap-2 sm:gap-3">
                        <div className="p-2 rounded-full bg-emerald-900/30 shrink-0"><User className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" /></div>
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-sm font-black tracking-widest text-white uppercase truncate sm:text-base">
                                {user.isAnonymous ? (currentP1Name || t('statsUserFallback')) : (user.displayName ? user.displayName.split(' ')[0] : t('statsUserFallback'))}
                            </h2>
                            <span className="text-[9px] sm:text-[10px] text-slate-500 truncate">
                                {user.isAnonymous ? (t('localOfflineProfile') || 'Nikdo není přihlášen') : (user.email || t('localOfflineProfile'))}
                            </span>
                        </div>
                    </div>
                    {user.isAnonymous ? (
                        <button
                            onClick={onLogin}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] sm:text-xs font-bold uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shrink-0 ml-2 shadow-lg flex gap-2 items-center"
                        >
                            <Cloud className="w-4 h-4"/> {t('backupBtn')}
                        </button>
                    ) : (
                        <button onClick={onLogout} className="bg-red-900/20 hover:bg-red-900/40 text-red-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border border-red-500/30 transition-colors shrink-0 ml-2">{t('logout')}</button>
                    )}
                </div>

                <div className="flex flex-col min-[480px]:flex-row gap-3 md:gap-4">
                <div className="flex flex-1 min-w-0 p-1 border rounded-lg bg-slate-900 border-slate-800">
                    {[{v:'x01', l:'X01 (501)'}, {v:'cricket', l:'CRICKET'}].map(f => (
                        <button key={f.v} onClick={() => setGameTab(f.v)} className={`flex-1 py-3 text-xs font-black rounded-md uppercase tracking-wider transition-colors ${gameTab === f.v ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{f.l}</button>
                    ))}
                </div>
                <div className="flex flex-1 min-w-0 p-1 border rounded-lg bg-slate-900 border-slate-800">
                    {[{v:'all', l:t('statsAllTime')}, {v:7, l:t('stats7Days')}, {v:30, l:t('stats30Days')}, {v:90, l:t('stats90Days')}].map(f => (
                        <button key={f.v} onClick={() => setTimeRange(f.v)} className={`flex-1 py-2 text-[10px] sm:text-xs font-bold rounded-md uppercase tracking-wider transition-colors ${timeRange === f.v ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{f.l}</button>
                    ))}
                </div>
                </div>

                {gameTab === 'x01' && (
                    <div className="flex flex-col gap-4 duration-300 animate-in fade-in landscape:gap-2">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 landscape:grid-cols-4 landscape:gap-2 landscape:p-1">
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl landscape:p-2"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('avg3')}</span><span className="font-mono text-2xl font-black sm:text-3xl landscape:text-xl text-emerald-400">{overallAvg}</span></div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl landscape:p-2"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('statsFirst9')}</span><span className="font-mono text-2xl font-black text-indigo-400 sm:text-3xl landscape:text-xl">{overallFirst9}</span></div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl landscape:p-2">
                                <span className="text-[8px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('winRate')}</span>
                                <div className="flex items-center gap-2"><span className="font-mono text-2xl font-black text-blue-400 sm:text-3xl landscape:text-xl">{winRate}%</span><span className="text-sm font-bold text-slate-600">|</span><span className="font-mono text-2xl font-black sm:text-3xl landscape:text-xl text-cyan-400">{legWinRate}%</span></div>
                                <span className="text-[8px] sm:text-[9px] text-slate-500 mt-1">{filteredMatches.length} {t('matches')} / {x01LegsPlayed} {t('legs')}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl landscape:p-2"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('statsAvgCheckout')}</span><span className="font-mono text-2xl font-black text-orange-400 sm:text-3xl landscape:text-xl">{avgCheckout}</span></div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 landscape:grid-cols-6 sm:gap-3 landscape:gap-2">
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('stats100p')}</span><span className="font-mono text-xl font-black text-white">{total100s}</span></div>
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('stats140p')}</span><span className="font-mono text-xl font-black text-white">{total140s}</span></div>
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('total180s')}</span><span className="font-mono text-xl font-black text-red-400">{total180s}</span></div>
                            <div className="flex flex-col items-center justify-center col-span-3 p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl landscape:col-span-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('highestCheckout')}</span>
                                <div className="flex items-center gap-3"><span className="font-mono text-2xl font-black text-yellow-400">{highestCheckout}</span><span className="text-[9px] text-slate-500 border-l border-slate-700 pl-3">{checkouts100plus}x {t('checkout100')}</span></div>
                            </div>
                        </div>

                        <div className="p-4 border bg-slate-900 rounded-xl border-slate-800">
                            <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {t('statsRoundDist')}
                            </div>
                            {totalCheckouts === 0 ? (
                                <div className="text-xs text-slate-600">-</div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {roundEntries.map(({ round, count }) => {
                                        const pct = Math.round((count / totalCheckouts) * 100);
                                        return (
                                            <div key={round} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
                                                <div className="text-xs font-bold text-slate-500">R{round}</div>
                                                <div className="h-3 rounded bg-slate-800 overflow-hidden border border-slate-700">
                                                    <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                                                </div>
                                                <div className="text-xs font-mono font-bold text-emerald-400 text-right">{pct}%</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {gameTab === 'cricket' && (
                    <div className="flex flex-col gap-4 duration-300 animate-in fade-in landscape:gap-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 landscape:grid-cols-2 landscape:gap-2">
                            <div className="flex flex-col items-center justify-center p-6 text-center border shadow-lg bg-slate-900 border-slate-800 rounded-xl landscape:p-3"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">{t('totalMprInfo')}</span><span className="font-mono text-5xl font-black text-emerald-400 landscape:text-3xl">{overallMPR}</span></div>
                            <div className="flex flex-col items-center justify-center p-6 text-center border bg-slate-900 border-slate-800 rounded-xl landscape:p-3">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">{t('winRate')}</span>
                                <div className="flex items-center gap-4"><span className="font-mono text-4xl font-black text-blue-400 landscape:text-2xl">{winRate}%</span><span className="text-2xl font-bold text-slate-600 landscape:text-xl">|</span><span className="font-mono text-4xl font-black text-cyan-400 landscape:text-2xl">{legWinRate}%</span></div>
                                <span className="text-[9px] text-slate-500 mt-2">{filteredMatches.length} {t('matches')} / {cricLegsPlayed} {t('legs')}</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 sm:gap-3 landscape:mt-0 landscape:gap-2">
                            <div className="relative flex flex-col items-center justify-center p-4 overflow-hidden text-center border bg-slate-900 border-slate-800 rounded-xl landscape:p-2">
                                <div className="absolute top-0 right-0 w-8 h-8 rounded-bl-full bg-yellow-500/10"></div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2 z-10">{t('whiteHorse')}</span>
                                <span className="z-10 font-mono text-3xl font-black text-yellow-400 landscape:text-2xl">{whiteHorses}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 text-center border bg-slate-900 border-slate-800 rounded-xl landscape:p-2">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2">{t('marks7plus')}</span>
                                <span className="font-mono text-3xl font-black text-white landscape:text-2xl">{highMarks}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 text-center border bg-slate-900 border-slate-800 rounded-xl landscape:p-2">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2">{t('marks5plus')}</span>
                                <span className="font-mono text-3xl font-black text-slate-300 landscape:text-2xl">{goodMarks}</span>
                            </div>
                        </div>
                    </div>
                )}
                <button onClick={onDeleteAccount} className="w-full py-3 mt-4 text-sm font-bold tracking-widest text-red-400 uppercase transition-all border shadow-md bg-red-900/20 hover:bg-red-900/40 border-red-500/30 rounded-xl active:scale-95">{t('deleteAccount')}</button>
            </div>
        </main>
    );
}
