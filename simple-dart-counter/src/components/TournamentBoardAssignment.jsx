import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { distributePlayersToFixedGroups } from '../utils/tournamentGenerator';
import { isTournamentBracketOnlyFormat } from '../utils/tournamentLogic';
import { translations } from '../translations';
import { AdminTapTextField } from './AdminTapField';

const EMPTY_BOARD_ASSIGNMENTS = {};

function parseBoardInput(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

export default function TournamentBoardAssignment({
  tournamentData,
  tournamentDraft,
  setTournamentDraft,
  tournamentMatches = [],
  onUpdateGroupBoard,
  lang = 'cs',
  onComplete,
  onBack,
}) {
  const t = (k) => translations[lang]?.[k] ?? k;

  const draftBoards = tournamentDraft?.boardAssignments ?? EMPTY_BOARD_ASSIGNMENTS;
  const persistedBoards = tournamentData?.boardAssignments ?? EMPTY_BOARD_ASSIGNMENTS;

  const groups = useMemo(() => {
    if (!tournamentData?.players?.length) return [];
    const playersWithIds = tournamentData.players.map((p, i) => ({
      ...p,
      id: p.id ?? `p${i + 1}`,
    }));
    const numGroups = tournamentData.numGroups ?? Math.max(1, Math.ceil(playersWithIds.length / 4));
    const computed = distributePlayersToFixedGroups(playersWithIds, numGroups);
    const existingGroups = tournamentData.groups ?? [];
    return computed.map((g) => {
      const existing = existingGroups.find((eg) => eg.groupId === g.groupId);
      return { ...g, boards: existing?.boards ?? g.boards ?? [] };
    });
  }, [tournamentData?.players, tournamentData?.numGroups, tournamentData?.groups]);

  const [boardInputs, setBoardInputs] = useState({});
  const [validationError, setValidationError] = useState('');
  const [boardInputErrors, setBoardInputErrors] = useState({});
  const totalBoards = Number(tournamentData?.totalBoards ?? tournamentData?.numBoards ?? 0) || 0;
  const assignedCount = useMemo(() => {
    const set = new Set();
    for (const raw of Object.values(boardInputs)) {
      for (const b of parseBoardInput(raw)) {
        if (totalBoards <= 0 || b <= totalBoards) set.add(b);
      }
    }
    return set.size;
  }, [boardInputs, totalBoards]);

  useEffect(() => {
    if (groups.length === 0) return;
    setBoardInputs((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        const gid = g.groupId;
        let stored = draftBoards[gid] ?? draftBoards[String(gid)];
        if (stored === undefined) {
          stored = persistedBoards[gid] ?? persistedBoards[String(gid)];
        }
        if (stored === undefined) {
          const boards = g.boards;
          stored = Array.isArray(boards) && boards.length > 0 ? boards.join(', ') : '';
        }
        next[gid] = typeof stored === 'string' ? stored : (Array.isArray(stored) ? stored.join(', ') : String(stored ?? ''));
      }
      return next;
    });
    setBoardInputErrors({});
  }, [groups, draftBoards, persistedBoards]);

  const handleBoardChange = (groupId, value) => {
    const parsed = parseBoardInput(value);
    const hasOutOfRange = totalBoards > 0 && parsed.some((n) => n > totalBoards);
    if (hasOutOfRange) {
      setBoardInputErrors((prev) => ({
        ...prev,
        [groupId]: (t('tournBoardErrMax') || 'Zadané číslo terče je vyšší než celkový počet dostupných terčů.'),
      }));
    } else {
      setBoardInputErrors((prev) => ({ ...prev, [groupId]: '' }));
    }
    setBoardInputs((prev) => ({ ...prev, [groupId]: value }));
    setValidationError('');
    setTournamentDraft?.((d) => ({
      ...d,
      boardAssignments: {
        ...(d.boardAssignments || {}),
        [groupId]: value,
      },
    }));

    // Propis do live tournamentData – vždy (včetně prázdné hodnoty pro frontu)
    if (!hasOutOfRange && typeof onUpdateGroupBoard === 'function' && tournamentData?.groups?.length) {
      const boards = value.trim() === '' ? [] : parseBoardInput(value);
      onUpdateGroupBoard(groupId, boards);
    }
  };

  const validateAndSubmit = () => {
    setValidationError('');
    const hasInputErrors = Object.values(boardInputErrors).some(Boolean);
    if (hasInputErrors) {
      setValidationError(t('tournBoardErrFixRange') || 'Opravte neplatná čísla terčů před pokračováním.');
      return;
    }
    const groupBoards = {};
    const nextBoardAssignments = {};

    for (const g of groups) {
      const raw = boardInputs[g.groupId] ?? '';
      const boards = raw === '' ? [] : parseBoardInput(raw);
      groupBoards[g.groupId] = boards;
      nextBoardAssignments[g.groupId] = raw;
    }

    const groupsWithBoards = groups.map((g) => ({
      ...g,
      boards: groupBoards[g.groupId],
    }));

    onComplete?.({
      ...tournamentData,
      groups: groupsWithBoards,
      boardAssignments: nextBoardAssignments,
    });
  };

  if (!tournamentData) return null;

  if (isTournamentBracketOnlyFormat(tournamentData.tournamentFormat)) {
    return (
      <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950">
        <div className="w-full max-w-2xl mx-auto p-4 pb-24">
          <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-4">
            {tournamentData.name}
          </h2>
          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 mb-6">
            <p className="text-slate-400">
              {t('tournKoOnlyNoGroups') || 'Tento turnaj nemá skupinovou fázi. Pokračujte do KO pavouka.'}
            </p>
          </div>
          <button
            onClick={() => onComplete?.(tournamentData)}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500"
          >
            <ArrowRight className="w-5 h-5" /> {t('tournContinue')}
          </button>
        </div>
      </main>
    );
  }

  if (!groups.length) return null;

  const btnBase =
    'flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all active:scale-95 border border-slate-700';

  return (
    <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950">
      <div className="w-full max-w-[98vw] mx-auto px-2 sm:px-4 py-4 pb-24">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400">
              {t('tournBoardAssignmentStepTitle') || 'Krok 4 - Přiřazení terčů'}{' '}
              <span className="text-sm font-bold normal-case text-slate-300">
                ({t('tournBoardsCounter') || 'Terče celkem'}: {totalBoards} / {t('tournBoardsAssigned') || 'Přiřazeno'}: {assignedCount})
              </span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {t('tournBoardAssignmentDescExtended') || 'Přiřaďte každé skupině čísla terčů (např. 1 nebo 1, 2). Prázdné = skupina čeká ve frontě. Jedné skupině můžete přiřadit i více terčů najednou (např. "1, 2"). Zápasy se mezi ně rozdělí.'}
            </p>
            {totalBoards > 0 && assignedCount === totalBoards && (
              <div className="mt-2 p-3 rounded-lg bg-emerald-900/30 border border-emerald-500/40 text-emerald-300 text-sm font-bold">
                {t('tournBoardsAllAssignedInfo') || '✅ Rozdělili jste všechny dostupné terče. Dalším skupinám nechte pole prázdné (zařadí se do fronty), nebo jim přiřaďte již použité číslo terče pro střídání zápasů.'}
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <button
              onClick={onBack}
              className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}
            >
              <ArrowLeft className="w-5 h-5" /> {t('tournBack')}
            </button>
            <button
              onClick={validateAndSubmit}
              className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500`}
            >
              {t('tournStartTournament') || 'Spustit turnaj'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group, index) => (
            <div
              key={group.groupId}
              className="p-4 rounded-xl bg-slate-800 border border-slate-700"
            >
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="font-bold text-slate-100">
                    {t('tournGroup') || 'Skupina'} {group.groupId} – {group.players.length}{' '}
                    {group.players.length === 1
                      ? (t('tournPlayerSingular') || 'hráč')
                      : group.players.length < 5
                      ? (t('tournPlayersFew') || 'hráči')
                      : (t('tournPlayersMany') || 'hráčů')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {group.players.map((p) => p.name).join(', ')}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                    {t('tournBoardNumbers') || 'Čísla terčů'}
                  </label>
                  <AdminTapTextField
                    name="boardInput"
                    id={`board-input-${group.groupId}`}
                    value={(
                      draftBoards[group.groupId] ??
                      draftBoards[String(group.groupId)] ??
                      persistedBoards[group.groupId] ??
                      persistedBoards[String(group.groupId)] ??
                      ''
                    )}
                    onValueChange={(v) => handleBoardChange(group.groupId, v)}
                    filterChar={(c) => /[\d,;\s]/.test(c)}
                    placeholder={t('tournBoardPlaceholderQueue') || "např. 1 (prázdné = fronta)"}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-mono"
                  />
                  {boardInputErrors[group.groupId] && (
                    <p className="mt-1 text-xs text-amber-400 font-bold">
                      {boardInputErrors[group.groupId]}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {validationError && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/30 border border-red-500/50 text-red-400 text-sm font-bold">
            {validationError}
          </div>
        )}

        <div className="flex justify-between gap-2 mt-8 md:hidden">
          <button onClick={onBack} className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}>
            <ArrowLeft className="w-5 h-5" /> {t('tournBack')}
          </button>
          <button
            onClick={validateAndSubmit}
            className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500`}
          >
            {t('tournStartTournament') || 'Spustit turnaj'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </main>
  );
}
