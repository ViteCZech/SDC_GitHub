import React, { useState, useMemo, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { distributePlayersToFixedGroups } from '../utils/tournamentGenerator';
import { isTournamentBracketOnlyFormat } from '../utils/tournamentLogic';
import { translations } from '../translations';
import { AdminTapTextField } from './AdminTapField';
import StickyActionBar from './StickyActionBar';
import { useAdminVirtualKeyboardOptional } from '../context/AdminVirtualKeyboardContext';

const EMPTY_BOARD_ASSIGNMENTS = {};

function parseBoardInput(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

/** Různá čísla terčů napříč skupinami (po validním rozsahu 1…totalBoards). */
function distinctBoardNumbers(boardInputs, groups, totalBoardsCap) {
  const set = new Set();
  for (const g of groups) {
    const raw = boardInputs[g.groupId] ?? '';
    for (const b of parseBoardInput(raw)) {
      if (totalBoardsCap > 0 && b > totalBoardsCap) continue;
      set.add(b);
    }
  }
  return set;
}

/** Mapa terč → seznam groupId, které ho používají. */
function boardToGroupsMap(boardInputs, groups, totalBoardsCap = 0) {
  const map = new Map();
  for (const g of groups) {
    const raw = boardInputs[g.groupId] ?? boardInputs[String(g.groupId)] ?? '';
    for (const b of parseBoardInput(raw)) {
      if (totalBoardsCap > 0 && b > totalBoardsCap) continue;
      if (!map.has(b)) map.set(b, []);
      map.get(b).push(g.groupId);
    }
  }
  return map;
}

function findSharedBoards(boardInputs, groups, totalBoardsCap = 0) {
  const entries = [];
  for (const [board, groupIds] of boardToGroupsMap(boardInputs, groups, totalBoardsCap)) {
    if (groupIds.length > 1) entries.push({ board, groupIds: [...groupIds].sort() });
  }
  entries.sort((a, b) => a.board - b.board);
  return entries;
}

function groupSharedBoards(boardInputs, groupId, groups, totalBoardsCap = 0) {
  const mine = parseBoardInput(boardInputs[groupId] ?? '');
  if (mine.length === 0) return [];
  const map = boardToGroupsMap(boardInputs, groups, totalBoardsCap);
  return mine.filter((b) => (map.get(b)?.length ?? 0) > 1);
}

function groupInputIsEmpty(boardInputs, groupId) {
  const raw = String(boardInputs[groupId] ?? '').trim();
  if (raw === '') return true;
  return parseBoardInput(raw).length === 0;
}

export default function TournamentBoardAssignment({
  tournamentData,
  tournamentDraft,
  setTournamentDraft,
  onUpdateGroupBoard,
  lang = 'cs',
  onComplete,
}) {
  const t = (k) => translations[lang]?.[k] ?? k;
  const vkOpt = useAdminVirtualKeyboardOptional();

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
  const [dupConfirmOpen, setDupConfirmOpen] = useState(false);
  const totalBoards = Number(tournamentData?.totalBoards ?? tournamentData?.numBoards ?? 0) || 0;

  const distinctUsed = useMemo(
    () => distinctBoardNumbers(boardInputs, groups, totalBoards),
    [boardInputs, groups, totalBoards]
  );
  const distinctCount = distinctUsed.size;

  const sharedBoards = useMemo(
    () => findSharedBoards(boardInputs, groups, totalBoards),
    [boardInputs, groups, totalBoards]
  );
  const sharedBoardNumberSet = useMemo(
    () => new Set(sharedBoards.map((s) => s.board)),
    [sharedBoards]
  );

  const capacityReached =
    totalBoards > 0 && distinctCount >= totalBoards && groups.some((g) => groupInputIsEmpty(boardInputs, g.groupId));

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
      setValidationError('');
      return;
    }

    const nextInputs = { ...boardInputs, [groupId]: value };
    const proposedDistinct = distinctBoardNumbers(nextInputs, groups, totalBoards);
    if (totalBoards > 0 && proposedDistinct.size > totalBoards) {
      setBoardInputErrors((prev) => ({
        ...prev,
        [groupId]: (t('tournBoardErrTooManyDistinct') || 'Překročen počet různých aktivních terčů oproti nastavení turnaje.'),
      }));
      setValidationError(
        String(
          t('tournBoardErrTooManyDistinctGlobal') ||
            'Nelze použít více než {n} různých terčů současně. Uvolněte terč (smažte přiřazení u skupiny), nebo počkejte ve frontě.'
        ).replace(/\{n\}/g, String(totalBoards))
      );
      return;
    }

    setBoardInputErrors((prev) => ({ ...prev, [groupId]: '' }));
    setValidationError('');
    setBoardInputs(nextInputs);
    setTournamentDraft?.((d) => ({
      ...d,
      boardAssignments: {
        ...(d.boardAssignments || {}),
        [groupId]: value,
      },
    }));

    if (typeof onUpdateGroupBoard === 'function' && tournamentData?.groups?.length) {
      const boards = value.trim() === '' ? [] : parseBoardInput(value);
      onUpdateGroupBoard(groupId, boards);
    }
  };

  const toggleBoardChip = (groupId, boardNum, fieldLocked) => {
    if (fieldLocked) return;
    const raw = String(boardInputs[groupId] ?? '').trim();
    const current = raw === '' ? [] : parseBoardInput(raw);
    const set = new Set(current);
    if (set.has(boardNum)) set.delete(boardNum);
    else set.add(boardNum);
    const next = [...set].sort((a, b) => a - b).join(', ');
    handleBoardChange(groupId, next);
  };

  const validateAndSubmit = (forceDupOk = false) => {
    setValidationError('');
    setDupConfirmOpen(false);
    const hasInputErrors = Object.values(boardInputErrors).some(Boolean);
    if (hasInputErrors) {
      setValidationError(t('tournBoardErrFixRange') || 'Opravte neplatná čísla terčů před pokračováním.');
      return;
    }
    if (totalBoards > 0 && distinctCount > totalBoards) {
      setValidationError(
        String(
          t('tournBoardErrTooManyDistinctGlobal') ||
            'Současně je použito více než {n} různých terčů. Upravte přiřazení.'
        ).replace(/\{n\}/g, String(totalBoards))
      );
      return;
    }
    if (!forceDupOk && sharedBoards.length > 0) {
      setDupConfirmOpen(true);
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
      <div className="w-full max-w-[98vw] xl:max-w-7xl mx-auto px-2 sm:px-4 py-4 pb-24">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400">
              {t('tournBoardAssignmentStepTitle') || 'Krok 4 - Přiřazení terčů'}{' '}
              <span className="text-sm font-bold normal-case text-slate-300">
                ({t('tournBoardsCounter') || 'Terče celkem'}: {totalBoards} / {t('tournBoardsDistinctUsed') || 'Aktivních různých'}: {distinctCount})
              </span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {t('tournBoardAssignmentDescExtended') || 'Přiřaďte každé skupině čísla terčů (např. 1 nebo 1, 2). Prázdné = skupina čeká ve frontě. Jedné skupině můžete přiřadit i více terčů najednou (např. "1, 2"). Zápasy se mezi ně rozdělí.'}
            </p>
            <p className="text-emerald-300/90 text-sm mt-2">
              {t('tournBoardDoublesHint')}
            </p>
            {capacityReached ? (
              <div
                className="mt-2 p-3 rounded-lg bg-amber-900/35 border border-amber-500/50 text-amber-200 text-sm font-bold"
                role="alert"
              >
                {String(
                  t('tournBoardsCapReachedQueue') ||
                    'Je obsazeno všech {n} různých terčů z nastavení turnaje. Skupiny bez přiřazení čekají na uvolnění — jejich pole jsou zablokována.'
                ).replace(/\{n\}/g, String(totalBoards))}
              </div>
            ) : null}
            {sharedBoards.length > 0 && (
              <div
                className="mt-2 p-3 rounded-lg bg-amber-950/50 border border-amber-500/40 text-amber-100 text-sm"
                role="alert"
              >
                <p className="font-bold mb-1.5">
                  {t('tournBoardDupBanner') || 'Upozornění — stejný terč u více skupin:'}
                </p>
                <ul className="space-y-1 text-xs font-mono">
                  {sharedBoards.map(({ board, groupIds }) => (
                    <li key={board}>
                      {(t('tournBoardDupWarningLine') || 'Terč {board}: Skupiny {groups}')
                        .replace(/\{board\}/g, String(board))
                        .replace(/\{groups\}/g, groupIds.join(', '))}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-200/80 mt-2 leading-snug">
                  {t('tournBoardDupHint') ||
                    'Sdílení terče je v pořádku při střídání (skupiny nehrají současně). Při spuštění turnaje budete vyzváni k potvrzení.'}
                </p>
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <button
              onClick={() => validateAndSubmit()}
              className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500`}
            >
              {t('tournStartTournament') || 'Spustit turnaj'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group) => {
            const gid = group.groupId;
            const fieldLocked =
              totalBoards > 0 &&
              distinctCount >= totalBoards &&
              groupInputIsEmpty(boardInputs, gid);
            const displayValue = boardInputs[gid] ?? '';
            const sharedHere = groupSharedBoards(boardInputs, gid, groups, totalBoards);
            return (
            <div
              key={gid}
              className="p-4 rounded-xl bg-slate-800 border border-slate-700"
            >
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="font-bold text-slate-100">
                    {t('tournGroup') || 'Skupina'} {gid} – {group.players.length}{' '}
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
                    id={`board-input-${gid}`}
                    value={displayValue}
                    onValueChange={(v) => handleBoardChange(gid, v)}
                    onEnterPress={() => {
                      const idx = groups.findIndex((g) => g.groupId === gid);
                      const next = idx >= 0 ? groups[idx + 1] : null;
                      if (!next) return;
                      vkOpt?.closeKeyboard?.();
                      requestAnimationFrame(() => {
                        const el = document.getElementById(`board-input-${next.groupId}`);
                        if (el) {
                          el.focus();
                          el.click();
                        }
                      });
                    }}
                    filterChar={(c) => /[\d,;\s]/.test(c)}
                    placeholder={t('tournBoardPlaceholderQueue') || "např. 1 (prázdné = fronta)"}
                    disabled={fieldLocked}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {fieldLocked ? (
                    <p className="mt-1 text-xs text-amber-400 font-bold">
                      {t('tournBoardFieldLockedQueue') || 'Čeká na uvolněný terč — nejdřív uvolněte číslo u jiné skupiny.'}
                    </p>
                  ) : null}
                  {boardInputErrors[gid] && (
                    <p className="mt-1 text-xs text-amber-400 font-bold">
                      {boardInputErrors[gid]}
                    </p>
                  )}
                  {!boardInputErrors[gid] && sharedHere.length > 0 && (
                    <p className="mt-1 text-xs text-amber-400 font-bold">
                      {(t('tournBoardDupFieldHint') || 'Terč {boards} sdílíte s jinou skupinou — ověřte střídání.')
                        .replace(/\{boards\}/g, sharedHere.join(', '))}
                    </p>
                  )}
                  {totalBoards > 0 && !fieldLocked && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Array.from({ length: totalBoards }, (_, i) => i + 1).map((b) => {
                        const selected = parseBoardInput(displayValue).includes(b);
                        const isShared = selected && sharedBoardNumberSet.has(b);
                        return (
                          <button
                            key={b}
                            type="button"
                            onClick={() => toggleBoardChip(gid, b, fieldLocked)}
                            className={`min-w-[40px] min-h-[36px] px-2 rounded-lg text-sm font-bold font-mono border transition-colors ${
                              isShared
                                ? 'bg-amber-600 border-amber-400 text-white'
                                : selected
                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            T{b}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {validationError && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/30 border border-red-500/50 text-red-400 text-sm font-bold">
            {validationError}
          </div>
        )}

      </div>

      <StickyActionBar>
        <button
          type="button"
          onClick={() => validateAndSubmit()}
          className={`${btnBase} w-full bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500`}
        >
          {t('tournStartTournament') || 'Spustit turnaj'}
          <ArrowRight className="w-5 h-5" />
        </button>
      </StickyActionBar>

      {dupConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="board-dup-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-amber-500/50 p-5 shadow-xl">
            <h3 id="board-dup-confirm-title" className="text-lg font-black text-amber-300 mb-2">
              {t('tournBoardDupConfirmTitle') || 'Sdílený terč mezi skupinami'}
            </h3>
            <p className="text-sm text-slate-300 mb-3">
              {t('tournBoardDupConfirmMessage') ||
                'Některé terče jsou přiřazeny více skupinám. Skupiny by se měly střídat, ne hrát souběžně na stejném terči.'}
            </p>
            <ul className="text-xs font-mono text-amber-200/90 mb-4 space-y-1">
              {sharedBoards.map(({ board, groupIds }) => (
                <li key={board}>
                  T{board} → {t('tournGroup') || 'Skupina'} {groupIds.join(', ')}
                </li>
              ))}
            </ul>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setDupConfirmOpen(false)}
                className={`${btnBase} flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200`}
              >
                {t('cancel') || 'Zrušit'}
              </button>
              <button
                type="button"
                onClick={() => validateAndSubmit(true)}
                className={`${btnBase} flex-1 bg-amber-600 hover:bg-amber-500 text-white border-amber-500`}
              >
                {t('tournBoardDupConfirmProceed') || 'Spustit i přesto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
