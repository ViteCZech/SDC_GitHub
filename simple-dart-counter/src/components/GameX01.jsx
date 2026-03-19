import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Delete, Mic, MicOff, Target, Trophy, Undo2, X } from 'lucide-react';
import { translations } from '../translations';

const IMPOSSIBLE_SCORES = [163, 166, 169, 172, 173, 175, 176, 178, 179];

const getMinDartsToCheckout = (score, outMode) => {
    if (score === 0) return 0;
    if (score > 180) return Infinity;
    if (IMPOSSIBLE_SCORES.includes(score)) return Infinity;
    if (outMode === 'single') { 
        if (score <= 60) return 1; 
        if (score <= 120) return 2; 
        return 3; 
    }
    if (score > 170) return Infinity; 
    const doubleOutBogeys = [159, 162, 163, 165, 166, 168, 169];
    if (doubleOutBogeys.includes(score)) return Infinity;
    if (score === 50 || (score <= 40 && score % 2 === 0 && score > 0)) return 1;
    if (score <= 110) return 2; 
    return 3;
};

const randNormal = (mean, stdDev) => {
    let u=0, v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random();
    return Math.round((Math.sqrt(-2.0*Math.log(u))*Math.cos(2.0*Math.PI*v))*stdDev+mean);
};

// --- Modals ---
const EditScoreModal = ({ initialScore, initialDarts, isFinish, scoreBefore, outMode, onSave, onCancel, lang }) => {
    const [score, setScore] = useState(initialScore.toString());
    const [darts, setDarts] = useState(initialDarts);
    const [isFirstEntry, setIsFirstEntry] = useState(true); 
    const t = (k) => translations[lang]?.[k] || k;

    const handleNum = (n) => { if (isFirstEntry) { setScore(n); setIsFirstEntry(false); } else { if (score.length >= 3) return; setScore(score === '0' ? n : score + n); } };
    const handleDel = () => { setIsFirstEntry(false); setScore(score.length > 1 ? score.slice(0, -1) : '0'); };

    const currentScoreInt = parseInt(score) || 0;
    const isNewFinish = (scoreBefore - currentScoreInt) === 0;
    const minDartsNeeded = isNewFinish ? getMinDartsToCheckout(scoreBefore, outMode) : 1;
    
    const btnBase = "h-12 sm:h-14 landscape:h-8 bg-slate-800 text-xl font-bold rounded-xl active:bg-slate-700 border border-slate-700/50 select-none touch-manipulation flex items-center justify-center";

    useEffect(() => {
        const handleKeyDown = (e) => {
            const key = e.key;
            if (/^[0-9]$/.test(key)) { e.preventDefault(); handleNum(key); }
            else if (key === 'Backspace') { e.preventDefault(); handleDel(); }
            else if (key === 'Enter') { e.preventDefault(); onSave(currentScoreInt, isNewFinish ? (darts < minDartsNeeded ? minDartsNeeded : darts) : 3); }
            else if (key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [score, isFirstEntry, darts, minDartsNeeded, currentScoreInt, isNewFinish]);

    return (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center p-2 sm:p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-3 landscape:p-1.5 sm:p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center shrink-0">
                    <div className="flex flex-col">
                        <h3 className="font-bold text-slate-300 uppercase tracking-widest text-xs landscape:text-[10px]">{t('editThrow')}</h3>
                        <span className="text-[10px] landscape:text-[8px] text-slate-500 italic">{t('originalScore')} {initialScore}</span>
                    </div>
                    <button onClick={onCancel} className="p-1 text-slate-500 hover:text-white"><X className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                </div>
                <div className="flex flex-col items-center gap-2 p-4 overflow-y-auto landscape:p-2 sm:p-6 landscape:gap-1 sm:gap-4">
                    <div className={`text-5xl landscape:text-3xl sm:text-6xl font-black font-mono px-6 py-2 landscape:py-1 sm:py-4 rounded-xl border shadow-inner transition-colors ${isFirstEntry ? 'text-slate-500 bg-slate-900 border-slate-800' : 'text-emerald-500 bg-slate-950 border-emerald-500/30'}`}>{score}</div>
                    
                    {isNewFinish && (
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] landscape:text-[8px] font-bold text-slate-500 uppercase tracking-widest">{t('howManyDarts')}</span>
                            <div className="flex gap-2">
                                {[1, 2, 3].map(d => <button key={d} disabled={d < minDartsNeeded} onClick={() => setDarts(d)} className={`w-10 h-10 landscape:w-8 landscape:h-8 rounded-lg font-bold border transition-all ${d < minDartsNeeded ? 'opacity-10 cursor-not-allowed bg-slate-900' : (darts === d ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400')}`}>{d}</button>)}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-1.5 landscape:gap-1 sm:gap-2 w-full mt-1 sm:mt-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (<button key={n} onClick={() => handleNum(n.toString())} className={btnBase}>{n}</button>))}
                        <button onClick={handleDel} className={`${btnBase} text-red-400 active:bg-red-900/20`}><Delete className="w-5 h-5 sm:w-6 sm:h-6"/></button>
                        <button onClick={() => handleNum('0')} className={btnBase}>0</button>
                        <button onClick={() => onSave(currentScoreInt, isNewFinish ? (darts < minDartsNeeded ? minDartsNeeded : darts) : 3)} className={`${btnBase} bg-emerald-600 text-white border-emerald-500 active:scale-95 shadow-lg shadow-emerald-900/20`}><CheckCircle className="w-6 h-6 sm:w-8 sm:h-8"/></button>
                    </div>
                    <button onClick={onCancel} className="w-full py-1.5 sm:py-2 text-slate-500 text-xs landscape:text-[10px] font-bold uppercase tracking-widest hover:text-slate-300 transition-colors mt-1">{t('cancel')}</button>
                </div>
            </div>
        </div>
    );
};

const FinishDartsSelector = ({ points, minDarts, onConfirm, onCancel, lang, player }) => {
    const t = (k) => translations[lang]?.[k] || k;
    const isP1 = player === 'p1';
    const borderColor = isP1 ? 'border-emerald-500' : 'border-purple-500';
    const textColor = isP1 ? 'text-emerald-500' : 'text-purple-500';
    const btnActiveColor = isP1 ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40 border-emerald-800' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/40 border-purple-800';

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex flex-col items-center justify-center p-4">
            <div className={`bg-slate-900 border-2 ${borderColor} w-full max-w-xs rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-6 animate-in zoom-in duration-200`}>
                <div className="text-center"><h3 className={`${textColor} font-black text-2xl uppercase tracking-tighter italic`}>{t('closed')}!</h3><p className="mt-1 text-sm font-bold tracking-widest uppercase text-slate-400">{t('howManyDarts')}</p></div>
                <div className="px-6 py-3 font-mono text-5xl font-black text-white border rounded-lg bg-slate-950 border-slate-800">{points}</div>
                <div className="grid w-full grid-cols-3 gap-3">{[1, 2, 3].map(d => <button key={d} disabled={d < minDarts} onClick={() => onConfirm(d)} className={`h-20 text-white rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 shadow-lg border-b-4 transition-all ${d < minDarts ? 'bg-slate-800 opacity-20 cursor-not-allowed' : btnActiveColor}`}><span className="text-3xl font-black">{d}</span><span className="text-[10px] uppercase font-bold">{t('confirmDarts')}</span></button>)}</div>
                <button onClick={onCancel} className="text-xs font-bold uppercase transition-colors text-slate-500 hover:text-slate-300">{t('cancel')}</button>
            </div>
        </div>
    );
};

export default function GameX01({ settings, lang, onMatchComplete, isLandscape, isPC }) {
    // 1. Zde máte překladovou funkci (pokud ne, přidejte ji)
  const t = (k) => translations[lang]?.[k] || k;

  // 2. HNED POD NI VLOŽTE getDisplayName:
  const getDisplayName = (name, isP1, isBot) => {
    if (!name) return '';
    
    // Bezpečný převod na malá písmena
    const lowerName = String(name).trim().toLowerCase();
    
    const p1Defaults = ['domácí', 'home', 'gospodarze'];
    const p2Defaults = ['hosté', 'away', 'goście'];
    const botDefaults = ['robot', 'bot'];

    if (isP1 && p1Defaults.includes(lowerName)) return t('p1Default') || 'Domácí';
    if (!isP1 && isBot && (botDefaults.includes(lowerName) || p2Defaults.includes(lowerName))) return t('botDefault') || 'Robot';
    if (!isP1 && p2Defaults.includes(lowerName)) return t('p2Default') || 'Hosté';
    
    return name;
  };
  const [gameState, setGameState] = useState({
    p1Score: settings.startScore, p2Score: settings.startScore, p1Legs: 0, p2Legs: 0, p1Sets: 0, p2Sets: 0,
    currentPlayer: settings.startPlayer, startingPlayer: settings.startPlayer,
    winner: null, matchWinner: null, history: [], completedLegs: [] 
  });

  const [currentInput, setCurrentInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [editingMove, setEditingMove] = useState(null); 
  const [finishData, setFinishData] = useState(null);

  const [longPressIdx, setLongPressIdx] = useState(null);
  const longPressTimer = useRef(null);
  const historyRef = useRef(null);

  const [isListening, setIsListening] = useState(false); 
  const [isMicActive, setIsMicActive] = useState(false); 

  const recognitionRef = useRef(null);
  const gameStateRef = useRef(gameState);
  const isMicActiveRef = useRef(isMicActive);
  const currentInputRef = useRef(currentInput);
  const finishDataRef = useRef(finishData);
  const processTurnRef = useRef(null);
  const handleTurnCommitRef = useRef(null);
  const micTimeoutRef = useRef(null);

  const [quickButtons, setQuickButtons] = useState(settings.quickButtons || [41, 45, 60, 100, 140, 180]);

    useEffect(() => {
      gameStateRef.current = gameState; isMicActiveRef.current = isMicActive;
      currentInputRef.current = currentInput; finishDataRef.current = finishData;
      if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; 
  }, [gameState, isMicActive, currentInput, finishData]);

  // Klávesnice
  useEffect(() => {
      const handleGlobalKeyDown = (e) => {
          if (editingMove || finishData || gameState.matchWinner) return;
          if (!isPC) return;
          const key = e.key;
          if (/^[0-9]$/.test(key)) { e.preventDefault(); setCurrentInput(prev => prev.length < 3 ? prev + key : prev); }
          else if (key === 'Backspace') { e.preventDefault(); setCurrentInput(prev => prev.slice(0, -1)); }
          else if (key === 'Enter') { e.preventDefault(); const cVal = currentInputRef.current; if (cVal !== '') handleTurnCommitRef.current(parseInt(cVal)); }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editingMove, finishData, isPC, gameState.matchWinner]);

  // Pomocná funkce: převod mluvených čísel na číslo (např. "sto" -> 100)
  const parseNumberFromSpeech = (transcript) => {
      if (!transcript) return null;
      // 1) nejdřív zkusit číslice (původní chování, když engine vrátí např. "100")
      const digits = transcript.match(/\d+/g);
      if (digits) return parseInt(digits.join(''));

      const text = transcript.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Pár konkrétních frází pro skóre do 180 (cz)
      const exactMap = {
          'sto osmdesat': 180,
          'sto sedmdesat': 170,
          'sto sedesat': 160,
          'sto padesat': 150,
          'sto ctyricet': 140,
          'sto tricet': 130,
          'sto dvacet': 120,
          'sto deset': 110,
          'sto': 100
      };
      if (exactMap[text] != null) return exactMap[text];

      // Základní slovní čísla – hlavně pro 1–3 ("na dvě", "na tři" atd.)
      const wordToNum = {
          // Czech
          'nula': 0, 'jedna': 1, 'jeden': 1, 'dva': 2, 'dve': 2, 'tri': 3,
          'ctyri': 4, 'pet': 5, 'sest': 6, 'sedm': 7, 'osm': 8, 'devet': 9,
          'deset': 10,
          // English
          'zero': 0, 'one': 1, 'two': 2, 'three': 3,
          // Polish (základ)
          'jeden': 1, 'dwa': 2, 'trzy': 3
      };
      const tokens = text.split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
          const w = tokens[i];
          if (wordToNum[w] != null) {
              return wordToNum[w];
          }
      }
      return null;
  };

  // Mikrofon
  useEffect(() => {
      let recognition = recognitionRef.current;
      if (isMicActive) {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!SpeechRecognition) {
              setIsMicActive(false); setErrorMsg(String(translations[lang]?.micError || 'Chyba mikrofonu')); setTimeout(() => setErrorMsg(''), 2000); return;
          }
          recognition = new SpeechRecognition();
          recognition.continuous = true; recognition.interimResults = false;
          recognition.lang = lang === 'en' ? 'en-US' : (lang === 'pl' ? 'pl-PL' : 'cs-CZ');
          recognition.onstart = () => setIsListening(true);
          recognition.onend = () => { setIsListening(false); if (isMicActiveRef.current) { try { recognition.start(); } catch(e) {} } };
          recognition.onresult = (event) => { handleVoiceCommand(event.results[event.results.length - 1][0].transcript.toLowerCase().trim()); };
          recognition.onerror = (e) => { if (e.error === 'not-allowed') { setIsMicActive(false); setErrorMsg('Přístup k mikrofonu odepřen.'); setTimeout(() => setErrorMsg(''), 2500); } };
          try { recognition.start(); } catch(e) {}
          recognitionRef.current = recognition;
      } else {
          if (recognition) { recognition.onend = null; recognition.stop(); setIsListening(false); }
      }
      return () => { if (recognition) { recognition.onend = null; recognition.stop(); } };
  }, [isMicActive, lang]);

  const handleVoiceCommand = (transcript) => {
      const tMap = translations[lang];
      // už čekáme jen na počet šipek pro checkout
      if (finishDataRef.current) {
          const num = parseNumberFromSpeech(transcript);
          if (num != null) {
              if (num >= finishDataRef.current.minD && num <= 3) {
                  processTurnRef.current(finishDataRef.current.points, num);
                  setFinishData(null);
              } else {
                  setErrorMsg(`Nemožné zavřít na ${num} šipek`);
                  setTimeout(() => setErrorMsg(''), 2000);
              }
          }
          return; 
      }
      // "zavřeno na dvě / tři" – zkusíme z hlasu vytáhnout i počet šipek
      if (tMap?.checkoutPhrases?.some(p => transcript.includes(p))) {
          if (!gameStateRef.current.winner) {
              const cScore = gameStateRef.current.currentPlayer === 'p1' ? gameStateRef.current.p1Score : gameStateRef.current.p2Score;
              const requestedDarts = parseNumberFromSpeech(transcript);
              if (requestedDarts != null && requestedDarts >= 1 && requestedDarts <= 3) {
                  const minD = getMinDartsToCheckout(cScore, settings.outMode);
                  if (minD === Infinity || requestedDarts < minD) {
                      setErrorMsg(`Nemožné zavřít na ${requestedDarts} šipky`);
                      setTimeout(() => setErrorMsg(''), 2000);
                  } else {
                      processTurnRef.current(cScore, requestedDarts);
                  }
              } else {
                  // bez konkrétního počtu šipek – chová se jako dříve
                  handleTurnCommitRef.current(cScore);
              }
          }
          return;
      }
      if (tMap?.cmdUndo?.some(p => transcript.includes(p))) {
           if (!gameStateRef.current.winner && gameStateRef.current.history.length > 0) handleUndoClick();
           return;
      }
      if (tMap?.cmdNextLeg?.some(p => transcript.includes(p))) {
          if (gameStateRef.current.winner && !gameStateRef.current.matchWinner) handleNextLeg();
          return;
      }
      if (!gameStateRef.current.winner) {
          const num = parseNumberFromSpeech(transcript);
          if (num != null && num >= 0 && num <= 180) {
              handleTurnCommitRef.current(num);
          } else {
              setErrorMsg(`? "${transcript}"`);
              setTimeout(() => setErrorMsg(''), 1500);
          }
      }
  };

  const toggleMic = () => setIsMicActive(!isMicActive);

  // Bot logic
  useEffect(() => {
      if (settings.isBot && gameState.currentPlayer === 'p2' && !gameState.winner) {
          const timeout = setTimeout(() => playBotTurn(), 1500);
          return () => clearTimeout(timeout);
      }
  }, [gameState.currentPlayer, gameState.winner, settings.isBot]);

  const playBotTurn = () => {
      const cScore = gameState.p2Score; let pts = 0; const lvl = settings.botLevel;
      const canOut = cScore <= 170 && ![169, 168, 166, 165, 163, 162, 159].includes(cScore);
      const neighbors = { 20: [1, 5], 19: [7, 3], 18: [4, 1], 17: [2, 3] };
      const getThrow = (target, tProb, sProb) => { const nb = neighbors[target] || [1, 5]; let s = 0; for(let i=0; i<3; i++) { const r = Math.random(); if(r < tProb) s += target * 3; else if(r < tProb + sProb) s += target; else s += nb[Math.floor(Math.random()*nb.length)]; } return s; };

      if (lvl === 'world_class') {
          let isCheckout = false;
          if (canOut) { if (cScore > 100) isCheckout = Math.random() < 0.45; else isCheckout = Math.random() < 0.80; }
          if (isCheckout) { pts = cScore; } else { let target = 20; const rTarget = Math.random(); if (rTarget > 0.98) target = 18; else if (rTarget > 0.92) target = 19; let attempt = getThrow(target, 0.38, 0.58); if (cScore - attempt <= 1) pts = Math.max(0, cScore - 32); else pts = attempt; }
      } else if (lvl === 'amateur') {
          let isCheckout = false;
          if (canOut) { if (cScore > 60) isCheckout = Math.random() < 0.01; else isCheckout = Math.random() < 0.15; }
          if (isCheckout) { pts = cScore; } else { let attempt = getThrow(20, 0.02, 0.65); if (cScore - attempt <= 1) pts = attempt; else pts = attempt; }
      } else if (lvl === 'pro') {
          let isCheckout = false;
          if (canOut) { if (cScore > 100) isCheckout = Math.random() < 0.04; else if (cScore > 60) isCheckout = Math.random() < 0.12; else isCheckout = Math.random() < 0.35; }
          if (isCheckout) { pts = cScore; } else { let attempt = getThrow(Math.random()<0.85?20:19, 0.14, 0.55); if (cScore - attempt <= 1) { if (cScore <= 60) { pts = Math.floor(cScore / 2); if (pts === 0) pts = 1; } else { pts = Math.max(0, cScore - 32); } } else { pts = attempt; } }
      } else if (lvl === 'custom') {
          const tAvg = parseInt(settings.botAvg) || 50;
          if (canOut && Math.random() < Math.min(0.95, tAvg/110)) pts = cScore; else pts = canOut ? 0 : randNormal(tAvg, 22);
      } else { pts = randNormal(50, 20); }

      processTurn(Math.min(180, Math.max(0, pts)), cScore === pts ? getMinDartsToCheckout(cScore, settings.outMode) : 3);
  };

  const recalculateGame = (baseHistory) => {
    const moves = [...baseHistory].reverse();
    let p1 = settings.startScore, p2 = settings.startScore, winner = null;
    const rec = moves.map((move, i) => {
      if (winner) return move;
      const cS = move.player === 'p1' ? p1 : p2; let nS = cS - move.score;
      let isBust = nS < 0 || (settings.outMode === 'double' && nS === 1);
      if (!isBust) { if (move.player === 'p1') p1 = nS; else p2 = nS; }
      if (!isBust && nS === 0) winner = move.player;
      return { ...move, remaining: move.player === 'p1' ? p1 : p2, isBust, turn: i + 1 };
    });
    let nP = rec.length > 0 ? (rec[rec.length - 1].player === 'p1' ? 'p2' : 'p1') : gameState.startingPlayer;
    return { ...gameState, p1Score: p1, p2Score: p2, history: rec.reverse(), winner, currentPlayer: winner ? winner : nP };
  };

  const processTurn = (points, dartsCount = 3) => {
    const pts = parseInt(points);
    if (isNaN(pts) || pts < 0 || pts > 180 || IMPOSSIBLE_SCORES.includes(pts)) { 
        setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); setTimeout(() => setErrorMsg(''), 1500); setCurrentInput(''); return; 
    }

    const nm = { id: Date.now(), player: gameState.currentPlayer, score: pts, dartsUsed: dartsCount };
    const ns = recalculateGame([nm, ...gameState.history]);
    if (ns.history[0].isBust) { setErrorMsg(String(translations[lang]?.bust || 'Bust')); setTimeout(() => setErrorMsg(''), 1500); }

    if (ns.winner) {
      const legTarget = settings.matchMode === 'first_to' ? settings.matchTarget : Math.ceil(settings.matchTarget / 2);
      let p1W = ns.winner === 'p1' ? gameState.p1Legs + 1 : gameState.p1Legs;
      let p2W = ns.winner === 'p2' ? gameState.p2Legs + 1 : gameState.p2Legs;
      let p1S = gameState.p1Sets || 0;
      let p2S = gameState.p2Sets || 0;
      if (p1W >= legTarget) { p1S += 1; p1W = 0; p2W = 0; }
      if (p2W >= legTarget) { p2S += 1; p1W = 0; p2W = 0; }
      const setTarget = settings.matchSets || 1;
      const isOver = p1S >= setTarget || p2S >= setTarget;
      const uLegs = [...gameState.completedLegs, { history: ns.history, winner: ns.winner }];

      if (isOver) {
        const record = { id: Date.now(), date: new Date().toLocaleString(), gameType: 'x01', p1Name: settings.p1Name, p1Id: settings.p1Id || null, p2Name: settings.p2Name, p2Id: settings.p2Id || null, p1Legs: p1W, p2Legs: p2W, p1Sets: p1S, p2Sets: p2S, matchWinner: ns.winner, completedLegs: uLegs, isBot: settings.isBot, botLevel: settings.botLevel, botAvg: settings.botAvg };
        // Vypnout mikrofon 10 vteřin po konci zápasu (pokud je teď zapnutý)
        if (isMicActiveRef.current) {
          if (micTimeoutRef.current) clearTimeout(micTimeoutRef.current);
          micTimeoutRef.current = setTimeout(() => {
            setIsMicActive(false);
          }, 10000);
        }
        onMatchComplete(record);
      } else {
        setGameState({ ...ns, p1Legs: p1W, p2Legs: p2W, p1Sets: p1S, p2Sets: p2S, matchWinner: null, completedLegs: uLegs });
      }
    } else { 
      setGameState(ns); 
    }
    
    setCurrentInput('');
  };
  processTurnRef.current = processTurn;

  const handleTurnCommit = (points, darts = 3, force = false) => {
    const cS = gameState.currentPlayer === 'p1' ? gameState.p1Score : gameState.p2Score;
    if ((cS - points) === 0 && !force) {
        const minD = getMinDartsToCheckout(cS, settings.outMode);
        if (minD === Infinity) { setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; }
        setFinishData({ points, minD });
    } else { processTurn(points, darts); }
  };
  handleTurnCommitRef.current = handleTurnCommit;

  const handleUndoClick = () => {
    if (gameState.history.length === 0) return;
    let sliceCount = 1;
    if (settings.isBot && gameState.currentPlayer === 'p1' && gameState.history.length >= 2) {
        if (gameState.history[0].player === 'p2') sliceCount = 2;
    }
    setGameState(recalculateGame(gameState.history.slice(sliceCount)));
  };

  const handleQuickBtnDown = (idx) => { setLongPressIdx(idx); longPressTimer.current = setTimeout(() => { if (currentInput && parseInt(currentInput) <= 180) { const newB = [...quickButtons]; newB[idx] = parseInt(currentInput); setQuickButtons(newB); setCurrentInput(''); setErrorMsg(String(translations[lang]?.presetSaved || 'Uloženo')); setTimeout(()=>setErrorMsg(''), 1000); } setLongPressIdx(null); }, 700); };
  const handleQuickBtnUp = (val) => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); if (longPressIdx !== null) handleTurnCommit(val); setLongPressIdx(null); } };

  const handleScoreClick = (pKey) => {
    if (pKey !== gameState.currentPlayer) return;
    if (!currentInput) { const cS = pKey === 'p1' ? gameState.p1Score : gameState.p2Score; const minD = getMinDartsToCheckout(cS, settings.outMode); if (minD !== Infinity) setFinishData({ points: cS, minD }); return; }
    const rem = parseInt(currentInput); if (isNaN(rem)) return;
    const cS = pKey === 'p1' ? gameState.p1Score : gameState.p2Score; const thr = cS - rem;
    if (thr < 0 || thr > 180 || IMPOSSIBLE_SCORES.includes(thr)) { setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; }
    if (rem === 0) { const minD = getMinDartsToCheckout(cS, settings.outMode); if (minD === Infinity) { setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; } setFinishData({ points: thr, minD }); } else handleTurnCommit(thr);
  };

  const handleSaveEdit = (newS, newD) => {
    if (isNaN(newS) || newS < 0 || newS > 180 || IMPOSSIBLE_SCORES.includes(newS)) { setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); return; }
    const uh = gameState.history.map(m => m.id === editingMove.id ? { ...m, score: newS, dartsUsed: (m.remaining+m.score-newS)===0 ? newD : 3 } : m);
    const ns = recalculateGame(uh);
    
    let nextP1Legs = gameState.p1Legs;
    let nextP2Legs = gameState.p2Legs;
    let nextCompletedLegs = [...gameState.completedLegs];

    if (gameState.winner && !ns.winner) {
        if (gameState.winner === 'p1') nextP1Legs = Math.max(0, nextP1Legs - 1);
        if (gameState.winner === 'p2') nextP2Legs = Math.max(0, nextP2Legs - 1);
        nextCompletedLegs.pop();
        ns.matchWinner = null;
    }
    else if (!gameState.winner && ns.winner) {
        if (ns.winner === 'p1') nextP1Legs++;
        if (ns.winner === 'p2') nextP2Legs++;
        nextCompletedLegs.push({ history: ns.history, winner: ns.winner });

        const tgt = settings.matchMode === 'first_to' ? settings.matchTarget : Math.ceil(settings.matchTarget / 2);
        const isOver = nextP1Legs >= tgt || nextP2Legs >= tgt;

        if (isOver) {
           const record = { id: Date.now(), date: new Date().toLocaleString(), gameType: 'x01', p1Name: settings.p1Name, p1Id: settings.p1Id || null, p2Name: settings.p2Name, p2Id: settings.p2Id || null, p1Legs: nextP1Legs, p2Legs: nextP2Legs, matchWinner: ns.winner, completedLegs: nextCompletedLegs, isBot: settings.isBot, botLevel: settings.botLevel, botAvg: settings.botAvg };
           setEditingMove(null);
           onMatchComplete(record);
           return;
        }
    }
    setGameState({ ...ns, p1Legs: nextP1Legs, p2Legs: nextP2Legs, completedLegs: nextCompletedLegs });
    setEditingMove(null);
  };

  const handleNextLeg = () => {
      const nS = gameState.startingPlayer === 'p1' ? 'p2' : 'p1'; 
      setGameState(prev => ({ ...prev, p1Score: settings.startScore, p2Score: settings.startScore, winner: null, history: [], currentPlayer: nS, startingPlayer: nS })); 
  };

  const btnGameBase = "text-white font-bold py-2 rounded text-[10px] sm:text-xs transition-all select-none touch-manipulation active:scale-95";
  const numBtnBase = "h-full bg-slate-800 text-xl sm:text-2xl font-bold rounded hover:bg-slate-700 active:bg-slate-600 select-none touch-manipulation flex items-center justify-center";
  const isSuccessMsg = errorMsg && ['!', 'Přihlášeno', 'Uloženo', 'Zálohováno', 'Recognized'].some(w => String(errorMsg).includes(w));

  const renderUnifiedHistory = () => {
    const rounds = []; let cR = {}; [...gameState.history].reverse().forEach(move => { const rN = Math.ceil(move.turn / 2); if (!cR[rN]) { const n = { id: rN, p1: null, p2: null }; cR[rN] = n; rounds.push(n); } if (move.player === 'p1') cR[rN].p1 = move; else cR[rN].p2 = move; });
    const renderMove = (move) => {
        if (!move) return <div className="h-8 md:h-12"></div>;
        const isCheckout = move.remaining === 0 && !move.isBust;
        let cls = 'text-slate-200'; if (isCheckout) cls = 'text-yellow-400'; else if (move.score >= 100) cls = move.player === 'p1' ? 'text-emerald-400' : 'text-purple-400';
        return (<div className={`flex items-center w-full ${move.player === 'p1' ? 'justify-between pr-2 md:pr-4' : 'justify-between pl-2 md:pl-4'}`}>{move.player === 'p1' && <div className="text-[10px] md:text-sm lg:text-base font-mono text-slate-500 font-bold w-8 md:w-12 text-left">{move.remaining}</div>}<div onClick={() => setEditingMove(move)} className={`cursor-pointer hover:bg-slate-800/50 rounded px-1 md:px-3 flex items-center gap-1 md:gap-2 ${move.player==='p1'?'text-right':'text-left'} ${move.isBust?'opacity-50':''}`}><div className={`${isCheckout?'text-2xl md:text-3xl lg:text-4xl':'text-xl md:text-2xl lg:text-3xl'} font-bold font-mono ${cls} flex items-baseline gap-1 md:gap-2`}>{move.isBust ? <span className="text-red-400 line-through decoration-2">{move.score}</span> : <span>{move.score}</span>}{isCheckout && <span className="text-xs italic text-yellow-400 md:text-sm">({move.dartsUsed}.{translations[lang]?.confirmDarts || 'šipka'})</span>}</div></div>{move.player === 'p2' && <div className="text-[10px] md:text-sm lg:text-base font-mono text-slate-500 font-bold w-8 md:w-12 text-right">{move.remaining}</div>}</div>);
    };
    return (<div ref={historyRef} className="border rounded-lg history-container bg-slate-900/50 border-slate-800">{rounds.map(r => <div key={r.id} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center border-b border-slate-800/60 py-2 md:py-3 last:border-0">{renderMove(r.p1)}<div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-800 border border-slate-700 shadow-sm text-[10px] md:text-xs font-bold text-slate-500">{r.id}</div>{renderMove(r.p2)}</div>)}{rounds.length === 0 && <div className="py-10 text-xs text-center text-slate-600 md:text-sm">- Zatím bez hodů -</div>}</div>);
  };

  return (
    <>
      <main className={`flex-1 overflow-hidden p-1 sm:p-2 grid gap-1 sm:gap-2 ${isLandscape ? 'grid-cols-[1fr_1.5fr_1fr]' : 'flex flex-col'}`}>
        
        {/* Score Cards */}
        <div className={`flex flex-col gap-1 sm:gap-2 w-full ${isLandscape ? 'h-full min-h-0' : 'h-auto shrink-0'}`}>
            <div className={`flex ${isLandscape ? 'flex-col min-h-0' : 'flex-row w-full'} flex-1 gap-1.5 h-full`}>
                {['p1', 'p2'].map(pKey => {
                    const act = gameState.currentPlayer === pKey && !gameState.winner; 
                    const isP1 = pKey === 'p1';
                    const isBot = !isP1 && settings.isBot;
                    const displayName = getDisplayName(isP1 ? settings.p1Name : settings.p2Name, isP1, isBot);

                    return (
                        <div key={pKey} className={`flex-1 relative p-2 sm:p-4 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${act ? `bg-slate-800 ${isP1?'border-emerald-500':'border-purple-500'} shadow-xl` : 'bg-slate-900 border-slate-800 opacity-90'}`} onClick={() => handleScoreClick(pKey)}>
                        {act && <div className={`absolute -top-1 sm:-top-1.5 ${isP1?'bg-emerald-500 border-emerald-400':'bg-purple-600 border-purple-400'} text-slate-900 text-[9px] font-bold px-3 py-0.5 rounded-full z-10 border leading-none`}>{translations[lang]?.serving || 'Hází'}</div>}
                        {gameState.startingPlayer === pKey && <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-slate-500"></div>}
                        <div className="flex items-center justify-between w-full mb-1">
                            <div className="flex flex-col flex-1 min-w-0 mr-1">
                                <h2 className="text-slate-300 text-[10px] sm:text-xs uppercase font-bold truncate">
                                    {displayName}
                                    {isBot && (
                                        <span className="ml-1 text-emerald-500">
                                            [{settings.botLevel === 'custom' ? `AVG ${settings.botAvg}` : (translations[lang]?.[`diff${settings.botLevel.charAt(0).toUpperCase() + settings.botLevel.slice(1)}`] || settings.botLevel)}]
                                        </span>
                                    )}
                                </h2>
                            </div>
                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                                <div className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700 text-emerald-400 font-black text-[10px] sm:text-xs leading-tight">S:{isP1 ? (gameState.p1Sets || 0) : (gameState.p2Sets || 0)}</div>
                                <div className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700 text-yellow-400 font-black text-[10px] sm:text-xs leading-tight">L:{isP1 ? gameState.p1Legs : gameState.p2Legs}</div>
                            </div>
                        </div>
                        <div className={`font-mono font-black text-white mb-0 sm:mb-2 leading-none transition-transform select-none ${act ? `active:scale-95 cursor-pointer ${isP1 ? 'active:text-emerald-400' : 'active:text-purple-400'}` : ''}`} style={{ fontSize: isLandscape ? 'clamp(4rem, 15vh + 5vw, 15rem)' : 'clamp(4rem, 20vw, 10rem)' }}>
                            {isP1?gameState.p1Score:gameState.p2Score}
                        </div>
                        <div className="text-[9px] sm:text-[11px] text-slate-500 font-mono mt-auto">AVG: {((((isP1 ? settings.startScore - gameState.p1Score : settings.startScore - gameState.p2Score) / (gameState.history.filter(h => h.player === pKey).reduce((acc, h) => acc + (h.dartsUsed || 3), 0) || 1)) * 3) || 0).toFixed(1)}</div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Střední část */}
        <div className="flex flex-col justify-center flex-1 h-full min-h-0 gap-1">
            {!gameState.winner ? (
                <div className={`flex flex-col gap-1 shrink-0 transition-opacity w-full h-full justify-center ${settings.isBot && gameState.currentPlayer === 'p2' ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className={`flex items-center gap-1 p-1 sm:p-1.5 rounded-lg border bg-opacity-10 border-opacity-10 ${gameState.currentPlayer === 'p1' ? 'bg-emerald-900 border-emerald-500' : 'bg-purple-900 border-purple-500'}`}>
                    <span className={`text-[8px] font-bold uppercase px-1 ${gameState.currentPlayer === 'p1' ? 'text-emerald-600/60' : 'text-purple-600/60'}`}>{translations[lang]?.quickCheckout || 'Zavřeno'}</span>
                    {[1, 2, 3].map(d => {
                        const cS = gameState.currentPlayer === 'p1' ? gameState.p1Score : gameState.p2Score; const minD = getMinDartsToCheckout(cS, settings.outMode); const isP = d >= minD && minD !== Infinity;
                        return <button key={d} disabled={!isP} onClick={() => handleTurnCommit(cS, d, true)} className={`${btnGameBase} flex-1 ${!isP ? 'bg-slate-800/40 opacity-10 cursor-default' : `${gameState.currentPlayer === 'p1' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'} shadow-lg`}`}>{d}. {translations[lang]?.dart || 'šipkou'}</button>;
                    })}
                    </div>
                    <div className="flex items-center justify-between h-12 px-2 py-1 border rounded-lg mobile-input-area bg-slate-900 sm:px-4 sm:py-2 border-slate-800 sm:h-20 shrink-0">
                        <div className="flex flex-col justify-center flex-1 min-w-0 mr-2"><span className="text-[9px] text-slate-500 uppercase font-bold shrink-0">{translations[lang]?.throw || 'Hod'}</span><div className={`font-bold flex-1 flex items-center ${errorMsg ? 'text-red-500 text-sm sm:text-xl leading-tight whitespace-normal' : 'text-white text-3xl sm:text-5xl font-mono truncate'}`}>{errorMsg || currentInput || <span className="text-slate-700">0</span>}</div></div>
                        <div className="flex gap-1.5 sm:gap-2 shrink-0">
                            <button onClick={toggleMic} className={`w-10 h-10 sm:w-12 sm:h-12 rounded flex items-center justify-center border transition-all ${isMicActive ? (isListening ? 'bg-red-600 border-red-500 animate-pulse text-white' : 'bg-red-900/50 border-red-500/50 text-red-200') : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}>{isMicActive ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6" />}</button>
                            <button onClick={handleUndoClick} className="flex items-center justify-center w-10 h-10 border rounded sm:w-12 sm:h-12 bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700"><Undo2 className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                            <button onClick={() => handleTurnCommit(parseInt(currentInput))} disabled={!currentInput} className={`bg-emerald-600 text-white h-10 sm:h-12 w-14 sm:w-20 rounded flex items-center justify-center transition-all ${!currentInput ? 'opacity-30' : 'hover:bg-emerald-500'}`}><CheckCircle className="w-6 h-6 sm:w-8 sm:h-8" /></button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-6 gap-1 shrink-0">
                        {quickButtons.map((val, i) => <button key={i} onPointerDown={() => handleQuickBtnDown(i)} onPointerUp={() => handleQuickBtnUp(val)} onPointerLeave={() => { if(longPressTimer.current) { clearTimeout(longPressTimer.current); setLongPressIdx(null); } }} className={`bg-slate-800 text-slate-300 text-xs sm:text-sm font-bold min-h-[2.5rem] sm:min-h-[3rem] rounded-lg sm:rounded-xl border border-slate-700/50 shadow-md transition-all select-none touch-manipulation ${longPressIdx === i ? 'bg-emerald-900 border-emerald-400 shaking' : ''}`}>{val}</button>)}
                    </div>
                    
                    <div className="flex-1 grid grid-cols-4 gap-1 min-h-[120px]">
                        {[7, 8, 9].map(n => <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>{n}</button>)}<button onClick={() => setCurrentInput(prev => prev.length < 3 ? prev + '0' : prev)} className={numBtnBase}>0</button>
                        {[4, 5, 6].map(n => <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>{n}</button>)}<button onClick={() => setCurrentInput(prev => prev.slice(0, -1))} className={`${numBtnBase} text-red-400 active:bg-red-900/20`}><Delete className="w-5 h-5 sm:w-6 sm:h-6"/></button>
                        {[1, 2, 3].map(n => <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>{n}</button>)}
                    </div>
                </div>
            ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center ${gameState.winner === 'p1' ? 'bg-emerald-900/40 border-emerald-500/50' : 'bg-purple-900/40 border-purple-500/50'} border-2 p-4 rounded-xl text-center animate-in zoom-in duration-300 shadow-2xl shadow-black/50`}>
                    <Trophy className={`w-10 h-10 sm:w-12 sm:h-12 mb-2 ${gameState.winner === 'p1' ? 'text-emerald-400' : 'text-purple-400'}`} />
                    <h3 className={`text-lg sm:text-2xl font-black uppercase tracking-widest ${gameState.winner === 'p1' ? 'text-emerald-400' : 'text-purple-400'} mb-2`}>
                        {translations[lang]?.legFor || 'Leg vyhrává'} {getDisplayName(gameState.winner === 'p1' ? settings.p1Name : settings.p2Name, gameState.winner === 'p1', gameState.winner === 'p2' && settings.isBot)}
                    </h3>
                    <button onClick={handleNextLeg} className={`w-full max-w-[250px] ${gameState.winner === 'p1' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'} text-white py-3 sm:py-4 rounded-xl font-black text-base sm:text-lg mt-2 sm:mt-4 shadow-lg active:scale-95 transition-all`}>
                        {translations[lang]?.nextLeg || 'Další leg'}
                    </button>
                </div>
            )}
        </div>

        {/* Pravá část Historie */}
        <div className={`bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden flex flex-col ${isLandscape ? 'h-full' : 'shrink-0 h-[22vh] sm:h-48'}`}>
            <div className="bg-slate-800/80 p-1.5 border-b border-slate-700 text-[9px] font-black uppercase text-center text-slate-500 tracking-widest hidden landscape:block">Historie náhozů</div>
            <div className="flex-1 overflow-hidden">
                {renderUnifiedHistory()}
            </div>
        </div>
      </main>

      {finishData && <FinishDartsSelector points={finishData.points} minDarts={finishData.minD} onConfirm={(d) => { processTurn(finishData.points, d); setFinishData(null); }} onCancel={() => setFinishData(null)} lang={lang} player={gameState.currentPlayer} />}
      {editingMove && <EditScoreModal initialScore={editingMove.score} initialDarts={editingMove.dartsUsed} isFinish={(editingMove.remaining+editingMove.score)-editingMove.score===0} scoreBefore={editingMove.remaining+editingMove.score} outMode={settings.outMode} onSave={handleSaveEdit} onCancel={()=>setEditingMove(null)} lang={lang} />}
      
      {errorMsg && (
        <div className={`fixed bottom-10 inset-x-0 mx-auto w-[90%] max-w-sm text-white px-6 py-3 sm:px-8 sm:py-4 rounded-full font-black shadow-2xl border-2 z-[1000] animate-bounce text-center text-xs sm:text-sm uppercase tracking-widest ${isSuccessMsg ? 'bg-emerald-600 border-emerald-400' : 'bg-red-600 border-red-400'}`}>
            {String(errorMsg)}
        </div>
      )}
    </>
  );
}