import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, deleteUser } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { 
  AlertTriangle, ArrowLeft, Bot, CheckCircle, ChevronDown, Cpu, Delete, 
  DownloadCloud, FileText, History, Home, Info, Keyboard as KeyboardIcon, 
  Maximize, Mic, MicOff, MousePointer2, Play, RefreshCw, RotateCcw, 
  Target, Trash2, Trophy, Undo2, User, Cloud, X, BarChart2, List, Swords
} from 'lucide-react';

import { translations } from './translations';
import GameX01 from './components/GameX01';
import GameCricket from './components/GameCricket';
import GameStats from './Stats';

const APP_VERSION = "v1.9.1"; 

const safeStorage = {
  getItem: (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } },
  setItem: (key, value) => { try { localStorage.setItem(key, value); } catch (e) {} }
};

const firebaseConfig = {
  apiKey: "AIzaSyCJuKUfdx5hC6jbtgBN_zXEnlVaq6mjcM0",
  authDomain: "simple-dart-counter-12ff2.firebaseapp.com",
  projectId: "simple-dart-counter-12ff2",
  storageBucket: "simple-dart-counter-12ff2.firebasestorage.app",
  messagingSenderId: "874074054437",
  appId: "1:874074054437:web:712eec6b4c4f8b9ed644cc",
  measurementId: "G-5NBXTH3LM7"
};

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app, 'eur3');
} catch (e) {
    console.error("Firebase Init Error:", e);
}

const appId = 'sdc_global_production';

// --- POMOCNÉ FUNKCE ---
const getTranslatedName = (name, isPlayer1, currentLang) => {
    if (!name) return '';
    // Přidány otazníky (?.) pro bezpečné čtení z externího souboru translations
    const p1Defaults = ['Domácí', 'Home', 'Gospodarze', translations?.cs?.p1Default, translations?.en?.p1Default, translations?.pl?.p1Default];
    const p2Defaults = ['Hosté', 'Away', 'Goście', translations?.cs?.p2Default, translations?.en?.p2Default, translations?.pl?.p2Default];
    const botDefaults = ['Robot', 'Bot', translations?.cs?.botDefault, translations?.en?.botDefault, translations?.pl?.botDefault];
    
    if (isPlayer1 && p1Defaults.includes(name)) return translations[currentLang]?.p1Default || 'Domácí';
    if (!isPlayer1 && botDefaults.includes(name)) return translations[currentLang]?.botDefault || 'Robot';
    if (!isPlayer1 && p2Defaults.includes(name)) return translations[currentLang]?.p2Default || 'Hosté';
    return name;
};

const calculateStats = (legs, p1Name, p2Name) => {
    let p1DartsTotal=0, p1ScoreTotal=0, p2DartsTotal=0, p2ScoreTotal=0;
    const p1High={'60+':0,'100+':0,'140+':0,'180':0}, p2High={'60+':0,'100+':0,'140+':0,'180':0};
    let p1HighCheck=0, p2HighCheck=0;
    const updateHigh = (s, obj) => { if(s===180) obj['180']++; else if(s>=140) obj['140+']++; else if(s>=100) obj['100+']++; else if(s>=60) obj['60+']++; };

    const legDetails = (legs||[]).map((leg, i) => {
        const p1M = leg.history.filter(m => m.player === 'p1');
        const p2M = leg.history.filter(m => m.player === 'p2');
        p1M.forEach(m => updateHigh(m.score, p1High)); 
        p2M.forEach(m => updateHigh(m.score, p2High));
        const lP1S = p1M.reduce((a,b)=>a+(b.score||0),0); 
        const lP2S = p2M.reduce((a,b)=>a+(b.score||0),0);
        const lP1D = p1M.reduce((a,b)=>a+(b.dartsUsed||3),0); 
        const lP2D = p2M.reduce((a,b)=>a+(b.dartsUsed||3),0);
        p1ScoreTotal+=lP1S; p1DartsTotal+=lP1D; 
        p2ScoreTotal+=lP2S; p2DartsTotal+=lP2D;
        const winnerKey = leg.winner;
        const winnerName = winnerKey === 'p1' ? p1Name : p2Name;
        const winThrow = leg.history.find(m => m.player === winnerKey && m.remaining === 0);
        const check = winThrow ? winThrow.score : 0;
        if(winnerKey==='p1') p1HighCheck = Math.max(p1HighCheck, check); else p2HighCheck = Math.max(p2HighCheck, check);
        const winnerDarts = winnerKey === 'p1' ? lP1D : lP2D;
        const winnerScore = winnerKey === 'p1' ? lP1S : lP2S;
        const winnerAvg = winnerDarts > 0 ? (winnerScore / winnerDarts) * 3 : 0;
        return { index: i+1, winner: winnerName, winnerKey: winnerKey, darts: winnerDarts, avg: winnerAvg, checkout: check };
    });
    return { p1Avg: p1DartsTotal ? (p1ScoreTotal/p1DartsTotal)*3 : 0, p2Avg: p2DartsTotal ? (p2ScoreTotal/p2DartsTotal)*3 : 0, legDetails, p1High, p2High, p1HighCheckout: p1HighCheck, p2HighCheckout: p2HighCheck };
};

// --- KOMPONENTY MENU / UI ---
const FlagIcon = ({ lang }) => {
    if (lang === 'cs') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" className="w-5 h-3.5 rounded-sm object-cover"><rect width="900" height="600" fill="#D7141A"/><rect width="900" height="300" fill="#FFF"/><polygon points="0,0 0,600 450,300" fill="#11457E"/></svg>;
    if (lang === 'en') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" className="w-5 h-3.5 rounded-sm object-cover"><clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/><path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#C8102E" strokeWidth="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/></svg>;
    if (lang === 'pl') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10" className="w-5 h-3.5 rounded-sm object-cover border border-slate-700/50"><rect width="16" height="10" fill="#fff"/><rect width="16" height="5" y="5" fill="#dc143c"/></svg>;
    return null;
};

