import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Ban, CheckCircle, Delete, Mic, MicOff, Trophy, Undo2, X } from 'lucide-react';
import { translations } from '../translations';
import {
  completeOnlineGameSession,
  subscribeOnlineGame,
  subscribeToGameState,
  updateGameState,
  updateHeartbeat,
} from '../services/onlineGamesService';
import OnlineVideoContainer from './online/OnlineVideoContainer';
import PostMatchView from './online/PostMatchView';
import {
  SPEECH_LANG_MAP,
  normalizeSpeechCommand,
  parseNumberFromSpeech,
  matchesAnyPhrase,
  VOICE_PHRASES,
  CHECKOUT_VOICE_PHRASES,
  getBustPointsForActiveScore,
} from '../voiceSpeech';

const IMPOSSIBLE_SCORES = [163, 166, 169, 172, 173, 175, 176, 178, 179];

/**
 * Online X01: po ukončení legu synchronizace — čeká na OK hráče, který leg prohrál.
 * @returns {{ awaitingAckFrom: 'p1'|'p2', checkoutScore: number, checkoutDarts: number, winnerLegDarts: number, currentScore: { p1: number, p2: number } } | null}
 */
function buildOnlineLegTransition(mergedLeg) {
  if (!mergedLeg?.winner) return null;
  const w = mergedLeg.winner;
  const loser = w === 'p1' ? 'p2' : 'p1';
  const currentScore = {
    p1: Number(mergedLeg.p1Legs) || 0,
    p2: Number(mergedLeg.p2Legs) || 0,
  };
  const winMove =
    (mergedLeg.history || []).find((m) => m.player === w && !m.isBust && m.remaining === 0) ||
    (mergedLeg.history || [])[0];
  if (!winMove || winMove.player !== w) {
    return { awaitingAckFrom: loser, checkoutScore: 0, checkoutDarts: 3, winnerLegDarts: 0, currentScore };
  }
  const checkoutScore = winMove.score ?? 0;
  const checkoutDarts = winMove.dartsUsed ?? 3;
  const winnerLegDarts = (mergedLeg.history || [])
    .filter((m) => m.player === w && !m.isBust)
    .reduce((acc, m) => acc + (m.dartsUsed ?? 3), 0);
  return { awaitingAckFrom: loser, checkoutScore, checkoutDarts, winnerLegDarts, currentScore };
}

function fillI18nTemplate(str, vars) {
  let out = String(str || '');
  Object.entries(vars).forEach(([k, v]) => {
    out = out.split(`{${k}}`).join(String(v));
  });
  return out;
}

/** Všechny kladné hodnoty jedné šipky (včetně 25 a 50). */
const SINGLE_DART_SCORES = (() => {
  const s = new Set();
  for (let n = 1; n <= 20; n++) {
    s.add(n);
    s.add(2 * n);
    s.add(3 * n);
  }
  s.add(25);
  s.add(50);
  return Array.from(s);
})();

/** Hodnoty zavírací double (včetně bull 50). */
const DOUBLE_OUT_FINISH_VALUES = (() => {
  const a = [];
  for (let n = 1; n <= 20; n++) a.push(2 * n);
  a.push(50);
  return a;
})();

const DOUBLE_OUT_IMPOSSIBLE_TOTAL = [159, 162, 163, 165, 166, 168, 169];

