import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Settings, Play, ClipboardList, Lock, Unlock, X, Pencil, Flag, Bell } from 'lucide-react';
import { translations } from '../translations';
import { getBracketWinLegsForRound, getRoundBusyPlayerIds, isBracketRefereePlaceholder, suggestRefereeIdsForBracketMatch } from '../utils/tournamentLogic';
import { AdminTapTextField } from './AdminTapField';

const BYE_MARKER = 'Volný los';

/**
 * Šipkařský název kola.
 */
function getRoundName(index, totalRounds, t, prelimLegs) {
  if (index === 0 && prelimLegs != null && Number(prelimLegs) > 0) {
    return t('tournPrelimLabel') || 'Předkolo';
  }
  const diff = totalRounds - index;
  if (diff === 1) return t('tournRoundFinal') || 'Finále';
  if (diff === 2) return t('tournRoundSemi') || 'Semifinále';
  if (diff === 3) return t('tournRoundQuarter') || 'Čtvrtfinále';
  const n = Math.pow(2, diff);
  const key = t('tournRoundLastN');
  return key ? key.replace('{n}', n) : `Last${n}`;
}

/** Text „na X vítězné legy“ / EN first to / PL. */
function formatLegsWinPhrase(legs, lang) {
  const n = Math.max(1, Number(legs) || 1);
  if (lang === 'cs') {
    if (n === 1) return 'na 1 vítězný leg';
    if (n >= 2 && n <= 4) return `na ${n} vítězné legy`;
    return `na ${n} vítězných legů`;
  }
  if (lang === 'pl') {
    if (n === 1) return 'na 1 wygrany leg';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `na ${n} wygrane legi`;
    return `na ${n} wygranych legów`;
  }
  return `first to ${n}`;
}

function outModeLabel(outMode) {
  const m = String(outMode ?? 'double').toLowerCase();
  if (m === 'double') return 'Double Out';
  if (m === 'single') return 'Single Out';
  if (m === 'master') return 'Master Out';
  return m.toUpperCase();
}

function isByeMatch(match) {
  return (
    match.status === 'completed' &&
    (String(match.player1Name ?? '').includes(BYE_MARKER) ||
      String(match.player2Name ?? '').includes(BYE_MARKER))
  );
}

