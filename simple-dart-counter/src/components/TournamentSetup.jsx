import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, Cloud, Edit2, Target, Trash2, UserPlus } from 'lucide-react';
import { translations } from '../translations';
import { distributePlayersToFixedGroups } from '../utils/tournamentGenerator';
import {
  applyAdvancementPhrase,
  countPlayersAdvancingFromGroups,
  estimateTotalTournamentTime,
  generateTournamentVariants,
  getGroupAdvancementPhraseKey,
  GROUP_SIZE_MIN,
  isAllowedGroupSplit,
  isTournamentBracketOnlyFormat,
  isTournamentGroupsThenBracketFormat,
  listValidGroupCounts,
} from '../utils/tournamentLogic';
import { AdminTapTextField } from './AdminTapField';

/** Ranking z inputu: prázdné nebo 0 → null */
function parseRankingFromInput(val) {
  if (val === '' || val == null) return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function formatGroupComposition(playerCount, numGroups, t) {
  const n = Number(playerCount) || 0;
  const g = Math.max(1, Number(numGroups) || 1);
  const base = Math.floor(n / g);
  const remainder = n % g;
  const bigger = base + 1;
  if (remainder === 0) {
    return `${g} ${t('tournVariantGroupsOf') || 'skupin po'} ${base} ${t('tournPlayersFew') || 'hráčích'}`;
  }
  return `${remainder} ${t('tournVariantGroupsOf') || 'skupiny po'} ${bigger} ${t('tournPlayersFew') || 'hráčích'}, ${g - remainder} ${t('tournVariantGroupsOf') || 'skupiny po'} ${base} ${t('tournPlayersFew') || 'hráčích'}`;
}

export default function TournamentSetup({
  lang,
  step: controlledStep = 1,
  onStepChange,
  tournamentDraft,
  setTournamentDraft,
  onComplete,
  onBack,
  user,
  onGoogleLogin,
}) {
  const t = (k) => translations[lang]?.[k] || k;

  const step = controlledStep ?? 1;
  const setStep = (s) => { if (typeof onStepChange === 'function') onStepChange(s); };
  const [validationError, setValidationError] = useState('');
  const [notification, setNotification] = useState(null); // { message: string, type: 'error'|'success' }
  const notificationTimerRef = useRef(null);
  const showNotification = (message, type = 'error') => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    setNotification({ message: String(message ?? ''), type });
    notificationTimerRef.current = window.setTimeout(() => setNotification(null), 4000);
  };
  useEffect(() => () => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
  }, []);

  const [playerName, setPlayerName] = useState('');
  const [playerRanking, setPlayerRanking] = useState('');
  const [addConfirm, setAddConfirm] = useState(false);
  const [step2Error, setStep2Error] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRanking, setEditRanking] = useState('');

  const players = tournamentDraft.players || [];

  /** Master Out není podporován – stará hodnota se zobrazí jako DO */
  const effectiveOutMode =
    tournamentDraft.outMode === 'master'
      ? 'double'
      : (tournamentDraft.outMode ?? 'double');

  useEffect(() => {
    if (step !== 2 || editingIndex !== null) return;
    const t = window.setTimeout(() => {
      try {
        document.getElementById('tournament-player-name')?.focus?.();
      } catch (e) {}
    }, 0);
    return () => clearTimeout(t);
  }, [step, editingIndex]);

  useEffect(() => {
    if (
      isTournamentGroupsThenBracketFormat(tournamentDraft.format) &&
      tournamentDraft.bracketLegs < tournamentDraft.groupLegs
    ) {
      setTournamentDraft((prev) => ({ ...prev, bracketLegs: prev.groupLegs }));
    }
  }, [tournamentDraft.format, tournamentDraft.groupLegs, setTournamentDraft]);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setTournamentDraft((prev) => (prev.cloudEnabled ? { ...prev, cloudEnabled: false } : prev));
    }
  }, [user, setTournamentDraft]);

  const isLoggedIn = user && !user.isAnonymous;

  const stepLabels = {
    tournStep1: t('tournStep1') || 'Krok 1: Založení',
    tournStep2: t('tournStep2') || 'Krok 2: Registrace hráčů',
    tournStep3: 'KROK 3 - NASTAVENÍ SKUPIN A PAVOUKA',
  };

  const setupPinDisplay = String(tournamentDraft.pin ?? '').trim();
  const showSetupPin = /^\d{4}$/.test(setupPinDisplay);

  const validateStep1 = () => {
    setValidationError('');
    const name = (tournamentDraft.name || '').trim();
    if (!name) {
      setValidationError(t('tournErrName') || 'Název turnaje nesmí být prázdný.');
      return false;
    }
    return true;
  };

  const handleStep1Continue = () => {
    if (!validateStep1()) return;
    setStep(2);
    setValidationError('');
  };

  const isDuplicateName = (name, excludeIdx) =>
    players.some((p, i) => i !== excludeIdx && p.name.trim().toLowerCase() === name.trim().toLowerCase());

  const getDuplicateFlags = () => {
    const dupName = {};
    const names = players.map((p) => p.name.trim().toLowerCase());
    players.forEach((_, i) => {
      dupName[i] = names.filter((n, j) => j !== i && n === names[i]).length > 0;
    });
    return { dupName };
  };

  const hasAnyDuplicates = () => {
    const { dupName } = getDuplicateFlags();
    return Object.values(dupName).some(Boolean);
  };

  const handleAddPlayer = () => {
    setStep2Error('');
    const name = playerName.trim();
    if (!name) return;

    // Dev cheat-code: "16!" => vygeneruje 16 testovacích hráčů
    const match = name.match(/^(\d+)!$/);
    if (match) {
      const count = parseInt(match[1], 10);
      if (Number.isFinite(count) && count > 0) {
        const firstNames = [
          'Petr', 'Pavel', 'Karel', 'Jan', 'Lukas', 'Tomas', 'Martin', 'Milan', 'Jiri', 'David',
          'Michal', 'Roman', 'Filip', 'Radek', 'Vojta', 'Jakub', 'Adam', 'Ondrej',
        ];
        const lastNames = [
          'Novak', 'Svoboda', 'Dvorak', 'Cerny', 'Prochazka', 'Kral', 'Kucera', 'Vesely', 'Horak', 'Nemec',
        ];

        const generatedPlayers = Array.from({ length: count }, (_, i) => {
          const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
          const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
          const withRanking = Math.random() < 0.8;
          const ranking = withRanking ? Math.floor(Math.random() * 10) + 1 : null;
          const uid =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          return {
            id: uid,
            name: `${fn}_${ln}_${i + 1}`,
            ranking,
          };
        });

        setTournamentDraft((prev) => ({
          ...prev,
          players: [...(prev.players || []), ...generatedPlayers],
        }));
        setPlayerName('');
        setPlayerRanking('');
        return;
      }
    }

    const finalRanking = parseRankingFromInput(playerRanking);
    if (isDuplicateName(name, -1)) {
      setStep2Error(t('tournErrDupName') || 'Toto jméno je již přihlášeno.');
      return;
    }
    setTournamentDraft((prev) => ({
      ...prev,
      players: [...(prev.players || []), { name, ranking: finalRanking }],
    }));
    setPlayerName('');
    setPlayerRanking('');
    setAddConfirm(true);
    setTimeout(() => setAddConfirm(false), 1800);
  };

  const handleDeletePlayer = (idx) => {
    setTournamentDraft((prev) => ({
      ...prev,
      players: (prev.players || []).filter((_, i) => i !== idx),
    }));
    if (editingIndex === idx) setEditingIndex(null);
    else if (editingIndex !== null && editingIndex > idx) setEditingIndex((i) => i - 1);
  };

  const handleEditPlayer = (idx) => {
    setEditingIndex(idx);
    setEditName(players[idx].name);
    setEditRanking(players[idx].ranking != null ? String(players[idx].ranking) : '');
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    setStep2Error('');
    const name = editName.trim();
    if (!name) return;
    const finalRanking = parseRankingFromInput(editRanking);
    if (isDuplicateName(name, editingIndex)) {
      setStep2Error(t('tournErrDupName') || 'Toto jméno je již přihlášeno.');
      return;
    }
    setTournamentDraft((prev) => ({
      ...prev,
      players: (prev.players || []).map((p, i) => (i === editingIndex ? { name, ranking: finalRanking } : p)),
    }));
    setEditingIndex(null);
  };

  const advancePerGroup =
    tournamentDraft.advancePerGroup ?? (isTournamentBracketOnlyFormat(tournamentDraft.format) ? 'all' : 2);
  const setAdvancePerGroup = (v) =>
    setTournamentDraft((prev) => ({
      ...prev,
      advancePerGroup: v === 'all' ? 'all' : v,
      promotersCount: v === 'all' ? 'all' : v,
    }));
  const bracketKoLegs = tournamentDraft.bracketKoLegs ?? tournamentDraft.bracketLegs ?? 3;
  const setBracketKoLegs = (v) => setTournamentDraft((prev) => ({ ...prev, bracketKoLegs: v }));

  const variants = useMemo(() => generateTournamentVariants(players.length, Number(tournamentDraft.numBoards)), [players.length, tournamentDraft.numBoards]);
  const isCustomFormat = tournamentDraft.selectedVariantId === 'custom';
  const customNumGroups = Math.max(1, Math.min(99, Number(tournamentDraft.customNumGroups) || 4));
  const customAdvancePerGroup = Math.max(1, Math.min(99, Number(tournamentDraft.customAdvancePerGroup) || 2));
  const selectedVariant = useMemo(() => {
    if (tournamentDraft.selectedVariantId === 'custom') {
      const totalAdv = countPlayersAdvancingFromGroups(players.length, customNumGroups, customAdvancePerGroup);
      const isPower2 = (x) => x > 0 && (x & (x - 1)) === 0;
      return {
        id: 'custom',
        labelKey: 'tournVariantCustom',
        numGroups: customNumGroups,
        advancePerGroup: customAdvancePerGroup,
        totalAdvancees: totalAdv,
        needsBye: !isPower2(totalAdv),
      };
    }
    const v = tournamentDraft.selectedVariantId
      ? variants.find((x) => x.id === tournamentDraft.selectedVariantId)
      : variants[0];
    return v ?? variants[0];
  }, [variants, tournamentDraft.selectedVariantId, customNumGroups, customAdvancePerGroup, players.length]);

  const resolvedNumGroups =
    tournamentDraft.numGroups ?? selectedVariant?.numGroups ?? listValidGroupCounts(players.length)[0] ?? 1;

  const groups = useMemo(() => {
    if (!isTournamentGroupsThenBracketFormat(tournamentDraft.format) || players.length < GROUP_SIZE_MIN) return [];
    const playersWithIds = players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }));
    const numGroups =
      tournamentDraft.numGroups ?? selectedVariant?.numGroups ?? listValidGroupCounts(playersWithIds.length)[0] ?? 1;
    return distributePlayersToFixedGroups(playersWithIds, numGroups);
  }, [tournamentDraft.format, tournamentDraft.numGroups, selectedVariant, players]);

  const numBoards = Math.max(1, Math.min(99, Number(tournamentDraft.numBoards) || 2));
  const rawNumBoards = tournamentDraft.numBoards;

  const grpFmtStep = isTournamentGroupsThenBracketFormat(tournamentDraft.format);
  const fmtBracketOnly = isTournamentBracketOnlyFormat(tournamentDraft.format);
  const minPlayersRequired = grpFmtStep ? GROUP_SIZE_MIN : 2;

  const totalAdvancees = useMemo(() => {
    if (!grpFmtStep) return players.length;
    return countPlayersAdvancingFromGroups(players.length, resolvedNumGroups, advancePerGroup);
  }, [grpFmtStep, players.length, resolvedNumGroups, advancePerGroup]);

  const needsPrelim = useMemo(() => {
    if (totalAdvancees < 2) return false;
    return !Number.isInteger(Math.log2(totalAdvancees));
  }, [totalAdvancees]);
  const showByeWarning = needsPrelim;
  const customSplitOk = isAllowedGroupSplit(players.length, customNumGroups);
  const customMinGroup = customSplitOk ? Math.floor(players.length / customNumGroups) : 0;
  const customAdvanceOk = customAdvancePerGroup <= customMinGroup;
  const isCustomInvalid =
    isCustomFormat && grpFmtStep && (!customSplitOk || !customAdvanceOk);

  const timeEstimate = useMemo(() => {
    const fmt = isTournamentBracketOnlyFormat(tournamentDraft.format)
      ? 'bracket_only'
      : 'groups_bracket';
    const opts = {
      players,
      format: fmt,
      groupLegs: tournamentDraft.groupLegs,
      bracketLegs: bracketKoLegs,
    };
    const numGroupsForEst =
      tournamentDraft.numGroups ?? selectedVariant?.numGroups ?? listValidGroupCounts(players.length)[0];
    return estimateTotalTournamentTime(opts, {
      advancePerGroup,
      bracketKoLegs,
      numBoards,
      numGroups: numGroupsForEst,
    });
  }, [
    players,
    tournamentDraft.format,
    tournamentDraft.groupLegs,
    tournamentDraft.numGroups,
    selectedVariant?.numGroups,
    advancePerGroup,
    bracketKoLegs,
    numBoards,
  ]);

  /** Seřazení hráčů podle rankingu. */
  const getSortedPlayersForTournament = () =>
    [...players]
      .sort((a, b) => {
        const ra = a.ranking != null ? Number(a.ranking) : Infinity;
        const rb = b.ranking != null ? Number(b.ranking) : Infinity;
        return ra - rb;
      })
      .map((p) => ({ name: p.name, ranking: p.ranking }));

  const handleGenerate = () => {
    if (players.length < minPlayersRequired || hasAnyDuplicates() || isCustomInvalid) return;
    try {
      const parsedBoards = Number(tournamentDraft.numBoards);
      if (!Number.isFinite(parsedBoards) || parsedBoards <= 0) {
        setValidationError(t('tournNumBoardsRequired') || 'Zadejte platný počet dostupných terčů.');
        return;
      }
      setValidationError('');
      const pinToSave =
        (String(tournamentDraft.pin ?? '').trim() && /^\d{4}$/.test(String(tournamentDraft.pin).trim())
          ? String(tournamentDraft.pin).trim()
          : Math.floor(1000 + Math.random() * 9000).toString());
      const numGroups =
        tournamentDraft.numGroups ?? selectedVariant?.numGroups ?? listValidGroupCounts(players.length)[0] ?? 1;
      const advPerGroup = tournamentDraft.advancePerGroup ?? selectedVariant?.advancePerGroup ?? 2;
      const data = {
        name: (tournamentDraft.name || '').trim(),
        tournamentFormat: fmtBracketOnly ? 'bracket_only' : 'groups_bracket',
        groupsLegs: grpFmtStep ? (tournamentDraft.groupLegs ?? 2) : null,
        bracketLegs: bracketKoLegs,
        bracketKoLegs,
        advancePerGroup: fmtBracketOnly ? 'all' : advPerGroup === 'all' ? 'all' : Number(advPerGroup),
        numGroups: grpFmtStep ? numGroups : null,
        startScore: tournamentDraft.startScore ?? 501,
        outMode:
          tournamentDraft.outMode === 'master'
            ? 'double'
            : (tournamentDraft.outMode ?? 'double'),
        prelimLegs: needsPrelim ? (tournamentDraft.prelimLegs ?? 2) : null,
        numBoards: parsedBoards,
        totalBoards: parsedBoards,
        players: getSortedPlayersForTournament(),
        pin: pinToSave,
        cloudEnabled: !!tournamentDraft.cloudEnabled && isLoggedIn,
      };
      onComplete?.(data);
    } catch (error) {
      console.error(error);
      showNotification(
        'Kritická chyba při generování rozpisu. Zkontrolujte, zda parametry turnaje dávají smysl.',
        'error'
      );
    }
  };

  const btnBase =
    'flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all active:scale-95 border border-slate-700';
  const inputBase =
    'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500';

  return (
    <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950">
      {notification && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 border ${
            notification.type === 'error' ? 'border-red-600' : 'border-green-600'
          } text-white p-4 rounded-lg shadow-2xl z-50 flex items-center gap-3`}
          role="status"
          aria-live="polite"
        >
          <span className="text-lg leading-none">
            {notification.type === 'error' ? '❌' : '✅'}
          </span>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}
      <div className="w-full max-w-[98vw] mx-auto px-2 sm:px-4 py-4 pb-20">
        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setTournamentDraft((prev) => ({ ...prev, format: 'groups_bracket' }))}
                className={`p-6 rounded-2xl border-2 text-left font-black uppercase tracking-wide text-sm sm:text-base transition-all ${
                  grpFmtStep
                    ? 'bg-emerald-900/40 border-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                {t('formatGroupsBracket') || t('tournFormatGroupsKo')}
              </button>
              <button
                type="button"
                onClick={() => setTournamentDraft((prev) => ({ ...prev, format: 'bracket_only' }))}
                className={`p-6 rounded-2xl border-2 text-left font-black uppercase tracking-wide text-sm sm:text-base transition-all ${
                  fmtBracketOnly
                    ? 'bg-emerald-900/40 border-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                {t('formatBracketOnly') || t('tournFormatKoOnly')}
              </button>
            </div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400">{stepLabels.tournStep1}</h2>
              <div className="hidden sm:flex items-center gap-2">
                {onBack && (
                  <button onClick={onBack} className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}>
                    <ArrowLeft className="w-5 h-5" /> {t('tournBack') || 'Zpět'}
                  </button>
                )}
                <button onClick={handleStep1Continue} className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500`}>
                  {t('tournContinue') || 'Pokračovat'}
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 border rounded-xl bg-slate-900 border-slate-800 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                  {t('tournName') || 'Název turnaje'}
                </label>
                <AdminTapTextField
                  value={tournamentDraft.name}
                  onValueChange={(v) => setTournamentDraft((prev) => ({ ...prev, name: v }))}
                  placeholder={t('tournNamePlaceholder') || 'např. Páteční turnaj'}
                  className={inputBase}
                />
              </div>
              {showSetupPin && (
                <div className="rounded-xl border border-amber-500/25 bg-slate-950/90 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/90 mb-0.5">
                      {t('tournSetupPin') || 'PIN turnaje'}
                    </p>
                    <p className="text-xs text-slate-500 leading-snug">
                      {t('tournSetupPinHint') ||
                        'Pro připojení herních tabletů a diváků.'}
                    </p>
                  </div>
                  <p
                    className="text-2xl sm:text-3xl font-black font-mono text-yellow-400 tabular-nums tracking-[0.15em] shrink-0 sm:text-right"
                    aria-label={`PIN ${setupPinDisplay}`}
                  >
                    {setupPinDisplay}
                  </p>
                </div>
              )}
              {validationError && (
                <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/50 text-red-400 text-sm font-bold">
                  {validationError}
                </div>
              )}
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
                      {t('tournamentHub.cloudModeToggle') || 'Síťová hra / Použít tablety'}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {t('tournSetupPinHint') || ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!tournamentDraft.cloudEnabled}
                    disabled={!isLoggedIn}
                    onClick={() => {
                      if (!isLoggedIn) return;
                      setTournamentDraft((prev) => ({ ...prev, cloudEnabled: !prev.cloudEnabled }));
                    }}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                      tournamentDraft.cloudEnabled && isLoggedIn ? 'bg-emerald-600' : 'bg-slate-700'
                    } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        tournamentDraft.cloudEnabled && isLoggedIn ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                {!isLoggedIn && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 px-3 py-3 space-y-3">
                    <p className="text-sm font-medium text-amber-100/95 leading-snug">
                      {t('tournamentHub.loginRequiredForCloud') ||
                        'Pro aktivaci cloudu a připojení tabletů se musíte přihlásit přes Google.'}
                    </p>
                    {typeof onGoogleLogin === 'function' && (
                      <button
                        type="button"
                        onClick={() => onGoogleLogin()}
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold bg-white text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors"
                      >
                        <Cloud className="w-5 h-5 text-sky-600" />
                        {t('loginWithGoogle') || 'Přihlásit se přes Google'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between gap-2 sm:hidden">
              {onBack && (
                <button onClick={onBack} className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}>
                  <ArrowLeft className="w-5 h-5" /> {t('tournBack') || 'Zpět'}
                </button>
              )}
              <button onClick={handleStep1Continue} className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 ml-auto`}>
                {t('tournContinue') || 'Pokračovat'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400">
                {stepLabels.tournStep2}
              </h2>
              <div className="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}
                >
                  <ArrowLeft className="w-5 h-5" /> {t('tournBack') || 'Zpět'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={players.length < minPlayersRequired || hasAnyDuplicates()}
                  className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {t('tournContinue') || 'Pokračovat'}
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 w-full">
              <div className="p-4 border rounded-xl bg-slate-900 border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                        {t('playerName') || 'Jméno hráče'}
                      </label>
                      <AdminTapTextField
                        id="tournament-player-name"
                        value={editingIndex !== null ? editName : playerName}
                        onValueChange={(v) =>
                          editingIndex !== null ? setEditName(v) : setPlayerName(v)
                        }
                        placeholder={t('tournPlayerPlaceholder') || 'Jméno nebo jméno a příjmení'}
                        className={inputBase}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                        {t('tournRanking') || 'Ranking'}
                      </label>
                      <AdminTapTextField
                        value={editingIndex !== null ? editRanking : playerRanking}
                        onValueChange={(v) =>
                          editingIndex !== null ? setEditRanking(v) : setPlayerRanking(v)
                        }
                        filterChar={(c) => /^\d$/.test(c)}
                        placeholder="–"
                        className={`${inputBase} w-full font-mono`}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={editingIndex !== null ? handleSaveEdit : handleAddPlayer}
                      disabled={
                        (editingIndex !== null ? !editName.trim() : !playerName.trim()) ||
                        (editingIndex !== null && !editName.trim())
                      }
                      className={`${btnBase} w-full shrink-0 whitespace-nowrap bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed ${
                        addConfirm ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900' : ''
                      }`}
                    >
                      {addConfirm ? (
                        <>
                          <CheckCircle className="w-5 h-5 shrink-0" /> {t('tournAdded') || 'Přidáno!'}
                        </>
                      ) : editingIndex !== null ? (
                        <>
                          <CheckCircle className="w-5 h-5 shrink-0" /> {t('save')}
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-5 h-5 shrink-0" /> {t('tournAddPlayer') || 'Přidat hráče'}
                        </>
                      )}
                    </button>
                  </div>
                  {editingIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingIndex(null);
                        setEditName('');
                        setEditRanking('');
                        setStep2Error('');
                      }}
                      className="mt-2 text-sm text-slate-500 hover:text-slate-300"
                    >
                      {t('cancel')}
                    </button>
                  )}
                  {step2Error && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-900/30 border border-amber-500/50 text-amber-400 text-sm font-bold">
                      {step2Error}
                    </div>
                  )}
                </div>
              <div className="flex flex-col w-full min-w-0">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t('tournPlayerList') || 'Registrovaní hráči'} ({players.length})
                  </span>
                  {players.length < minPlayersRequired && (
                    <span className="text-xs text-amber-400">
                      {minPlayersRequired <= 2
                        ? t('tournMinPlayersKo') || 'Min. 2 hráči'
                        : t('tournMinPlayers') || 'Min. 3 hráči'}
                    </span>
                  )}
                  {hasAnyDuplicates() && (
                    <span className="text-xs text-amber-400">
                      {t('tournFixDuplicates') || 'Opravte duplicity'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-h-[300px] max-h-[60vh] p-4 border rounded-xl bg-slate-900 border-slate-800 overflow-hidden flex flex-col">
                  <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 flex-1 min-h-0 overflow-y-auto content-start">
                    {(() => {
                      const { dupName } = getDuplicateFlags();
                      return [...players]
                        .map((p, i) => ({ ...p, _origIdx: i }))
                        .sort((a, b) => {
                          const ra = a.ranking != null ? Number(a.ranking) : Infinity;
                          const rb = b.ranking != null ? Number(b.ranking) : Infinity;
                          return ra - rb;
                        })
                        .map((p) => (
                          <li
                            key={p._origIdx}
                            className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${
                              dupName[p._origIdx]
                                ? 'bg-amber-900/20 border-amber-500/60'
                                : 'bg-slate-800 border-slate-700'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="flex items-center gap-2">
                                <UserPlus className="w-4 h-4 text-slate-500 shrink-0" />
                                <span className="font-bold text-white line-clamp-2 leading-tight">{p.name}</span>
                                {p.ranking != null && <span className="text-xs text-slate-500 font-mono">({p.ranking})</span>}
                              </div>
                              {dupName[p._origIdx] && (
                                <span className="text-[10px] text-amber-400 font-medium">
                                  {t('tournDupName') || 'Duplicitní jméno'}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEditPlayer(p._origIdx)}
                                className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-emerald-400 transition-colors"
                                title={t('editThrow') || 'Upravit'}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePlayer(p._origIdx)}
                                className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors"
                                title="Smazat"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </li>
                        ));
                    })()}
                    {players.length === 0 && (
                      <li className="col-span-full p-6 text-center text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg">
                        {t('tournNoPlayers') || 'Zatím žádní hráči'}
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
            <div className="w-full flex justify-between gap-2 mt-4 sm:hidden">
              <button type="button" onClick={() => setStep(1)} className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}>
                <ArrowLeft className="w-5 h-5" /> {t('tournBack') || 'Zpět'}
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={players.length < minPlayersRequired || hasAnyDuplicates()}
                className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40`}
              >
                {t('tournContinue') || 'Pokračovat'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 – Chytrý asistent formátu */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400">
                {stepLabels.tournStep3}
              </h2>
              <div className="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}
                >
                  <ArrowLeft className="w-5 h-5" /> {t('tournBack') || 'Zpět'}
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={players.length < minPlayersRequired || hasAnyDuplicates() || isCustomInvalid}
                  className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Target className="w-5 h-5" />
                  {t('tournGenerate') || 'Vygenerovat turnaj'}
                </button>
              </div>
            </div>

            <div
              className={`grid grid-cols-1 gap-6 ${fmtBracketOnly ? '' : 'lg:grid-cols-3'}`}
            >
              {/* Levý sloupec – nastavení legů, typu hry a ukončení */}
              <div className="p-4 border rounded-xl bg-slate-900 border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {t('tournGameType') || 'Typ hry'}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[501, 301].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTournamentDraft((prev) => ({ ...prev, startScore: v }))}
                        className={`px-4 py-2 rounded-xl font-black border-2 transition-all ${
                          (tournamentDraft.startScore ?? 501) === v
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {t('tournOutMode') || 'Ukončení'}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { v: 'double', label: 'DO' },
                      { v: 'single', label: 'SO' },
                    ].map(({ v, label }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTournamentDraft((prev) => ({ ...prev, outMode: v }))}
                        className={`px-3 py-2 rounded-xl font-bold text-sm border-2 transition-all ${
                          effectiveOutMode === v
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Terče: vždy viditelné pro skupiny i „Jen Pavouk“ (nesmí být v prostředním sloupci skrytém u bracket_only). */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {t('tournNumBoards') || 'Celkový počet dostupných terčů v herně'}
                  </label>
                  <AdminTapTextField
                    value={
                      rawNumBoards === '' || rawNumBoards == null
                        ? ''
                        : String(rawNumBoards)
                    }
                    onValueChange={(text) => {
                      if (text === '') {
                        setTournamentDraft((prev) => ({ ...prev, numBoards: '' }));
                        return;
                      }
                      const v = parseInt(text, 10);
                      setTournamentDraft((prev) => ({
                        ...prev,
                        numBoards: Number.isFinite(v) ? Math.max(1, Math.min(99, v)) : '',
                      }));
                    }}
                    filterChar={(c) => /^\d$/.test(c)}
                    className={`${inputBase} w-24 font-mono`}
                  />
                </div>
                {grpFmtStep && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                      {t('tournGroupsLegs') || 'Skupiny hrajeme na X vítězných legů'}
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setTournamentDraft((prev) => ({ ...prev, groupLegs: v }))}
                          className={`w-12 h-12 rounded-xl font-black border-2 transition-all ${
                            (tournamentDraft.groupLegs ?? 2) === v
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  {needsPrelim && (
                    <div className="mb-4">
                      <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                        {t('tournBracketKoLegsPrelim') || 'Počet vítězných legů (Předkolo)'}
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {[1, 2, 3, 4, 5].map((v) => (
                          <button
                            key={`pre-${v}`}
                            type="button"
                            onClick={() => setTournamentDraft((prev) => ({ ...prev, prelimLegs: v }))}
                            className={`w-12 h-12 rounded-xl font-black border-2 transition-all ${
                              (tournamentDraft.prelimLegs ?? 2) === v
                                ? 'bg-amber-600 border-amber-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {t('tournBracketKoLegsMain') || 'Počet vítězných legů (1. kolo a dále)'}
                  </label>
                  <p className="text-[10px] text-slate-500 mb-2">
                    {t('tournBracketLegsNote') || 'Pro 1. kolo pavouka. V každém dalším kole se přidá +1 vítězný leg.'}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setBracketKoLegs(v)}
                        className={`w-12 h-12 rounded-xl font-black border-2 transition-all ${
                          bracketKoLegs === v
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Prostřední sloupec – parametry a vlastní formát */}
              <div className={`flex flex-col gap-4 ${fmtBracketOnly ? 'hidden' : ''}`}>
                <div className="p-4 border rounded-xl bg-slate-900 border-slate-800 space-y-4">
                  <p className="text-base font-black text-emerald-400">
                    {t('tournPlayersTotal') || 'Celkem přihlášeno'}: {players.length} {t('tournPlayersMany') || 'hráčů'}
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setTournamentDraft((prev) => ({
                        ...prev,
                        selectedVariantId: 'custom',
                        customNumGroups: prev.customNumGroups ?? 4,
                        customAdvancePerGroup: prev.customAdvancePerGroup ?? 2,
                        numGroups: prev.customNumGroups ?? 4,
                        advancePerGroup: prev.customAdvancePerGroup ?? 2,
                      }))
                    }
                    className={`p-4 rounded-xl border-2 text-left transition-all w-full ${
                      isCustomFormat
                        ? 'bg-emerald-900/40 border-emerald-500 shadow-lg shadow-emerald-900/20'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-black text-emerald-400 mb-1">
                      {t('tournVariantCustom') || 'Vlastní formát'}
                    </div>
                    <p className="text-sm text-slate-400">
                      {t('tournVariantCustomDesc') || 'Manuální nastavení počtu skupin a postupujících'}
                    </p>
                  </button>
                  {isCustomFormat && (
                    <div className="mt-3 p-4 rounded-xl border border-slate-700 bg-slate-800/50 space-y-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                          {t('tournCustomNumGroups') || 'Počet skupin'}
                        </label>
                        <AdminTapTextField
                          value={String(customNumGroups)}
                          onValueChange={(text) => {
                            const v = Math.max(1, Math.min(99, parseInt(String(text), 10) || 1));
                            setTournamentDraft((prev) => ({
                              ...prev,
                              customNumGroups: v,
                              numGroups: v,
                            }));
                          }}
                          filterChar={(c) => /^\d$/.test(c)}
                          className={`${inputBase} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                          {t('tournCustomAdvancePerGroup') || 'Počet postupujících z každé skupiny'}
                        </label>
                        <AdminTapTextField
                          value={String(customAdvancePerGroup)}
                          onValueChange={(text) => {
                            const v = Math.max(1, Math.min(99, parseInt(String(text), 10) || 1));
                            setTournamentDraft((prev) => ({
                              ...prev,
                              customAdvancePerGroup: v,
                              advancePerGroup: v,
                            }));
                          }}
                          filterChar={(c) => /^\d$/.test(c)}
                          className={`${inputBase} font-mono`}
                        />
                      </div>
                      <p className="text-sm text-slate-300">
                        {t('tournAdvanceTotalHint') || 'Celkem postupuje'}:{' '}
                        <span className="font-mono font-bold text-emerald-400">
                          {countPlayersAdvancingFromGroups(players.length, customNumGroups, customAdvancePerGroup)}
                        </span>
                      </p>
                      {!customSplitOk && (
                        <p className="text-sm font-bold text-red-400">
                          ⚠️ {t('tournCustomInvalidGroupSplit')}
                        </p>
                      )}
                      {customSplitOk && !customAdvanceOk && (
                        <p className="text-sm font-bold text-red-400">
                          ⚠️ {t('tournCustomInvalidAdvance').replace(/\{max\}/g, String(customMinGroup))}
                        </p>
                      )}
                      <p className="text-sm text-slate-400">
                        {t('tournVariantBracket') || 'Pavouk'}:{' '}
                        {(() => {
                          const total = countPlayersAdvancingFromGroups(
                            players.length,
                            customNumGroups,
                            customAdvancePerGroup
                          );
                          const needsByeBracket = total > 0 && (total & (total - 1)) !== 0;
                          return needsByeBracket ? (
                            <span className="text-amber-400 font-bold">
                              {t('tournBracketByeWarning') || 'Bude použito předkolo'}
                            </span>
                          ) : (
                            <span>{t('tournNoPrelim') || 'Bez předkola'}</span>
                          );
                        })()}
                      </p>
                      <p className="text-xs text-emerald-400/90 font-mono">
                        ~{Math.round(estimateTotalTournamentTime(
                          { players, format: 'groups_bracket', groupLegs: tournamentDraft.groupLegs ?? 2, bracketLegs: bracketKoLegs },
                          { advancePerGroup: customAdvancePerGroup, bracketKoLegs, numGroups: customNumGroups, numBoards }
                        ).totalMs / 60000)} {t('tournMinutes') || 'min'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pravý sloupec – chytré návrhy formátů */}
              <div className={`flex flex-col gap-4 ${fmtBracketOnly ? 'hidden' : ''}`}>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t('tournVariantChoose') || 'Vyberte formát turnaje'}
                </span>
                {variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id && !isCustomFormat;
                  const advancePhrase = applyAdvancementPhrase(
                    t,
                    getGroupAdvancementPhraseKey(players.length, v.numGroups, v.advancePerGroup)
                  );
                  const timeEst = estimateTotalTournamentTime(
                    { players, format: 'groups_bracket', groupLegs: tournamentDraft.groupLegs ?? 2, bracketLegs: bracketKoLegs },
                    { advancePerGroup: v.advancePerGroup, bracketKoLegs, numGroups: v.numGroups, numBoards }
                  );
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        setTournamentDraft((prev) => ({
                          ...prev,
                          selectedVariantId: v.id,
                          numGroups: v.numGroups,
                          advancePerGroup: v.advancePerGroup,
                        }))
                      }
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'bg-emerald-900/40 border-emerald-500 shadow-lg shadow-emerald-900/20'
                          : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-black text-emerald-400 mb-1">
                        {t(v.labelKey) || (v.id === 'A' ? 'Rychlá' : v.id === 'B' ? 'Standard' : 'Dlouhá')}
                      </div>
                      <p className="text-sm text-slate-300">
                        {t('tournVariantGroups') || 'Rozložení'}: {formatGroupComposition(players.length, v.numGroups, t)}
                      </p>
                      <p className="text-sm text-slate-300">
                        <span className="text-slate-400">{t('tournAdvanceRule')}: </span>
                        {advancePhrase}
                      </p>
                      <p className="text-sm text-slate-400 mt-2">
                        {t('tournVariantBracket') || 'Pavouk'}: {t('tournVariantBracketFor') || 'pro'} {v.totalAdvancees} {t('tournPlayersFew') || 'hráčů'}
                        {v.needsBye && (
                          <span className="ml-2 text-amber-400 font-bold">
                            ({t('tournBracketByeWarning') || 'vyžaduje předkolo'})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-emerald-400/90 mt-2 font-mono">
                        ~{Math.round(timeEst.totalMs / 60000)} {t('tournMinutes') || 'min'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {validationError && (
              <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/50 text-red-400 text-sm font-bold">
                {validationError}
              </div>
            )}

            <div className="flex justify-between gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => setStep(2)}
                className={`${btnBase} bg-slate-800 text-slate-300 hover:bg-slate-700`}
              >
                <ArrowLeft className="w-5 h-5" /> {t('tournBack') || 'Zpět'}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={players.length < minPlayersRequired || hasAnyDuplicates() || isCustomInvalid}
                className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40`}
              >
                <Target className="w-5 h-5" />
                {t('tournGenerate') || 'Vygenerovat turnaj'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
