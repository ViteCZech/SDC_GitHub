import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import { translations } from '../translations';

const CHECKIN_SECONDS = 180;

function formatMmSs(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * UI tabletu u terči: auto-zápas, tabulka / rozpis, check-in s časovačem.
 * Všechny hooky musí být před jakýmkoli podmíněným returnem (jeden return na konci).
 */
export default function TabletWaitingRoom({
  lang = 'cs',
  hasGroupSchedule = false,
  groupStandings = null,
  boardSchedule = [],
  assignedMatch = null,
  activeMatch = null,
  onStartGame,
  onCheckInComplete,
  onTabletTimeoutWarning,
  onBack,
  showDemoAssignButton = true,
}) {
  const tt = (k) => translations[lang]?.tablet?.[k] ?? k;
  const match = activeMatch ?? assignedMatch;

  const [phase, setPhase] = useState(1);
  const [idleTab, setIdleTab] = useState('standings');
  const [presentP1, setPresentP1] = useState(false);
  const [presentP2, setPresentP2] = useState(false);
  const [presentRef, setPresentRef] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CHECKIN_SECONDS);
  const [timerExpired, setTimerExpired] = useState(false);
  const timeoutSentRef = useRef(false);

  const allPresent = presentP1 && presentP2 && presentRef;
  const matchKey = match ? String(match.matchId ?? match.id ?? '') : '';

  const matchP1 = !match
    ? ''
    : String(match.player1Name || '').trim() ||
      String(match.p1Name || '').trim() ||
      String(match.player1Id ?? '').trim() ||
      '?';
  const matchP2 = !match
    ? ''
    : String(match.player2Name || '').trim() ||
      String(match.p2Name || '').trim() ||
      String(match.player2Id ?? '').trim() ||
      '?';

  const tFlat = (k) => translations[lang]?.[k] ?? k;

  const showStandingsPanel =
    hasGroupSchedule && Array.isArray(groupStandings) && groupStandings.length > 0;
  const showSchedulePanel = Array.isArray(boardSchedule) && boardSchedule.length > 0;
  const dualIdlePanel = showStandingsPanel && showSchedulePanel;

  const resetCheckIn = useCallback(() => {
    setPresentP1(false);
    setPresentP2(false);
    setPresentRef(false);
  }, []);

  useEffect(() => {
    if (!showStandingsPanel && showSchedulePanel) setIdleTab('schedule');
    if (showStandingsPanel && !showSchedulePanel) setIdleTab('standings');
  }, [showStandingsPanel, showSchedulePanel]);

  useEffect(() => {
    if (!match && phase > 1) {
      setPhase(1);
      resetCheckIn();
      setTimerExpired(false);
      timeoutSentRef.current = false;
    }
  }, [match, phase, resetCheckIn]);

  useEffect(() => {
    if (phase !== 2 || !matchKey) return;
    setSecondsLeft(CHECKIN_SECONDS);
    setTimerExpired(false);
    timeoutSentRef.current = false;
  }, [phase, matchKey]);

  useEffect(() => {
    if (phase !== 2 || !match) return undefined;
    const id = setInterval(() => {
      if (presentP1 && presentP2 && presentRef) return;
      setSecondsLeft((s) => (s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, match, presentP1, presentP2, presentRef]);

  useEffect(() => {
    if (phase !== 2 || !match) return;
    if (secondsLeft > 0) return;
    if (presentP1 && presentP2 && presentRef) return;
    if (timeoutSentRef.current) return;
    timeoutSentRef.current = true;
    setTimerExpired(true);
    const mid = match.matchId ?? match.id;
    const mt = match.matchType === 'bracket' ? 'bracket' : 'group';
    if (typeof onTabletTimeoutWarning === 'function' && mid) {
      onTabletTimeoutWarning(mt, mid);
    }
  }, [
    secondsLeft,
    phase,
    match,
    presentP1,
    presentP2,
    presentRef,
    onTabletTimeoutWarning,
  ]);

  const handleWhoStarts = (startingPlayerId) => {
    const mid = match?.matchId ?? match?.id;
    if (!mid || !onStartGame) return;
    onStartGame(mid, startingPlayerId);
  };

  const enterCheckIn = () => {
    if (!match) return;
    resetCheckIn();
    setTimerExpired(false);
    timeoutSentRef.current = false;
    setSecondsLeft(CHECKIN_SECONDS);
    setPhase(2);
  };

  const timerClass = timerExpired
    ? 'text-red-500'
    : secondsLeft <= 30
      ? 'text-amber-400'
      : 'text-emerald-400';

  const standingsTableClass =
    'w-full text-sm lg:text-base border-collapse [&_td]:py-2.5 lg:[&_td]:py-3 [&_td]:px-3 lg:[&_td]:px-4';

  const panelShellClass =
    'rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden w-full min-w-0';

  const renderStandingsPanel = () => (
    <div
      className={`${panelShellClass} flex flex-col w-full min-w-0 shrink-0 lg:h-auto lg:max-h-none max-lg:flex-1 max-lg:min-h-0 max-lg:h-full max-lg:max-h-full`}
    >
      <h3 className="text-xs lg:text-sm font-black uppercase tracking-widest text-slate-500 px-4 py-2.5 border-b border-slate-800 shrink-0">
        {translations[lang]?.tournTabStandings ?? 'Tabulka'}
      </h3>
      <div className="w-full overflow-x-auto max-lg:flex-1 max-lg:min-h-0 max-lg:overflow-y-auto lg:overflow-y-visible">
        <table className={`${standingsTableClass} text-left`}>
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-tight">
              <th className="text-center py-1.5 w-9 sm:w-10 px-0.5 text-xs sm:text-sm font-bold tabular-nums normal-case">
                {tFlat('tournStandingPos')}
              </th>
              <th className="text-left py-1.5 pr-1 min-w-0">{tFlat('playerName')}</th>
              <th className="text-center py-1.5 w-8 sm:w-9 px-0.5">{tFlat('tournStandingPoints')}</th>
              <th className="text-center py-1.5 w-[3.25rem] sm:w-[4rem] px-0.5 whitespace-pre-line leading-tight">
                {tFlat('tournStandingMatchesShort')}
              </th>
              <th className="text-center py-1.5 w-[3.25rem] sm:w-[4rem] px-0.5 whitespace-pre-line leading-tight">
                {tFlat('tournStandingLegsShort')}
              </th>
              <th
                className="text-center py-1.5 w-9 sm:w-10 px-0.5 align-middle"
                title={tFlat('tournStandingDiff')}
              >
                <span className="sr-only">{tFlat('tournStandingDiff')}</span>
                <span className="inline-flex flex-col items-center justify-center gap-0" aria-hidden="true">
                  <Plus className="w-3.5 h-3.5 mx-auto stroke-[2.5]" />
                  <Minus className="w-3.5 h-3.5 mx-auto -mt-0.5 stroke-[2.5]" />
                </span>
              </th>
              <th
                className="text-center py-1.5 w-11 sm:w-12 px-0.5 align-middle font-serif normal-case font-semibold text-[11px] sm:text-xs"
                title={tFlat('tournStandingAvg')}
              >
                <span className="sr-only">{tFlat('tournStandingAvg')}</span>
                <span aria-hidden="true">x̄</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {groupStandings.map((row, idx) => (
              <tr key={row.id ?? idx} className="border-b border-slate-800 last:border-0">
                <td className="text-center text-slate-200 text-xs sm:text-sm font-bold tabular-nums px-0.5 py-1.5">
                  {idx + 1}
                </td>
                <td className="text-slate-200 font-medium break-words max-w-[min(100%,14rem)] sm:max-w-xs lg:max-w-none min-w-0 py-1.5 px-1">
                  {row.name}
                </td>
                <td className="text-center text-slate-200 font-mono text-xs font-bold">
                  {row.points ?? row.matchesWon ?? '—'}
                </td>
                <td className="text-center text-slate-300 font-mono text-xs">
                  {row.matchesWon ?? 0}:{row.matchesLost ?? 0}
                </td>
                <td className="text-center text-slate-400 font-mono text-xs">
                  {row.legsWon ?? 0}:{row.legsLost ?? 0}
                </td>
                <td className="text-center text-slate-300 font-mono text-xs">
                  {(row.legDifference ?? 0) > 0 ? '+' : ''}
                  {row.legDifference ?? 0}
                </td>
                <td className="text-center text-slate-300 font-mono text-xs">
                  {Number(row.average ?? 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSchedulePanel = () => (
    <div
      className={`${panelShellClass} flex flex-col flex-1 min-h-0 h-full max-h-full overflow-hidden w-full min-w-0`}
    >
      <h3 className="text-xs lg:text-sm font-black uppercase tracking-widest text-slate-500 px-4 py-2.5 border-b border-slate-800 bg-slate-900/95 z-10 shrink-0">
        {tt('matchSchedule')}
      </h3>
      <ul className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain divide-y divide-slate-800 text-sm lg:text-base w-full">
        {boardSchedule.map((row) => {
          const activeId = match ? String(match.matchId ?? match.id) : '';
          const rowId = String(row.match?.matchId ?? row.match?.id ?? '');
          const isNext = activeId && rowId === activeId;
          return (
            <li
              key={row.key}
              className={`px-4 py-3 lg:py-4 ${isNext ? 'bg-emerald-950/40 border-l-2 border-l-emerald-500' : ''}`}
            >
              <div className="font-bold text-slate-100 break-words">
                {row.player1Name} <span className="text-slate-500 font-normal">vs</span> {row.player2Name}
              </div>
              <div className="text-xs lg:text-sm text-slate-500 mt-1 break-words flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {tt('referee')}: {row.refereeName}
                </span>
                <span className="text-slate-600">·</span>
                {row.status === 'completed' && row.scoreDisplay ? (
                  <span className="font-mono font-bold text-emerald-400">{row.scoreDisplay}</span>
                ) : (
                  <span>{row.status}</span>
                )}
                {row.tabletStatus ? (
                  <span className="text-amber-500/90 text-[11px]">({row.tabletStatus})</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const checkInSlotBtn = (active, onActivate, label, name) => (
    <button
      type="button"
      disabled={active}
      onClick={onActivate}
      className={`flex-1 min-h-[4.5rem] md:min-h-0 flex flex-col items-center justify-center rounded-2xl border-2 px-2 py-3 md:py-4 text-center transition-all touch-manipulation active:scale-[0.99] ${
        active
          ? 'border-emerald-500/70 bg-emerald-950/50 text-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.15)]'
          : 'border-slate-600 bg-slate-800/90 text-white hover:border-emerald-500/50 hover:bg-slate-800'
      } ${active ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
        {label}
      </span>
      <span className="text-sm md:text-lg lg:text-xl font-bold break-words line-clamp-4 leading-tight px-1">
        {name}
      </span>
      {active ? (
        <span className="mt-2 text-[11px] md:text-xs font-black uppercase tracking-wider text-emerald-400">
          {tt('present')}
        </span>
      ) : (
        <span className="mt-2 text-[10px] text-slate-500 font-semibold">{tt('tapToCheckIn')}</span>
      )}
    </button>
  );

  return phase === 2 && match ? (
        <main className="flex flex-1 flex-col min-h-0 h-full max-h-[calc(100dvh-2.5rem-3.5rem)] w-full max-w-6xl mx-auto overflow-hidden bg-slate-950 px-3 pt-1 pb-2 md:px-6 md:pb-3">
          <h1 className="shrink-0 text-center text-sm md:text-xl font-black uppercase tracking-wide text-white py-1">
            {tt('matchCheckIn')}
          </h1>

          <div
            className={`shrink-0 rounded-xl border-2 px-2 py-1.5 md:py-2 text-center max-w-md mx-auto w-full ${
              timerExpired ? 'border-red-600/60 bg-red-950/25' : 'border-slate-700 bg-slate-900/80'
            }`}
          >
            <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-500 mb-0.5">
              {tt('timeRemaining')}
            </p>
            <p className={`text-3xl md:text-5xl font-black tabular-nums leading-none ${timerClass}`}>
              {formatMmSs(secondsLeft)}
            </p>
            {timerExpired && (
              <p className="mt-0.5 text-xs font-bold text-red-400 leading-snug px-1">
                {tt('timeExpired')}
              </p>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row md:gap-2 gap-1.5 py-1 md:py-2">
            {checkInSlotBtn(presentP1, () => setPresentP1(true), tt('player1'), matchP1)}
            {checkInSlotBtn(presentP2, () => setPresentP2(true), tt('player2'), matchP2)}
            {checkInSlotBtn(presentRef, () => setPresentRef(true), tt('referee'), match.refereeName)}
          </div>

          <div className="shrink-0 flex flex-col gap-1.5 pt-1 border-t border-slate-800/80 bg-slate-950">
            <button
              type="button"
              disabled={!allPresent}
              onClick={async () => {
                if (allPresent && typeof onCheckInComplete === 'function') {
                  try {
                    await onCheckInComplete();
                  } catch (e) {
                    console.warn('onCheckInComplete:', e);
                  }
                }
                if (allPresent) setPhase(3);
              }}
              className={`w-full max-w-xl mx-auto py-2.5 md:py-3.5 rounded-xl font-black text-sm md:text-base uppercase tracking-wider ${
                allPresent
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              {tt('continue')}
            </button>

            <button
              type="button"
              onClick={() => {
                resetCheckIn();
                setPhase(1);
                setTimerExpired(false);
                timeoutSentRef.current = false;
              }}
              className="w-full max-w-xl mx-auto py-2 rounded-xl font-bold text-sm text-slate-400 bg-slate-800/50 border border-slate-700"
            >
              {translations[lang]?.tournBack ?? 'Zpět'}
            </button>
          </div>
        </main>
      ) : phase === 3 && match ? (
        <main className="flex flex-1 flex-col min-h-0 h-full max-h-[calc(100dvh-2.5rem-3.5rem)] w-full max-w-5xl mx-auto overflow-hidden bg-slate-950 px-3 pt-1 pb-2 md:px-4 md:pb-3">
          <h2 className="shrink-0 text-base md:text-xl font-black text-center text-white py-1">
            {tt('whoStarts')}
          </h2>
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 items-stretch">
            <button
              type="button"
              onClick={() => handleWhoStarts(match.player1Id)}
              className="min-h-0 rounded-2xl font-black text-sm md:text-lg uppercase tracking-wide bg-slate-800 border-2 border-emerald-500/40 text-emerald-300 hover:bg-slate-700 break-words px-3 py-3 flex items-center justify-center text-center leading-tight"
            >
              {matchP1}
            </button>
            <button
              type="button"
              onClick={() => handleWhoStarts(match.player2Id)}
              className="min-h-0 rounded-2xl font-black text-sm md:text-lg uppercase tracking-wide bg-slate-800 border-2 border-emerald-500/40 text-emerald-300 hover:bg-slate-700 break-words px-3 py-3 flex items-center justify-center text-center leading-tight"
            >
              {matchP2}
            </button>
          </div>
          <div className="shrink-0 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                resetCheckIn();
                setPhase(2);
                setTimerExpired(false);
                timeoutSentRef.current = false;
                setSecondsLeft(CHECKIN_SECONDS);
              }}
              className="w-full max-w-xl mx-auto py-2 rounded-xl font-bold text-sm text-slate-400 bg-slate-800/50 border border-slate-700"
            >
              {translations[lang]?.tournBack ?? 'Zpět'}
            </button>
          </div>
        </main>
      ) : (
        <main className="flex flex-col flex-1 min-h-0 h-full max-h-[calc(100dvh-2.5rem-3.5rem)] w-full max-w-2xl lg:max-w-7xl mx-auto overflow-hidden bg-slate-950 px-3 lg:px-6 pt-2 pb-3">
          <div className="flex flex-col flex-1 min-h-0 gap-2 lg:gap-4">
            {dualIdlePanel && (
              <div className="lg:hidden shrink-0 flex rounded-xl border border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIdleTab('standings')}
                  className={`flex-1 py-2.5 text-xs sm:text-sm font-black uppercase tracking-wider transition-colors ${
                    idleTab === 'standings'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {translations[lang]?.tournTabStandings ?? 'Tabulka'}
                </button>
                <button
                  type="button"
                  onClick={() => setIdleTab('schedule')}
                  className={`flex-1 py-2.5 text-xs sm:text-sm font-black uppercase tracking-wider transition-colors ${
                    idleTab === 'schedule'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {tt('matchSchedule')}
                </button>
              </div>
            )}

            {dualIdlePanel && (
              <div className="hidden lg:flex lg:flex-row lg:flex-1 lg:min-h-0 lg:gap-8 w-full lg:overflow-hidden lg:items-start">
                <div className="shrink-0 min-w-0 w-full lg:w-auto lg:max-w-[min(50%,40rem)] flex flex-col">
                  {renderStandingsPanel()}
                </div>
                <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden lg:self-stretch lg:max-h-[min(calc(100dvh-11rem),85vh)]">
                  {renderSchedulePanel()}
                </div>
              </div>
            )}

            {dualIdlePanel && (
              <div className="lg:hidden flex-1 min-h-0 flex flex-col overflow-hidden">
                {idleTab === 'standings' && (
                  <div className="flex-1 min-h-0 flex flex-col">{renderStandingsPanel()}</div>
                )}
                {idleTab === 'schedule' && (
                  <div className="flex-1 min-h-0 flex flex-col">{renderSchedulePanel()}</div>
                )}
              </div>
            )}

            {!dualIdlePanel && showStandingsPanel && (
              <div className="flex-1 min-h-0 flex flex-col">{renderStandingsPanel()}</div>
            )}

            {!dualIdlePanel && showSchedulePanel && !showStandingsPanel && (
              <div className="flex-1 min-h-0 flex flex-col">{renderSchedulePanel()}</div>
            )}
          </div>

          <div className="shrink-0 space-y-2 pt-2 border-t border-slate-800/60 mt-auto">
          {match && (
            <button
              type="button"
              onClick={enterCheckIn}
              className="mt-2 w-full rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-br from-slate-900 to-slate-800 p-5 lg:p-6 text-left shadow-lg shadow-emerald-900/20 active:scale-[0.99] transition-transform hover:border-emerald-400/70 max-w-3xl mx-auto"
            >
              <p className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-2">
                {tt('nextMatchOnBoard')}
              </p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white leading-tight break-words">
                {matchP1}{' '}
                <span className="text-slate-500 font-bold text-lg sm:text-xl lg:text-2xl">vs</span>{' '}
                {matchP2}
              </p>
              <p className="text-sm lg:text-base text-slate-400 mt-3 break-words">
                {tt('referee')}: <span className="text-slate-200 font-semibold">{match.refereeName}</span>
              </p>
              <p className="mt-4 text-center text-sm font-black uppercase tracking-wider text-emerald-400">
                {tt('startCheckIn')}
              </p>
            </button>
          )}

          {!match && (
            <p className="text-center text-slate-400 text-base lg:text-lg font-semibold mt-4 mb-2 px-2">
              {tt('waitingForMatch')}
            </p>
          )}

          {showDemoAssignButton && match && (
            <button
              type="button"
              onClick={enterCheckIn}
              className="mt-4 w-full py-3 rounded-xl text-sm font-bold bg-amber-900/30 text-amber-200 border border-amber-500/30 hover:bg-amber-900/50 max-w-3xl mx-auto"
            >
              {tt('demoAssignMatch')}
            </button>
          )}

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 max-w-3xl mx-auto"
            >
              {translations[lang]?.backMenu ?? 'Zpět do menu'}
            </button>
          )}
          </div>
        </main>
      );
}