const VirtualKeyboard = ({ onChar, onDelete, onClose, lang }) => {
    const t = (k) => translations[lang]?.[k] || k;
    const [popup, setPopup] = useState(null);
    const timerRef = useRef(null);
    const pressedRef = useRef(false);
    const specialChars = { 'A':['Á','Ą','Ä'], 'C':['Č','Ć'], 'D':['Ď'], 'E':['É','Ě','Ę','Ë'], 'I':['Í'], 'L':['Ł','Ĺ'], 'N':['Ň','Ń'], 'O':['Ó','Ö'], 'R':['Ř'], 'S':['Š','Ś'], 'T':['Ť'], 'U':['Ú','Ů','Ü'], 'Y':['Ý'], 'Z':['Ž','Ź','Ż'] };
    
    const rows = [['1','2','3','4','5','6','7','8','9','0'], ['Q','W','E','R','T','Z','U','I','O','P'], ['A','S','D','F','G','H','J','K','L'], ['Y','X','C','V','B','N','M']];
    if (lang === 'en' || lang === 'pl') { rows[1][5] = 'Y'; rows[3][0] = 'Z'; }

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Backspace') { e.preventDefault(); onDelete(); }
            else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); onClose(); }
            else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) onChar(e.key.toUpperCase());
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onChar, onDelete, onClose]);

    const handleDown = (char) => {
        if (popup) return;
        pressedRef.current = true;
        if (specialChars[char]) { timerRef.current = setTimeout(() => { if (pressedRef.current) { setPopup({ char, variants: specialChars[char] }); pressedRef.current = false; } }, 400); }
    };

    const handleUp = (char) => { clearTimeout(timerRef.current); if (pressedRef.current) { onChar(char); pressedRef.current = false; } };

    return (
        <>
            {popup && <div className="fixed inset-0 z-[600]" onClick={() => setPopup(null)}></div>}
            <div className="fixed bottom-0 left-0 w-full bg-slate-900 border-t border-slate-700 p-1.5 sm:p-2 pb-4 sm:pb-6 z-[600] shadow-2xl animate-in slide-in-from-bottom duration-200 select-none">
                <div className="flex items-center justify-between max-w-lg p-2 mx-auto mb-2 border-b rounded-t-lg shadow-sm bg-slate-800 border-slate-700">
                    <span className="text-[10px] text-slate-500 font-bold uppercase ml-2 tracking-widest">{t('players')}</span>
                    <button onClick={onClose} className="px-5 py-1.5 bg-slate-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-black transition-colors shadow-sm">{t('kbdDone')}</button>
                </div>
                <div className="flex flex-col gap-1 max-w-lg mx-auto relative z-[610]">
                    {rows.map((row, i) => (
                        <div key={i} className="flex justify-center gap-1">
                            {row.map(char => (
                                <div key={char} className="relative flex-1 max-w-[40px]">
                                    {popup && popup.char === char && (
                                        <div className="absolute flex p-1 mb-2 duration-100 -translate-x-1/2 border rounded-lg shadow-xl bottom-full left-1/2 bg-slate-800 border-slate-600 animate-in zoom-in">
                                            {popup.variants.map(v => (<button key={v} onClick={(e) => { e.stopPropagation(); onChar(v); setPopup(null); }} className="w-10 h-10 text-lg font-bold text-white rounded sm:h-12 hover:bg-emerald-600">{v}</button>))}
                                        </div>
                                    )}
                                    <button onPointerDown={(e) => { e.preventDefault(); handleDown(char); }} onPointerUp={(e) => { e.preventDefault(); handleUp(char); }} onPointerLeave={() => { clearTimeout(timerRef.current); pressedRef.current = false; }} className={`w-full h-9 sm:h-12 bg-slate-800 text-white font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-slate-700 transition-all text-xs sm:text-base ${popup && popup.char === char ? 'bg-slate-700' : ''}`}>{char}</button>
                                </div>
                            ))}
                        </div>
                    ))}
                    <div className="flex justify-center gap-1 mt-1">
                        <button onClick={() => onChar(' ')} className="flex-1 max-w-[280px] bg-slate-800 text-slate-400 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-slate-700 py-2 sm:py-3 text-xs uppercase tracking-widest">{t('kbdSpace')}</button>
                        <button onClick={onDelete} className="flex-1 max-w-[80px] bg-red-900/30 text-red-400 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-red-900/50 flex items-center justify-center"><Delete className="w-5 h-5 sm:w-6 sm:h-6"/></button>
                    </div>
                </div>
            </div>
        </>
    );
};

