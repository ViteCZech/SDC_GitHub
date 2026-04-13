import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Home, Pencil, Bell } from 'lucide-react';
import { distributePlayersToFixedGroups } from '../utils/tournamentGenerator';
import {
  calculateTournamentTimePrediction,
  calculateGroupStandings,
  isTournamentBracketOnlyFormat,
  isTournamentGroupsThenBracketFormat,
} from '../utils/tournamentLogic';
import { translations } from '../translations';

/** Tabulka pořadí – profesionální s všemi detaily */
function GroupStandingsTable({ standings, advanceCount, t }) {
  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <table className="w-full max-w-full text-xs sm:text-sm table-fixed">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-tight leading-tight">
            <th className="text-center py-1.5 w-[2.25rem] sm:w-10 px-0.5 align-bottom">
              {t('tournStandingPos') || 'No:'}
            </th>
            <th className="text-left py-1.5 pr-1 min-w-0 align-bottom">{t('playerName') || 'Hráč'}</th>
            <th className="text-center py-1.5 w-8 sm:w-9 px-0.5 align-bottom">
              {t('tournStandingPoints') || 'Body'}
            </th>
            <th className="text-center py-1.5 w-[3.25rem] sm:w-[4rem] px-0.5 align-bottom leading-tight whitespace-pre-line">
              {t('tournStandingMatchesShort')}
            </th>
            <th className="text-center py-1.5 w-[3.25rem] sm:w-[4rem] px-0.5 align-bottom leading-tight whitespace-pre-line">
              {t('tournStandingLegsShort')}
            </th>
            <th className="text-center py-1.5 w-9 sm:w-10 px-0.5 align-bottom">
              {t('tournStandingDiff') || 'Rozdíl'}
            </th>
            <th className="text-center py-1.5 w-11 sm:w-12 px-0.5 align-bottom">
              {t('tournStandingAvg') || 'Průměr'}
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, idx) => {
            const isAdvancing =
              advanceCount > 0 && idx < Math.min(advanceCount, standings.length);
            return (
            <tr
              key={row.id}
              className={`border-b border-slate-800 last:border-0 ${
                isAdvancing ? 'bg-emerald-900/20' : ''
              }`}
            >
              {/* border-l na <tr> u collapse tabulek často mizí — okraj jen na první buňce */}
              <td
                className={`py-1.5 px-0.5 text-center text-[10px] sm:text-xs font-bold tabular-nums text-slate-200 ${
                  isAdvancing ? 'border-l-2 border-l-emerald-500/60' : ''
                }`}
              >
                {idx + 1}
              </td>
              <td className="min-w-0 px-1 py-1.5 font-medium truncate text-slate-100">
                <div className="flex items-center gap-2">
                  <span className="truncate">{row.name}</span>
                  {isAdvancing && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                      P
                    </span>
                  )}
                </div>
              </td>
              <td className="py-1.5 px-0.5 text-center text-slate-200 font-mono text-[10px] sm:text-xs font-bold">
                {row.points ?? row.matchesWon}
              </td>
              <td className="py-1.5 px-0.5 text-center text-slate-300 font-mono text-[10px] sm:text-xs">
                {row.matchesWon}:{row.matchesLost}
              </td>
              <td className="py-1.5 px-0.5 text-center text-slate-400 font-mono text-[10px] sm:text-xs">
                {row.legsWon}:{row.legsLost}
              </td>
              <td className="py-1.5 px-0.5 text-center text-slate-300 font-mono text-[10px] sm:text-xs">
                {row.legDifference > 0 ? '+' : ''}{row.legDifference}
              </td>
              <td className="py-1.5 px-0.5 text-center text-slate-300 font-mono text-[10px] sm:text-xs">
                {Number(row.average ?? 0).toFixed(2)}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Scrollovatelný seznam zápasů – plná plocha karty */
function ScrollableMatchList({
  groupMatches,
  group,
  firstPlayableIdx,
  getPlayerName,
  onStartMatch,
  onResetMatch,
  t,
  allowAdminMatchActions = true,
}) {
  return (
    <div className="h-full min-h-[280px] max-h-[400px] overflow-y-auto pr-2">
      <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2 sticky top-0 bg-slate-800 py-1 z-10">
        {t('tournOrderOfPlay') || 'Rozpis zápasů'}
      </h3>
      <ul className="space-y-1.5">
        {groupMatches.map((m, idx) => {
          const isCompleted = m.status === 'completed';
          const isPlaying = m.status === 'playing';
          const isTabletTimeout = m.tabletStatus === 'timeout_warning';
          const isLocked = idx > firstPlayableIdx;
          const name1 = getPlayerName(m.player1Id);
          const name2 = getPlayerName(m.player2Id);
          const chalkerName = m.chalkerId ? getPlayerName(m.chalkerId) : null;
          const canClick = allowAdminMatchActions && (!isLocked || isPlaying || isCompleted);
          const statusClasses =
            isCompleted
              ? 'border-slate-800 bg-slate-800/50 text-slate-500'
              : isPlaying
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 animate-pulse'
              : 'border-slate-700 hover:bg-slate-700/50 text-slate-300';

          return (
            <li key={m.matchId}>
              <div
                role={allowAdminMatchActions ? 'button' : undefined}
                tabIndex={allowAdminMatchActions && canClick ? 0 : undefined}
                onClick={() => {
                  if (!allowAdminMatchActions || !canClick) return;
                  if (isCompleted) {
                    requestConfirm(
                      'Tento zápas je již dohrán. Chcete smazat jeho výsledek a zadat jej znovu?',
                      () => onResetMatch?.(m.matchId ?? m.id, m.groupId ?? m.group)
                    );
                    return;
                  }
                  onStartMatch?.(m, group);
                }}
                onKeyDown={(e) => {
                  if (!allowAdminMatchActions || !canClick || (e.key !== 'Enter' && e.key !== ' ')) return;
                  e.preventDefault();
                  if (isCompleted) {
                    requestConfirm(
                      'Tento zápas je již dohrán. Chcete smazat jeho výsledek a zadat jej znovu?',
                      () => onResetMatch?.(m.matchId ?? m.id, m.groupId ?? m.group)
                    );
                    return;
                  }
                  onStartMatch?.(m, group);
                }}
                className={`flex items-center justify-between p-2 rounded transition-all border ${statusClasses} ${allowAdminMatchActions && canClick ? 'cursor-pointer' : 'cursor-default'} ${!canClick && allowAdminMatchActions ? 'opacity-60 cursor-not-allowed' : ''} ${
                  isTabletTimeout
                    ? 'border-red-500 ring-2 ring-red-500/70 bg-red-950/30 shadow-[0_0_20px_rgba(239,68,68,0.25)] animate-pulse'
                    : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-white font-bold text-xs w-6 inline-block">#{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    {isTabletTimeout && (
                      <div className="flex items-center gap-1.5 text-red-400 font-black text-[10px] uppercase tracking-wider mb-1">
                        <Bell className="w-3.5 h-3.5 shrink-0 text-red-500" aria-hidden />
                        {t('tournTabletTimeoutAlert') || 'ČAS VYPRŠEL!'}
                      </div>
                    )}
                    <div className="font-medium leading-snug truncate">
                      {name1} vs {name2}
                    </div>
                    {chalkerName && (
                      <div className="text-[11px] text-slate-500 leading-tight">
                        {t('tournChalker') || 'Počítá'}: {chalkerName}
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-2 shrink-0">
                  {isCompleted && m.result ? (
                    <span className="font-bold text-emerald-400 whitespace-nowrap">
                      {m.result.p1Legs ?? 0} : {m.result.p2Legs ?? 0}
                    </span>
                  ) : isPlaying ? (
                    <span className="text-xs uppercase tracking-wider">{t('tournPlaying') || 'Hraje se'}</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Karta skupiny s přepínačem Tabulka / Zápasy */
function GroupCard({
  group,
  groupMatches,
  standings,
  advanceCount,
  firstPlayableIdx,
  isReviewMode,
  onStartMatch,
  onResetMatch,
  onRequestWithdrawPlayer,
  isAdmin,
  t,
}) {
  const [viewMode, setViewMode] = useState('standings');
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const getPlayerName = (id) => group.players.find((p) => p.id === id)?.name || id || 'Neznámý';
  const withdrawCandidates = (group.players || []).filter((p) => !p?.isWithdrawn);

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-4">
      {/* Hlavička karty: název skupiny, terč, záložky */}
      <div className="flex flex-wrap items-center gap-2 mb-0">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
          {t('tournGroup') || 'Skupina'} {group.groupId}
        </h3>
        {!isReviewMode && group.boards && group.boards.length > 0 ? (
          <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-xs font-bold">
            🎯 {t('tournBoard') || 'Terč'} {group.boards[0]}
          </span>
        ) : !isReviewMode ? (
          <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs font-bold animate-pulse">
            ⏳ {t('tournWaitingForBoard') || 'Čeká na terč'}
          </span>
        ) : null}
        {!isReviewMode && (
          <div className="flex items-center gap-2 ml-auto relative">
            {isAdmin && (
            <button
              type="button"
              onClick={() => setActionMenuOpen((v) => !v)}
              className="p-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
              title={t('tournament.editTooltip') || 'Upravit/Kontumovat'}
              aria-label={t('tournament.editTooltip') || 'Upravit/Kontumovat'}
            >
              <Pencil className="w-4 h-4" />
            </button>
            )}
            {isAdmin && actionMenuOpen && (
              <div className="absolute right-0 top-11 z-20 w-72 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-3">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  {t('tournament.actionMenuTitle') || 'Možnosti kontumace'}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  {t('tournament.withdrawFromGroupCategory') || 'Odstoupení hráče ze skupiny'}
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {withdrawCandidates.length > 0 ? (
                    withdrawCandidates.map((p) => (
                      <button
                        key={p.id ?? p.name}
                        type="button"
                        onClick={() => {
                          onRequestWithdrawPlayer?.(group.groupId, p.id ?? p.name);
                          setActionMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors"
                      >
                        {p.name ?? p.id}
                      </button>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 px-2 py-1">
                      {t('tournNoPlayers') || 'Zatím žádní hráči'}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('standings')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'standings'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              📊 {t('tournTabStandings') || 'Tabulka'}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matches')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'matches'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              🆚 {t('tournTabMatches') || 'Zápasy'}
            </button>
          </div>
          </div>
        )}
      </div>

      {/* Dynamický obsah: v ReviewMode vždy tabulka; jinak podle viewMode */}
      {(viewMode === 'standings' || isReviewMode) && (
        <GroupStandingsTable
          standings={standings}
          advanceCount={advanceCount}
          t={t}
        />
      )}
      {viewMode === 'matches' && !isReviewMode && (
        <ScrollableMatchList
          groupMatches={groupMatches}
          group={group}
          firstPlayableIdx={firstPlayableIdx}
          getPlayerName={getPlayerName}
          onStartMatch={onStartMatch}
          onResetMatch={onResetMatch}
          allowAdminMatchActions={isAdmin}
          t={t}
        />
      )}
    </div>
  );
}

export default function TournamentGroupsView({
  tournamentData,
  tournamentMatches = [],
  tournamentGroups = [],
  estimatedTournamentEnd = null,
  estimatedGroupsPhaseEnd = null,
  lang = 'cs',
  userRole = null,
  hasBracket = false,
  onBack,
  onStartMatch,
  onResetMatch,
  onWithdrawPlayer,
  onDevFillMatches,
  onGenerateBracket,
  onFinishGroups,
  onResumeBracket,
}) {
  const isAdmin = userRole === 'admin';
  const th = (k) => translations[lang]?.tournamentHub?.[k] ?? k;
  const t = (k) => translations[lang]?.[k] ?? k;
  const tNested = (k) => {
    if (!k) return k;
    if (!String(k).includes('.')) return t(k);
    const parts = String(k).split('.');
    let cur = translations[lang];
    for (const p of parts) cur = cur?.[p];
    if (cur != null) return cur;
    const flatFallbackMap = {
      'tournament.actionMenuTitle': 'actionMenuTitle',
      'tournament.withdrawFromGroupCategory': 'withdrawFromGroupCategory',
      'tournament.editTooltip': 'editTooltip',
      'tournament.tournWithdrawConfirm': 'tournWithdrawConfirm',
    };
    const flatKey = flatFallbackMap[String(k)];
    if (flatKey) return t(flatKey);
    return k;
  };
  const [isReviewMode, setIsReviewMode] = useState(() => !!hasBracket);
  // Lokální confirm modal (nahrazuje window.confirm)
  const [confirmState, setConfirmState] = useState(null); // { message: string, onConfirm: () => void }
  const requestConfirm = (message, onConfirm) =>
    setConfirmState({
      message: String(message ?? ''),
      onConfirm: typeof onConfirm === 'function' ? onConfirm : () => {},
    });
  const pressTimer = useRef(null);

  useEffect(() => {
    if (hasBracket) setIsReviewMode(true);
  }, [hasBracket]);

  const fallbackGroups = useMemo(() => {
    if (tournamentData?.groups?.length) return tournamentData.groups;
    if (!tournamentData?.players?.length) return [];
    const playersWithIds = tournamentData.players.map((p, i) => ({
      ...p,
      id: p.id ?? `p${i + 1}`,
    }));
    const numGroups = tournamentData.numGroups ?? Math.max(1, Math.ceil(playersWithIds.length / 4));
    return distributePlayersToFixedGroups(playersWithIds, numGroups).map((g) => ({
      ...g,
      boards: g.boards ?? [],
    }));
  }, [tournamentData?.players, tournamentData?.groups, tournamentData?.numGroups]);

  const groups = tournamentGroups?.length ? tournamentGroups : fallbackGroups;
  const groupStatus = useMemo(() => {
    const isCompleted = (groupId) => {
      const gm = tournamentMatches.filter((m) => (m.groupId ?? m.group) === groupId);
      return gm.length > 0 && gm.every((m) => m.status === 'completed');
    };
    const completed = groups.filter((g) => isCompleted(g.groupId)).length;
    const waiting = groups.filter((g) => (!g.boards || g.boards.length === 0)).length;
    const playing = groups.filter((g) => (g.boards?.length ?? 0) > 0 && !isCompleted(g.groupId)).length;
    return { total: groups.length, playing, waiting, completed };
  }, [groups, tournamentMatches]);

  const [timePrediction, setTimePrediction] = useState({
    estimatedEnd: new Date(),
    avgMatchDurationMs: 900000,
    averageLegTimeMs: 300000,
  });

  useEffect(() => {
    const settings = {
      groupsLegs: tournamentData?.groupsLegs ?? 3,
      totalBoards: tournamentData?.totalBoards ?? tournamentData?.numBoards ?? 0,
    };
    const pred = calculateTournamentTimePrediction(groups, tournamentMatches, settings);
    setTimePrediction(pred);
  }, [groups, tournamentMatches, tournamentData?.groupsLegs, tournamentData?.totalBoards, tournamentData?.numBoards]);

  const formatTime = (date) =>
    date.toLocaleTimeString(lang === 'cs' ? 'cs-CZ' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const groupsEndForBanner =
    estimatedGroupsPhaseEnd instanceof Date && !Number.isNaN(estimatedGroupsPhaseEnd.getTime())
      ? estimatedGroupsPhaseEnd
      : timePrediction.estimatedEnd;

  const handleStartMatch = (match, group) => {
    const p1 = group.players.find((p) => p.id === match.player1Id);
    const p2 = group.players.find((p) => p.id === match.player2Id);
    console.log('SPUSTIT ZÁPAS:', {
      matchId: match.matchId,
      player1: p1,
      player2: p2,
      chalkerId: match.chalkerId,
      groupId: match.groupId,
    });
    onStartMatch?.(match, group);
  };

  const handleRequestWithdrawPlayer = (groupId, playerId) => {
    requestConfirm(
      tNested('tournament.tournWithdrawConfirm') ||
        t('tournWithdrawConfirm') ||
        'Opravdu chcete hráče odhlásit z turnaje? Jeho zbývající zápasy budou zkontumovány (0:W).',
      () => onWithdrawPlayer?.(groupId, playerId)
    );
  };

  const getFirstPlayableIndex = (groupMatches) => {
    let idx = 0;
    for (let i = 0; i < groupMatches.length; i++) {
      if (groupMatches[i].status === 'pending' || groupMatches[i].status === 'playing') {
        return i;
      }
      idx = i + 1;
    }
    return groupMatches.length;
  };

  const handlePressStart = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      const winLegs = tournamentData?.legsGroup || tournamentData?.groupsLegs || 2;
      const nextMatches = (tournamentMatches || []).map((m) => {
        if (m.status === 'completed') return m;
        const p1Wins = Math.random() > 0.5;
        const scoreP1 = p1Wins ? winLegs : Math.floor(Math.random() * winLegs);
        const scoreP2 = p1Wins ? Math.floor(Math.random() * winLegs) : winLegs;
        const mockP1Avg = parseFloat((Math.random() * 20 + 50).toFixed(2));
        const mockP2Avg = parseFloat((Math.random() * 20 + 50).toFixed(2));
        return {
          ...m,
          status: 'completed',
          winnerId: p1Wins ? m.player1Id : m.player2Id,
          p1Avg: mockP1Avg,
          p2Avg: mockP2Avg,
          result: {
            p1Legs: scoreP1,
            p2Legs: scoreP2,
            p1Avg: mockP1Avg,
            p2Avg: mockP2Avg,
          },
          completedAt: Date.now(),
        };
      });
      onDevFillMatches?.(nextMatches);
      setIsReviewMode(true);
    }, 1500);
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  useEffect(() => () => handlePressEnd(), []);

  if (!tournamentData) {
    if (userRole === 'viewer' || userRole === 'tablet') {
      return (
        <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 p-4 pb-24">
          <div className="max-w-lg mx-auto w-full text-center py-16 px-4">
            <p className="text-slate-400 mb-10">{th('hubNoLocalData')}</p>
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 mx-auto"
            >
              <Home className="w-5 h-5" /> {t('backMenu') || 'Zpět do menu'}
            </button>
          </div>
        </main>
      );
    }
    return null;
  }

  if (isTournamentBracketOnlyFormat(tournamentData.tournamentFormat)) {
    return (
      <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950">
        {confirmState && (
          <div
            className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onClick={() => setConfirmState(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-4 sm:p-5 animate-in zoom-in-95 fade-in duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-black text-white tracking-tight mb-2">
                {t('confirmModalTitle') || 'Potvrzení'}
              </h3>
              <p className="text-sm text-slate-300">{confirmState.message}</p>
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setConfirmState(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors"
                >
                  {t('cancel') || 'Zrušit'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fn = confirmState.onConfirm;
                    setConfirmState(null);
                    fn?.();
                  }}
                  className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
                >
                  {t('confirmAction') || 'Potvrdit'}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="w-full max-w-[98vw] mx-auto px-2 sm:px-4 py-4 pb-24">
          <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-4">
            {tournamentData.name}
          </h2>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-slate-400">
              {t('tournKoOnlyNoGroups') ||
                'Tento turnaj nemá skupinovou fázi. Pokračujte přímo do vyřazovacího pavouka.'}
            </p>
          </div>
          {hasBracket && onResumeBracket && (
            <button
              type="button"
              onClick={() => onResumeBracket()}
              className="mt-4 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500"
            >
              {t('tournResumeToBracket') || '➡️ Přejít na Pavouka'}
            </button>
          )}
          <button
            onClick={onBack}
            className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
          >
            <Home className="w-5 h-5" /> {t('backMenu')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950">
      {confirmState && (
        <div
          className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmState(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-4 sm:p-5 animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-white tracking-tight mb-2">
              {t('confirmModalTitle') || 'Potvrzení'}
            </h3>
            <p className="text-sm text-slate-300">{confirmState.message}</p>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                {t('cancel') || 'Zrušit'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = confirmState.onConfirm;
                  setConfirmState(null);
                  fn?.();
                }}
                className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                {t('confirmAction') || 'Potvrdit'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-[98vw] mx-auto px-2 sm:px-4 pb-24">
        {!isReviewMode && (
          <>
            {/* Banner predikce času */}
            <div className="mb-6 p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-lg font-bold text-slate-100">
                {t('tournEstEndGroups') || 'Odhadovaný konec skupin'}:{' '}
                <span className="text-emerald-400">{formatTime(groupsEndForBanner)}</span>
              </p>
              {estimatedTournamentEnd instanceof Date && !Number.isNaN(estimatedTournamentEnd.getTime()) ? (
                <p className="text-base font-bold text-slate-200 mt-2">
                  {t('tournEstTournamentEnd') || 'Odhad konec celého turnaje'}:{' '}
                  <span className="text-emerald-400">{formatTime(estimatedTournamentEnd)}</span>
                </p>
              ) : null}
              <p className="text-sm text-slate-400 mt-1">
                {t('tournAvgMatchTime') || 'Průměrný čas zápasu'}:{' '}
                {Math.round(timePrediction.avgMatchDurationMs / 60000)} {t('tournMinutes') || 'minut'}
              </p>
            </div>
            {/* Status lišta – nad nadpisem; nadpis má odsazení mt-8 */}
            <div className="flex overflow-x-auto whitespace-nowrap gap-4 p-4 bg-slate-900 border-b border-slate-800 rounded-xl">
              <div className="shrink-0 flex items-center gap-4">
                <span className="text-slate-300 font-bold">{t('tournGroupsStatus') || 'Stav skupin'}:</span>
                <span className="text-slate-200">{t('tournGroupsTotal') || 'Celkem skupin'}: <b>{groupStatus.total}</b></span>
                <span className="text-emerald-300">{t('tournGroupsPlaying') || 'Hrající'}: <b>{groupStatus.playing}</b></span>
                <span className="text-amber-300">{t('tournGroupsWaiting') || 'Čekající'}: <b>{groupStatus.waiting}</b></span>
                <span className="text-blue-300">{t('tournGroupsCompleted') || 'Dokončené'}: <b>{groupStatus.completed}</b></span>
              </div>
              <div className="w-px bg-slate-700 shrink-0" />
              <div className="shrink-0 flex items-center gap-4">
                <span className="text-slate-300 font-bold">{t('tournParams') || 'Parametry turnaje'}:</span>
                <span className="text-slate-200">{t('tournGroupsLabel') || 'Skupiny'}: <b>{tournamentData?.startScore ?? 501} {String(tournamentData?.outMode ?? 'double').toUpperCase()}, {t('tournToWinLegs') || 'na'} {tournamentData?.groupsLegs ?? 2}</b></span>
                <span className="text-slate-200">{t('tournPrelimLabel') || 'Předkolo'}: <b>{tournamentData?.prelimLegs ? `${tournamentData.prelimLegs} ${t('tournMinutesLegsUnit') || 'legů'}` : (t('tournNoPrelim') || 'Nehraje se')}</b></span>
                <span className="text-slate-200">{t('tournBracketLabel') || 'Pavouk'}: <b>{tournamentData?.bracketKoLegs ?? tournamentData?.bracketLegs ?? 2} {t('tournMinutesLegsUnit') || 'legů'}</b></span>
              </div>
            </div>
          </>
        )}

        <div className={`${isReviewMode ? 'mt-6' : 'mt-8'} mb-4`}>
          <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-2">
            {t('tournGroupsTitle')}
          </h2>
          {isReviewMode && (
            <h3 className="text-lg md:text-xl font-black tracking-wide uppercase text-amber-300">
              KONTROLA VÝSLEDKŮ: Konečné pořadí ve skupinách
            </h3>
          )}
        </div>

        {/* Mřížka skupin */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 auto-rows-max gap-4 items-start">
          {groups.map((group) => {
            const groupMatches = tournamentMatches
              .filter((m) => (m.groupId ?? m.group) === group.groupId)
              .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || 0);
            const standings = calculateGroupStandings(group.players, groupMatches);
            // Stejný význam jako u generování pavouka (App): promotersCount = počet „řad“ postupu ze skupiny.
            const rawAdvancePerGroup =
              tournamentData?.promotersCount ??
              tournamentData?.promotersPerGroup ??
              tournamentData?.advancePerGroup ??
              2;
            const advanceCount = rawAdvancePerGroup === 'all'
              ? (group.players?.length ?? 0)
              : Math.max(0, Math.min(group.players?.length ?? 0, Number(rawAdvancePerGroup) || 0));
            const firstPlayableIdx = getFirstPlayableIndex(groupMatches);

            return (
              <GroupCard
                key={group.groupId}
                group={group}
                groupMatches={groupMatches}
                standings={standings}
                advanceCount={advanceCount}
                firstPlayableIdx={firstPlayableIdx}
                isReviewMode={isReviewMode}
                onStartMatch={handleStartMatch}
                onResetMatch={onResetMatch}
                onRequestWithdrawPlayer={handleRequestWithdrawPlayer}
                isAdmin={isAdmin}
                t={(key) => {
                  const nested = tNested(key);
                  if (nested !== key) return nested;
                  return t(key);
                }}
              />
            );
          })}
        </div>

        {isAdmin &&
          isTournamentGroupsThenBracketFormat(tournamentData.tournamentFormat) &&
          (onGenerateBracket || onFinishGroups) &&
          !isReviewMode && (
          <button
            type="button"
            onMouseDown={handlePressStart}
            onMouseUp={handlePressEnd}
            onMouseLeave={handlePressEnd}
            onTouchStart={handlePressStart}
            onTouchEnd={handlePressEnd}
            onClick={() => {
              const hasUnfinished = tournamentMatches?.some((m) => m.status !== 'completed') ?? false;
              if (hasUnfinished) return;
              setIsReviewMode(true);
            }}
            className="mt-8 flex items-center justify-center gap-3 w-full py-5 px-4 rounded-2xl font-black text-lg uppercase tracking-wide text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-2 border-amber-400/50 shadow-lg shadow-amber-900/30 active:scale-[0.98] transition-all"
          >
            {t('tournFinishGroupsBtn') || 'Ukončit skupiny a nastavit Pavouka'}
          </button>
        )}

        {isReviewMode && hasBracket && (
          <button
            type="button"
            onClick={() => onResumeBracket?.()}
            className="mt-8 w-full py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500"
          >
            {t('tournResumeToBracket') || '➡️ Přejít zpět na Pavouka'}
          </button>
        )}

        {isAdmin && isReviewMode && !hasBracket && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsReviewMode(false)}
              className="py-4 rounded-xl font-black bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
            >
              Zpět k zápasům (Opravit chybu)
            </button>
            <button
              type="button"
              onClick={() => (onGenerateBracket ?? onFinishGroups)?.()}
              className="py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500"
            >
              ✅ Potvrdit pořadí a vygenerovat Pavouka
            </button>
          </div>
        )}

        <button
          onClick={onBack}
          className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors"
        >
          <Home className="w-5 h-5" /> {t('backMenu') || 'Zpět do menu'}
        </button>
      </div>
    </main>
  );
}
