import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Trophy, Undo2 } from 'lucide-react';
import { matchesAnyPhrase, normalizeSpeechCommand, VOICE_PHRASES } from '../voiceSpeech';

// --- MOCK PŘEKLADŮ (V reálném projektu smažte a použijte import) ---
const translations = {
  cs: { serving: 'Hází', legFor: 'Leg vyhrává', nextLeg: 'Další leg', p1Default: 'Domácí', p2Default: 'Hosté', botDefault: 'Robot' },
  en: { serving: 'Serving', legFor: 'Leg winner', nextLeg: 'Next leg', p1Default: 'Home', p2Default: 'Away', botDefault: 'Bot' },
  pl: { serving: 'Rzuca', legFor: 'Leg wygrywa', nextLeg: 'Następny leg', p1Default: 'Gospodarze', p2Default: 'Goście', botDefault: 'Bot' }
};

const TARGETS = [20, 19, 18, 17, 16, 15, 25];
const INITIAL_MARKS = TARGETS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {});

const CricketMark = ({ marks, colorClass }) => {
  if (marks === 0) return <div className="h-full aspect-square max-h-8 max-w-[2rem]"></div>;
  return (
    <div className={`h-full aspect-square max-h-8 max-w-[2rem] flex items-center justify-center ${colorClass}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full stroke-current fill-none stroke-[12] stroke-linecap-round shadow-sm transition-all duration-300">
        {marks >= 1 && <line x1="20" y1="80" x2="80" y2="20" />}
        {marks >= 2 && <line x1="20" y1="20" x2="80" y2="80" />}
        {marks >= 3 && <circle cx="50" cy="50" r="40" />}
      </svg>
    </div>
  );
};

const DartsIndicator = ({ dartsThrown }) => {
  const dartsLeft = 3 - dartsThrown;
  return (
    <div className="flex justify-center gap-2 p-2 border shadow-inner bg-slate-900/50 rounded-xl border-slate-700/50">
      {[1, 2, 3].map((num) => (
        <div 
          key={num} 
          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full shadow-inner transition-all duration-300 ${
            num <= dartsLeft 
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' 
              : 'bg-slate-800 border border-slate-700/50'
          }`} 
        />
      ))}
    </div>
  );
};