const getMinDartsToCheckout = (score, outMode) => {
  if (score === 0) return 0;
  if (score > 180) return Infinity;
  if (IMPOSSIBLE_SCORES.includes(score)) return Infinity;
  if (outMode === 'single') {
    if (score <= 60) return 1;
    if (score <= 120) return 2;
    return 3;
  }
  if (outMode !== 'double') {
    if (score <= 60) return 1;
    if (score <= 120) return 2;
    return 3;
  }
  if (score > 170) return Infinity;
  if (DOUBLE_OUT_IMPOSSIBLE_TOTAL.includes(score)) return Infinity;

  if (DOUBLE_OUT_FINISH_VALUES.includes(score)) return 1;

  for (let i = 0; i < SINGLE_DART_SCORES.length; i++) {
    const a = SINGLE_DART_SCORES[i];
    for (let j = 0; j < DOUBLE_OUT_FINISH_VALUES.length; j++) {
      const d = DOUBLE_OUT_FINISH_VALUES[j];
      if (a + d === score) return 2;
    }
  }

  for (let i = 0; i < SINGLE_DART_SCORES.length; i++) {
    const a = SINGLE_DART_SCORES[i];
    for (let j = 0; j < SINGLE_DART_SCORES.length; j++) {
      const b = SINGLE_DART_SCORES[j];
      for (let k = 0; k < DOUBLE_OUT_FINISH_VALUES.length; k++) {
        const d = DOUBLE_OUT_FINISH_VALUES[k];
        if (a + b + d === score) return 3;
      }
    }
  }

  return Infinity;
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

export default function GameX01({
  settings,
  lang,
  onMatchComplete,
  isLandscape,
  isPC,
  restoredGameState,
  onRestoredConsumed,
  onRematchVoice,
  /** Volitelně: po kroku zpět z checkoutu, který ukončil leg (vrácení do probíhajícího zápasu). */
  onFinishedLegUndone,
  /** ID online zápasu ve Firestore – pro budoucí synchronizaci hodů. */
  onlineGameId = null,
  /** Na tomto zařízení: 'p1' = hostitel, 'p2' = host. */
  myOnlineRole = null,
  /** Lokální stream z online lobby (kamera + volitelně mikrofon). */
  onlineLocalStream = null,
  /** Po online handshake konce zápasu (obě strany) — vymaže onlineGameId v App. */
  onOnlineSessionEnded = null,
  /** ID online hry: pokud se shoduje s tímto, p1 neodesílá prázdný seed (obnova stránky s live stavem). */
  skipOnlineInitialSeedGameId = null,
  onAbort: _onAbort,
}) {
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
  const defaultGameState = {
    p1Score: settings.startScore,
    p2Score: settings.startScore,
    p1Legs: 0,
    p2Legs: 0,
    p1Sets: 0,
    p2Sets: 0,
    currentPlayer: settings.startPlayer,
    startingPlayer: settings.startPlayer,
    winner: null,
    matchWinner: null,
    history: [],
    completedLegs: []
  };

  const [gameState, setGameState] = useState(() => restoredGameState?.gameState || defaultGameState);

  const [currentInput, setCurrentInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [editingMove, setEditingMove] = useState(null); 
  const [finishData, setFinishData] = useState(null);
  const [setScores, setSetScores] = useState(() => restoredGameState?.setScores || []);
  /** Online: po výhře legu čeká na potvrzení (OK) poražený hráč — data z Firebase `liveGameState.legTransition`. */
  const [onlineLegTransition, setOnlineLegTransition] = useState(null);
  const onlineLegTransitionRef = useRef(null);
  const [onlineMatchTransition, setOnlineMatchTransition] = useState(null);
  const onlineMatchTransitionRef = useRef(null);
  const [pendingOnlineMatchRecord, setPendingOnlineMatchRecord] = useState(null);
  const pendingOnlineMatchRecordRef = useRef(null);
  /** Firestore `onlineGames/{id}.status === 'completed'` — ukončení WebRTC v náhledu. */
  const [onlineFirestoreSessionCompleted, setOnlineFirestoreSessionCompleted] = useState(false);
  /** Po potvrzení poraženého — statistiky + odpočet před `completeOnlineGameSession`. */
  const [postMatchStatsActive, setPostMatchStatsActive] = useState(false);
  const postMatchStatsActiveRef = useRef(false);
  const onlineSessionEndOnceRef = useRef(false);

  const [highScoreAnimation, setHighScoreAnimation] = useState(null);
  const [longPressIdx, setLongPressIdx] = useState(null);
  const longPressTimer = useRef(null);
  const historyRef = useRef(null);

  const [isListening, setIsListening] = useState(false); 
  const [isMicActive, setIsMicActive] = useState(false); 

  const recognitionRef = useRef(null);
  const onlineGameIdRef = useRef(onlineGameId);
  const gameStateRef = useRef(gameState);
  const isMicActiveRef = useRef(isMicActive);
  const currentInputRef = useRef(currentInput);
  const finishDataRef = useRef(finishData);
  const processTurnRef = useRef(null);
  const handleTurnCommitRef = useRef(null);
  const handleUndoClickRef = useRef(null);
  const handleNextLegRef = useRef(null);
  const handleVoiceCommandRef = useRef(() => {});
  const micTimeoutRef = useRef(null);
  const pushOnlineX01LiveRef = useRef(async () => {});
  const lastPushedWriteIdRef = useRef('');
  const didSeedOnlineRef = useRef(false);
  const setScoresRef = useRef(setScores);
  const opponentHeartbeatMsRef = useRef(null);
  const [isOpponentOffline, setIsOpponentOffline] = useState(false);

  const [quickButtons, setQuickButtons] = useState(settings.quickButtons || [41, 45, 60, 100, 140, 180]);

  const isOnlineInputLocked = () =>
    Boolean(
      postMatchStatsActiveRef.current ||
      (onlineGameId &&
        settings.gameType === 'x01' &&
        myOnlineRole &&
        (onlineMatchTransition ||
          gameState.matchWinner ||
          (gameState.currentPlayer !== myOnlineRole && !gameState.winner && !gameState.matchWinner)))
    );

    useEffect(() => {
      gameStateRef.current = gameState; isMicActiveRef.current = isMicActive;
      currentInputRef.current = currentInput; finishDataRef.current = finishData;
      if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; 
  }, [gameState, isMicActive, currentInput, finishData]);

  useEffect(() => {
    onlineGameIdRef.current = onlineGameId;
  }, [onlineGameId]);

  useEffect(() => {
    setScoresRef.current = setScores;
  }, [setScores]);

  useEffect(() => {
    onlineLegTransitionRef.current = onlineLegTransition;
  }, [onlineLegTransition]);

  useEffect(() => {
    onlineMatchTransitionRef.current = onlineMatchTransition;
  }, [onlineMatchTransition]);

  useEffect(() => {
    pendingOnlineMatchRecordRef.current = pendingOnlineMatchRecord;
  }, [pendingOnlineMatchRecord]);

  useEffect(() => {
    postMatchStatsActiveRef.current = postMatchStatsActive;
  }, [postMatchStatsActive]);

  useEffect(() => {
    didSeedOnlineRef.current = false;
  }, [onlineGameId]);

  useEffect(() => {
    setOnlineLegTransition(null);
    setOnlineMatchTransition(null);
    setPendingOnlineMatchRecord(null);
    setOnlineFirestoreSessionCompleted(false);
    setPostMatchStatsActive(false);
    postMatchStatsActiveRef.current = false;
    onlineSessionEndOnceRef.current = false;
    opponentHeartbeatMsRef.current = null;
    setIsOpponentOffline(false);
  }, [onlineGameId]);

  useEffect(() => {
    pushOnlineX01LiveRef.current = async (gs, ss, syncExtra = null) => {
      if (!onlineGameId || settings.gameType !== 'x01') return;
      let legTransition = onlineLegTransitionRef.current;
      let matchTransition = onlineMatchTransitionRef.current;
      let pendingMatchRecord = pendingOnlineMatchRecordRef.current;
      if (syncExtra && typeof syncExtra === 'object' && !Array.isArray(syncExtra)) {
        if ('legTransition' in syncExtra) legTransition = syncExtra.legTransition;
        if ('matchTransition' in syncExtra) matchTransition = syncExtra.matchTransition;
        if ('pendingMatchRecord' in syncExtra) pendingMatchRecord = syncExtra.pendingMatchRecord;
        if (
          !('legTransition' in syncExtra) &&
          !('matchTransition' in syncExtra) &&
          !('pendingMatchRecord' in syncExtra) &&
          syncExtra.awaitingAckFrom
        ) {
          if (syncExtra.finalScore) matchTransition = syncExtra;
          else legTransition = syncExtra;
        }
      } else if (syncExtra != null) {
        legTransition = syncExtra;
      }
      const writeId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      lastPushedWriteIdRef.current = writeId;
      const payload = {
        kind: 'x01',
        writeId,
        gameState: gs,
        setScores: Array.isArray(ss) ? ss : [],
        legTransition,
        matchTransition,
        pendingMatchRecord,
      };
      if (postMatchStatsActiveRef.current) {
        payload.postMatchStatsActive = true;
      }
      try {
        await updateGameState(onlineGameId, payload);
      } catch (e) {
        console.warn('updateGameState', e);
      }
    };
  }, [onlineGameId, settings.gameType]);

  useEffect(() => {
    if (!onlineGameId || settings.gameType !== 'x01') return undefined;
    const unsub = subscribeToGameState(onlineGameId, (live) => {
      if (!live || live.kind !== 'x01' || !live.gameState) return;
      if (live.writeId && live.writeId === lastPushedWriteIdRef.current) return;
      setGameState(live.gameState);
      setSetScores(Array.isArray(live.setScores) ? live.setScores : []);
      setOnlineLegTransition(live.legTransition ?? null);
      setOnlineMatchTransition(live.matchTransition ?? null);
      setPendingOnlineMatchRecord(live.pendingMatchRecord ?? null);
      if (live.postMatchStatsActive) {
        setPostMatchStatsActive(true);
        setOnlineMatchTransition(null);
      }
      setCurrentInput('');
      setFinishData(null);
      setEditingMove(null);
    });
    return () => {
      try {
        unsub();
      } catch (e) {
        /* ignore */
      }
    };
  }, [onlineGameId, settings.gameType]);

  useEffect(() => {
    if (!onlineGameId || settings.gameType !== 'x01') return undefined;
    const unsub = subscribeOnlineGame(onlineGameId, (doc) => {
      if (!doc) return;
      if (doc.status === 'completed') {
        setOnlineFirestoreSessionCompleted(true);
      }
      if (!myOnlineRole) return;
      const oppField = myOnlineRole === 'p1' ? doc.heartbeatGuest : doc.heartbeatHost;
      const ms = oppField?.toMillis?.();
      if (typeof ms === 'number' && !Number.isNaN(ms)) {
        opponentHeartbeatMsRef.current = ms;
      }
    });
    return () => {
      try {
        unsub();
      } catch (e) {
        /* ignore */
      }
    };
  }, [onlineGameId, settings.gameType, myOnlineRole]);

  useEffect(() => {
    if (!onlineGameId || settings.gameType !== 'x01' || !myOnlineRole) return undefined;
    const tick = () => {
      void updateHeartbeat(onlineGameId, myOnlineRole).catch((e) => console.warn('updateHeartbeat', e));
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [onlineGameId, settings.gameType, myOnlineRole]);

  useEffect(() => {
    if (!onlineGameId || settings.gameType !== 'x01' || !myOnlineRole) return undefined;
    const id = setInterval(() => {
      const ms = opponentHeartbeatMsRef.current;
      if (ms == null) {
        setIsOpponentOffline(false);
        return;
      }
      setIsOpponentOffline(Date.now() - ms > 15000);
    }, 1000);
    return () => clearInterval(id);
  }, [onlineGameId, settings.gameType, myOnlineRole]);

  useEffect(() => {
    if (!onlineGameId || settings.gameType !== 'x01' || myOnlineRole !== 'p1') return;
    if (didSeedOnlineRef.current) return;
    if (
      skipOnlineInitialSeedGameId &&
      String(skipOnlineInitialSeedGameId) === String(onlineGameId)
    ) {
      didSeedOnlineRef.current = true;
      return;
    }
    didSeedOnlineRef.current = true;
    const seed = {
      p1Score: settings.startScore,
      p2Score: settings.startScore,
      p1Legs: 0,
      p2Legs: 0,
      p1Sets: 0,
      p2Sets: 0,
      currentPlayer: settings.startPlayer || 'p1',
      startingPlayer: settings.startPlayer || 'p1',
      winner: null,
      matchWinner: null,
      history: [],
      completedLegs: [],
    };
    void pushOnlineX01LiveRef.current(seed, setScoresRef.current || [], {});
  }, [
    onlineGameId,
    myOnlineRole,
    settings.gameType,
    settings.startScore,
    settings.startPlayer,
    skipOnlineInitialSeedGameId,
  ]);

  // Pokud se uživatel vrátí zpět z obrazovky "konec zápasu",
  // obnovíme přesně stav před posledním ukončujícím hodem.
  useEffect(() => {
    if (!restoredGameState) return;
    if (restoredGameState.gameState) setGameState(restoredGameState.gameState);
    if (restoredGameState.setScores) setSetScores(restoredGameState.setScores);
    setCurrentInput('');
    setErrorMsg('');
    setEditingMove(null);
    setFinishData(null);
    if (onRestoredConsumed) onRestoredConsumed();
  }, [restoredGameState, onRestoredConsumed]);

  // Klávesnice
  useEffect(() => {
      const handleGlobalKeyDown = (e) => {
          if (editingMove || finishData || gameState.matchWinner || onlineMatchTransition) return;
          if (!isPC) return;
          const key = e.key;
          if (/^[0-9]$/.test(key)) { e.preventDefault(); setCurrentInput(prev => prev.length < 3 ? prev + key : prev); }
          else if (key === 'Backspace') { e.preventDefault(); setCurrentInput(prev => prev.slice(0, -1)); }
          else if (key === 'Enter') { e.preventDefault(); const cVal = currentInputRef.current; if (cVal !== '') handleTurnCommitRef.current(parseInt(cVal)); }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editingMove, finishData, isPC, gameState.matchWinner, onlineMatchTransition]);

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

  const recalculateGame = (baseHistory, baseState) => {
    const bs = baseState ?? gameState;
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
    let nP = rec.length > 0 ? (rec[rec.length - 1].player === 'p1' ? 'p2' : 'p1') : bs.startingPlayer;
    return { ...bs, p1Score: p1, p2Score: p2, history: rec.reverse(), winner, currentPlayer: winner ? winner : nP };
  };

  const processTurn = (points, dartsCount = 3) => {
    if (isOnlineInputLocked()) return;
    const pts = parseInt(points);
    if (isNaN(pts) || pts < 0 || pts > 180 || IMPOSSIBLE_SCORES.includes(pts)) { 
        setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); setTimeout(() => setErrorMsg(''), 1500); setCurrentInput(''); return; 
    }

    // Pro tlačítko "zpět" na obrazovce konce zápasu potřebujeme obnovit přesně stav
    // před tímto ukončujícím hodem.
    const restorePayload = { gameState, setScores };

    const nm = { id: Date.now(), player: gameState.currentPlayer, score: pts, dartsUsed: dartsCount };
    const ns = recalculateGame([nm, ...gameState.history]);
    if (ns.history[0].isBust) { setErrorMsg(String(translations[lang]?.bust || 'Bust')); setTimeout(() => setErrorMsg(''), 1500); }

    if (ns.winner) {
      const legTarget = settings.matchMode === 'first_to' ? settings.matchTarget : Math.ceil(settings.matchTarget / 2);
      let p1W = ns.winner === 'p1' ? gameState.p1Legs + 1 : gameState.p1Legs;
      let p2W = ns.winner === 'p2' ? gameState.p2Legs + 1 : gameState.p2Legs;
      // Před resetem setu (p1W/p2W → 0) uložíme skóre legů pro turnaj / statistiky
      const legsAtEndOfMatch = { p1: p1W, p2: p2W };
      let p1S = gameState.p1Sets || 0;
      let p2S = gameState.p2Sets || 0;
      let nextSetScores = [...setScores];
      if (p1W >= legTarget || p2W >= legTarget) {
        nextSetScores = [...nextSetScores, { p1: p1W, p2: p2W }];
      }
      if (p1W >= legTarget) { p1S += 1; p1W = 0; p2W = 0; }
      if (p2W >= legTarget) { p2S += 1; p1W = 0; p2W = 0; }
      const setTarget = settings.matchSets || 1;
      const isOver = p1S >= setTarget || p2S >= setTarget;
      const uLegs = [...gameState.completedLegs, { history: ns.history, winner: ns.winner }];

      if (isOver) {
        const finalResult = {
          player1: { legsWon: legsAtEndOfMatch.p1 },
          player2: { legsWon: legsAtEndOfMatch.p2 },
        };
        const resultForStore = {
          p1Legs: Number(finalResult.player1.legsWon) || 0,
          p2Legs: Number(finalResult.player2.legsWon) || 0,
        };
        const stableId = onlineGameId ? String(onlineGameId) : Date.now();
        const record = {
          id: stableId,
          onlineSessionGameId: onlineGameId ? String(onlineGameId) : null,
          date: new Date().toLocaleString(),
          gameType: 'x01',
          p1Name: settings.p1Name,
          p1Id: settings.p1Id || null,
          p2Name: settings.p2Name,
          p2Id: settings.p2Id || null,
          p1Legs: resultForStore.p1Legs,
          p2Legs: resultForStore.p2Legs,
          finalResult,
          p1Sets: p1S,
          p2Sets: p2S,
          matchSets: settings.matchSets || 1,
          setScores: nextSetScores,
          matchWinner: ns.winner,
          completedLegs: uLegs,
          isBot: settings.isBot,
          botLevel: settings.botLevel,
          botAvg: settings.botAvg,
        };
        setSetScores(nextSetScores);
        if (isMicActiveRef.current) {
          if (micTimeoutRef.current) clearTimeout(micTimeoutRef.current);
          micTimeoutRef.current = setTimeout(() => {
            setIsMicActive(false);
          }, 10000);
        }
        if (onlineGameId && settings.gameType === 'x01') {
          const loser = ns.winner === 'p1' ? 'p2' : 'p1';
          const matchT = {
            winner: ns.winner,
            awaitingAckFrom: loser,
            finalScore: { p1: legsAtEndOfMatch.p1, p2: legsAtEndOfMatch.p2 },
          };
          const mergedMatch = {
            ...ns,
            p1Legs: p1W,
            p2Legs: p2W,
            p1Sets: p1S,
            p2Sets: p2S,
            matchWinner: ns.winner,
            completedLegs: uLegs,
          };
          onlineLegTransitionRef.current = null;
          onlineMatchTransitionRef.current = matchT;
          pendingOnlineMatchRecordRef.current = record;
          setOnlineLegTransition(null);
          setOnlineMatchTransition(matchT);
          setPendingOnlineMatchRecord(record);
          setGameState(mergedMatch);
          void pushOnlineX01LiveRef.current(mergedMatch, nextSetScores, {
            legTransition: null,
            matchTransition: matchT,
            pendingMatchRecord: record,
          });
        } else {
          setOnlineLegTransition(null);
          onMatchComplete(record, restorePayload);
        }
      } else {
        setSetScores(nextSetScores);
        const mergedLeg = { ...ns, p1Legs: p1W, p2Legs: p2W, p1Sets: p1S, p2Sets: p2S, matchWinner: null, completedLegs: uLegs };
        let legT = null;
        if (onlineGameId && settings.gameType === 'x01') {
          legT = buildOnlineLegTransition(mergedLeg);
          onlineLegTransitionRef.current = legT;
          setOnlineLegTransition(legT);
        } else {
          setOnlineLegTransition(null);
        }
        setGameState(mergedLeg);
        if (onlineGameId && settings.gameType === 'x01') {
          void pushOnlineX01LiveRef.current(mergedLeg, nextSetScores, { legTransition: legT });
        }
      }
    } else { 
      setGameState(ns);
      if (onlineGameId && settings.gameType === 'x01') {
        void pushOnlineX01LiveRef.current(ns, setScoresRef.current, {});
      }
    }

    if (pts >= 95 && !ns.history[0].isBust) {
      const isP1 = gameState.currentPlayer === 'p1';
      const color = isP1 ? 'rgb(52,211,153)' : 'rgb(168,85,247)';
      setHighScoreAnimation({ score: pts, color });
      setTimeout(() => setHighScoreAnimation(null), 1500);
    }

    setCurrentInput('');
  };
  processTurnRef.current = processTurn;

  const handleTurnCommit = (points, darts = 3, force = false) => {
    if (isOnlineInputLocked()) return;
    const cS = gameState.currentPlayer === 'p1' ? gameState.p1Score : gameState.p2Score;
    if ((cS - points) === 0 && !force) {
        const minD = getMinDartsToCheckout(cS, settings.outMode);
        if (minD === Infinity) { setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; }
        setFinishData({ points, minD });
    } else { processTurn(points, darts); }
  };
  handleTurnCommitRef.current = handleTurnCommit;

  const handleUndoClick = () => {
    const gs = gameStateRef.current;
    if (
      onlineGameId &&
      settings.gameType === 'x01' &&
      myOnlineRole &&
      gs.history[0] &&
      gs.history[0].player !== myOnlineRole
    ) {
      return;
    }
    if (gs.history.length === 0) return;
    let sliceCount = 1;
    if (settings.isBot && gs.currentPlayer === 'p1' && gs.history.length >= 2) {
      if (gs.history[0].player === 'p2') sliceCount = 2;
    }
    const newHist = gs.history.slice(sliceCount);
    const ns = recalculateGame(newHist, gs);

    let nextP1Legs = gs.p1Legs;
    let nextP2Legs = gs.p2Legs;
    const nextCompletedLegs = [...(gs.completedLegs || [])];

    if (gs.winner && !ns.winner) {
      if (gs.winner === 'p1') nextP1Legs = Math.max(0, nextP1Legs - 1);
      if (gs.winner === 'p2') nextP2Legs = Math.max(0, nextP2Legs - 1);
      nextCompletedLegs.pop();
      ns.matchWinner = null;
      if (typeof onFinishedLegUndone === 'function') onFinishedLegUndone();
    }

    const mergedUndo = {
      ...ns,
      p1Legs: nextP1Legs,
      p2Legs: nextP2Legs,
      p1Sets: gs.p1Sets,
      p2Sets: gs.p2Sets,
      completedLegs: nextCompletedLegs,
    };
    if (gs.winner && !ns.winner) {
      onlineLegTransitionRef.current = null;
      setOnlineLegTransition(null);
    }
    setGameState(mergedUndo);
    if (onlineGameId && settings.gameType === 'x01') {
      void pushOnlineX01LiveRef.current(mergedUndo, setScoresRef.current, { legTransition: null });
    }
  };

  const handleQuickBtnDown = (idx) => { setLongPressIdx(idx); longPressTimer.current = setTimeout(() => { if (currentInput && parseInt(currentInput) <= 180) { const newB = [...quickButtons]; newB[idx] = parseInt(currentInput); setQuickButtons(newB); setCurrentInput(''); setErrorMsg(String(translations[lang]?.presetSaved || 'Uloženo')); setTimeout(()=>setErrorMsg(''), 1000); } setLongPressIdx(null); }, 700); };
  const handleQuickBtnUp = (val) => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); if (longPressIdx !== null) handleTurnCommit(val); setLongPressIdx(null); } };

  const handleScoreClick = (pKey) => {
    if (isOnlineInputLocked()) return;
    if (pKey !== gameState.currentPlayer) return;
    if (!currentInput) { const cS = pKey === 'p1' ? gameState.p1Score : gameState.p2Score; const minD = getMinDartsToCheckout(cS, settings.outMode); if (minD !== Infinity) setFinishData({ points: cS, minD }); return; }
    const rem = parseInt(currentInput); if (isNaN(rem)) return;
    const cS = pKey === 'p1' ? gameState.p1Score : gameState.p2Score; const thr = cS - rem;
    if (thr < 0 || thr > 180 || IMPOSSIBLE_SCORES.includes(thr)) { setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; }
    if (rem === 0) { const minD = getMinDartsToCheckout(cS, settings.outMode); if (minD === Infinity) { setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; } setFinishData({ points: thr, minD }); } else handleTurnCommit(thr);
  };

  const handleSaveEdit = (newS, newD) => {
    if (isNaN(newS) || newS < 0 || newS > 180 || IMPOSSIBLE_SCORES.includes(newS)) { setErrorMsg(String(translations[lang]?.impossible || 'Chyba')); return; }
    if (
      onlineGameId &&
      settings.gameType === 'x01' &&
      myOnlineRole &&
      editingMove &&
      editingMove.player !== myOnlineRole
    ) {
      return;
    }

    // Pro případ "zpět" po ukončení zápasu z obrazovky statistik
    // ukládáme stav před uložením úpravy.
    const restorePayload = { gameState, setScores };

    const uh = gameState.history.map(m => m.id === editingMove.id ? { ...m, score: newS, dartsUsed: (m.remaining+m.score-newS)===0 ? newD : 3 } : m);
    const ns = recalculateGame(uh, gameState);
    
    let nextP1Legs = gameState.p1Legs;
    let nextP2Legs = gameState.p2Legs;
    let nextCompletedLegs = [...gameState.completedLegs];

    if (gameState.winner && !ns.winner) {
        if (gameState.winner === 'p1') nextP1Legs = Math.max(0, nextP1Legs - 1);
        if (gameState.winner === 'p2') nextP2Legs = Math.max(0, nextP2Legs - 1);
        nextCompletedLegs.pop();
        ns.matchWinner = null;
        if (onlineGameId && settings.gameType === 'x01') {
          onlineLegTransitionRef.current = null;
          setOnlineLegTransition(null);
        }
    }
    else if (!gameState.winner && ns.winner) {
        if (ns.winner === 'p1') nextP1Legs++;
        if (ns.winner === 'p2') nextP2Legs++;
        nextCompletedLegs.push({ history: ns.history, winner: ns.winner });

        const tgt = settings.matchMode === 'first_to' ? settings.matchTarget : Math.ceil(settings.matchTarget / 2);
        const isOver = nextP1Legs >= tgt || nextP2Legs >= tgt;

        if (isOver) {
          const finalResult = {
            player1: { legsWon: nextP1Legs },
            player2: { legsWon: nextP2Legs },
          };
          const resultForStore = {
            p1Legs: Number(finalResult.player1.legsWon) || 0,
            p2Legs: Number(finalResult.player2.legsWon) || 0,
          };
          const stableId = onlineGameId ? String(onlineGameId) : Date.now();
          const record = {
            id: stableId,
            onlineSessionGameId: onlineGameId ? String(onlineGameId) : null,
            date: new Date().toLocaleString(),
            gameType: 'x01',
            p1Name: settings.p1Name,
            p1Id: settings.p1Id || null,
            p2Name: settings.p2Name,
            p2Id: settings.p2Id || null,
            p1Legs: resultForStore.p1Legs,
            p2Legs: resultForStore.p2Legs,
            finalResult,
            p1Sets: gameState.p1Sets || 0,
            p2Sets: gameState.p2Sets || 0,
            matchSets: settings.matchSets || 1,
            setScores: setScoresRef.current,
            matchWinner: ns.winner,
            completedLegs: nextCompletedLegs,
            isBot: settings.isBot,
            botLevel: settings.botLevel,
            botAvg: settings.botAvg,
          };
          setEditingMove(null);
          if (onlineGameId && settings.gameType === 'x01') {
            const legsAtEndOfMatch = { p1: nextP1Legs, p2: nextP2Legs };
            const loser = ns.winner === 'p1' ? 'p2' : 'p1';
            const matchT = {
              winner: ns.winner,
              awaitingAckFrom: loser,
              finalScore: { p1: legsAtEndOfMatch.p1, p2: legsAtEndOfMatch.p2 },
            };
            const mergedMatch = {
              ...ns,
              p1Legs: nextP1Legs,
              p2Legs: nextP2Legs,
              p1Sets: gameState.p1Sets || 0,
              p2Sets: gameState.p2Sets || 0,
              matchWinner: ns.winner,
              completedLegs: nextCompletedLegs,
            };
            onlineLegTransitionRef.current = null;
            onlineMatchTransitionRef.current = matchT;
            pendingOnlineMatchRecordRef.current = record;
            setOnlineLegTransition(null);
            setOnlineMatchTransition(matchT);
            setPendingOnlineMatchRecord(record);
            setGameState(mergedMatch);
            void pushOnlineX01LiveRef.current(mergedMatch, setScoresRef.current, {
              legTransition: null,
              matchTransition: matchT,
              pendingMatchRecord: record,
            });
            return;
          }
          setOnlineLegTransition(null);
          onMatchComplete(record, restorePayload);
          return;
        }
    }
    const mergedEdit = { ...ns, p1Legs: nextP1Legs, p2Legs: nextP2Legs, completedLegs: nextCompletedLegs };
    let legT = null;
    if (onlineGameId && settings.gameType === 'x01') {
      if (mergedEdit.winner) {
        legT = buildOnlineLegTransition(mergedEdit);
        onlineLegTransitionRef.current = legT;
        setOnlineLegTransition(legT);
      } else {
        onlineLegTransitionRef.current = null;
        setOnlineLegTransition(null);
      }
    }
    setGameState(mergedEdit);
    if (onlineGameId && settings.gameType === 'x01') {
      void pushOnlineX01LiveRef.current(mergedEdit, setScoresRef.current, {
        legTransition: mergedEdit.winner ? legT : null,
      });
    }
    setEditingMove(null);
  };

  const prevNextLegStateRef = useRef(null);

  const acknowledgeOnlineLegEnd = () => {
    if (!onlineGameId || settings.gameType !== 'x01') return;
    const lt = onlineLegTransitionRef.current;
    if (!lt || lt.awaitingAckFrom !== myOnlineRole) return;
    const gs = gameStateRef.current;
    if (!gs.winner) return;
    prevNextLegStateRef.current = gs;
    const nS = gs.startingPlayer === 'p1' ? 'p2' : 'p1';
    const next = {
      ...gs,
      p1Score: settings.startScore,
      p2Score: settings.startScore,
      winner: null,
      history: [],
      currentPlayer: nS,
      startingPlayer: nS,
    };
    setGameState(next);
    setCurrentInput('');
    setFinishData(null);
    onlineLegTransitionRef.current = null;
    setOnlineLegTransition(null);
    void pushOnlineX01LiveRef.current(next, setScoresRef.current, { legTransition: null });
  };

  const handleOnlineMatchComplete = useCallback(async () => {
    if (!onlineGameId || settings.gameType !== 'x01') return;
    if (onlineSessionEndOnceRef.current) return;
    if (!postMatchStatsActiveRef.current) return;
    const rec = pendingOnlineMatchRecordRef.current;
    onlineSessionEndOnceRef.current = true;
    try {
      await completeOnlineGameSession(onlineGameId, rec);
    } catch (e) {
      console.warn('completeOnlineGameSession', e);
      onlineSessionEndOnceRef.current = false;
      return;
    }
    try {
      if (rec && typeof onMatchComplete === 'function') {
        await onMatchComplete(rec, null);
      }
    } catch (e) {
      console.warn('onMatchComplete', e);
    }
    if (typeof onOnlineSessionEnded === 'function') {
      onOnlineSessionEnded();
    }
  }, [onlineGameId, settings.gameType, onMatchComplete, onOnlineSessionEnded]);

  const beginOnlinePostMatchStats = useCallback(async () => {
    if (!onlineGameId || settings.gameType !== 'x01') return;
    const mt = onlineMatchTransitionRef.current;
    if (!mt || mt.awaitingAckFrom !== myOnlineRole) return;
    const rec = pendingOnlineMatchRecordRef.current;
    if (!rec) return;
    const gs = gameStateRef.current;
    const ss = setScoresRef.current;
    postMatchStatsActiveRef.current = true;
    setPostMatchStatsActive(true);
    onlineMatchTransitionRef.current = null;
    setOnlineMatchTransition(null);
    const writeId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    lastPushedWriteIdRef.current = writeId;
    try {
      await updateGameState(onlineGameId, {
        kind: 'x01',
        writeId,
        gameState: gs,
        setScores: Array.isArray(ss) ? ss : [],
        legTransition: null,
        matchTransition: null,
        pendingMatchRecord: rec,
        postMatchStatsActive: true,
      });
    } catch (e) {
      console.warn('beginOnlinePostMatchStats', e);
      postMatchStatsActiveRef.current = false;
      setPostMatchStatsActive(false);
      onlineMatchTransitionRef.current = mt;
      setOnlineMatchTransition(mt);
    }
  }, [onlineGameId, settings.gameType, myOnlineRole]);
  const acknowledgeOnlineLegEndRef = useRef(() => {});
  acknowledgeOnlineLegEndRef.current = acknowledgeOnlineLegEnd;

  const handleNextLeg = () => {
      if (
        onlineGameId &&
        settings.gameType === 'x01' &&
        (onlineLegTransitionRef.current ||
          onlineMatchTransitionRef.current ||
          postMatchStatsActiveRef.current)
      ) {
        return;
      }
      prevNextLegStateRef.current = gameState;
      const nS = gameState.startingPlayer === 'p1' ? 'p2' : 'p1';
      const next = {
        ...gameState,
        p1Score: settings.startScore,
        p2Score: settings.startScore,
        winner: null,
        history: [],
        currentPlayer: nS,
        startingPlayer: nS,
      };
      setGameState(next);
      setCurrentInput('');
      setFinishData(null);
      if (onlineGameId && settings.gameType === 'x01') {
        void pushOnlineX01LiveRef.current(next, setScoresRef.current, {});
      }
  };

  handleUndoClickRef.current = handleUndoClick;
  handleNextLegRef.current = handleNextLeg;

  const handleVoiceCommand = (rawTranscript) => {
    const command = normalizeSpeechCommand(rawTranscript);
    const gs = gameStateRef.current;
    const voiceInputLocked = () =>
      Boolean(
        postMatchStatsActiveRef.current ||
        (onlineGameId &&
          settings.gameType === 'x01' &&
          myOnlineRole &&
          (onlineMatchTransitionRef.current ||
            gs.matchWinner ||
            (gs.currentPlayer !== myOnlineRole && !gs.winner && !gs.matchWinner)))
      );
    const tMap = translations[lang];
    const legacyUndo = Array.isArray(tMap?.cmdUndo) ? tMap.cmdUndo : [];
    const legacyNext = Array.isArray(tMap?.cmdNextLeg) ? tMap.cmdNextLeg : [];
    const checkoutPhrases = [
      ...(Array.isArray(tMap?.checkoutPhrases) ? tMap.checkoutPhrases : []),
      ...CHECKOUT_VOICE_PHRASES,
    ];

    if (matchesAnyPhrase(command, [...VOICE_PHRASES.undo, ...legacyUndo])) {
      if (finishDataRef.current) {
        setFinishData(null);
        return;
      }
      if (gs.history.length > 0) {
        handleUndoClickRef.current();
      }
      return;
    }

    if (finishDataRef.current) {
      if (voiceInputLocked()) return;
      const num = parseNumberFromSpeech(rawTranscript);
      if (num != null && num >= finishDataRef.current.minD && num <= 3) {
        processTurnRef.current(finishDataRef.current.points, num);
        setFinishData(null);
      } else if (num != null) {
        setErrorMsg(`Nemožné zavřít na ${num} šipek`);
        setTimeout(() => setErrorMsg(''), 2000);
      }
      return;
    }

    if (gs.matchWinner && typeof onRematchVoice === 'function' && matchesAnyPhrase(command, VOICE_PHRASES.rematch)) {
      onRematchVoice();
      return;
    }

    if (matchesAnyPhrase(command, [...VOICE_PHRASES.nextLeg, ...legacyNext])) {
      if (gs.winner && !gs.matchWinner) {
        if (
          onlineGameId &&
          settings.gameType === 'x01' &&
          onlineLegTransitionRef.current?.awaitingAckFrom === myOnlineRole
        ) {
          acknowledgeOnlineLegEndRef.current();
        } else if (
          onlineGameId &&
          settings.gameType === 'x01' &&
          onlineLegTransitionRef.current
        ) {
          /* vítěz legu čeká na OK soupeře */
        } else {
          handleNextLegRef.current();
        }
      }
      return;
    }

    if (matchesAnyPhrase(command, VOICE_PHRASES.bust)) {
      if (!gs.winner) {
        if (voiceInputLocked()) return;
        const cScore = gs.currentPlayer === 'p1' ? gs.p1Score : gs.p2Score;
        const bustPts = getBustPointsForActiveScore(cScore);
        handleTurnCommitRef.current(bustPts);
      }
      return;
    }

    const checkoutMatch = checkoutPhrases.some((p) => matchesAnyPhrase(command, [p]));
    if (checkoutMatch) {
      if (!gs.winner) {
        if (voiceInputLocked()) return;
        const cScore = gs.currentPlayer === 'p1' ? gs.p1Score : gs.p2Score;
        const requestedDarts = parseNumberFromSpeech(rawTranscript);
        if (requestedDarts != null && requestedDarts >= 1 && requestedDarts <= 3) {
          const minD = getMinDartsToCheckout(cScore, settings.outMode);
          if (minD === Infinity || requestedDarts < minD) {
            setErrorMsg(`Nemožné zavřít na ${requestedDarts} šipky`);
            setTimeout(() => setErrorMsg(''), 2000);
          } else {
            processTurnRef.current(cScore, requestedDarts);
          }
        } else {
          handleTurnCommitRef.current(cScore);
        }
      }
      return;
    }

    if (!gs.winner) {
      if (voiceInputLocked()) return;
      const num = parseNumberFromSpeech(rawTranscript);
      if (num != null && num >= 0 && num <= 180) {
        handleTurnCommitRef.current(num);
      } else {
        setErrorMsg(`? "${command}"`);
        setTimeout(() => setErrorMsg(''), 1500);
      }
    }
  };

  handleVoiceCommandRef.current = handleVoiceCommand;

  useEffect(() => {
    let recognition = recognitionRef.current;
    if (isMicActive) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsMicActive(false);
        setErrorMsg(String(translations[lang]?.micError || 'Chyba mikrofonu'));
        setTimeout(() => setErrorMsg(''), 2000);
        return;
      }
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = SPEECH_LANG_MAP[lang] || 'cs-CZ';
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
        if (isMicActiveRef.current) {
          try {
            recognition.start();
          } catch (e) {}
        }
      };
      recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        handleVoiceCommandRef.current(transcript);
      };
      recognition.onerror = (e) => {
        if (e.error === 'not-allowed') {
          setIsMicActive(false);
          setErrorMsg('Přístup k mikrofonu odepřen.');
          setTimeout(() => setErrorMsg(''), 2500);
        }
      };
      try {
        recognition.start();
      } catch (e) {}
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

  const handleBackFromLeg = () => {
    if (prevNextLegStateRef.current) {
      setGameState(prevNextLegStateRef.current);
      prevNextLegStateRef.current = null;
      setCurrentInput('');
      setFinishData(null);
      setEditingMove(null);
      setErrorMsg('');
      return;
    }
    if (gameStateRef.current.winner && gameStateRef.current.history.length > 0) {
      handleUndoClick();
    }
  };

  const showOnlineLegAckModal =
    Boolean(
      onlineGameId &&
        settings.gameType === 'x01' &&
        !onlineMatchTransition &&
        onlineLegTransition &&
        gameState.winner &&
        myOnlineRole === onlineLegTransition.awaitingAckFrom
    );
  const showOnlineLegWaitOpponent =
    Boolean(
      onlineGameId &&
        settings.gameType === 'x01' &&
        !onlineMatchTransition &&
        onlineLegTransition &&
        gameState.winner &&
        myOnlineRole === gameState.winner
    );
  const showOnlineMatchLoserAck =
    Boolean(
      onlineGameId &&
        settings.gameType === 'x01' &&
        !postMatchStatsActive &&
        onlineMatchTransition &&
        myOnlineRole === onlineMatchTransition.awaitingAckFrom
    );
  const showOnlineMatchWinnerWait =
    Boolean(
      onlineGameId &&
        settings.gameType === 'x01' &&
        onlineMatchTransition &&
        myOnlineRole === onlineMatchTransition.winner
    );

  const btnGameBase = "text-white font-bold py-2 rounded text-[10px] sm:text-xs transition-all select-none touch-manipulation active:scale-95";
  const numBtnBase = "h-full w-full bg-slate-800 text-2xl sm:text-3xl landscape:text-3xl leading-none font-bold rounded-xl border border-slate-700/50 hover:bg-slate-700 active:bg-slate-600 select-none touch-manipulation flex items-center justify-center";
  const isSuccessMsg = errorMsg && ['!', 'Přihlášeno', 'Uloženo', 'Zálohováno', 'Recognized'].some(w => String(errorMsg).includes(w));

  const renderUnifiedHistory = () => {
    const rounds = []; let cR = {}; [...gameState.history].reverse().forEach(move => { const rN = Math.ceil(move.turn / 2); if (!cR[rN]) { const n = { id: rN, p1: null, p2: null }; cR[rN] = n; rounds.push(n); } if (move.player === 'p1') cR[rN].p1 = move; else cR[rN].p2 = move; });
    const renderMove = (move) => {
        if (!move) return <div className="h-8 md:h-12"></div>;
        const isCheckout = move.remaining === 0 && !move.isBust;
        let cls = 'text-slate-200';
        if (isCheckout) cls = 'text-yellow-400';
        else if (move.score >= 100) cls = move.player === 'p1' ? 'text-emerald-400' : 'text-purple-400';

        return (
          <div className={`flex items-center w-full ${move.player === 'p1' ? 'justify-between pr-2 md:pr-4' : 'justify-between pl-2 md:pl-4'}`}>
            {move.player === 'p1' && (
              <div className="text-[10px] md:text-sm lg:text-base font-mono text-slate-500 font-bold w-8 md:w-12 text-left">
                {move.remaining}
              </div>
            )}

            <div
              onClick={() => setEditingMove(move)}
              className={`cursor-pointer hover:bg-slate-800/50 rounded px-1 md:px-3 flex items-center gap-1 md:gap-2 ${move.player === 'p1' ? 'text-right' : 'text-left'} ${move.isBust ? 'opacity-50' : ''}`}
            >
              <div className={`${isCheckout ? 'text-2xl md:text-3xl lg:text-4xl' : 'text-xl md:text-2xl lg:text-3xl'} font-bold font-mono ${cls} flex items-baseline gap-1 md:gap-2`}>
                {move.isBust ? (
                  <span className="inline-flex items-center justify-center w-full">
                    <Ban className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
                  </span>
                ) : (
                  <span>{move.score}</span>
                )}
                {isCheckout && (
                  <span className="text-xs italic text-yellow-400 md:text-sm">({move.dartsUsed}.{translations[lang]?.confirmDarts || 'šipka'})</span>
                )}
              </div>
            </div>

            {move.player === 'p2' && (
              <div className="text-[10px] md:text-sm lg:text-base font-mono text-slate-500 font-bold w-8 md:w-12 text-right">
                {move.remaining}
              </div>
            )}
          </div>
        );
    };
    return (<div ref={historyRef} className="border rounded-lg history-container bg-slate-900/50 border-slate-800">{rounds.map(r => <div key={r.id} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center border-b border-slate-800/60 py-2 md:py-3 last:border-0">{renderMove(r.p1)}<div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-800 border border-slate-700 shadow-sm text-[10px] md:text-xs font-bold text-slate-500">{r.id}</div>{renderMove(r.p2)}</div>)}{rounds.length === 0 && <div className="py-10 text-xs text-center text-slate-600 md:text-sm">- Zatím bez hodů -</div>}</div>);
  };

  const activeScore = gameState.currentPlayer === 'p1' ? gameState.p1Score : gameState.p2Score;
  const activeMinDarts = getMinDartsToCheckout(activeScore, settings.outMode);
  const isInputEmpty = currentInput === '';
  const isOnCheckout = activeScore > 0 && activeScore <= 170 && activeMinDarts !== Infinity;
  const showMissBust = isOnCheckout && isInputEmpty && !gameState.winner;

  // Pro "BUST" potřebujeme hodnotu, která jistě přestřelí zbývající skóre.
  // V rámci X01 tu navíc vyhýbáme hodnotám z IMPOSSIBLE_SCORES (ačkoliv je to interní filtr).
  const bustPoints = (() => {
    let pts = activeScore + 1;
    while (pts <= 180 && IMPOSSIBLE_SCORES.includes(pts)) pts += 1;
    return pts <= 180 ? pts : Math.min(180, activeScore + 1);
  })();

  const onlineInputLocked = isOnlineInputLocked();

  const onlineOpponentVideoBackdrop =
    Boolean(onlineGameId) &&
    settings.gameType === 'x01' &&
    Boolean(myOnlineRole) &&
    !postMatchStatsActive &&
    gameState.currentPlayer !== myOnlineRole &&
    !gameState.winner &&
    !gameState.matchWinner;

  const onlineVideoMatchDone = onlineFirestoreSessionCompleted;

  const mainLayoutClass = postMatchStatsActive
    ? 'relative flex flex-1 min-h-0 flex-col gap-2 overflow-hidden p-1 sm:p-2'
    : `relative flex-1 min-h-0 overflow-hidden p-1 sm:p-2 grid gap-1 sm:gap-2 ${
        isLandscape ? 'grid-cols-[1fr_1.5fr_1fr]' : 'flex flex-col'
      }`;

  return (
    <>
      <main className={mainLayoutClass}>
        {onlineGameId && settings.gameType === 'x01' && myOnlineRole && (
          <div className={`shrink-0 ${!postMatchStatsActive && isLandscape ? 'col-span-3' : ''}`}>
            <OnlineVideoContainer
              onlineGameId={onlineGameId}
              myRole={myOnlineRole}
              currentPlayer={gameState.currentPlayer}
              lang={lang}
              localStream={onlineLocalStream}
              overlay={{
                p1Score: gameState.p1Score,
                p2Score: gameState.p2Score,
                p1Legs: gameState.p1Legs,
                p2Legs: gameState.p2Legs,
                p1Sets: gameState.p1Sets || 0,
                p2Sets: gameState.p2Sets || 0,
                matchSets: settings.matchSets || 1,
              }}
              matchCompleted={onlineVideoMatchDone}
              isPostMatch={postMatchStatsActive}
            />
          </div>
        )}
        {postMatchStatsActive && pendingOnlineMatchRecord && (
          <PostMatchView
            lang={lang}
            record={pendingOnlineMatchRecord}
            startScore={settings.startScore}
            onLeaveSession={handleOnlineMatchComplete}
            p1Name={getDisplayName(settings.p1Name, true, false)}
            p2Name={getDisplayName(settings.p2Name, false, settings.isBot)}
          />
        )}
        {!postMatchStatsActive && highScoreAnimation !== null && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50"
            aria-hidden
          >
            <span
              className="block text-6xl md:text-8xl font-black font-mono animate-high-score-pop"
              style={{ color: highScoreAnimation.color, textShadow: `0 0 20px ${highScoreAnimation.color}99` }}
            >
              {highScoreAnimation.score}!
            </span>
          </div>
        )}
        {!postMatchStatsActive && (
          <div
            className={`relative z-0 min-h-0 w-full flex-1 ${
              isLandscape
                ? 'col-span-3 grid h-full min-h-0 grid-cols-[1fr_1.5fr_1fr] grid-rows-[auto_minmax(0,1fr)] gap-1 sm:gap-2'
                : 'flex flex-col gap-1 sm:gap-2'
            }`}
          >
        <div
          className={`relative z-30 flex w-full items-center justify-center rounded-lg border border-slate-800 py-1 px-2 ${isLandscape ? 'col-span-3 row-start-1' : ''} ${
            onlineOpponentVideoBackdrop ? 'bg-slate-950/80 backdrop-blur-sm' : 'bg-slate-900/70'
          }`}
        >
            {(settings.matchSets || 1) === 1 ? (
                <div className="text-sm sm:text-base font-black text-yellow-400 tracking-wider">LEGS {gameState.p1Legs} - {gameState.p2Legs}</div>
            ) : (
                <div className="text-xs sm:text-sm font-black text-slate-200 tracking-wider text-center">
                    <span className="text-emerald-400">SETS {gameState.p1Sets || 0} - {gameState.p2Sets || 0}</span>
                    <span className="mx-2 text-slate-600">|</span>
                    <span className="text-yellow-400">LEGS {gameState.p1Legs} - {gameState.p2Legs}</span>
                </div>
            )}
        </div>
        
        {/* Score Cards */}
        <div
          className={`relative z-30 flex w-full flex-col gap-1 sm:gap-2 ${isLandscape ? 'col-start-1 row-start-2 h-full min-h-0' : 'h-auto shrink-0'}`}
        >
            <div className={`flex ${isLandscape ? 'flex-col min-h-0' : 'flex-row w-full'} flex-1 gap-1.5 h-full`}>
                {['p1', 'p2'].map(pKey => {
                    const act = gameState.currentPlayer === pKey && !gameState.winner; 
                    const isP1 = pKey === 'p1';
                    const isBot = !isP1 && settings.isBot;
                    const displayName = getDisplayName(isP1 ? settings.p1Name : settings.p2Name, isP1, isBot);

                    return (
                        <div
                          key={pKey}
                          className={`flex-1 relative p-2 sm:p-4 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
                            act
                              ? `${onlineOpponentVideoBackdrop ? 'bg-slate-900/95 backdrop-blur-sm' : 'bg-slate-800'} ${
                                  isP1 ? 'border-emerald-500' : 'border-purple-500'
                                } shadow-xl`
                              : `border-slate-800 opacity-90 ${
                                  onlineOpponentVideoBackdrop ? 'bg-slate-950/85 backdrop-blur-sm' : 'bg-slate-900'
                                }`
                          }`}
                          onClick={() => handleScoreClick(pKey)}
                        >
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
                            <div className="w-2 shrink-0" />
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
        <div
          className={`relative z-30 flex h-full min-h-0 flex-1 flex-col justify-center gap-1 ${isLandscape ? 'col-start-2 row-start-2' : ''}`}
        >
            {!gameState.winner ? (
                <div
                  className={`relative flex flex-col gap-1 shrink-0 transition-opacity w-full h-full justify-center ${
                    settings.isBot && gameState.currentPlayer === 'p2' ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                    {onlineInputLocked && (
                      <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-slate-950/85 px-2">
                        <p className="text-center text-xs sm:text-sm font-black uppercase tracking-widest text-amber-300">
                          {t('onlineOpponentThrowing')}
                        </p>
                      </div>
                    )}
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
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-6 gap-1 shrink-0">
                        {quickButtons.map((val, i) => <button key={i} onPointerDown={() => handleQuickBtnDown(i)} onPointerUp={() => handleQuickBtnUp(val)} onPointerLeave={() => { if(longPressTimer.current) { clearTimeout(longPressTimer.current); setLongPressIdx(null); } }} className={`bg-slate-800 text-slate-300 text-xs sm:text-sm font-bold min-h-[2.5rem] sm:min-h-[3rem] rounded-lg sm:rounded-xl border border-slate-700/50 shadow-md transition-all select-none touch-manipulation ${longPressIdx === i ? 'bg-emerald-900 border-emerald-400 shaking' : ''}`}>{val}</button>)}
                    </div>
                    
                    <div className="flex-1 min-h-0 h-full grid grid-cols-4 grid-rows-3 gap-2 landscape:gap-2">
                      {[7, 8, 9].map(n => (
                        <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>
                          {n}
                        </button>
                      ))}

                      {/* 1. řádek, 4. sloupec: MISS (0) nebo smazání */}
                      <button
                        onClick={() => {
                          if (showMissBust) handleTurnCommit(0);
                          else setCurrentInput(prev => prev.slice(0, -1));
                        }}
                        className={`${numBtnBase} ${showMissBust ? 'text-red-400 active:bg-red-900/20' : 'text-red-400 active:bg-red-900/20'}`}
                        disabled={!showMissBust && currentInput.length === 0}
                      >
                        {showMissBust ? (
                          <span className="text-[12px] sm:text-[13px] font-black tracking-widest">MISS</span>
                        ) : (
                          <Delete className="w-6 h-6 sm:w-7 sm:h-7" />
                        )}
                      </button>

                      {[4, 5, 6].map(n => (
                        <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>
                          {n}
                        </button>
                      ))}
                      <button onClick={() => setCurrentInput(prev => prev.length < 3 ? prev + '0' : prev)} className={numBtnBase}>0</button>

                      {[1, 2, 3].map(n => (
                        <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>
                          {n}
                        </button>
                      ))}

                      {/* 3. řádek, 4. sloupec: BUST nebo ENTER */}
                      {(() => {
                        const isEnterEnabled = !showMissBust && Boolean(currentInput);
                        const enterBaseClass = showMissBust
                          ? 'text-slate-500 active:bg-slate-800/60 bg-slate-800'
                          : isEnterEnabled
                            ? '!bg-emerald-600 !text-white !hover:bg-emerald-500'
                            : '!bg-slate-800 !text-slate-500 !opacity-60 !cursor-not-allowed';

                        return (
                      <button
                        onClick={() => {
                          if (showMissBust) handleTurnCommit(bustPoints);
                          else if (currentInput) handleTurnCommit(parseInt(currentInput));
                        }}
                        disabled={!showMissBust && !currentInput}
                        className={`${numBtnBase} ${enterBaseClass}`}
                      >
                        {showMissBust ? (
                          <span className="text-[12px] sm:text-[13px] font-black tracking-widest">BUST</span>
                        ) : (
                          <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 landscape:w-8 landscape:h-8" />
                        )}
                      </button>
                        );
                      })()}
                    </div>
                </div>
            ) : (
                <div className={`relative w-full h-full flex flex-col items-center justify-center ${gameState.winner === 'p1' ? 'bg-emerald-900/40 border-emerald-500/50' : 'bg-purple-900/40 border-purple-500/50'} border-2 p-4 rounded-xl text-center animate-in zoom-in duration-300 shadow-2xl shadow-black/50`}>
                {!onlineMatchTransition && (
                <button
                    type="button"
                    title={String(translations[lang]?.cmdUndo?.[0] || '')}
                    onClick={handleBackFromLeg}
                    className="absolute top-3 left-3 p-2 transition-colors border rounded-lg shadow-lg bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                )}
                    <Trophy className={`w-10 h-10 sm:w-12 sm:h-12 mb-2 ${gameState.winner === 'p1' ? 'text-emerald-400' : 'text-purple-400'}`} />
                    <h3 className={`text-lg sm:text-2xl font-black uppercase tracking-widest ${gameState.winner === 'p1' ? 'text-emerald-400' : 'text-purple-400'} mb-2`}>
                        {translations[lang]?.legFor || 'Leg vyhrává'} {getDisplayName(gameState.winner === 'p1' ? settings.p1Name : settings.p2Name, gameState.winner === 'p1', gameState.winner === 'p2' && settings.isBot)}
                    </h3>
                    {showOnlineMatchWinnerWait && onlineMatchTransition?.finalScore && (
                      <p className="mb-3 max-w-sm text-xs sm:text-sm font-bold leading-relaxed text-amber-200/95">
                        {t('onlineMatchWaitLoserAck')}
                      </p>
                    )}
                    {showOnlineLegWaitOpponent && (
                      <p className="mb-3 max-w-sm text-xs sm:text-sm font-bold leading-relaxed text-amber-200/95">
                        {t('onlineLegWaitLoserAck')}
                      </p>
                    )}
                    {showOnlineLegWaitOpponent && onlineLegTransition?.currentScore && (
                      <p className="mb-2 max-w-sm text-center text-[11px] font-bold text-slate-300 sm:text-xs">
                        {fillI18nTemplate(t('onlineMatchScore'), {
                          p1Score: onlineLegTransition.currentScore.p1,
                          p2Score: onlineLegTransition.currentScore.p2,
                        })}
                      </p>
                    )}
                    {showOnlineMatchWinnerWait && onlineMatchTransition?.finalScore && (
                      <p className="mb-2 max-w-sm text-center text-[11px] font-bold text-slate-300 sm:text-xs">
                        {fillI18nTemplate(t('onlineMatchScore'), {
                          p1Score: onlineMatchTransition.finalScore.p1,
                          p2Score: onlineMatchTransition.finalScore.p2,
                        })}
                      </p>
                    )}
                    {!showOnlineLegWaitOpponent &&
                      !showOnlineLegAckModal &&
                      !showOnlineMatchWinnerWait &&
                      !showOnlineMatchLoserAck && (
                    <button onClick={handleNextLeg} className={`w-full max-w-[250px] ${gameState.winner === 'p1' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'} text-white py-3 sm:py-4 rounded-xl font-black text-base sm:text-lg mt-2 sm:mt-4 shadow-lg active:scale-95 transition-all`}>
                        {translations[lang]?.nextLeg || 'Další leg'}
                    </button>
                    )}
                </div>
            )}
        </div>

        {/* Pravá část Historie */}
        <div
          className={`relative z-30 flex flex-col overflow-hidden rounded-xl border border-slate-800 ${isLandscape ? 'col-start-3 row-start-2 h-full min-h-0' : 'shrink-0 h-[22vh] sm:h-48'} ${
            onlineOpponentVideoBackdrop ? 'bg-slate-950/80 backdrop-blur-sm' : 'bg-slate-900/40'
          }`}
        >
            <div className="bg-slate-800/80 p-1.5 border-b border-slate-700 text-[9px] font-black uppercase text-center text-slate-500 tracking-widest hidden landscape:block">Historie náhozů</div>
            <div className="flex-1 overflow-hidden">
                {renderUnifiedHistory()}
            </div>
        </div>
            {Boolean(onlineGameId) &&
              settings.gameType === 'x01' &&
              myOnlineRole &&
              isOpponentOffline && (
                <div
                  className="absolute inset-0 z-[35] flex cursor-default items-center justify-center rounded-lg bg-slate-950/70 px-3 py-4 backdrop-blur-sm"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-center text-xs font-black uppercase tracking-widest text-amber-200 sm:text-sm">
                    {t('onlineOpponentOffline')}
                  </p>
                </div>
              )}
          </div>
        )}
      </main>

      {showOnlineLegAckModal && onlineLegTransition && (
        <div
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="online-leg-ack-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <h3
              id="online-leg-ack-title"
              className="text-center text-sm font-black uppercase tracking-widest text-amber-300 sm:text-base"
            >
              {t('onlineLegLoserAckTitle')}
            </h3>
            <p className="mt-4 text-center text-sm font-bold leading-relaxed text-slate-200 sm:text-base">
              {fillI18nTemplate(t('onlineLegLoserAckBody'), {
                checkout: onlineLegTransition.checkoutScore,
                dartsVisit: onlineLegTransition.checkoutDarts,
                dartsLeg: onlineLegTransition.winnerLegDarts,
              })}
            </p>
            {onlineLegTransition.currentScore && (
              <p className="mt-3 text-center text-xs font-bold text-slate-300 sm:text-sm">
                {fillI18nTemplate(t('onlineMatchScore'), {
                  p1Score: onlineLegTransition.currentScore.p1,
                  p2Score: onlineLegTransition.currentScore.p2,
                })}
              </p>
            )}
            <button
              type="button"
              onClick={() => acknowledgeOnlineLegEnd()}
              className="mt-6 w-full rounded-xl border border-amber-600/60 bg-amber-600 py-3 text-center text-base font-black uppercase tracking-widest text-slate-950 shadow-lg transition-colors hover:bg-amber-500 active:scale-[0.99]"
            >
              {t('onlineLegLoserAckOk')}
            </button>
          </div>
        </div>
      )}
      {showOnlineMatchLoserAck && onlineMatchTransition?.finalScore && (
        <div
          className="fixed inset-0 z-[125] flex flex-col items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="online-match-ack-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <h3
              id="online-match-ack-title"
              className="text-center text-sm font-black uppercase tracking-widest text-rose-300 sm:text-base"
            >
              {t('onlineMatchLoserAckTitle')}
            </h3>
            <p className="mt-4 text-center text-sm font-bold leading-relaxed text-slate-200 sm:text-base">
              {fillI18nTemplate(t('onlineMatchLoserOpponentWon'), {
                p1Score: onlineMatchTransition.finalScore.p1,
                p2Score: onlineMatchTransition.finalScore.p2,
              })}
            </p>
            <p className="mt-2 text-center text-xs font-semibold text-slate-400 sm:text-sm">
              {fillI18nTemplate(t('onlineMatchLoserAckBody'), {
                p1Score: onlineMatchTransition.finalScore.p1,
                p2Score: onlineMatchTransition.finalScore.p2,
              })}
            </p>
            <button
              type="button"
              onClick={() => void beginOnlinePostMatchStats()}
              className="mt-6 w-full rounded-xl border border-rose-600/60 bg-rose-600 py-3 text-center text-base font-black uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-rose-500 active:scale-[0.99]"
            >
              {t('onlineMatchEndButton')}
            </button>
          </div>
        </div>
      )}
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