function BracketModal({
  title,
  hint,
  value,
  onChange,
  onSave,
  onClose,
  saveLabel,
  cancelLabel,
  inputMode = 'numeric',
  extraActionLabel = null,
  onExtraAction = null,
  extraActionDisabled = false,
}) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bracket-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-4 sm:p-5 animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 id="bracket-modal-title" className="text-lg font-black text-white tracking-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label={cancelLabel}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {hint ? <p className="text-xs text-slate-500 mb-3">{hint}</p> : null}
        <AdminTapTextField
          value={value}
          onValueChange={onChange}
          onEnterPress={() => onSave()}
          filterChar={inputMode === 'numeric' ? (c) => /^\d$/.test(c) : undefined}
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
        />
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors"
          >
            {cancelLabel}
          </button>
          {extraActionLabel && onExtraAction ? (
            <button
              type="button"
              onClick={onExtraAction}
              disabled={extraActionDisabled}
              className={`flex-1 py-3 rounded-xl font-black transition-colors border ${
                extraActionDisabled
                  ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                  : 'bg-amber-600/20 text-amber-200 border-amber-500/30 hover:bg-amber-600/30'
              }`}
            >
              {extraActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TournamentBracketView({
  bracketData,
  tournamentData,
  userRole = null,
  onStartMatch,
  onUpdateRoundSettings,
  onUpdateMatchBoard,
  onToggleMatchBoardLock,
  onSetMatchBoardAuto,
  onManualRefereeChange,
  onManualBracketPlayerSlot,
  onBracketWalkover,
  onBracketWithdrawPlayer,
  onBracketDataCommit,
  lang = 'cs',
}) {
  const isAdmin = userRole === 'admin';
  const t = (k) => translations[lang]?.[k] ?? k;
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
  const [legsModalOpen, setLegsModalOpen] = useState(false);
  const [editLegsValue, setEditLegsValue] = useState('');
  const [editBoardsValue, setEditBoardsValue] = useState('');
  const [boardModal, setBoardModal] = useState(null);
  const [refereeModal, setRefereeModal] = useState(null);
  const [refereeSearch, setRefereeSearch] = useState('');
  const [playerSlotModal, setPlayerSlotModal] = useState(null);
  const [walkoverModal, setWalkoverModal] = useState(null);
  const pressTimer = useRef(null);

  const totalRounds = bracketData?.length ?? 0;
  const activeRound = bracketData?.[activeRoundIndex];
  const matches = activeRound?.matches ?? [];

  const startScore = tournamentData?.startScore ?? 501;
  const outLabel = outModeLabel(tournamentData?.outMode);
  const bracketBaseLegs = tournamentData?.bracketKoLegs ?? tournamentData?.bracketLegs ?? 3;
  const prelimLegs = tournamentData?.prelimLegs;
  const currentLegs =
    matches[0]?.winLegs ??
    getBracketWinLegsForRound(activeRoundIndex, bracketBaseLegs, prelimLegs);

  const legsPhrase = formatLegsWinPhrase(currentLegs, lang);
  const formatSummary = `${startScore} ${outLabel}, ${legsPhrase}`;

  const activeRoundTitle = getRoundName(activeRoundIndex, totalRounds, t, prelimLegs);

  useEffect(() => {
    setLegsModalOpen(false);
    setBoardModal(null);
    setRefereeModal(null);
    setRefereeSearch('');
    setPlayerSlotModal(null);
    setWalkoverModal(null);
  }, [activeRoundIndex]);

  useEffect(() => {
    return () => {
      if (pressTimer.current != null) clearTimeout(pressTimer.current);
    };
  }, []);

  const openLegsModal = () => {
    setEditLegsValue(String(currentLegs));
    const roundBc = bracketData[activeRoundIndex]?.boardsCount;
    const fallback =
      tournamentData?.numBoards ?? tournamentData?.totalBoards ?? tournamentData?.boardsCount ?? 1;
    setEditBoardsValue(
      String(roundBc != null && Number(roundBc) >= 1 ? Math.floor(Number(roundBc)) : fallback)
    );
    setLegsModalOpen(true);
  };

  const saveRoundSettingsModal = () => {
    const legs = parseInt(editLegsValue, 10);
    const boards = parseInt(editBoardsValue, 10);
    if (!Number.isNaN(legs) && legs > 0 && !Number.isNaN(boards) && boards >= 1) {
      onUpdateRoundSettings?.(activeRoundIndex, legs, boards);
      setLegsModalOpen(false);
    }
  };

  const openBoardModal = (roundIndex, match) => {
    setBoardModal({
      roundIndex,
      matchId: match.id,
      input: String(match.board ?? 1),
    });
  };

  const saveBoardModal = () => {
    if (!boardModal) return;
    const parsed = parseInt(boardModal.input, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 99) {
      onUpdateMatchBoard?.(boardModal.roundIndex, boardModal.matchId, parsed);
      setBoardModal(null);
    }
  };

  const setBoardModalAuto = () => {
    if (!boardModal) return;
    onSetMatchBoardAuto?.(boardModal.roundIndex, boardModal.matchId);
    setBoardModal(null);
  };

  const allTournamentPlayers = React.useMemo(() => {
    const byId = new Map();
    const sourcePlayers = Array.isArray(tournamentData?.players)
      ? tournamentData.players
      : (tournamentData?.groups || []).flatMap((g) => g?.players || []);
    for (const p of sourcePlayers || []) {
      const id = p?.id ?? p?.name;
      const name = p?.name ?? p?.id;
      if (!id || !name) continue;
      if (!byId.has(id)) byId.set(id, { id, name });
    }
    return [...byId.values()].sort((a, b) =>
      String(a.name).localeCompare(String(b.name), 'cs', { sensitivity: 'base', numeric: true })
    );
  }, [tournamentData?.players, tournamentData?.groups]);

  const openRefereeModal = (roundIndex, matchIndex, match) => {
    const nm = match?.referee?.name != null ? String(match.referee.name) : '';
    setRefereeModal({
      roundIndex,
      matchIndex,
      selectedId: String(match?.referee?.id ?? ''),
      customName: nm,
    });
    setRefereeSearch('');
  };

  const refereeBusyIds = useMemo(() => {
    const ri = refereeModal?.roundIndex;
    if (ri === null || ri === undefined) return new Set();
    return getRoundBusyPlayerIds(bracketData, ri) || new Set();
  }, [bracketData, refereeModal?.roundIndex]);

  const normalizeSearchKey = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const filteredRefereeOptions = useMemo(() => {
    const q = normalizeSearchKey(refereeSearch);
    const all = Array.isArray(allTournamentPlayers) ? allTournamentPlayers : [];
    if (!q) return all;
    return all.filter((p) => {
      const key = normalizeSearchKey(`${p?.name ?? ''} ${p?.id ?? ''}`);
      return key.includes(q);
    });
  }, [allTournamentPlayers, refereeSearch]);

  const { filteredAvailableRefs, filteredBusyRefs } = useMemo(() => {
    const avail = [];
    const busy = [];
    for (const p of filteredRefereeOptions || []) {
      const pid = p?.id;
      const isBusy = pid != null && refereeBusyIds?.has?.(pid);
      if (isBusy) busy.push(p);
      else avail.push(p);
    }
    return { filteredAvailableRefs: avail, filteredBusyRefs: busy };
  }, [filteredRefereeOptions, refereeBusyIds]);

  const suggestedRefereeIds = useMemo(() => {
    const ri = refereeModal?.roundIndex;
    const mi = refereeModal?.matchIndex;
    if (ri === null || ri === undefined) return [];
    if (mi === null || mi === undefined) return [];
    return suggestRefereeIdsForBracketMatch(bracketData, ri, mi) || [];
  }, [bracketData, refereeModal?.roundIndex, refereeModal?.matchIndex]);

  const suggestedRefs = useMemo(() => {
    if (!suggestedRefereeIds?.length) return [];
    const mapById = new Map((allTournamentPlayers || []).map((p) => [String(p.id), p]));
    const q = normalizeSearchKey(refereeSearch);
    const out = [];
    for (const id of suggestedRefereeIds) {
      const p = mapById.get(String(id));
      if (!p) continue;
      const key = normalizeSearchKey(`${p?.name ?? ''} ${p?.id ?? ''}`);
      if (q && !key.includes(q)) continue;
      // Nepovolit vybrat účastníky zápasu nebo busy v tomto kole (defenzivně)
      const isBusy = p?.id != null && refereeBusyIds?.has?.(p.id);
      if (isBusy) continue;
      out.push(p);
    }
    return out;
  }, [allTournamentPlayers, suggestedRefereeIds, refereeSearch, refereeBusyIds]);

  const saveRefereeModal = () => {
    if (!refereeModal) return;
    const picked = allTournamentPlayers.find((p) => String(p.id) === String(refereeModal.selectedId));
    if (!picked) return;
    const custom = String(refereeModal.customName ?? '').trim();
    onManualRefereeChange?.(refereeModal.roundIndex, refereeModal.matchIndex, {
      id: picked.id,
      name: custom || picked.name,
    });
    setRefereeModal(null);
  };

  const savePlayerSlotModal = () => {
    if (!playerSlotModal) return;
    const picked = allTournamentPlayers.find((p) => String(p.id) === String(playerSlotModal.selectedId));
    if (!picked) return;
    onManualBracketPlayerSlot?.(
      playerSlotModal.roundIndex,
      playerSlotModal.matchIndex,
      playerSlotModal.slot,
      picked
    );
    setPlayerSlotModal(null);
  };

  const handleDevAutoResolveRound = () => {
    if (!bracketData?.length || !onBracketDataCommit) return;
    const next = bracketData.map((round) => ({
      ...round,
      matches: round.matches.map((m) => ({
        ...m,
        score: m.score && typeof m.score === 'object' ? { ...m.score } : { p1: 0, p2: 0 },
      })),
    }));
    const round = next[activeRoundIndex];
    if (!round?.matches) return;
    let filled = 0;
    for (const m of round.matches) {
      if (m.status !== 'pending' || !m.player1Id || !m.player2Id) continue;
      if (isByeMatch(m)) continue;
      // Dev hack: jen zápasy „připravené na terči“ — mají terč i počtáře (vlny 1–2 na stejných deskách)
      const hasBoard = m.board != null && Number.isFinite(Number(m.board)) && Number(m.board) >= 1;
      const hasRef = m.referee && (m.referee.id != null || m.referee.name);
      if (!hasBoard || !hasRef) continue;
      const wl = Math.max(1, Number(m.winLegs) || 3);
      const p1Wins = Math.random() > 0.5;
      const p1 = p1Wins ? wl : Math.floor(Math.random() * wl);
      const p2 = !p1Wins ? wl : Math.floor(Math.random() * wl);
      m.score = { p1, p2 };
      m.p1Avg = Number((50 + Math.random() * 30).toFixed(2));
      m.p2Avg = Number((50 + Math.random() * 30).toFixed(2));
      m.status = 'completed';
      m.winnerId = p1Wins ? m.player1Id : m.player2Id;
      filled += 1;
    }
    if (filled === 0) return;
    onBracketDataCommit(next);
  };

  const handlePressStart = () => {
    if (pressTimer.current != null) clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      handleDevAutoResolveRound();
    }, 1500);
  };

  const handlePressEnd = () => {
    if (pressTimer.current != null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  if (!bracketData || !Array.isArray(bracketData) || (bracketData?.length ?? 0) === 0) {
    if (userRole === 'viewer') {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-6 py-12 text-center">
          <p className="text-lg font-semibold text-slate-300 max-w-md">
            {t('tournament.bracketNotReady') || 'Pavouk se zatím připravuje…'}
          </p>
        </div>
      );
    }
    return (
      <div className="p-8 text-center text-slate-400">
        {t('tournBracketGenerating') || 'Pavouk se generuje...'}
      </div>
    );
  }

  const BoardChip = ({ roundIndex, match, disabled, readOnly }) => {
    const n = match.board;
    const label = n != null && Number.isFinite(Number(n)) ? `#T${n}` : '#T—';
    const locked = !!match.boardLocked;
    if (readOnly) {
      return (
        <span
          className={`font-mono text-xl font-bold tabular-nums px-3 py-1 rounded bg-slate-800 ${
            locked ? 'text-amber-200/80' : 'text-slate-500'
          }`}
        >
          {label}
        </span>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && openBoardModal(roundIndex, match)}
          className={`font-mono text-xl font-bold tabular-nums px-3 py-1 rounded transition-colors ${
            disabled
              ? 'bg-slate-800 text-slate-600 cursor-default'
              : locked
              ? 'bg-slate-700 text-amber-200 hover:bg-slate-600'
              : 'bg-slate-700 text-emerald-200 hover:bg-slate-600'
          }`}
          title={locked ? (t('tournBoardLocked') || 'Terč je ručně zamčený') : undefined}
        >
          {label}
        </button>

        {locked && !disabled && (
          <button
            type="button"
            onClick={() => onToggleMatchBoardLock?.(roundIndex, match.id)}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-amber-300 hover:bg-slate-700 hover:text-amber-200 transition-colors"
            title={t('tournUnlockBoard') || 'Odemknout terč (povolí automatické srovnání)'}
            aria-label={t('tournUnlockBoard') || 'Odemknout terč'}
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        {!locked && !disabled && (
          <button
            type="button"
            onClick={() => onToggleMatchBoardLock?.(roundIndex, match.id)}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 hover:bg-slate-700 hover:text-slate-300 transition-colors"
            title={t('tournLockBoard') || 'Zamknout terč (automat jej nebude měnit)'}
            aria-label={t('tournLockBoard') || 'Zamknout terč'}
          >
            <Unlock className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  const matchNumLabel = (index) =>
    (t('tournBracketMatchN') || 'Zápas #{n}').replace('{n}', String(index + 1));

  const MatchStatusLabel = ({ match }) => {
    if (isByeMatch(match)) return <span>{t('tournBracketStatusBye')}</span>;
    if (match.status === 'completed') return <span>{t('tournBracketStatusDone')}</span>;
    if (match.status === 'playing') return <span className="text-emerald-400">{t('tournPlaying')}</span>;
    return <span>{t('tournBracketStatusPending')}</span>;
  };

  const RefereeRow = ({ match, roundIndex, matchIndex }) => {
    if (isByeMatch(match)) return null;
    const placeholderRef = isBracketRefereePlaceholder(match?.referee, match?.refereeId);
    const canPickRefereeManually =
      isAdmin &&
      match.status === 'pending' &&
      typeof onManualRefereeChange === 'function' &&
      allTournamentPlayers.length > 0;
    const showRefereeAsButton = canPickRefereeManually;
    const refNameTrim =
      match.referee?.name != null ? String(match.referee.name).trim() : '';
    const refereeLabel =
      refNameTrim ||
      (placeholderRef ? t('tournBracketScorerPlaceholder') || '⏳ Čeká na proherce...' : '');
    return (
      <div className="text-sm text-slate-400 mt-2 flex items-center gap-2 border-t border-slate-700/50 pt-2">
        <span className="text-xs uppercase tracking-wider">
          {t('tournBracketScorer') || 'Počtář:'}
        </span>
        {isAdmin && match.refereePickTier != null && Number(match.refereePickTier) >= 1 && (
          <span
            className="text-[9px] font-mono text-slate-500 shrink-0"
            title={String(t('tournRefereePickTierHint')).replace(
              /\{n\}/g,
              String(match.refereePickTier)
            )}
          >
            {String(t('tournRefereePickTierBadge')).replace(/\{n\}/g, String(match.refereePickTier))}
          </span>
        )}
        {showRefereeAsButton ? (
          <button
            type="button"
            onClick={() => openRefereeModal(roundIndex, matchIndex, match)}
            className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-300 font-semibold truncate max-w-full text-left"
            title={t('tournEditScorer') || 'Vybrat / upravit počtáře'}
          >
            <span className={`truncate ${!match.referee || placeholderRef ? 'italic text-slate-400' : ''}`}>
              {refereeLabel || t('tournBracketScorerPlaceholder') || '⏳ Čeká na proherce...'}
            </span>
            <Pencil className="w-3.5 h-3.5 shrink-0" />
          </button>
        ) : match.referee && !placeholderRef ? (
          <span className="text-amber-500 font-semibold truncate">{match.referee.name}</span>
        ) : (
          <span className="italic text-slate-500">
            {t('tournBracketScorerPlaceholder') || '⏳ Čeká na proherce...'}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-[98vw] mx-auto px-2 sm:px-4 space-y-3 relative">
      {legsModalOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setLegsModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-4 sm:p-5 animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-lg font-black text-white tracking-tight">
                {t('tournBracketRoundSettingsTitle') || t('tournBracketModalLegsTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setLegsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label={t('tournBracketModalCancel')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">{t('tournBracketRoundSettingsHint')}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                  {t('tournBracketModalLegsTitle')}
                </label>
                <AdminTapTextField
                  value={editLegsValue}
                  onValueChange={setEditLegsValue}
                  onEnterPress={saveRoundSettingsModal}
                  filterChar={(c) => /^\d$/.test(c)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">{t('tournBracketModalLegsHint')}</p>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                  {t('tournBracketModalRoundBoardsLabel')}
                </label>
                <AdminTapTextField
                  value={editBoardsValue}
                  onValueChange={setEditBoardsValue}
                  onEnterPress={saveRoundSettingsModal}
                  filterChar={(c) => /^\d$/.test(c)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">{t('tournBracketModalRoundBoardsHint')}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setLegsModalOpen(false)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                {t('tournBracketModalCancel')}
              </button>
              <button
                type="button"
                onClick={saveRoundSettingsModal}
                className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                {t('tournBracketModalSaveChanges') || t('tournBracketModalSave')}
              </button>
            </div>
          </div>
        </div>
      )}
      {boardModal && (
        <BracketModal
          title={t('tournBracketModalBoardTitle')}
          hint={t('tournBracketModalBoardHint')}
          value={boardModal.input}
          onChange={(v) => setBoardModal((prev) => (prev ? { ...prev, input: v } : null))}
          onSave={saveBoardModal}
          onClose={() => setBoardModal(null)}
          saveLabel={t('tournBracketModalSave')}
          cancelLabel={t('tournBracketModalCancel')}
          extraActionLabel={t('tournAutoBoard') || 'AUTO'}
          onExtraAction={setBoardModalAuto}
        />
      )}
      {playerSlotModal && (
        <div
          className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setPlayerSlotModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-4 sm:p-5 animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-lg font-black text-white tracking-tight">
                {playerSlotModal.slot === 1
                  ? t('tournBracketAssignPlayer1') || 'Doplnit hráče (levý slot)'
                  : t('tournBracketAssignPlayer2') || 'Doplnit hráče (pravý slot)'}
              </h3>
              <button
                type="button"
                onClick={() => setPlayerSlotModal(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label={t('tournBracketModalCancel')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {t('tournBracketAssignPlayerHint') ||
                'Použijte při chybějící propagaci z předchozího kola. Po uložení se znovu dopočítají navazující zápasy.'}
            </p>
            <select
              value={playerSlotModal.selectedId}
              onChange={(e) =>
                setPlayerSlotModal((prev) => (prev ? { ...prev, selectedId: e.target.value } : null))
              }
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
            >
              <option value="">{t('tournSelectPlayer') || '— Vyberte hráče —'}</option>
              {allTournamentPlayers.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setPlayerSlotModal(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                {t('tournBracketModalCancel')}
              </button>
              <button
                type="button"
                onClick={savePlayerSlotModal}
                className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                {t('tournBracketModalSave') || 'Uložit'}
              </button>
            </div>
          </div>
        </div>
      )}
      {refereeModal && (
        <div
          className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setRefereeModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-4 sm:p-5 animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-lg font-black text-white tracking-tight">
                {t('tournEditScorer') || 'Upravit počtáře'}
              </h3>
              <button
                type="button"
                onClick={() => setRefereeModal(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label={t('tournBracketModalCancel')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {t('tournSelectScorer') || 'Vyberte počtáře pro tento zápas'}
            </p>
            <input
              type="text"
              value={refereeSearch}
              onChange={(e) => setRefereeSearch(e.target.value)}
              placeholder={t('refereeSearchPlaceholder') || 'Začněte psát jméno…'}
              className="w-full mb-3 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
              autoComplete="off"
              inputMode="text"
            />
            <select
              value={refereeModal.selectedId}
              onChange={(e) => {
                const id = e.target.value;
                const p = allTournamentPlayers.find((x) => String(x.id) === id);
                setRefereeModal((prev) =>
                  prev
                    ? {
                        ...prev,
                        selectedId: id,
                        customName: p ? String(p.name) : '',
                      }
                    : null
                );
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                saveRefereeModal();
              }}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
            >
              <option value="">{t('tournSelectScorer') || '— Vyberte počtáře —'}</option>
              {suggestedRefs.length > 0 && (
                <optgroup label={t('refereeSuggestedGroup') || 'Doporučení (vlna)'}>
                  {suggestedRefs.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      ★ {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t('refereeAvailableGroup') || 'Dostupní'}>
                {(filteredAvailableRefs || []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('refereePlayingGroup') || 'Hrající v tomto kole'}>
                {(filteredBusyRefs || []).map((p) => (
                  <option
                    key={p.id}
                    value={String(p.id)}
                    disabled
                    title={t('playerIsPlaying') || 'Hraje'}
                  >
                    {p.name} ({t('playerIsPlaying') || 'Hraje'})
                  </option>
                ))}
              </optgroup>
            </select>
            <div className="mt-4">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                {t('tournRefereeDisplayName') || 'Jméno u zápasu (úprava)'}
              </label>
              <AdminTapTextField
                value={refereeModal.customName ?? ''}
                onValueChange={(v) =>
                  setRefereeModal((prev) => (prev ? { ...prev, customName: v } : null))
                }
                onEnterPress={saveRefereeModal}
                placeholder={t('tournRefereeNamePlaceholder') || 'Volitelně upravte zobrazené jméno'}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
              />
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setRefereeModal(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                {t('tournBracketModalCancel')}
              </button>
              <button
                type="button"
                onClick={saveRefereeModal}
                className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                {t('tournBracketModalSave') || 'Uložit'}
              </button>
            </div>
          </div>
        </div>
      )}
      {walkoverModal && onBracketWalkover && isAdmin && (
        <div
          className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="walkover-modal-title"
          onClick={() => setWalkoverModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-4 sm:p-5 animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3
                id="walkover-modal-title"
                className="text-lg font-black text-white tracking-tight pr-2"
              >
                {t('whoWinsWalkover') || 'Kdo postupuje kontumačně?'}
              </h3>
              <button
                type="button"
                onClick={() => setWalkoverModal(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                aria-label={t('tournBracketModalCancel')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onBracketWalkover(
                    walkoverModal.roundIndex,
                    walkoverModal.matchIndex,
                    walkoverModal.match.player1Id
                  );
                  setWalkoverModal(null);
                }}
                className="w-full py-3 rounded-xl font-bold text-left px-4 bg-slate-800 border border-slate-600 text-slate-100 hover:bg-slate-700 transition-colors truncate"
              >
                {walkoverModal.match.player1Name ?? walkoverModal.match.player1Id}
              </button>
              <button
                type="button"
                onClick={() => {
                  onBracketWalkover(
                    walkoverModal.roundIndex,
                    walkoverModal.matchIndex,
                    walkoverModal.match.player2Id
                  );
                  setWalkoverModal(null);
                }}
                className="w-full py-3 rounded-xl font-bold text-left px-4 bg-slate-800 border border-slate-600 text-slate-100 hover:bg-slate-700 transition-colors truncate"
              >
                {walkoverModal.match.player2Name ?? walkoverModal.match.player2Id}
              </button>
            </div>
            {typeof onBracketWithdrawPlayer === 'function' && (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
                <p className="text-[11px] text-amber-200/90 leading-snug mb-2">
                  {t('tournWithdrawPlayerFromBracket') ||
                    'Odhlásit hráče z pavouku: zbylé zápasy se zkontumují (0:W).'}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onBracketWithdrawPlayer(walkoverModal.match.player1Id);
                      setWalkoverModal(null);
                    }}
                    className="w-full py-3 rounded-xl font-black text-left px-4 bg-amber-950/40 border border-amber-500/40 text-amber-100 hover:bg-amber-950/60 transition-colors truncate"
                  >
                    {t('withdraw') || 'Odhlásit'}: {walkoverModal.match.player1Name ?? walkoverModal.match.player1Id}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onBracketWithdrawPlayer(walkoverModal.match.player2Id);
                      setWalkoverModal(null);
                    }}
                    className="w-full py-3 rounded-xl font-black text-left px-4 bg-amber-950/40 border border-amber-500/40 text-amber-100 hover:bg-amber-950/60 transition-colors truncate"
                  >
                    {t('withdraw') || 'Odhlásit'}: {walkoverModal.match.player2Name ?? walkoverModal.match.player2Id}
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setWalkoverModal(null)}
              className="w-full mt-3 py-3 rounded-xl font-bold text-slate-400 bg-slate-800/50 border border-slate-700 hover:bg-slate-800 transition-colors"
            >
              {t('tournBracketModalCancel')}
            </button>
          </div>
        </div>
      )}

      <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400">
        {t('tournBracketTitle') || 'Vyřazovací pavouk'}
      </h2>

      <div className="flex overflow-x-auto whitespace-nowrap gap-2 p-4 bg-slate-900 border-b border-slate-800 rounded-xl">
        {(bracketData ?? []).map((round, index) => {
          const isActive = index === activeRoundIndex;
          const roundName = getRoundName(index, totalRounds, t, prelimLegs);
          const roundLegs =
            round.matches?.[0]?.winLegs ??
            getBracketWinLegsForRound(index, bracketBaseLegs, prelimLegs);
          const sub = formatLegsWinPhrase(roundLegs, lang);
          return (
            <button
              key={round.round}
              type="button"
              onClick={() => setActiveRoundIndex(index)}
              onMouseDown={isActive && isAdmin ? handlePressStart : undefined}
              onMouseUp={isActive && isAdmin ? handlePressEnd : undefined}
              onMouseLeave={isActive && isAdmin ? handlePressEnd : undefined}
              onTouchStart={isActive && isAdmin ? handlePressStart : undefined}
              onTouchEnd={isActive && isAdmin ? handlePressEnd : undefined}
              className={`shrink-0 flex flex-col items-center justify-center px-4 py-2.5 rounded-lg text-left min-w-[7rem] transition-colors select-none touch-manipulation ${
                isActive ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span className="text-sm font-bold leading-tight">{roundName}</span>
              <span
                className={`text-[10px] mt-0.5 leading-tight font-medium ${
                  isActive ? 'text-white/90' : 'text-slate-500'
                }`}
              >
                {sub}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-lg font-black text-slate-100 truncate">{activeRoundTitle}</h3>
          {isAdmin && (
          <button
            type="button"
            onClick={openLegsModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors shrink-0"
            aria-label={t('tournBracketChangeFormat')}
          >
            <Settings className="w-5 h-5" />
          </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 px-1 font-medium">
        <span className="text-slate-500">{t('tournBracketFormat')}: </span>
        {formatSummary}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto w-full">
        {matches.map((match, matchIndex) => {
          const isBye = isByeMatch(match);
          const isTba =
            (match.player1Id == null || match.player2Id == null) &&
            match.status === 'pending' &&
            !isBye;
          const canStart =
            !isBye && !isTba && match.status === 'pending' && match.player1Id && match.player2Id;

          const displayName1 = match.player1Name ?? (match.player1Id ? '?' : null);
          const displayName2 = match.player2Name ?? (match.player2Id ? '?' : null);
          const tbaText = t('tournBracketWaitingOpponent');
          const byeText = t('tournBracketByeAdvance');

          if (isBye) {
            const winnerName =
              match.player1Name === BYE_MARKER ? match.player2Name : match.player1Name;
            return (
              <div
                key={match.id}
                className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/40 text-slate-500"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] text-slate-500">
                  <MatchStatusLabel match={match} />
                  <BoardChip roundIndex={activeRoundIndex} match={match} disabled readOnly={!isAdmin} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 text-sm font-medium text-slate-400 truncate">{winnerName}</div>
                  <span className="text-slate-600 font-mono text-sm shrink-0">—</span>
                  <div className="text-[11px] text-slate-600 shrink-0 max-w-[4rem] truncate">{BYE_MARKER}</div>
                </div>
                <p className="text-[10px] mt-1.5 text-slate-500">{byeText}</p>
              </div>
            );
          }

          if (isTba) {
            const name1 = match.player1Id != null ? (displayName1 ?? '?') : tbaText;
            const name2 = match.player2Id != null ? (displayName2 ?? '?') : tbaText;
            return (
              <div key={match.id} className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/60">
                <p className="text-[10px] text-slate-500 mb-1">{matchNumLabel(matchIndex)}</p>
                <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] text-slate-500">
                  <MatchStatusLabel match={match} />
                  <BoardChip roundIndex={activeRoundIndex} match={match} disabled={false} readOnly={!isAdmin} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                    <span className="text-sm font-semibold text-slate-300 truncate leading-tight">{name1}</span>
                    <span className="text-sm font-semibold text-slate-300 truncate leading-tight">{name2}</span>
                  </div>
                  <div className="shrink-0 w-12 text-center font-mono text-slate-600 text-sm">—</div>
                  <div className="shrink-0 w-[4.5rem]" />
                </div>
                <RefereeRow match={match} roundIndex={activeRoundIndex} matchIndex={matchIndex} />
                {isAdmin &&
                  typeof onManualBracketPlayerSlot === 'function' &&
                  allTournamentPlayers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {match.player1Id == null && (
                        <button
                          type="button"
                          onClick={() =>
                            setPlayerSlotModal({
                              roundIndex: activeRoundIndex,
                              matchIndex,
                              slot: 1,
                              selectedId: '',
                            })
                          }
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 border border-slate-600"
                        >
                          {t('tournBracketAssignPlayer1') || 'Doplnit hráče 1'}
                        </button>
                      )}
                      {match.player2Id == null && (
                        <button
                          type="button"
                          onClick={() =>
                            setPlayerSlotModal({
                              roundIndex: activeRoundIndex,
                              matchIndex,
                              slot: 2,
                              selectedId: '',
                            })
                          }
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 border border-slate-600"
                        >
                          {t('tournBracketAssignPlayer2') || 'Doplnit hráče 2'}
                        </button>
                      )}
                    </div>
                  )}
              </div>
            );
          }

          const isCompleted = match.status === 'completed';
          const isPlaying = match.status === 'playing';
          const isTabletTimeout = match.tabletStatus === 'timeout_warning';
          const canWalkover =
            isAdmin &&
            typeof onBracketWalkover === 'function' &&
            (match.status === 'pending' ||
              match.status === 'playing' ||
              match.status === 'in_progress') &&
            !!match.player1Id &&
            !!match.player2Id;
          const showAvg = isCompleted || isPlaying;
          const p1Avg = showAvg
            ? Number(match.p1Avg ?? match.result?.p1Avg ?? match.p1Average ?? 0)
            : null;
          const p2Avg = showAvg
            ? Number(match.p2Avg ?? match.result?.p2Avg ?? match.p2Average ?? 0)
            : null;
          const cardClasses = isTabletTimeout
            ? 'border-red-500 ring-2 ring-red-500/70 bg-red-950/35 shadow-[0_0_24px_rgba(239,68,68,0.2)] animate-pulse'
            : isCompleted
              ? 'border-slate-700 bg-slate-800/40'
              : isPlaying
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800/50';

          return (
            <div key={match.id} className={`p-2.5 rounded-xl border transition-all ${cardClasses}`}>
              <p className="text-[10px] text-slate-500 mb-1">{matchNumLabel(matchIndex)}</p>
              {isTabletTimeout && (
                <div className="flex items-center gap-1.5 text-red-400 font-black text-[10px] uppercase tracking-wider mb-1.5">
                  <Bell className="w-3.5 h-3.5 shrink-0 text-red-500" aria-hidden />
                  {t('tournTabletTimeoutAlert') || 'ČAS VYPRŠEL!'}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] text-slate-500">
                <MatchStatusLabel match={match} />
                <div className="flex items-center gap-1 shrink-0">
                  {canWalkover && (
                    <button
                      type="button"
                      onClick={() =>
                        setWalkoverModal({
                          roundIndex: activeRoundIndex,
                          matchIndex,
                          match,
                        })
                      }
                      className="p-1.5 rounded-lg text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/15 border border-transparent hover:border-amber-500/30 transition-colors"
                      title={t('walkoverMatch') || 'Kontumovat zápas'}
                      aria-label={t('walkoverMatch') || 'Kontumovat zápas'}
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  )}
                  <BoardChip roundIndex={activeRoundIndex} match={match} disabled={false} readOnly={!isAdmin} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                  <div className="flex justify-between items-center whitespace-nowrap gap-2">
                    <span className="text-sm font-semibold text-slate-100 truncate leading-tight">
                      {displayName1 ?? '?'}
                    </span>
                    {showAvg && Number.isFinite(p1Avg) && p1Avg > 0 && (
                      <span
                        className="ml-2 text-yellow-400 font-bold text-xs whitespace-nowrap truncate"
                        title="Průměr v zápase"
                      >
                        (Ø {p1Avg.toFixed(2)})
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center whitespace-nowrap gap-2">
                    <span className="text-sm font-semibold text-slate-100 truncate leading-tight">
                      {displayName2 ?? '?'}
                    </span>
                    {showAvg && Number.isFinite(p2Avg) && p2Avg > 0 && (
                      <span
                        className="ml-2 text-yellow-400 font-bold text-xs whitespace-nowrap truncate"
                        title="Průměr v zápase"
                      >
                        (Ø {p2Avg.toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 w-20 md:w-24 flex flex-col items-center justify-center">
                  {isCompleted && match.score ? (
                    <span className="text-3xl font-black font-mono text-emerald-400 tabular-nums leading-none">
                      {match.score.p1 ?? 0}:{match.score.p2 ?? 0}
                    </span>
                  ) : (
                    <span className="text-slate-600 font-mono text-sm">—</span>
                  )}
                </div>
                <div className="shrink-0 w-[4.5rem] flex items-center justify-end">
                  {canStart && isAdmin && (
                    <button
                      type="button"
                      onClick={() => onStartMatch?.(match, activeRoundIndex)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg font-black bg-emerald-600 text-white hover:bg-emerald-500 text-[10px] uppercase tracking-wide"
                    >
                      <Play className="w-3.5 h-3.5 shrink-0 fill-current" />
                      {t('tournBracketPlayUpper')}
                    </button>
                  )}
                  {isPlaying && (
                    <span className="text-emerald-400 text-[9px] font-bold uppercase text-right leading-tight">
                      {t('tournPlaying')}
                    </span>
                  )}
                </div>
              </div>
              <RefereeRow match={match} roundIndex={activeRoundIndex} matchIndex={matchIndex} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