export default function GameCricket({
  settings,
  lang,
  onMatchComplete,
  isLandscape,
  isPC,
  onlineGameId = null,
  onAbort: _onAbort,
}) {
  const [gameState, setGameState] = useState({
    p1Score: 0, p2Score: 0,
    p1Marks: { ...INITIAL_MARKS }, p2Marks: { ...INITIAL_MARKS },
    p1Legs: 0, p2Legs: 0, p1Sets: 0, p2Sets: 0,
    currentPlayer: settings?.startPlayer || 'p1', startingPlayer: settings?.startPlayer || 'p1',
    dartsThrown: 0, 
    multiplier: 1,
    winner: null, matchWinner: null, history: [], completedLegs: []
  });

  const [highScoreAnimation, setHighScoreAnimation] = useState(null);
  const [isMicActive, setIsMicActive] = useState(false); 
  const [isListening, setIsListening] = useState(false);
  const [setScores, setSetScores] = useState([]);

  const t = (k) => translations[lang]?.[k] || k;

  const recognitionRef = useRef(null);
  const onlineGameIdRef = useRef(onlineGameId);
  const isMicActiveRef = useRef(isMicActive);
  const gameStateRef = useRef(gameState);

  const getDisplayName = (name, isP1, isBot) => {
    if (!name) return '';
    
    // Převod na malá písmena pro bezpečné porovnání
    const lowerName = name.trim().toLowerCase();
    
    const p1Defaults = ['domácí', 'home', 'gospodarze'];
    const p2Defaults = ['hosté', 'away', 'goście'];
    const botDefaults = ['robot', 'bot'];

    if (isP1 && p1Defaults.includes(lowerName)) return t('p1Default') || 'Domácí';
    if (!isP1 && isBot && (botDefaults.includes(lowerName) || p2Defaults.includes(lowerName))) return t('botDefault') || 'Robot';
    if (!isP1 && p2Defaults.includes(lowerName)) return t('p2Default') || 'Hosté';
    
    return name;
  };

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    onlineGameIdRef.current = onlineGameId;
  }, [onlineGameId]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (!isPC || gameState.winner) return;
      const key = e.key.toLowerCase();
      if (key === 'm') handleThrow(0);
      else if (key === 's') setGameState(prev => ({...prev, multiplier: 1}));
      else if (key === 'd') setGameState(prev => ({...prev, multiplier: 2}));
      else if (key === 't') setGameState(prev => ({...prev, multiplier: 3}));
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isPC, gameState.winner, gameState.multiplier]);

  // --- HLASOVÉ OVLÁDÁNÍ – CRICKET ---
  const sanitizeSpeech = (text) => {
    if (!text) return '';
    let clean = text.toLowerCase().trim();
    // sjednotíme oddělovače na mezery + odstraníme diakritiku pro stabilní slovníky
    clean = clean.replace(/[;,]/g, ' ');
    clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const wordMap = {
      // Czech targets
      'patnact': '15', 'patnactka': '15', 'patnactku': '15',
      'sestnact': '16', 'sestnactka': '16', 'sestnactku': '16',
      'sedmnact': '17', 'sedmnactka': '17', 'sedmnactku': '17',
      'osmnact': '18', 'osmnactka': '18', 'osmnactku': '18',
      'devatenact': '19', 'devatenactka': '19', 'devatenactku': '19',
      'dvacet': '20', 'dvacitka': '20', 'dvacitku': '20',
      'petadvacet': '25', 'cisty stred': '25',
      // bull color hints (standalone or with "stred")
      'zeleny': '25', 'zeleny stred': '25',
      'cerveny': '50', 'cerveny stred': '50',
      'padesat': '50', 'stred': '50',
      // English targets
      'fifteen': '15',
      'sixteen': '16',
      'seventeen': '17',
      'eighteen': '18',
      'nineteen': '19',
      'twenty': '20',
      'bull': '50', 'bullseye': '50', 'outer bull': '25', 'inner bull': '50',
      // Polish targets
      'pietnascie': '15',
      'szesnascie': '16',
      'siedemnascie': '17',
      'osiemnascie': '18',
      'dziewietnascie': '19',
      'dwadziescia': '20',
      'bullseye': '50',
      // Miss / zero
      'vedle': '0', 'mimo': '0', 'nula': '0', 'nic': '0', 'minul': '0',
      'miss': '0', 'outside': '0', 'no score': '0',
      'pudlo': '0', 'obok': '0'
    };

    // Kvantifikátory počtu šipek (x1/x2/x3)
    const countMap = {
      // Czech (explicit repeats phrasing)
      'jedna sipka': 'x1', 'jednu sipku': 'x1',
      'dve sipky': 'x2', 'dvema sipkama': 'x2',
      'tri sipky': 'x3', 'trema sipkama': 'x3',
      // English
      'once': 'x1', 'one time': 'x1',
      'twice': 'x2', 'two times': 'x2',
      'three times': 'x3',
      // Polish
      'raz': 'x1', 'jeden raz': 'x1',
      'dwa razy': 'x2', 'dwa raz': 'x2',
      'trzy razy': 'x3'
    };

    const multiplierMap = {
      // Czech / generic
      'tripl': 'T', 'trojitá': 'T', 'trojitý': 'T',
      'dabl': 'D', 'dvojitá': 'D', 'dvojitý': 'D',
      // Czech spoken: "dvakrát 20" usually means double 20, "třikrát 20" triple 20
      'dvakrat': 'D',
      'trikrat': 'T',
      // English
      'triple': 'T', 'treble': 'T',
      'double': 'D',
      // Polish
      'potrojny': 'T',
      'podwojny': 'D'
    };

    Object.entries(wordMap).forEach(([word, val]) => {
      clean = clean.replace(new RegExp(`\\b${word}\\b`, 'g'), val);
    });
    Object.entries(countMap).forEach(([word, val]) => {
      clean = clean.replace(new RegExp(`\\b${word}\\b`, 'g'), val);
    });
    Object.entries(multiplierMap).forEach(([word, val]) => {
      clean = clean.replace(new RegExp(`\\b${word}\\b`, 'g'), val);
    });

    // Záchyt tvarů "2x", "3x" jako počtu šipek
    clean = clean.replace(/\b1x\b/g, 'x1').replace(/\b2x\b/g, 'x2').replace(/\b3x\b/g, 'x3');

    return clean;
  };

  const parseCricketDarts = (cleanText, maxDarts = 3) => {
    const darts = [];
    if (!cleanText) return darts;

    const tokens = cleanText.split(/\s+/).filter(Boolean);
    let currentMultiplier = 1;
    let currentRepeat = 1;

    const validDirectTargets = [15, 16, 17, 18, 19, 20, 25, 50, 0];

    const pushDart = (target, multiplier) => {
      if (darts.length >= maxDarts) return;
      if (target === 25 && multiplier === 3) multiplier = 2;
      if (target === 50) { target = 25; multiplier = 2; }
      if (target === 0) multiplier = 1;
      darts.push({ target, multiplier });
    };

    for (let token of tokens) {
      if (darts.length >= maxDarts) break;

      if (token === 'x3') { currentRepeat = 3; continue; }
      if (token === 'x2') { currentRepeat = 2; continue; }
      if (token === 'x1') { currentRepeat = 1; continue; }

      if (token === 'T') { currentMultiplier = 3; continue; }
      if (token === 'D') { currentMultiplier = 2; continue; }

      const num = parseInt(token, 10);
      if (Number.isNaN(num)) continue;

      let target = null;
      let multFromNumber = 1;

      if (validDirectTargets.includes(num)) {
        target = num;
      } else {
        // rozklad čísel jako 45, 60, 40 -> base * mult
        for (let base of [15, 16, 17, 18, 19, 20]) {
          for (let m of [3, 2, 1]) {
            if (base * m === num) {
              target = base;
              multFromNumber = m;
              break;
            }
          }
          if (target !== null) break;
        }
      }

      if (target === null) continue;

      let effectiveMult = currentMultiplier !== 1 ? currentMultiplier : multFromNumber;

      // Speciál: "dvakrát mimo" / "třikrát miss" – v praxi jde o počet šipek mimo
      if (target === 0 && currentMultiplier > 1 && currentRepeat === 1) {
        currentRepeat = currentMultiplier;
        effectiveMult = 1;
      }

      const repeats = Math.min(maxDarts - darts.length, currentRepeat);
      for (let i = 0; i < repeats; i++) {
        pushDart(target, effectiveMult);
      }

      currentMultiplier = 1;
      currentRepeat = 1;
    }

    return darts;
  };

  const handleVoiceCommand = (rawTranscript) => {
    const transcript = (rawTranscript || '').toLowerCase().trim();
    const cleanText = sanitizeSpeech(transcript);

    const cmd = normalizeSpeechCommand(rawTranscript || '');
    if (matchesAnyPhrase(cmd, VOICE_PHRASES.undo)) {
      handleUndoClick();
      return;
    }
    if (matchesAnyPhrase(cmd, VOICE_PHRASES.nextLeg)) {
      const gs = gameStateRef.current;
      if (gs?.winner && !gs?.matchWinner) handleNextLeg();
      return;
    }

    const remaining = Math.max(0, 3 - (gameStateRef.current?.dartsThrown ?? 0));
    const darts = parseCricketDarts(cleanText, remaining || 3);
    darts.forEach(d => handleThrow(d.target, d.multiplier));
  };

  useEffect(() => {
    let recognition = recognitionRef.current;
    if (isMicActive) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsMicActive(false);
        return;
      }
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = lang === 'en' ? 'en-US' : (lang === 'pl' ? 'pl-PL' : 'cs-CZ');
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
        if (isMicActiveRef.current) {
          try { recognition.start(); } catch (e) {}
        }
      };
      recognition.onresult = (event) => {
        const res = event.results[event.results.length - 1][0].transcript;
        handleVoiceCommand(res);
      };
      recognition.onerror = () => {};
      try { recognition.start(); } catch (e) {}
      recognitionRef.current = recognition;
    } else {
      if (recognition) {
        recognition.onend = null;
        recognition.stop();
        setIsListening(false);
      }
    }
    return () => {
      if (recognition) {
        recognition.onend = null;
        recognition.stop();
      }
    };
  }, [isMicActive, lang]);

  const recalculateGame = (baseHistory, baseState) => {
    const moves = [...baseHistory].reverse();
    let st = {
      p1Score: 0, p2Score: 0,
      p1Marks: { ...INITIAL_MARKS }, p2Marks: { ...INITIAL_MARKS },
      currentPlayer: baseState.startingPlayer,
      dartsThrown: 0,
      winner: null
    };

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (st.winner) break;

      st.currentPlayer = move.player;

      if (move.target !== 0) {
        const myMarks = move.player === 'p1' ? st.p1Marks : st.p2Marks;
        const oppMarks = move.player === 'p1' ? st.p2Marks : st.p1Marks;
        
        let remainingHits = move.multiplier;
        const neededToClose = 3 - myMarks[move.target];
        
        // Zde je přesně ta matematika: "Rozkouskování" zásahů
        if (neededToClose > 0) {
          const hitsToApply = Math.min(remainingHits, neededToClose);
          myMarks[move.target] += hitsToApply;
          remainingHits -= hitsToApply;
        }

        // Pokud něco zbylo a soupeř nemá zavřeno, stávají se z toho body
        if (remainingHits > 0 && oppMarks[move.target] < 3) {
          const points = remainingHits * (move.target === 25 ? 25 : move.target);
          if (move.player === 'p1') st.p1Score += points; else st.p2Score += points;
        }
      }

      const currentMyMarks = move.player === 'p1' ? st.p1Marks : st.p2Marks;
      const myScore = move.player === 'p1' ? st.p1Score : st.p2Score;
      const oppScore = move.player === 'p1' ? st.p2Score : st.p1Score;

      const allClosed = TARGETS.every(t => currentMyMarks[t] >= 3);
      if (allClosed && myScore >= oppScore) {
        st.winner = move.player;
      } else {
        st.dartsThrown++;
        if (st.dartsThrown === 3) {
          st.currentPlayer = st.currentPlayer === 'p1' ? 'p2' : 'p1';
          st.dartsThrown = 0;
        }
      }
    }

    return { 
      ...baseState, 
      p1Score: st.p1Score, p2Score: st.p2Score, 
      p1Marks: st.p1Marks, p2Marks: st.p2Marks,
      currentPlayer: st.winner ? st.currentPlayer : st.currentPlayer, 
      dartsThrown: st.dartsThrown,
      winner: st.winner,
      history: baseHistory,
      multiplier: 1 
    };
  };

  const handleThrow = (target, overrideMultiplier = null) => {
    if (gameState.winner) return;

    let finalMult = gameState.multiplier;
    if (overrideMultiplier !== null) finalMult = overrideMultiplier;
    else if (target === 25 && gameState.multiplier === 3) finalMult = 2;

    const isHighThrow = target > 0 && (finalMult === 3 || (target === 25 && finalMult === 2));
    if (isHighThrow) {
      const isP1 = gameState.currentPlayer === 'p1';
      const color = isP1 ? 'rgb(52,211,153)' : 'rgb(168,85,247)';
      const label = target === 25 ? '50' : `T${target}`;
      setHighScoreAnimation({ score: label, color });
      setTimeout(() => setHighScoreAnimation(null), 1500);
    }

    setGameState(prev => {
      let finalMultiplier = prev.multiplier;
      if (overrideMultiplier !== null) {
        finalMultiplier = overrideMultiplier;
      } else if (target === 25 && prev.multiplier === 3) {
        finalMultiplier = 2;
      }

      const newMove = { 
          id: Date.now(), 
          player: prev.currentPlayer, 
          target: target, 
          multiplier: target === 0 ? 1 : finalMultiplier 
      };
      
      const newState = recalculateGame([newMove, ...prev.history], prev);

      if (newState.winner) {
        const legTarget = settings?.matchMode === 'first_to' ? settings.matchTarget : Math.ceil((settings?.matchTarget || 1) / 2);
        let p1W = newState.winner === 'p1' ? prev.p1Legs + 1 : prev.p1Legs;
        let p2W = newState.winner === 'p2' ? prev.p2Legs + 1 : prev.p2Legs;
        let p1S = prev.p1Sets || 0;
        let p2S = prev.p2Sets || 0;
        let nextSetScores = [...setScores];
        if (p1W >= legTarget || p2W >= legTarget) {
          nextSetScores = [...nextSetScores, { p1: p1W, p2: p2W }];
        }
        if (p1W >= legTarget) { p1S += 1; p1W = 0; p2W = 0; }
        if (p2W >= legTarget) { p2S += 1; p1W = 0; p2W = 0; }
        const setTarget = settings?.matchSets || 1;
        const isOver = p1S >= setTarget || p2S >= setTarget;
        const uLegs = [...prev.completedLegs, { history: newState.history, winner: newState.winner }];

        if (isOver && onMatchComplete) {
          onMatchComplete({ 
            id: Date.now(), date: new Date().toLocaleString(), gameType: 'cricket', 
            p1Name: settings.p1Name, p2Name: settings.p2Name, p1Legs: p1W, p2Legs: p2W, p1Sets: p1S, p2Sets: p2S,
            matchSets: settings?.matchSets || 1, setScores: nextSetScores,
            matchWinner: newState.winner, completedLegs: uLegs, 
            isBot: settings.isBot, botLevel: settings.botLevel 
          });
          setSetScores(nextSetScores);
          return { ...newState, p1Legs: p1W, p2Legs: p2W, p1Sets: p1S, p2Sets: p2S, completedLegs: uLegs };
        } else {
          setSetScores(nextSetScores);
          return { ...newState, p1Legs: p1W, p2Legs: p2W, p1Sets: p1S, p2Sets: p2S, matchWinner: null, completedLegs: uLegs };
        }
      } else {
        return newState;
      }
    });
  };

  const handleUndoClick = () => {
    if (gameState.history.length === 0) return;
    let sliceCount = 1;
    if (settings?.isBot && gameState.currentPlayer === 'p1' && gameState.history.length >= 3) {
       if (gameState.history[0].player === 'p2') sliceCount = 1 + gameState.history.filter(m => m.player === 'p2').length % 3 || 3;
    }
    setGameState(recalculateGame(gameState.history.slice(sliceCount), gameState));
  };

  const handleNextLeg = () => {
    const nS = gameState.startingPlayer === 'p1' ? 'p2' : 'p1'; 
    setGameState(prev => ({ 
      ...prev, p1Score: 0, p2Score: 0, p1Marks: {...INITIAL_MARKS}, p2Marks: {...INITIAL_MARKS}, 
      winner: null, history: [], currentPlayer: nS, startingPlayer: nS, dartsThrown: 0, multiplier: 1 
    })); 
  };

  useEffect(() => {
    if (settings?.isBot && gameState.currentPlayer === 'p2' && !gameState.winner) {
      const timeout = setTimeout(() => playBotDart(), 800);
      return () => clearTimeout(timeout);
    }
  }, [gameState.currentPlayer, gameState.dartsThrown, gameState.winner, settings?.isBot]);

  const playBotDart = () => {
    const lvl = settings?.botLevel || 'amateur';
    let target = 0; let mult = 1;

    const getBestTarget = () => {
      const toClose = TARGETS.find(t => gameState.p2Marks[t] > 0 && gameState.p2Marks[t] < 3);
      if (toClose) return toClose;
      const toOpen = TARGETS.find(t => gameState.p2Marks[t] < 3);
      if (toOpen) return toOpen;
      if (gameState.p2Score <= gameState.p1Score) {
          const toPoint = TARGETS.find(t => gameState.p2Marks[t] === 3 && gameState.p1Marks[t] < 3);
          if (toPoint) return toPoint;
      }
      return 20; 
    };

    const bestTarget = getBestTarget();
    const rand = Math.random();
    
    if (lvl === 'world_class') {
        if (rand < 0.8) { target = bestTarget; mult = 3; } else if (rand < 0.95) { target = bestTarget; mult = 1; } else target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    } else if (lvl === 'pro') {
        if (rand < 0.4) { target = bestTarget; mult = 3; } else if (rand < 0.8) { target = bestTarget; mult = 1; } else { target = TARGETS[Math.floor(Math.random() * TARGETS.length)]; mult = 1; }
    } else if (lvl === 'amateur') {
        if (rand < 0.1) { target = bestTarget; mult = 3; } else if (rand < 0.5) { target = bestTarget; mult = 1; } else { target = Math.random() < 0.2 ? 0 : TARGETS[Math.floor(Math.random() * TARGETS.length)]; mult = 1; }
    } else {
        const hitChance = Math.min(0.9, (settings?.botAvg || 50) / 100);
        if (rand < hitChance) { target = bestTarget; mult = Math.random() < hitChance ? 3 : 1; } else target = 0;
    }

    if (target === 25 && mult === 3) mult = 2;
    setGameState(prev => ({...prev, multiplier: mult}));
    setTimeout(() => handleThrow(target), 200);
  };

  const calculateMPR = (playerKey) => {
    const pHistory = gameState.history.filter(h => h.player === playerKey);
    if (pHistory.length === 0) return "0.00";
    let totalMarks = 0;
    pHistory.forEach(h => { if(h.target !== 0) { totalMarks += (h.target === 25 && h.multiplier === 3) ? 2 : h.multiplier; } });
    const rounds = Math.max(1, pHistory.length / 3);
    return (totalMarks / rounds).toFixed(2);
  };

  const isP1Active = gameState.currentPlayer === 'p1' && !gameState.winner;
  const isP2Active = gameState.currentPlayer === 'p2' && !gameState.winner;

  return (
    <main className={`relative h-full w-full flex-1 overflow-hidden p-2 grid gap-2 sm:gap-4 ${isLandscape ? 'grid-cols-[1.2fr_1.5fr_1fr]' : 'flex flex-col'}`}>
      {highScoreAnimation !== null && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50" aria-hidden>
          <span
            className="block text-6xl md:text-8xl font-black font-mono animate-high-score-pop"
            style={{ color: highScoreAnimation.color, textShadow: `0 0 20px ${highScoreAnimation.color}99` }}
          >
            {highScoreAnimation.score}!
          </span>
        </div>
      )}
      <div className={`w-full flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 py-1 px-2 ${isLandscape ? 'col-span-3' : ''}`}>
        {(settings?.matchSets || 1) === 1 ? (
          <div className="text-sm sm:text-base font-black text-yellow-400 tracking-wider">LEGS {gameState.p1Legs} - {gameState.p2Legs}</div>
        ) : (
          <div className="text-xs sm:text-sm font-black text-slate-200 tracking-wider text-center">
            <span className="text-emerald-400">SETS {gameState.p1Sets || 0} - {gameState.p2Sets || 0}</span>
            <span className="mx-2 text-slate-600">|</span>
            <span className="text-yellow-400">LEGS {gameState.p1Legs} - {gameState.p2Legs}</span>
          </div>
        )}
      </div>
      
      <div className={`flex gap-2 shrink-0 ${isLandscape ? 'flex-col h-full justify-center' : 'flex-row'}`}>
        <div className={`flex-1 relative p-2 sm:p-5 rounded-xl border-2 transition-all duration-300 flex flex-col items-center justify-center ${isP1Active ? 'bg-slate-800 border-emerald-500 shadow-xl shadow-emerald-900/20' : 'bg-slate-900 border-slate-800 opacity-80'}`}>
            {isP1Active && <div className="absolute -top-3 bg-emerald-500 text-slate-900 text-[10px] sm:text-xs font-bold px-3 py-1 rounded-full z-10">{t('serving')}</div>}
            {gameState.startingPlayer === 'p1' && <div className="absolute w-2 h-2 rounded-full top-2 left-2 bg-slate-500"></div>}
            <div className="flex items-center justify-between w-full mb-1">
                <h2 className="pr-2 text-xs font-bold uppercase truncate text-slate-300 sm:text-sm">
                    {getDisplayName(settings?.p1Name, true, false)}
                </h2>
                <div className="w-2 shrink-0" />
            </div>
            <div className={`font-mono font-black text-white leading-none ${isP1Active ? 'text-emerald-400' : ''}`} style={{ fontSize: isLandscape ? 'clamp(3rem, 10vh, 8rem)' : 'clamp(2rem, 12vw, 4rem)' }}>
                {gameState.p1Score}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-mono mt-1 tracking-widest">MPR: {calculateMPR('p1')}</div>
        </div>

        <div className={`flex-1 relative p-2 sm:p-5 rounded-xl border-2 transition-all duration-300 flex flex-col items-center justify-center ${isP2Active ? 'bg-slate-800 border-purple-500 shadow-xl shadow-purple-900/20' : 'bg-slate-900 border-slate-800 opacity-80'}`}>
            {isP2Active && <div className="absolute -top-3 bg-purple-500 text-white text-[10px] sm:text-xs font-bold px-3 py-1 rounded-full z-10">{t('serving')}</div>}
            {gameState.startingPlayer === 'p2' && <div className="absolute w-2 h-2 rounded-full top-2 left-2 bg-slate-500"></div>}
            <div className="flex items-center justify-between w-full mb-1">
                <h2 className="pr-2 text-xs font-bold uppercase truncate text-slate-300 sm:text-sm">
                    {getDisplayName(settings?.p2Name, false, settings?.isBot)}
                </h2>
                <div className="w-2 shrink-0" />
            </div>
            <div className={`font-mono font-black text-white leading-none ${isP2Active ? 'text-purple-400' : ''}`} style={{ fontSize: isLandscape ? 'clamp(3rem, 10vh, 8rem)' : 'clamp(2rem, 12vw, 4rem)' }}>
                {gameState.p2Score}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-mono mt-1 tracking-widest">MPR: {calculateMPR('p2')}</div>
        </div>
      </div>

      <div className="flex flex-col justify-center flex-1 min-h-0">
        {!gameState.winner ? (
            <div className={`flex flex-col h-full gap-1 sm:gap-2 transition-opacity overflow-y-auto ${settings?.isBot && gameState.currentPlayer === 'p2' ? 'opacity-60 pointer-events-none' : ''}`}>
                {TARGETS.map(target => (
                    <div key={target} className="flex items-center overflow-hidden border bg-slate-800/40 rounded-xl border-slate-700/50 h-12 sm:h-14 lg:h-16 shrink-0">
                        <div className="flex items-center justify-end flex-1 h-full py-1 pr-2">
                            <CricketMark marks={gameState.p1Marks[target]} colorClass="text-emerald-500" />
                        </div>
                        
                        <button 
                            onClick={() => handleThrow(target)}
                            className="flex items-center justify-center w-16 h-full font-mono text-xl font-black transition-all shadow-lg sm:w-24 lg:w-32 bg-slate-800 sm:text-2xl border-x-2 border-slate-900/50 hover:bg-slate-700 active:scale-95 text-slate-100"
                        >
                            {target === 25 ? 'B' : target}
                        </button>
                        
                        <div className="flex items-center justify-start flex-1 h-full py-1 pl-2">
                            <CricketMark marks={gameState.p2Marks[target]} colorClass="text-purple-500" />
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className={`w-full h-full flex flex-col items-center justify-center ${gameState.winner === 'p1' ? 'bg-emerald-900/40 border-emerald-500/50' : 'bg-purple-900/40 border-purple-500/50'} border-2 p-4 rounded-xl text-center animate-in zoom-in duration-300 shadow-2xl`}>
                <Trophy className={`w-12 h-12 sm:w-16 sm:h-16 mb-4 ${gameState.winner === 'p1' ? 'text-emerald-400' : 'text-purple-400'}`} />
                <h3 className={`text-xl sm:text-3xl font-black uppercase tracking-widest ${gameState.winner === 'p1' ? 'text-emerald-400' : 'text-purple-400'} mb-4`}>
                    {t('legFor')} {getDisplayName(gameState.winner === 'p1' ? settings?.p1Name : settings?.p2Name, gameState.winner === 'p1', gameState.winner === 'p2' && settings?.isBot)}
                </h3>
                <button onClick={handleNextLeg} className={`w-full max-w-xs ${gameState.winner === 'p1' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'} text-white py-4 rounded-xl font-black text-lg mt-4 shadow-lg active:scale-95 transition-all`}>
                    {t('nextLeg')}
                </button>
            </div>
        )}
      </div>

      <div className={`shrink-0 flex gap-2 justify-center ${isLandscape ? 'flex-col h-full' : 'flex-row'}`}>
        
        <div className="flex flex-col flex-1 gap-2">
            <DartsIndicator dartsThrown={gameState.dartsThrown} />
            <button onClick={() => setGameState(prev => ({...prev, multiplier: 1}))} disabled={gameState.winner}
                className={`flex-1 py-2 rounded-xl font-black text-sm transition-all border ${gameState.multiplier === 1 ? 'bg-slate-200 text-slate-900 border-white shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'}`}>
                SINGLE
            </button>
            <button onClick={() => setGameState(prev => ({...prev, multiplier: 2}))} disabled={gameState.winner}
                className={`flex-1 py-2 rounded-xl font-black text-sm transition-all border ${gameState.multiplier === 2 ? 'bg-orange-500 text-white border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'}`}>
                DOUBLE
            </button>
            <button onClick={() => setGameState(prev => ({...prev, multiplier: 3}))} disabled={gameState.winner}
                className={`flex-1 py-2 rounded-xl font-black text-sm transition-all border ${gameState.multiplier === 3 ? 'bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'}`}>
                TRIPLE
            </button>
        </div>

        <div className="flex flex-col flex-1 gap-2">
            <button onClick={() => handleThrow(0)} disabled={gameState.winner}
                className="flex-1 w-full text-lg font-black tracking-widest uppercase transition-all border bg-slate-900 border-slate-700 text-slate-400 rounded-xl hover:bg-slate-800 active:scale-95">
                Miss
            </button>
            
            <div className="flex gap-2 shrink-0">
                <button onClick={() => handleThrow(25, 1)} disabled={gameState.winner}
                    className="flex-1 py-2 text-sm font-black transition-all border sm:py-3 bg-emerald-700/60 border-emerald-600 text-emerald-100 rounded-xl hover:bg-emerald-600 active:scale-95">
                    25
                </button>
                <button onClick={() => handleThrow(25, 2)} disabled={gameState.winner}
                    className="flex-1 py-2 text-sm font-black text-red-100 transition-all border border-red-600 sm:py-3 bg-red-700/60 rounded-xl hover:bg-red-600 active:scale-95">
                    50
                </button>
            </div>
            
            <div className="flex h-12 gap-2 sm:h-14 shrink-0">
                <button
                  onClick={() => setIsMicActive(!isMicActive)}
                  className={`flex-1 rounded-xl flex items-center justify-center border transition-all ${
                    isMicActive
                      ? (isListening
                          ? 'bg-red-600 border-red-500 text-white animate-pulse'
                          : 'bg-red-900/60 border-red-500 text-red-100')
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                  }`}
                >
                    {isMicActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button onClick={handleUndoClick} disabled={gameState.history.length === 0}
                    className={`flex-[2] rounded-xl font-bold flex flex-col items-center justify-center uppercase tracking-widest border transition-all ${gameState.history.length === 0 ? 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-red-900/40 hover:text-red-400 hover:border-red-900 active:scale-95'}`}>
                    <Undo2 className="w-4 h-4 mb-0.5" />
                    <span className="text-[10px]">Undo</span>
                </button>
            </div>
        </div>

      </div>

    </main>
  );
}