const MatchStatsView = ({ data, onClose, title, lang, onStartMatch }) => {
    const t = (k) => translations[lang]?.[k] || k;
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

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 fixed inset-0 z-[1000] overflow-hidden">
            <div className="relative z-20 flex items-center justify-center w-full px-4 pb-4 border-b shrink-0 pt-14 sm:p-4 bg-slate-950 border-slate-900/50">
                <div className="absolute z-50 flex gap-2 mt-5 -translate-y-1/2 left-4 top-1/2 sm:mt-0">
                    <button onClick={onClose} className="p-2 transition-colors border rounded-lg shadow-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700"><ArrowLeft className="w-5 h-5" /></button>
                </div>
                <div className="w-full text-center">
                    <h2 className={`text-xl sm:text-2xl font-bold uppercase tracking-widest leading-none ${winColorText}`}>{title}</h2>
                    <div className="text-xs sm:text-sm text-slate-500">{data.date}</div>
                </div>
            </div>
            
            <div className="flex-1 w-full overflow-x-hidden overflow-y-auto bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800">
                <div className="w-full max-w-4xl p-4 pb-12 mx-auto space-y-6">
                    <div className="flex justify-center">
                        <div className={`bg-gradient-to-br ${winColorBg} border ${winBorder} rounded-xl px-6 py-3 flex items-center gap-3 shadow-lg animate-pulse`}>
                            <Trophy className={`w-8 h-8 ${winColorText}`} />
                            <div className="text-center">
                                <div className={`text-[10px] uppercase font-bold tracking-widest ${isP1 ? 'text-emerald-300' : 'text-purple-300'}`}>{t('matchWinner')}</div>
                                <div className="text-2xl font-black text-white">{isP1 ? displayP1Name : displayP2Name}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-center gap-6">
                        <div className="text-center"><div className="mb-1 text-xs font-bold text-slate-400">{displayP1Name}</div><div className={`text-5xl font-black ${isP1 ? 'text-emerald-500' : 'text-slate-600'}`}>{data.p1Legs}</div></div>
                        <div className="text-xl font-bold text-slate-700">vs</div>
                        <div className="text-center"><div className="mb-1 text-xs font-bold text-slate-400">{displayP2Name}</div><div className={`text-5xl font-black ${!isP1 ? 'text-purple-500' : 'text-slate-600'}`}>{data.p2Legs}</div></div>
                    </div>

                    {data.gameType === 'cricket' ? (
                        <div className="flex justify-around w-full p-4 mt-4 border shadow-md bg-slate-900 rounded-xl border-slate-800">
                            <div className="text-center"><div className="mb-1 text-xs font-bold tracking-widest uppercase text-slate-500">MPR</div><div className="font-mono text-3xl font-black text-emerald-400">{cP1Mpr}</div></div>
                            <div className="text-center"><div className="mb-1 text-xs font-bold tracking-widest uppercase text-slate-500">MPR</div><div className="font-mono text-3xl font-black text-purple-400">{cP2Mpr}</div></div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 border rounded-lg bg-slate-900 border-slate-800"><div className="mb-2 text-xs font-bold text-center text-slate-500">{t('avg3')}</div><div className="flex justify-between font-mono text-lg font-bold"><span className="text-emerald-400">{stats.p1Avg.toFixed(1)}</span><span className="text-purple-400">{stats.p2Avg.toFixed(1)}</span></div></div>
                                <div className="p-3 border rounded-lg bg-slate-900 border-slate-800"><div className="mb-2 text-xs font-bold text-center text-slate-500">{t('highestCheckout')}</div><div className="flex justify-between font-mono text-lg font-bold"><span className="text-emerald-400">{stats.p1HighCheckout}</span><span className="text-purple-400">{stats.p2HighCheckout}</span></div></div>
                            </div>
                            <div className="w-full overflow-hidden border rounded-lg bg-slate-900 border-slate-800">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-[10px] uppercase bg-slate-800 text-slate-400"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">{t('detailWinner')}</th><th className="px-3 py-2 text-center">{t('detailDarts')}</th><th className="px-3 py-2 text-right">{t('detailCheckout')}</th><th className="px-3 py-2 text-right">{t('detailAvg')}</th></tr></thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {stats.legDetails.map(l => {
                                            const rowColor = l.winnerKey === 'p1' ? 'text-emerald-400' : 'text-purple-400';
                                            return (
                                                <tr key={l.index}>
                                                    <td className="px-3 py-2 font-bold text-slate-500">{l.index}</td>
                                                    <td className={`px-3 py-2 font-bold ${rowColor}`}>{l.winner}</td>
                                                    <td className={`px-3 py-2 text-center font-mono ${rowColor}`}>{l.darts}</td>
                                                    <td className={`px-3 py-2 text-right font-mono ${rowColor}`}>{l.checkout || '-'}</td>
                                                    <td className={`px-3 py-2 text-right font-mono ${rowColor}`}>{l.avg.toFixed(1)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    
                    {/* TLAČÍTKO ODVETA */}
                    <button onClick={onStartMatch} className="flex items-center justify-center w-full gap-3 py-4 mt-6 text-lg font-black text-white transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 rounded-xl active:scale-95">
                        <RotateCcw className="w-6 h-6" /> {t('rematch')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- UŽIVATELSKÝ PROFIL S ROZDĚLENÍM X01 A CRICKET ---
const UserProfile = ({ user, matches, onLogout, onDeleteAccount, onLogin, lang, currentP1Name }) => {
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

    return (
        <main className="relative z-10 flex-1 w-full overflow-y-auto bg-slate-950">
            <div className="flex flex-col w-full max-w-4xl gap-4 p-4 pb-24 mx-auto sm:p-6">
                
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

                <div className="flex p-1 border rounded-lg bg-slate-900 border-slate-800">
                    {[{v:'x01', l:'X01 (501)'}, {v:'cricket', l:'CRICKET'}].map(f => (
                        <button key={f.v} onClick={() => setGameTab(f.v)} className={`flex-1 py-3 text-xs font-black rounded-md uppercase tracking-wider transition-colors ${gameTab === f.v ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{f.l}</button>
                    ))}
                </div>
                <div className="flex p-1 border rounded-lg bg-slate-900 border-slate-800">
                    {[{v:'all', l:t('statsAllTime')}, {v:7, l:t('stats7Days')}, {v:30, l:t('stats30Days')}, {v:90, l:t('stats90Days')}].map(f => (
                        <button key={f.v} onClick={() => setTimeRange(f.v)} className={`flex-1 py-2 text-[10px] sm:text-xs font-bold rounded-md uppercase tracking-wider transition-colors ${timeRange === f.v ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{f.l}</button>
                    ))}
                </div>

                {gameTab === 'x01' && (
                    <div className="flex flex-col gap-4 duration-300 animate-in fade-in">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('avg3')}</span><span className="font-mono text-2xl font-black sm:text-3xl text-emerald-400">{overallAvg}</span></div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('statsFirst9')}</span><span className="font-mono text-2xl font-black text-indigo-400 sm:text-3xl">{overallFirst9}</span></div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl">
                                <span className="text-[8px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('winRate')}</span>
                                <div className="flex items-center gap-2"><span className="font-mono text-2xl font-black text-blue-400 sm:text-3xl">{winRate}%</span><span className="text-sm font-bold text-slate-600">|</span><span className="font-mono text-2xl font-black sm:text-3xl text-cyan-400">{legWinRate}%</span></div>
                                <span className="text-[8px] sm:text-[9px] text-slate-500 mt-1">{filteredMatches.length} {t('matches')} / {x01LegsPlayed} {t('legs')}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('statsAvgCheckout')}</span><span className="font-mono text-2xl font-black text-orange-400 sm:text-3xl">{avgCheckout}</span></div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 landscape:grid-cols-6 sm:gap-3">
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('stats100p')}</span><span className="font-mono text-xl font-black text-white">{total100s}</span></div>
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('stats140p')}</span><span className="font-mono text-xl font-black text-white">{total140s}</span></div>
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('total180s')}</span><span className="font-mono text-xl font-black text-red-400">{total180s}</span></div>
                            <div className="flex flex-col items-center justify-center col-span-3 p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl landscape:col-span-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('highestCheckout')}</span>
                                <div className="flex items-center gap-3"><span className="font-mono text-2xl font-black text-yellow-400">{highestCheckout}</span><span className="text-[9px] text-slate-500 border-l border-slate-700 pl-3">{checkouts100plus}x {t('checkout100')}</span></div>
                            </div>
                        </div>
                    </div>
                )}

                {gameTab === 'cricket' && (
                    <div className="flex flex-col gap-4 duration-300 animate-in fade-in">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                            <div className="flex flex-col items-center justify-center p-6 text-center border shadow-lg bg-slate-900 border-slate-800 rounded-xl"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">{t('totalMprInfo')}</span><span className="font-mono text-5xl font-black text-emerald-400">{overallMPR}</span></div>
                            <div className="flex flex-col items-center justify-center p-6 text-center border bg-slate-900 border-slate-800 rounded-xl">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">{t('winRate')}</span>
                                <div className="flex items-center gap-4"><span className="font-mono text-4xl font-black text-blue-400">{winRate}%</span><span className="text-2xl font-bold text-slate-600">|</span><span className="font-mono text-4xl font-black text-cyan-400">{legWinRate}%</span></div>
                                <span className="text-[9px] text-slate-500 mt-2">{filteredMatches.length} {t('matches')} / {cricLegsPlayed} {t('legs')}</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 sm:gap-3">
                            <div className="relative flex flex-col items-center justify-center p-4 overflow-hidden text-center border bg-slate-900 border-slate-800 rounded-xl">
                                <div className="absolute top-0 right-0 w-8 h-8 rounded-bl-full bg-yellow-500/10"></div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2 z-10">{t('whiteHorse')}</span>
                                <span className="z-10 font-mono text-3xl font-black text-yellow-400">{whiteHorses}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 text-center border bg-slate-900 border-slate-800 rounded-xl">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2">{t('marks7plus')}</span>
                                <span className="font-mono text-3xl font-black text-white">{highMarks}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 text-center border bg-slate-900 border-slate-800 rounded-xl">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2">{t('marks5plus')}</span>
                                <span className="font-mono text-3xl font-black text-slate-300">{goodMarks}</span>
                            </div>
                        </div>
                    </div>
                )}
                <button onClick={onDeleteAccount} className="w-full py-3 mt-4 text-sm font-bold tracking-widest text-red-400 uppercase transition-all border shadow-md bg-red-900/20 hover:bg-red-900/40 border-red-500/30 rounded-xl active:scale-95">{t('deleteAccount')}</button>
            </div>
        </main>
    );
};

// --- HLAVNÍ KOMPONENTA (ROUTER) ---
export default function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [isReady, setIsReady] = useState(true);
  const [appState, setAppState] = useState('home');
  const [lang, setLang] = useState('cs'); 
  const t = (k) => translations[lang]?.[k] || k;

  const [settings, setSettings] = useState({
    gameType: 'x01',
    startScore: 501, outMode: 'double',
    p1Name: translations[lang]?.p1Default || 'Domácí', p1Id: null,
    p2Name: translations[lang]?.p2Default || 'Hosté', p2Id: null,
    quickButtons: [41, 45, 60, 100, 140, 180],
    matchMode: 'first_to', matchTarget: 3,
    isBot: false, botLevel: 'pro', botAvg: 65,
    startPlayer: 'p1'
  });

  const [matchHistory, setMatchHistory] = useState(() => { try { const saved = safeStorage.getItem('dartsMatchHistory'); return saved ? JSON.parse(saved) : []; } catch(e){ return []; } });
  const [selectedMatchDetail, setSelectedMatchDetail] = useState(null); 
  const [activeKeyboardInput, setActiveKeyboardInput] = useState(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPC, setIsPC] = useState(false);
  const [tutorialTab, setTutorialTab] = useState('x01');

  useEffect(() => {
    const check = () => { setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth > 500); setIsPC(window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 768); };
    window.addEventListener('resize', check); check();
    return () => window.removeEventListener('resize', check);
  }, []);
  // Sledování změny jazyka a aktualizace výchozích jmen v nastavení
  useEffect(() => {
      setSettings(prev => {
          const p1Defaults = ['Domácí', 'Home', 'Gospodarze', translations?.cs?.p1Default, translations?.en?.p1Default, translations?.pl?.p1Default];
          const p2Defaults = ['Hosté', 'Away', 'Goście', translations?.cs?.p2Default, translations?.en?.p2Default, translations?.pl?.p2Default];
          const botDefaults = ['Robot', 'Bot', translations?.cs?.botDefault, translations?.en?.botDefault, translations?.pl?.botDefault];

          let newP1 = prev.p1Name;
          let newP2 = prev.p2Name;

          // Pokud je v políčku defaultní jméno, přepiš ho do nového jazyka
          if (p1Defaults.includes(prev.p1Name)) {
              newP1 = translations[lang]?.p1Default || 'Domácí';
          }
          if (prev.isBot && botDefaults.includes(prev.p2Name)) {
              newP2 = translations[lang]?.botDefault || 'Robot';
          } else if (!prev.isBot && p2Defaults.includes(prev.p2Name)) {
              newP2 = translations[lang]?.p2Default || 'Hosté';
          }

          return { ...prev, p1Name: newP1, p2Name: newP2 };
      });
  }, [lang]);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
        if (u) { setUser(u); } else { try { await signInAnonymously(auth); } catch (e) { setOfflineMode(true); } }
        setLoadingUser(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (user && !user.isAnonymous && user.displayName) {
          setSettings(prev => {
              const defaultNames = ['Domácí', 'Home', 'Gospodarze', translations.cs.p1Default, translations.en.p1Default, translations.pl.p1Default];
              if (!prev.p1Name || defaultNames.includes(prev.p1Name)) {
                  return { ...prev, p1Name: user.displayName.split(' ')[0], p1Id: user.uid };
              }
              return { ...prev, p1Id: user.uid };
          });
      } else if (user) {
          setSettings(prev => ({ ...prev, p1Id: user.uid }));
      }
  }, [user, lang]);

  useEffect(() => { safeStorage.setItem('dartsMatchHistory', JSON.stringify(matchHistory)); }, [matchHistory]);

  const handleMatchComplete = async (record) => {
      const fullRecord = { ...record, gameType: settings.gameType, startScore: settings.startScore, outMode: settings.outMode };
      setMatchHistory(prev => [fullRecord, ...prev]);
      if(db && user && !user.isAnonymous) { try { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), fullRecord); } catch(err) {} }
      setSelectedMatchDetail(fullRecord);
      setAppState('match_finished');
  };

  const handleKeyboardInput = (char) => { if (!activeKeyboardInput) return; setSettings(s => ({ ...s, [activeKeyboardInput]: s[activeKeyboardInput] + char })); };

  const handleLogin = async () => { 
      const provider = new GoogleAuthProvider(); 
      provider.setCustomParameters({ prompt: 'select_account' }); 
      try { await signInWithPopup(auth, provider); } catch (error) {} 
  };

  let legOptions = [];
  if (settings.matchMode === 'first_to') {
      legOptions = [1, 2, 3, 4, 5];
  } else {
      legOptions = [3, 5, 7, 9, 11];
  }

  useEffect(() => {
      if (!legOptions.includes(settings.matchTarget)) {
          setSettings(prev => ({ ...prev, matchTarget: legOptions[0] }));
      }
  }, [settings.matchMode]);

  if (!isReady) return <div className="w-full h-full bg-slate-950"></div>;

  if (appState === 'match_finished' || selectedMatchDetail) {
      return (
          <div className="flex flex-col bg-slate-950 text-slate-100 font-sans relative overflow-hidden w-full h-[100dvh]">
              <MatchStatsView data={selectedMatchDetail} onClose={() => { setSelectedMatchDetail(null); setAppState('setup'); }} title={t('matchStats')} lang={lang} onStartMatch={() => setAppState('playing')} />
          </div>
      );
  }

  if (appState === 'playing') {
      return (
          <div className="bg-slate-950 text-slate-100 font-sans flex flex-col relative w-full h-[100dvh] overflow-hidden">
              <header className="flex items-center justify-between px-4 py-3 border-b bg-slate-900 border-slate-800 shrink-0">
                  <button onClick={() => setAppState('setup')} className="p-2 transition-colors rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
                      <Home className="w-5 h-5" />
                  </button>
                  <div className="flex flex-col items-center">
                      <div className="flex items-center gap-2 text-[10px] sm:text-xs font-black tracking-[0.3em] uppercase">
                          <span className="text-slate-500">
                              {settings.gameType === 'cricket' ? 'CRICKET' : `${settings.startScore} ${settings.outMode === 'double' ? 'DO' : 'SO'}`}
                          </span>
                          <span className="text-slate-700">/</span>
                          <div className="flex items-center gap-1">
                              <span className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.4)]">
                                  {settings.matchMode === 'first_to' ? t('firstTo') : t('bestOf')}
                              </span>
                              <span className="text-white">{settings.matchTarget}</span>
                          </div>
                      </div>
                  </div>
                  <div className="flex p-1 border rounded-lg bg-slate-800 border-slate-700">
                      {['cs','en','pl'].map(l=><button key={l} onClick={()=>setLang(l)} className={`p-1 rounded transition-all ${lang===l?'bg-slate-600 opacity-100 shadow-sm':'opacity-40 grayscale'}`}><FlagIcon lang={l} /></button>)}
                  </div>
              </header>
              {settings.gameType === 'x01' ? (
                  <GameX01 settings={settings} lang={lang} isLandscape={isLandscape} isPC={isPC} onAbort={() => setAppState('setup')} onMatchComplete={handleMatchComplete} />
              ) : (
                  <GameCricket settings={settings} lang={lang} isLandscape={isLandscape} isPC={isPC} onAbort={() => setAppState('setup')} onMatchComplete={handleMatchComplete} />
              )}
          </div>
      );
  }

  return (
    <div className="bg-slate-950 text-slate-100 font-sans flex flex-col relative w-full h-[100dvh] overflow-hidden">
      
      {activeKeyboardInput && <VirtualKeyboard onChar={handleKeyboardInput} onDelete={() => setSettings(s => ({...s, [activeKeyboardInput]: s[activeKeyboardInput].slice(0,-1)}))} onClose={() => setActiveKeyboardInput(null)} lang={lang} />}

      <header className="relative z-20 flex items-center justify-between p-2 border-b h-14 bg-slate-900 border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
            {appState === 'home' ? (
                <div className="text-[10px] font-mono text-slate-500 border border-slate-800 rounded px-1.5 py-0.5">{APP_VERSION}</div>
            ) : (
                <button onClick={() => setAppState('home')} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"><Home className="w-6 h-6" /></button>
            )}
        </div>
        <div className="flex items-center gap-2">
            <div className="flex p-1 border rounded-lg bg-slate-800 border-slate-700">{['cs','en','pl'].map(l=><button key={l} onClick={()=>setLang(l)} className={`p-1 rounded transition-all ${lang===l?'bg-slate-600 opacity-100 shadow-sm':'opacity-40 grayscale'}`}><FlagIcon lang={l} /></button>)}</div>
        </div>
      </header>

      {/* --- HOME --- */}
      {appState === 'home' && (
        <main className="flex flex-col items-center justify-center flex-1 w-full max-w-md gap-5 p-6 mx-auto overflow-y-auto">
            <div className="flex flex-col items-center mb-2">
                <div className="flex items-center justify-center w-20 h-20 mb-3 rounded-full shadow-lg bg-emerald-600 shadow-emerald-900/50">
                    <Target className="w-10 h-10 text-slate-900" />
                </div>
                <h1 className="text-3xl font-black leading-none tracking-widest text-white">SIMPLE DART</h1>
                <h2 className="mt-1 text-sm font-bold tracking-widest text-emerald-500">COUNTER</h2>
            </div>
            
            <button onClick={() => setAppState('setup')} className="flex justify-center w-full gap-3 py-4 text-xl font-black text-white transition-transform shadow-lg bg-emerald-600 hover:bg-emerald-500 rounded-2xl active:scale-95"><Play className="fill-current w-7 h-7" /> {t('newGame')}</button>
            
            <div className="grid w-full grid-cols-2 gap-3">
                <button onClick={() => setAppState('tutorial')} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><FileText className="w-7 h-7 text-emerald-400" /><span className="text-sm font-bold text-white">{t('tutorial')}</span></button>
                <button onClick={() => setAppState('history')} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><History className="text-blue-400 w-7 h-7" /><span className="text-sm font-bold text-white">{t('matchHistory')}</span></button>
                <button onClick={() => setAppState('profile')} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><BarChart2 className="text-purple-400 w-7 h-7" /><span>{t('statsPersonal')}</span></button>
                <button onClick={() => setAppState('about')} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><Info className="text-yellow-400 w-7 h-7" /><span className="text-sm font-bold text-white">{t('aboutApp')}</span></button>
            </div>

            {(!user || user.isAnonymous) ? (
                <button onClick={handleLogin} className="flex items-center justify-center w-full gap-3 p-3 mt-2 transition-transform border shadow-md bg-slate-900 hover:bg-slate-800 border-slate-700 rounded-xl active:scale-95">
                    <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    <span className="text-xs font-bold tracking-widest uppercase text-slate-300">{t('loginWithGoogle') || 'Přihlásit přes Google'}</span>
                </button>
            ) : (
                <div className="flex items-center justify-between w-full p-3 mt-2 border shadow-md bg-slate-900 border-slate-700 rounded-xl">
                    <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Přihlášen jako:</span>
                        <div className="flex items-center gap-1.5 text-slate-300">
                            <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-xs font-bold truncate">{user.email}</span>
                        </div>
                    </div>
                    <button onClick={() => signOut(auth)} className="shrink-0 bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-400 text-[10px] uppercase font-bold tracking-widest px-3 py-2 rounded-lg transition-colors">
                        {t('logout') || 'Odhlásit'}
                    </button>
                </div>
            )}
        </main>
      )}

      {/* --- SETUP --- */}
      {appState === 'setup' && (
        <main className="flex flex-col items-center flex-1 w-full p-4 overflow-y-auto">
          <div className="w-full max-w-lg pb-20 space-y-4">
            <div className="flex p-1 border shadow-md bg-slate-800 rounded-xl border-slate-700">
                <button onClick={() => setSettings({...settings, gameType: 'x01'})} className={`flex-1 py-3 text-sm font-black rounded-lg uppercase tracking-widest transition-colors ${settings.gameType === 'x01' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>X01</button>
                <button onClick={() => setSettings({...settings, gameType: 'cricket'})} className={`flex-1 py-3 text-sm font-black rounded-lg uppercase tracking-widest transition-colors ${settings.gameType === 'cricket' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>CRICKET</button>
            </div>

            <div className="p-4 space-y-4 border bg-slate-900 rounded-xl border-slate-800">
                <div className="flex justify-between items-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                    <span>{t('players')}</span>
                    <div className="flex items-center gap-1.5 text-emerald-500">
                        <Target className="w-3.5 h-3.5" />
                        <span>{t('whoStarts')}</span>
                    </div>
                </div>
                <div className="flex items-stretch gap-2">
                    <div onClick={() => setActiveKeyboardInput('p1Name')} className="flex items-center flex-1 gap-3 px-4 py-3 text-sm text-white border rounded-lg shadow-inner cursor-pointer bg-slate-800 border-slate-700">
                        <User className="w-5 h-5 text-slate-400 shrink-0" />
                        <span className="font-bold truncate">{settings.p1Name || t('p1Placeholder')}</span>
                    </div>
                    <button onClick={() => setSettings({...settings, startPlayer: 'p1'})} className={`w-14 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${settings.startPlayer === 'p1' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-600 hover:text-slate-400'}`}>
                        <Target className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="flex items-stretch gap-2">
                    <div onClick={() => !settings.isBot && setActiveKeyboardInput('p2Name')} className={`flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm flex items-center gap-3 ${settings.isBot ? 'text-emerald-400 bg-emerald-900/10 border-emerald-900/50' : 'text-white cursor-pointer shadow-inner'}`}>
                        {settings.isBot ? <Cpu className="w-5 h-5 shrink-0" /> : <User className="w-5 h-5 text-slate-400 shrink-0" />}
                        <span className="font-bold truncate">{settings.isBot ? getTranslatedName(settings.p2Name, false, lang) : (settings.p2Name || t('p2Placeholder'))}</span>
                    </div>
                    
                    <button 
                        onClick={() => {
                            const newIsBot = !settings.isBot;
                            setSettings({...settings, isBot: newIsBot, p2Name: newIsBot ? translations[lang].botDefault : translations[lang].p2Default})
                        }} 
                        className={`w-14 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${settings.isBot ? 'bg-emerald-600/20 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-600 hover:text-slate-400'}`}
                    >
                        <Cpu className="w-6 h-6" />
                    </button>

                    <button onClick={() => setSettings({...settings, startPlayer: 'p2'})} className={`w-14 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${settings.startPlayer === 'p2' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-600 hover:text-slate-400'}`}>
                        <Target className="w-6 h-6" />
                    </button>
                </div>

                {settings.isBot && (
                    <div className="p-3 mt-2 duration-200 border rounded-lg bg-slate-800/50 border-slate-700 animate-in fade-in zoom-in-95">
                        <label className="text-slate-400 text-[10px] font-bold uppercase mb-2 flex tracking-widest items-center gap-2">
                            <Cpu className="w-4 h-4"/> {t('botDifficulty')}
                        </label>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {[{ id: 'amateur', l: t('diffAmateur'), avg: 45 }, { id: 'pro', l: t('diffPro'), avg: 65 }, { id: 'world_class', l: t('diffWorldClass'), avg: 100 }, { id: 'custom', l: t('diffCustom') || 'Vlastní', avg: settings.botLevel === 'custom' ? settings.botAvg : 60 }].map(b => (
                                <button key={b.id} onClick={() => setSettings({...settings, botLevel: b.id, botAvg: b.avg})} className={`py-2 px-2 rounded-lg font-bold text-xs transition-colors ${settings.botLevel === b.id ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}>{b.l}</button>
                            ))}
                        </div>
                        {settings.botLevel === 'custom' && (
                            <div className="p-3 border rounded-lg bg-slate-900 border-slate-700">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold uppercase text-slate-400">{t('customAvg') || 'Vlastní AVG'}</span>
                                    <span className="font-mono text-lg font-black text-emerald-400">{settings.botAvg}</span>
                                </div>
                                <input 
                                    type="range" min="40" max="120" step="1" 
                                    value={settings.botAvg} 
                                    onChange={(e) => setSettings({...settings, botAvg: parseInt(e.target.value)})} 
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-emerald-500" 
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                                    <span>40</span><span>120</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {settings.gameType === 'x01' && (
                <div className="p-4 border bg-slate-900 rounded-xl border-slate-800 animate-in fade-in slide-in-from-top-2">
                    <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3 block">Pravidla X01</label>
                    <div className="grid grid-cols-2 gap-3 mb-3">{[301, 501].map(s => <button key={s} onClick={()=>setSettings({...settings, startScore:s})} className={`py-3 px-3 rounded-lg font-bold border transition-colors ${settings.startScore===s?'bg-emerald-600 border-emerald-500 text-white':'bg-slate-800 border-slate-700 text-slate-400'}`}>{s}</button>)}</div>
                    <div className="grid grid-cols-2 gap-3">{['single', 'double'].map(m => <button key={m} onClick={()=>setSettings({...settings, outMode:m})} className={`py-3 px-3 rounded-lg font-bold text-sm border uppercase transition-colors ${settings.outMode===m?'bg-blue-600 border-blue-500 text-white':'bg-slate-800 border-slate-700 text-slate-400'}`}>{m} OUT</button>)}</div>
                </div>
            )}
            <div className="p-4 border bg-slate-900 rounded-xl border-slate-800">
                <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3 block">{t('matchFormat')}</label>
                <div className="flex p-1 mb-4 border rounded-lg bg-slate-800 border-slate-700">
                    <button onClick={() => setSettings({...settings, matchMode: 'first_to'})} className={`flex-1 py-2 text-xs font-black rounded-md uppercase tracking-widest transition-colors ${settings.matchMode === 'first_to' ? 'bg-slate-100 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('firstTo')}</button>
                    <button onClick={() => setSettings({...settings, matchMode: 'best_of'})} className={`flex-1 py-2 text-xs font-black rounded-md uppercase tracking-widest transition-colors ${settings.matchMode === 'best_of' ? 'bg-slate-100 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('bestOf')}</button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                    {legOptions.map(n => <button key={n} onClick={()=>setSettings({...settings, matchTarget:n})} className={`py-3 rounded-lg font-bold border transition-colors ${settings.matchTarget===n?'bg-emerald-600 border-emerald-500 text-white':'bg-slate-800 border-slate-700 text-slate-400'}`}>{n}</button>)}
                </div>
            </div>
            <button onClick={() => setAppState('playing')} className="flex items-center justify-center w-full gap-2 py-4 mt-2 text-xl font-black transition-all shadow-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-xl shadow-emerald-900/20 active:scale-95"><Play className="w-6 h-6 fill-current" /> {t('startMatch')}</button>
          </div>
        </main>
      )}

      {/* --- HISTORY --- */}
      {appState === 'history' && (
        <main className="flex flex-col items-center flex-1 w-full p-4 overflow-y-auto">
            <div className="w-full max-w-lg pb-20 space-y-4">
                <h2 className="flex items-center justify-center gap-2 mt-4 mb-6 text-2xl font-black tracking-widest text-white uppercase"><History className="w-6 h-6 text-emerald-500"/> {t('matchHistory')}</h2>
                <div className="mt-2 overflow-hidden border bg-slate-900 rounded-xl border-slate-800">
                    {(() => {
                        const myMatches = matchHistory;
                        if (myMatches.length === 0) return <div className="p-8 text-center text-slate-500">{t('noMatches')}</div>;
                        return (
                            <div className="divide-y divide-slate-800">
                                {myMatches.map(m => (
                                    <div key={m.id} className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/50" onClick={() => setSelectedMatchDetail(m)}>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="text-xs text-slate-500">{m.date}</div>
                                                <div className="text-[9px] uppercase font-bold px-1.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                                    {m.gameType === 'cricket' ? 'CRICKET' : `${m.startScore} ${m.outMode === 'double' ? 'DO' : 'SO'}`}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`font-bold ${m.matchWinner === 'p1' ? 'text-emerald-400' : 'text-slate-400'}`}>{getTranslatedName(m.p1Name, true, lang)}</div>
                                                <div className="bg-slate-950 px-3 py-0.5 rounded text-sm font-mono font-bold border border-slate-800 flex gap-1">
                                                    <span className={m.matchWinner === 'p1' ? 'text-emerald-500' : 'text-slate-500'}>{m.p1Legs}</span><span className="text-slate-600">-</span><span className={m.matchWinner === 'p2' ? 'text-purple-500' : 'text-slate-500'}>{m.p2Legs}</span>
                                                </div>
                                                
                                                {/* Přidání obtížnosti Bota v seznamu historie zápasů */}
                                                <div className={`font-bold flex items-center gap-1 ${m.matchWinner === 'p2' ? 'text-purple-400' : 'text-slate-400'}`}>
                                                    {getTranslatedName(m.p2Name, false, lang)}
                                                    {m.isBot && <span className="text-[10px] text-emerald-500 font-bold border border-emerald-500/30 px-1 rounded bg-emerald-900/20">{m.botLevel === 'custom' ? `AVG ${m.botAvg}` : (translations[lang]?.[`diff${m.botLevel.charAt(0).toUpperCase() + m.botLevel.slice(1)}`] || m.botLevel)}</span>}
                                                </div>
                                                
                                            </div>
                                        </div>
                                        <button onClick={async (e) => { e.stopPropagation(); setMatchHistory(p => p.filter(x => x.id !== m.id)); if (m.docId && db && user && !offlineMode) { try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'matches', m.docId)); } catch(err) {} } }} className="p-3 transition-colors rounded-lg text-slate-600 hover:text-red-400 hover:bg-slate-800"><Trash2 className="w-5 h-5" /></button>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </main>
      )}

      {/* --- TUTORIAL --- */}
      {appState === 'tutorial' && (
        <main className="relative z-10 flex flex-col items-center flex-1 w-full p-4 pb-20 overflow-y-auto sm:p-6">
            <h2 className="flex items-center gap-2 mb-6 text-2xl font-black tracking-widest text-white uppercase"><FileText className="w-6 h-6 text-emerald-500"/> {t('tutorial')}</h2>
            
            <div className="flex w-full max-w-md p-1 mb-6 border shadow-md bg-slate-800 rounded-xl border-slate-700">
                <button onClick={() => setTutorialTab('x01')} className={`flex-1 py-3 text-xs font-black rounded-lg uppercase tracking-widest transition-colors ${tutorialTab === 'x01' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('tutTabX01')}</button>
                <button onClick={() => setTutorialTab('cricket')} className={`flex-1 py-3 text-xs font-black rounded-lg uppercase tracking-widest transition-colors ${tutorialTab === 'cricket' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('tutTabCricket')}</button>
            </div>

            <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
                {tutorialTab === 'x01' && (
                    <>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Target className="w-6 h-6 text-blue-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutX01Title1')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutX01Desc1')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><CheckCircle className="w-6 h-6 text-emerald-500" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutX01Title2')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutX01Desc2')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><KeyboardIcon className="w-6 h-6 text-yellow-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutX01Title3')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutX01Desc3')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><History className="w-6 h-6 text-orange-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutX01Title4')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutX01Desc4')}</p></div>
                        </div>
                    </>
                )}
                {tutorialTab === 'cricket' && (
                    <>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Target className="w-6 h-6 text-purple-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutCricTitle1')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutCricDesc1')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><CheckCircle className="w-6 h-6 text-emerald-500" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutCricTitle2')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutCricDesc2')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800 md:col-span-2">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Trophy className="w-6 h-6 text-yellow-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutCricTitle3')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutCricDesc3')}</p></div>
                        </div>
                    </>
                )}
                <div className="grid grid-cols-1 col-span-1 gap-4 pt-4 mt-4 border-t md:col-span-2 border-slate-800 md:grid-cols-2">
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl">
                        <div className="p-2 shrink-0"><Cpu className="w-6 h-6 text-emerald-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">{t('tutCommonTitle1')}</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutCommonDesc1')}</p></div>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl">
                        <div className="p-2 shrink-0"><Target className="w-6 h-6 text-blue-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">{t('tutCommonTitle2')}</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutCommonDesc2')}</p></div>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl">
                        <div className="p-2 shrink-0"><Undo2 className="w-6 h-6 text-orange-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">{t('tutCommonTitle3')}</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutCommonDesc3')}</p></div>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl">
                        <div className="p-2 shrink-0"><Cloud className="w-6 h-6 text-purple-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">{t('tutCommonTitle4')}</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutCommonDesc4')}</p></div>
                    </div>
                </div>
            </div>
        </main>
      )}

      {/* --- O APLIKACI --- */}
      {appState === 'about' && (
        <main className="relative z-10 flex flex-col items-center flex-1 w-full max-w-lg p-4 pb-20 mx-auto overflow-y-auto sm:p-6">
            <h2 className="flex items-center gap-2 mb-6 text-2xl font-black tracking-widest text-white uppercase"><Info className="w-6 h-6 text-yellow-500"/> {t('aboutApp')}</h2>
            <div className="w-full p-6 space-y-6 border shadow-xl bg-slate-900 rounded-2xl border-slate-800">
                <div className="pb-6 space-y-2 text-center border-b border-slate-800">
                    <div className="flex items-center justify-center w-20 h-20 mx-auto mb-4 rounded-full shadow-lg bg-emerald-600"><Target className="w-10 h-10 text-slate-900" /></div>
                    <h1 className="text-2xl font-black tracking-widest text-white">SIMPLE DART</h1>
                    <h2 className="text-sm font-bold tracking-widest text-emerald-500">COUNTER</h2>
                    <div className="mt-2 font-mono text-xs text-slate-500">Verze {APP_VERSION}</div>
                </div>
                <div className="pt-2 text-center">
                    <p className="text-sm text-slate-400">{t('aboutText')}</p>
                    <button onClick={() => window.location.href = '/privacy.html'} className="flex items-center justify-center w-full gap-2 mt-8 text-sm font-bold tracking-widest underline uppercase text-emerald-500 hover:text-emerald-400">
                        {typeof t === 'function' ? t('privacyPolicy') : 'Zásady ochrany soukromí'}
                    </button>
                </div>
                <div className="text-center text-[10px] text-slate-500 pt-4 border-t border-slate-800">&copy; {new Date().getFullYear()} Vít (ViteCZech).<br/> Všechna práva vyhrazena.</div>
            </div>
        </main>
      )}

      {/* --- PROFIL / STATISTIKY --- */}
      {appState === 'profile' && user && (
          <UserProfile 
              user={user} 
              matches={matchHistory} 
              onLogout={()=>signOut(auth)} 
              onLogin={handleLogin}
              
              // Komplexní smazání účtu včetně historie zápasů
              onDeleteAccount={async () => { 
                if(window.confirm(t('deleteAccountConfirm') || 'Opravdu chcete nenávratně smazat účet a veškerou historii zápasů?')) { 
                    try { 
                        // 1. Smazání z Firebase DB (pokud je online a přihlášen)
                        if (db && !offlineMode && !user.isAnonymous) {
                            const q1 = query(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), where('p1Id', '==', user.uid));
                            const q2 = query(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), where('p2Id', '==', user.uid));
                            
                            const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                            const deletePromises = [];
                            snap1.forEach(d => deletePromises.push(deleteDoc(d.ref)));
                            snap2.forEach(d => deletePromises.push(deleteDoc(d.ref)));
                            
                            await Promise.all(deletePromises);
                        }
    
                        // 2. Vymazání z lokální paměti prohlížeče
                        setMatchHistory(prev => prev.filter(m => m.p1Id !== user.uid && m.p2Id !== user.uid));
                        
                        // 3. Smazání samotného uživatelského účtu
                        await deleteUser(user); 
                        setAppState('home'); 
                    } catch(e) {
                        console.error('Chyba při mazání:', e);
                        alert('Chyba. Z bezpečnostních důvodů vyžaduje Google před smazáním účtu čerstvé přihlášení. Odhlaste se, znovu se přihlaste a akci opakujte.');
                    } 
                } 
              }} 
              lang={lang}
              currentP1Name={settings.p1Name}
          />
      )}

    </div>
  );
}