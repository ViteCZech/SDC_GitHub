import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, Cloud, Edit2, ExternalLink, HardDrive, Loader2, Target, Trash2, UserPlus } from 'lucide-react';
import { translations } from '../translations';
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
import NumericStepper from './NumericStepper';
import StickyActionBar from './StickyActionBar';
import { useAdminVirtualKeyboardOptional } from '../context/AdminVirtualKeyboardContext';
import {
  buildDrawRankingSnapshot,
  formatCsoUpdatedAt,
  getCsoRankingDisplayDate,
  getCsoRankingUrl,
  loadCsoRanking,
  resolvePlayerLiveRank,
  searchCsoPlayers,
} from '../utils/csoRanking';
import CsoRankingUpdateButton from './CsoRankingUpdateButton';
import PlayerDuplicateModal from './PlayerDuplicateModal';
import { useListboxKeyboard } from '../hooks/useListboxKeyboard';
import {
  findDuplicatePlayer,
  playersAreSame,
  resolveCsoPlayerId,
} from '../utils/playerIdentity';
import { handleExternalLinkClick } from '../utils/openExternalUrl';
import { normalizeCompetitionType, usesDoublesRanking } from '../utils/preregCompetition';
import {
  drawRandomPairs,
  flattenPairDraw,
  isPairDrawComplete,
  isRandomDoublesDraft,
} from '../utils/drawRandomPairs';
import RandomPairDrawPanel from './RandomPairDrawPanel';
import VenueTvLinkCard from './VenueTvLinkCard';
import ContextHelpButton from './ContextHelpButton';

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
  onNotify,
  preRegTournamentId,
  onBackToPreRegAdmin,
  onOpenContextHelp,
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const th = (k) => translations[lang]?.tournamentHub?.[k] ?? k;
  const vkOpt = useAdminVirtualKeyboardOptional();
  void onBack;

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
  const [csoList, setCsoList] = useState([]);
  const [csoMeta, setCsoMeta] = useState(null);
  const [csoLoading, setCsoLoading] = useState(false);
  const [csoReloadKey, setCsoReloadKey] = useState(0);
  const [csoError, setCsoError] = useState(null);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCsoRank, setSelectedCsoRank] = useState(null);
  const [pendingCsoPlayerId, setPendingCsoPlayerId] = useState(null);
  const [dupModal, setDupModal] = useState(null); // { mode: 'add'|'edit'|'select', name, csoPlayerId, ranking, existingIndex }
  const [highlightPlayerIndex, setHighlightPlayerIndex] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pairDrawBusy, setPairDrawBusy] = useState(false);
  const tournamentNameFieldRef = useRef(null);
  const playerNameFieldRef = useRef(null);
  const playerRankingFieldRef = useRef(null);

  const players = tournamentDraft.players || [];
  const hasTeams = players.some((p) => p?.kind === 'team');
  const competitionType = normalizeCompetitionType(tournamentDraft.competitionType);
  const isRandomDoubles = isRandomDoublesDraft(tournamentDraft);
  const pairDrawDone = isRandomDoubles && isPairDrawComplete(players);
  const importedFixedPairs = hasTeams && (competitionType === 'doubles' || competitionType === 'mixed');
  const fromPreReg = !!preRegTournamentId;
  const lockCompetitionType = fromPreReg || importedFixedPairs;
  const usesDoublesCso = usesDoublesRanking(competitionType) || hasTeams;
  const csoGender = tournamentDraft.csoRankingGender === 'women' ? 'women' : 'men';
  const csoListKey = usesDoublesCso ? 'doubles' : csoGender;
  const useCsoRanking = !!tournamentDraft.useCsoRanking;

  /** Plovoucí rank pro UI — při zapnutém ČŠO vždy z aktuálního žebříčku. */
  const getDisplayRanking = (player) => {
    if (player?.kind === 'team') {
      if (player.ranking != null && Number.isFinite(Number(player.ranking))) {
        return Number(player.ranking);
      }
      return null;
    }
    if (useCsoRanking) {
      return resolvePlayerLiveRank(player?.name, csoList);
    }
    if (player?.ranking != null && !Number.isNaN(Number(player.ranking))) {
      return Number(player.ranking);
    }
    return null;
  };

  useEffect(() => {
    if (step !== 2 || !useCsoRanking) {
      setCsoList((prev) => (prev.length === 0 ? prev : []));
      setCsoMeta(null);
      setCsoLoading(false);
      setCsoError(null);
      setShowSuggestions(false);
      setNameSuggestions((prev) => (prev.length === 0 ? prev : []));
      setSelectedCsoRank(null);
      return;
    }

    let cancelled = false;
    const isReload = csoReloadKey > 0;
    setCsoLoading(true);
    setCsoError(null);
    // Při reloadu po Stedar update nemaž meta — jinak badge blikne na starý static JSON.
    if (!isReload) {
      setCsoMeta(null);
    }
    setShowSuggestions(false);
    setNameSuggestions((prev) => (prev.length === 0 ? prev : []));
    setSelectedCsoRank(null);

    loadCsoRanking(csoListKey, { bypassCache: true })
      .then((data) => {
        if (!cancelled) {
          setCsoList(data.players ?? []);
          setCsoMeta((prev) => {
            const next = data.meta ?? null;
            if (!next) return prev;
            // Po CF update může re-fetch spadnout na static JSON bez Stedar generatedAt —
            // nenech přepsat čerstvé datum z odpovědi funkce.
            if (isReload && prev?.generatedAt && !next?.generatedAt) {
              return {
                ...next,
                updatedAt: prev.updatedAt,
                generatedAt: prev.generatedAt,
                effectiveDate: prev.effectiveDate ?? null,
              };
            }
            return next;
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const fallback =
            translations[lang]?.tournCsoLoadError || 'Nepodařilo se načíst žebříček';
          setCsoError(err?.message ?? fallback);
          setCsoList([]);
          if (!isReload) setCsoMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCsoLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `lang` místo `t` — `t` je nová funkce při každém renderu a způsobovalo nekonečný re-render (zamrznutí UI).
  }, [step, csoListKey, useCsoRanking, csoReloadKey, lang]);

  const handlePlayerNameChange = (v) => {
    if (editingIndex !== null) setEditName(v);
    else setPlayerName(v);
    setSelectedCsoRank(null);
    setPendingCsoPlayerId(resolveCsoPlayerId({ name: v }));
    if (!useCsoRanking) {
      setShowSuggestions(false);
      setNameSuggestions([]);
      return;
    }
    const hits = searchCsoPlayers(csoList, v);
    setNameSuggestions(hits);
    setShowSuggestions(v.trim().length >= 2 && hits.length > 0);
  };

  const selectCsoPlayer = (entry) => {
    const name = String(entry?.name ?? '').trim();
    const rankStr = entry?.rank != null ? String(entry.rank) : '';
    const csoId = resolveCsoPlayerId({ ...entry, name });
    if (editingIndex !== null) {
      setEditName(name);
      setEditRanking(rankStr);
    } else {
      setPlayerName(name);
      setPlayerRanking(rankStr);
    }
    setPendingCsoPlayerId(csoId);
    setSelectedCsoRank(entry?.rank ?? null);
    setShowSuggestions(false);
    setNameSuggestions([]);
    vkOpt?.closeKeyboard?.();

    const excludeIdx = editingIndex !== null ? editingIndex : undefined;
    const dup = findDuplicatePlayer(
      players,
      { name, csoPlayerId: csoId },
      { excludeIndex: excludeIdx }
    );
    if (dup) {
      setDupModal({
        mode: editingIndex !== null ? 'edit' : 'select',
        name,
        csoPlayerId: csoId,
        ranking: useCsoRanking ? null : parseRankingFromInput(rankStr),
        existingIndex: dup.index,
      });
    }
  };

  const suggestionsOpen = useCsoRanking && showSuggestions && nameSuggestions.length > 0;
  const {
    highlightedIndex: suggestionHighlight,
    setHighlightedIndex: setSuggestionHighlight,
    setOptionRef: setSuggestionOptionRef,
  } = useListboxKeyboard({
    items: nameSuggestions,
    isOpen: suggestionsOpen,
    onSelect: (entry) => selectCsoPlayer(entry),
    onClose: () => setShowSuggestions(false),
    enabled: useCsoRanking,
  });

  /** Master Out není podporován – stará hodnota se zobrazí jako DO */
  const effectiveOutMode =
    tournamentDraft.outMode === 'master'
      ? 'double'
      : (tournamentDraft.outMode ?? 'double');

  useEffect(() => {
    if (step !== 2 || editingIndex !== null) return;
    const t = window.setTimeout(() => {
      try {
        playerNameFieldRef.current?.focus();
      } catch {}
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
  }, [tournamentDraft.format, tournamentDraft.groupLegs, tournamentDraft.bracketLegs, setTournamentDraft]);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setTournamentDraft((prev) => (prev.cloudEnabled ? { ...prev, cloudEnabled: false } : prev));
    }
  }, [user, setTournamentDraft]);

  const isLoggedIn = user && !user.isAnonymous;

  const stepLabels = {
    tournStep1: fromPreReg
      ? (t('tournStep1FromPrereg') || 'Krok 1: Nastavení živého běhu')
      : (t('tournStep1') || 'Krok 1: Založení'),
    tournStep2: fromPreReg
      ? (t('tournStep2FromPrereg') || 'Krok 2: Soupiska z předregistrace')
      : (t('tournStep2') || 'Krok 2: Registrace hráčů'),
    tournStep3: t('tournStep3') || 'Krok 3: Kontrola nasazení',
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
    if (tournamentDraft.cloudEnabled && isLoggedIn) {
      const tp = String(tournamentDraft.tabletPassword ?? '').trim();
      if (!tp) {
        setValidationError(
          t('tournTabletPasswordRequired') ||
            'Máte zapnuté herní tablety — vyplňte heslo pro ně (1–5 znaků, nesmí být stejné jako PIN), jinak nelze pokračovat.'
        );
        return false;
      }
      if (tp.length > 5) {
        setValidationError(
          t('tournTabletPasswordInvalid') ||
            'Heslo pro herní tablety: max. 5 znaků a nesmí být stejné jako PIN.'
        );
        return false;
      }
      const pinStr = String(tournamentDraft.pin ?? '').trim();
      if (/^\d{4}$/.test(pinStr) && tp === pinStr) {
        setValidationError(
          t('tournTabletPasswordDistinct') || 'Heslo nesmí být stejné jako PIN turnaje.'
        );
        return false;
      }
    }
    return true;
  };

  const handleStep1Continue = () => {
    if (!validateStep1()) return;
    setStep(2);
    setValidationError('');
  };

  const isBlockingDuplicatePair = (a, b) => {
    if (!playersAreSame(a, b)) return false;
    // „Přidat i přesto“ — neblokovat generování rozpisu
    return !(a?.duplicateOk || b?.duplicateOk);
  };

  const getDuplicateFlags = () => {
    const dupName = {};
    players.forEach((p, i) => {
      dupName[i] = players.some(
        (other, j) => j !== i && playersAreSame(p, other)
      );
    });
    return { dupName };
  };

  const hasAnyDuplicates = () => {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        if (isBlockingDuplicatePair(players[i], players[j])) return true;
      }
    }
    return false;
  };

  const clearPlayerForm = () => {
    setPlayerName('');
    setPlayerRanking('');
    setPendingCsoPlayerId(null);
    setSelectedCsoRank(null);
    setShowSuggestions(false);
    setNameSuggestions([]);
  };

  const commitAddPlayer = (name, ranking, csoPlayerId, { duplicateOk = false } = {}) => {
    setTournamentDraft((prev) => ({
      ...prev,
      players: [
        ...(prev.players || []),
        {
          name,
          ranking,
          csoPlayerId: csoPlayerId || resolveCsoPlayerId({ name }),
          ...(duplicateOk ? { duplicateOk: true } : {}),
        },
      ],
    }));
    clearPlayerForm();
    setAddConfirm(true);
    setTimeout(() => setAddConfirm(false), 1800);
    return true;
  };

  const handleAddPlayer = (opts = {}) => {
    setStep2Error('');
    const name = playerName.trim();
    if (!name) return false;

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
          const fullName = `${fn}_${ln}_${i + 1}`;
          return {
            id: uid,
            name: fullName,
            ranking,
            csoPlayerId: resolveCsoPlayerId({ name: fullName }),
          };
        });

        setTournamentDraft((prev) => ({
          ...prev,
          players: [...(prev.players || []), ...generatedPlayers],
        }));
        clearPlayerForm();
        return true;
      }
    }

    const finalRanking = useCsoRanking ? null : parseRankingFromInput(playerRanking);
    const csoId = pendingCsoPlayerId || resolveCsoPlayerId({ name });
    if (!opts.force) {
      const dup = findDuplicatePlayer(players, { name, csoPlayerId: csoId });
      if (dup) {
        setDupModal({
          mode: 'add',
          name,
          csoPlayerId: csoId,
          ranking: finalRanking,
          existingIndex: dup.index,
        });
        return false;
      }
    }
    return commitAddPlayer(name, finalRanking, csoId, { duplicateOk: !!opts.force });
  };

  const handleDeletePlayer = (idx) => {
    setTournamentDraft((prev) => {
      const list = prev.players || [];
      const removed = list[idx];
      let nextPlayers = list.filter((_, i) => i !== idx);
      let roster = prev.pairDrawRoster || null;
      let reserve = prev.pairDrawReserve ?? null;
      if (removed?.kind === 'team' && Array.isArray(removed.members)) {
        const keys = new Set(
          removed.members.flatMap((m) => [String(m.id ?? ''), String(m.name ?? '').trim()].filter(Boolean))
        );
        roster = (roster || []).filter(
          (p) => !keys.has(String(p.id ?? '')) && !keys.has(String(p.name ?? '').trim())
        );
      }
      if (nextPlayers.length === 0 && roster?.length) {
        nextPlayers = roster;
        roster = null;
        reserve = null;
      }
      return {
        ...prev,
        players: nextPlayers,
        pairDrawRoster: roster,
        pairDrawReserve: reserve,
      };
    });
    if (editingIndex === idx) setEditingIndex(null);
    else if (editingIndex !== null && editingIndex > idx) setEditingIndex((i) => i - 1);
  };

  const applyPairDraw = async () => {
    const roster = (tournamentDraft.pairDrawRoster?.length
      ? tournamentDraft.pairDrawRoster
      : players.filter((p) => p?.kind !== 'team'));
    if (roster.length < 2 || pairDrawBusy) return;
    setPairDrawBusy(true);
    try {
      let doublesPlayers = [];
      if (useCsoRanking) {
        try {
          const data = await loadCsoRanking('doubles', { bypassCache: true });
          doublesPlayers = data.players ?? [];
        } catch {
          doublesPlayers = [];
        }
      }
      const { teams, reserve } = drawRandomPairs(roster, { doublesPlayers });
      setTournamentDraft((prev) => ({
        ...prev,
        pairDrawRoster: roster,
        pairDrawReserve: reserve,
        players: teams,
      }));
    } finally {
      setPairDrawBusy(false);
    }
  };

  const handleDissolvePairs = () => {
    const people =
      flattenPairDraw(
        players.filter((p) => p?.kind === 'team'),
        tournamentDraft.pairDrawReserve
      );
    const fallback = tournamentDraft.pairDrawRoster?.length ? tournamentDraft.pairDrawRoster : people;
    setTournamentDraft((prev) => ({
      ...prev,
      players: fallback.length ? fallback : people,
      pairDrawReserve: null,
      pairDrawRoster: null,
    }));
  };

  const handleEditPlayer = (idx) => {
    setEditingIndex(idx);
    setEditName(players[idx].name);
    setEditRanking(
      useCsoRanking
        ? ''
        : players[idx].ranking != null
          ? String(players[idx].ranking)
          : ''
    );
    setPendingCsoPlayerId(players[idx].csoPlayerId || resolveCsoPlayerId(players[idx]));
    setSelectedCsoRank(null);
    setShowSuggestions(false);
    setNameSuggestions([]);
    setHighlightPlayerIndex(idx);
    window.setTimeout(() => setHighlightPlayerIndex(null), 3500);
  };

  const handleSaveEdit = (opts = {}) => {
    if (editingIndex === null) return false;
    setStep2Error('');
    const name = editName.trim();
    if (!name) return false;
    const finalRanking = useCsoRanking ? null : parseRankingFromInput(editRanking);
    const csoId = pendingCsoPlayerId || resolveCsoPlayerId({ name });
    if (!opts.force) {
      const dup = findDuplicatePlayer(
        players,
        { name, csoPlayerId: csoId },
        { excludeIndex: editingIndex }
      );
      if (dup) {
        setDupModal({
          mode: 'edit',
          name,
          csoPlayerId: csoId,
          ranking: finalRanking,
          existingIndex: dup.index,
        });
        return false;
      }
    }
    setTournamentDraft((prev) => ({
      ...prev,
      players: (prev.players || []).map((p, i) =>
        i === editingIndex
          ? {
              ...p,
              name,
              ranking: finalRanking,
              csoPlayerId: csoId,
              ...(opts.force ? { duplicateOk: true } : {}),
            }
          : p
      ),
    }));
    setEditingIndex(null);
    setEditName('');
    setEditRanking('');
    setPendingCsoPlayerId(null);
    setSelectedCsoRank(null);
    setShowSuggestions(false);
    setNameSuggestions([]);
    return true;
  };

  const advancePerGroup =
    tournamentDraft.advancePerGroup ?? (isTournamentBracketOnlyFormat(tournamentDraft.format) ? 'all' : 2);
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

  const numBoards = Math.max(1, Math.min(99, Number(tournamentDraft.numBoards) || 2));
  const rawNumBoards = tournamentDraft.numBoards;

  const grpFmtStep = isTournamentGroupsThenBracketFormat(tournamentDraft.format);
  const fmtBracketOnly = isTournamentBracketOnlyFormat(tournamentDraft.format);
  const minPlayersRequired = grpFmtStep ? GROUP_SIZE_MIN : 2;
  const competitiveSlots = hasTeams
    ? players.filter((p) => p?.kind === 'team')
    : isRandomDoubles
      ? []
      : players;
  const canContinueStep2 =
    competitiveSlots.length >= minPlayersRequired &&
    !hasAnyDuplicates() &&
    (!isRandomDoubles || pairDrawDone);

  const totalAdvancees = useMemo(() => {
    if (!grpFmtStep) return players.length;
    return countPlayersAdvancingFromGroups(players.length, resolvedNumGroups, advancePerGroup);
  }, [grpFmtStep, players.length, resolvedNumGroups, advancePerGroup]);

  const needsPrelim = useMemo(() => {
    if (totalAdvancees < 2) return false;
    return !Number.isInteger(Math.log2(totalAdvancees));
  }, [totalAdvancees]);
  const customSplitOk = isAllowedGroupSplit(players.length, customNumGroups);
  const customMinGroup = customSplitOk ? Math.floor(players.length / customNumGroups) : 0;
  const customAdvanceOk = customAdvancePerGroup <= customMinGroup;
  const isCustomInvalid =
    isCustomFormat && grpFmtStep && (!customSplitOk || !customAdvanceOk);

  /** Seřazení hráčů podle rankingu (při ČŠO z živého žebříčku — finální snapshot až při generate). */
  const getSortedPlayersForTournament = () =>
    [...players]
      .map((p) =>
        p.kind === 'team'
          ? { ...p }
          : {
              name: p.name,
              ranking: useCsoRanking ? resolvePlayerLiveRank(p.name, csoList) : p.ranking ?? null,
              id: p.id,
            }
      )
      .sort((a, b) => {
        const ra = a.ranking != null ? Number(a.ranking) : Infinity;
        const rb = b.ranking != null ? Number(b.ranking) : Infinity;
        return ra - rb;
      })
      .map((p) =>
        p.kind === 'team'
          ? p
          : { name: p.name, ranking: p.ranking, ...(p.id ? { id: p.id } : {}) }
      );

  const handleGenerate = async () => {
    if (
      competitiveSlots.length < minPlayersRequired ||
      hasAnyDuplicates() ||
      isCustomInvalid ||
      isGenerating ||
      (isRandomDoubles && !pairDrawDone)
    ) {
      if (isRandomDoubles && !pairDrawDone) {
        setValidationError(t('tournNeedPairDraw') || 'Nejdřív vylosujte páry.');
      }
      return;
    }
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
      if (tournamentDraft.cloudEnabled && isLoggedIn) {
        const tp = String(tournamentDraft.tabletPassword ?? '').trim();
        if (!tp) {
          setValidationError(
            t('tournTabletPasswordRequired') ||
              'Máte zapnuté herní tablety — vyplňte heslo pro ně (1–5 znaků, nesmí být stejné jako PIN), jinak nelze pokračovat.'
          );
          return;
        }
        if (tp.length > 5) {
          setValidationError(
            t('tournTabletPasswordInvalid') ||
              'Heslo pro herní tablety: max. 5 znaků a nesmí být stejné jako PIN.'
          );
          return;
        }
        if (tp === pinToSave) {
          setValidationError(
            t('tournTabletPasswordDistinct') || 'Heslo nesmí být stejné jako PIN turnaje.'
          );
          return;
        }
      }

      setIsGenerating(true);
      let snapPlayers;
      let rankingSnapshot;
      if (useCsoRanking) {
        const rankingData = await loadCsoRanking(csoListKey, { bypassCache: true });
        const built = buildDrawRankingSnapshot({
          players,
          rankingData,
          gender: usesDoublesCso ? 'doubles' : csoGender,
          rankingKind: usesDoublesCso ? 'doubles' : 'singles',
          useCsoRanking: true,
        });
        snapPlayers = built.players.map((p) => {
          if (p.kind === 'team') {
            return {
              ...p,
              name: p.name,
              ranking: p.ranking ?? null,
              ...(p.id ? { id: p.id } : {}),
            };
          }
          return {
            name: p.name,
            ranking: p.ranking,
            ...(p.id ? { id: p.id } : {}),
            ...(p.csoPlayerId ? { csoPlayerId: p.csoPlayerId } : {}),
            ...(p.duplicateOk ? { duplicateOk: true } : {}),
          };
        });
        rankingSnapshot = built.rankingSnapshot;
        setCsoList(rankingData.players ?? []);
        setCsoMeta(rankingData.meta ?? null);
      } else {
        const built = buildDrawRankingSnapshot({
          players: getSortedPlayersForTournament(),
          rankingData: null,
          gender: null,
          useCsoRanking: false,
        });
        snapPlayers = built.players;
        rankingSnapshot = built.rankingSnapshot;
      }

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
        promotersCount: fmtBracketOnly ? 'all' : advPerGroup === 'all' ? 'all' : Number(advPerGroup),
        numGroups: grpFmtStep ? numGroups : null,
        startScore: tournamentDraft.startScore ?? 501,
        outMode:
          tournamentDraft.outMode === 'master'
            ? 'double'
            : (tournamentDraft.outMode ?? 'double'),
        prelimLegs: needsPrelim ? (tournamentDraft.prelimLegs ?? 2) : null,
        numBoards: parsedBoards,
        totalBoards: parsedBoards,
        players: snapPlayers,
        rankingSnapshot,
        rankingsLocked: false,
        pin: pinToSave,
        cloudEnabled: !!tournamentDraft.cloudEnabled && isLoggedIn,
        tabletPassword:
          tournamentDraft.cloudEnabled && isLoggedIn
            ? String(tournamentDraft.tabletPassword ?? '').trim().slice(0, 5)
            : null,
        competitionType,
        pairDrawReserve: isRandomDoubles ? tournamentDraft.pairDrawReserve ?? null : null,
      };
      onComplete?.(data);
    } catch (error) {
      console.error(error);
      showNotification(
        t('tournCsoLoadError') ||
          'Kritická chyba při generování rozpisu. Zkontrolujte, zda parametry turnaje dávají smysl.',
        'error'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const btnBase =
    'flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all active:scale-95 border border-slate-700';
  const inputBase =
    'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500';

  return (
    <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 pb-24 sm:pb-4">
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
      <div className="w-full max-w-[98vw] xl:max-w-7xl mx-auto px-2 sm:px-4 py-4 pb-20">
        {preRegTournamentId && onBackToPreRegAdmin && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onBackToPreRegAdmin}
              className={`${btnBase} bg-slate-800 text-emerald-400 hover:bg-slate-700 border border-emerald-500/30 text-xs sm:text-sm`}
            >
              <ArrowLeft className="w-4 h-4" />
              {t('preregBackToAdmin') || 'Zpět do správce předregistrací'}
            </button>
          </div>
        )}
        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start animate-in fade-in duration-200">
            <div className="lg:col-span-12 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 lg:flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400">
                    {stepLabels.tournStep1}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 max-w-md">
                  <button
                    type="button"
                    onClick={() => setTournamentDraft((prev) => ({ ...prev, format: 'groups_bracket' }))}
                    className={`px-4 py-3 rounded-xl border-2 text-left font-black uppercase tracking-wide text-xs sm:text-sm transition-all ${
                      grpFmtStep
                        ? 'bg-emerald-900/40 border-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {t('formatGroupsBracket') || t('tournFormatGroupsKo')}
                    <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400 mt-1">
                      {t('tournFormatGroupsKoHint') || 'Skupiny → pavouk'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTournamentDraft((prev) => ({ ...prev, format: 'bracket_only' }))}
                    className={`px-4 py-3 rounded-xl border-2 text-left font-black uppercase tracking-wide text-xs sm:text-sm transition-all ${
                      fmtBracketOnly
                        ? 'bg-emerald-900/40 border-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {t('formatBracketOnly') || t('tournFormatKoOnly')}
                    <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400 mt-1">
                      {t('tournFormatKoOnlyHint') || 'Přímý pavouk bez skupin'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 max-w-md">
                  {lockCompetitionType ? (
                    <div className="col-span-2 px-4 py-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30">
                      <p className="text-xs font-black uppercase tracking-wide text-emerald-300">
                        {t(`preregCompType_${competitionType}`)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {importedFixedPairs
                          ? t('tournCompTypeImportedHint')
                          : t('tournCompTypeLockedHint')}
                      </p>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setTournamentDraft((prev) => {
                            if (normalizeCompetitionType(prev.competitionType) === 'singles') return prev;
                            const teams = (prev.players || []).filter((p) => p?.kind === 'team');
                            const people = teams.length
                              ? flattenPairDraw(teams, prev.pairDrawReserve)
                              : prev.players;
                            return {
                              ...prev,
                              competitionType: 'singles',
                              players: people,
                              pairDrawReserve: null,
                              pairDrawRoster: null,
                            };
                          })
                        }
                        className={`px-4 py-3 rounded-xl border-2 text-left font-black uppercase tracking-wide text-xs sm:text-sm transition-all ${
                          competitionType === 'singles'
                            ? 'bg-emerald-900/40 border-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        {t('preregCompType_singles')}
                        <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400 mt-1">
                          {t('tournCompTypeSinglesHint')}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTournamentDraft((prev) => ({
                            ...prev,
                            competitionType: 'random_doubles',
                          }))
                        }
                        className={`px-4 py-3 rounded-xl border-2 text-left font-black uppercase tracking-wide text-xs sm:text-sm transition-all ${
                          isRandomDoubles
                            ? 'bg-emerald-900/40 border-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        {t('preregCompType_random_doubles')}
                        <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400 mt-1">
                          {t('preregCompTypeHint_random_doubles')}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleStep1Continue}
                className={`${btnBase} hidden sm:flex bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 ml-auto`}
              >
                {t('tournContinue') || 'Pokračovat'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
            <div className="lg:col-span-12 grid gap-4 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-5 p-4 border rounded-xl bg-slate-900 border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {t('tournName') || 'Název turnaje'}
                  </label>
                  <AdminTapTextField
                    fieldRef={tournamentNameFieldRef}
                    id="tournament-setup-tournament-name"
                    value={tournamentDraft.name}
                    readOnly={fromPreReg}
                    disabled={fromPreReg}
                    onValueChange={(v) => {
                      if (fromPreReg) return;
                      setTournamentDraft((prev) => ({ ...prev, name: v }));
                    }}
                    onEnterPress={() => {
                      if (fromPreReg) return;
                      vkOpt?.closeKeyboard?.();
                      handleStep1Continue();
                    }}
                    placeholder={t('tournNamePlaceholder') || 'např. Páteční turnaj'}
                    className={`${inputBase}${fromPreReg ? ' opacity-80 cursor-not-allowed' : ''}`}
                  />
                  {fromPreReg && (
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                      {t('tournNameLockedHint')}
                    </p>
                  )}
                </div>
                {showSetupPin && (
                  <div className="rounded-xl border border-amber-500/25 bg-slate-950/90 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/90 mb-0.5">
                        {t('tournSetupPin') || 'PIN turnaje'}
                      </p>
                      <p className="text-xs text-slate-500 leading-snug">
                        {t('tournSetupPinHint') ||
                          'Diváci: jen PIN. Herní tablety v cloudu: PIN a heslo od administrátora.'}
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
              </div>

              <div className="lg:col-span-7 p-4 border rounded-xl bg-slate-900 border-slate-800 space-y-4 min-w-0">
                <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {th('modeSectionTitle') || 'Režim turnaje'}
                    </p>
                    <ContextHelpButton
                      topicId="offline-mode"
                      lang={lang}
                      onOpenContextHelp={onOpenContextHelp}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!tournamentDraft.cloudEnabled}
                      onClick={() =>
                        setTournamentDraft((prev) => ({
                          ...prev,
                          cloudEnabled: false,
                          tabletPassword: '',
                        }))
                      }
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        !tournamentDraft.cloudEnabled
                          ? 'border-emerald-500/60 bg-emerald-950/30'
                          : 'border-slate-700 bg-slate-900/70 hover:bg-slate-900'
                      }`}
                    >
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-2">
                        <HardDrive className="w-4 h-4 shrink-0" />
                        {th('offlineModeTitle') || 'Offline / lokální turnaj'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                        {th('offlineModeHint') ||
                          'Běh na tomto zařízení bez cloudu. Vhodné při výpadku internetu.'}
                      </p>
                      <p className="text-[11px] text-emerald-200/90 mt-2 leading-snug">
                        {th('offlineModeConditions') ||
                          'Podmínky: bez cloudových tabletů a bez cloud TV feedu. Data zůstávají lokálně na zařízení.'}
                      </p>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={!!tournamentDraft.cloudEnabled && !!isLoggedIn}
                      disabled={!isLoggedIn}
                      onClick={() => {
                        if (!isLoggedIn) return;
                        setTournamentDraft((prev) => ({ ...prev, cloudEnabled: true }));
                      }}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        tournamentDraft.cloudEnabled && isLoggedIn
                          ? 'border-sky-500/60 bg-sky-950/30'
                          : 'border-slate-700 bg-slate-900/70 hover:bg-slate-900'
                      } ${!isLoggedIn ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <p className="text-[11px] font-black uppercase tracking-widest text-sky-300 flex items-center gap-2">
                        <Cloud className="w-4 h-4 shrink-0" />
                        {th('cloudModeTitle') || 'Cloud turnaj'}
                      </p>
                      <p className="text-[11px] text-slate-300 mt-2 leading-snug">
                        {th('cloudModeHint') ||
                          'Online registrace, cloud synchronizace, tablety u terčů a TV obrazovka.'}
                      </p>
                      <p className="text-[11px] text-sky-100/90 mt-2 leading-snug">
                        {th('cloudModeConditions') ||
                          'Podmínky: internet + Google přihlášení pořadatele. Diváci/tablety se připojují přes PIN.'}
                      </p>
                    </button>
                  </div>

                  {!isLoggedIn && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 px-3 py-3 space-y-3">
                      <p className="text-sm font-medium text-amber-100/95 leading-snug flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          {th('cloudModeLoginWarning') ||
                            t('tournamentHub.loginRequiredForCloud') ||
                            'Pro tablety, cloudové diváky a TV obrazovku haly se musíte přihlásit přes Google.'}
                        </span>
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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('venueTvOpen')}
                      </span>
                      <ContextHelpButton
                        topicId="tv-screen"
                        lang={lang}
                        onOpenContextHelp={onOpenContextHelp}
                      />
                    </div>
                    <VenueTvLinkCard
                      lang={lang}
                      pin={setupPinDisplay}
                      isLoggedIn={!!isLoggedIn}
                      cloudEnabled={!!tournamentDraft.cloudEnabled}
                    />
                  </div>
                  {tournamentDraft.cloudEnabled && isLoggedIn && (
                    <div className="rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-3 space-y-2">
                      <label
                        className="block text-[10px] font-bold uppercase tracking-widest text-slate-400"
                        htmlFor="tournament-tablet-password"
                      >
                        {t('tournTabletPasswordLabel') || 'Heslo pro herní tablety'}
                      </label>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        {t('tournTabletPasswordHint') ||
                          'Max. 5 znaků, musí se lišit od PINu. Divácké tablety zadávají pouze PIN.'}
                      </p>
                      <input
                        id="tournament-tablet-password"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        maxLength={5}
                        value={String(tournamentDraft.tabletPassword ?? '')}
                        onChange={(e) =>
                          setTournamentDraft((prev) => ({
                            ...prev,
                            tabletPassword: e.target.value.slice(0, 5),
                          }))
                        }
                        placeholder={t('tournTabletPasswordPlaceholder') || 'např. ab12'}
                        className={inputBase}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {validationError && (
              <div
                className="lg:col-span-12 p-3 rounded-lg bg-red-900/30 border border-red-500/50 text-red-400 text-sm font-bold"
                role="alert"
              >
                {validationError}
              </div>
            )}
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
                  onClick={() => setStep(3)}
                  disabled={!canContinueStep2}
                  className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {t('tournContinue') || 'Pokračovat'}
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 w-full">
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
                      {t('tournUseCsoRanking')}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {t('tournUseCsoRankingHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useCsoRanking}
                    onClick={() =>
                      setTournamentDraft((prev) => {
                        const nextOn = !prev.useCsoRanking;
                        return {
                          ...prev,
                          useCsoRanking: nextOn,
                          // Při zapnutí ČŠO smaž uložené ranky — UI bere živý žebříček.
                          players: nextOn
                            ? (prev.players || []).map((p) =>
                                p?.kind === 'team' ? p : { ...p, ranking: null }
                              )
                            : prev.players,
                        };
                      })
                    }
                    className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer ${
                      useCsoRanking ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        useCsoRanking ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {isRandomDoubles && (
                <RandomPairDrawPanel
                  lang={lang}
                  playerCount={
                    pairDrawDone
                      ? (tournamentDraft.pairDrawRoster?.length ??
                        players.reduce((n, p) => n + (p.members?.length ?? 0), 0) +
                          (tournamentDraft.pairDrawReserve ? 1 : 0))
                      : players.length
                  }
                  teamCount={players.filter((p) => p?.kind === 'team').length}
                  reserve={tournamentDraft.pairDrawReserve ?? null}
                  drawn={pairDrawDone}
                  canDraw={!pairDrawDone && players.filter((p) => p?.kind !== 'team').length >= 2}
                  busy={pairDrawBusy}
                  onDraw={applyPairDraw}
                  onRedraw={applyPairDraw}
                  onDissolve={handleDissolvePairs}
                />
              )}

              <div className="p-4 border rounded-xl bg-slate-900 border-slate-800">
                  {useCsoRanking && (
                  <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-slate-800">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {usesDoublesCso ? t('tournCsoDoublesRanking') : t('tournCsoRanking')}
                    </span>
                    {!usesDoublesCso && (
                    <div className="flex rounded-lg overflow-hidden border border-slate-600">
                      {(['men', 'women']).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setTournamentDraft((prev) => ({ ...prev, csoRankingGender: g }))
                          }
                          className={`px-4 py-2 text-sm font-bold transition-colors ${
                            csoGender === g
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-900 text-slate-400 hover:text-white'
                          }`}
                        >
                          {g === 'men' ? t('tournMen') : t('tournWomen')}
                        </button>
                      ))}
                    </div>
                    )}
                    <a
                      href={getCsoRankingUrl(csoListKey)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleExternalLinkClick(getCsoRankingUrl(csoListKey))}
                      className={`${btnBase} bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm`}
                    >
                      <ExternalLink className="w-4 h-4" />
                      {t('tournOpenOfficialRanking')}
                    </a>
                    {csoLoading && (
                      <span className="text-xs text-slate-500">
                        {t('tournCsoLoading')}
                      </span>
                    )}
                    {!csoLoading && !csoError && getCsoRankingDisplayDate(csoMeta) && (
                      <span className="text-xs text-slate-500 px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700">
                        {t('tournCsoUpdatedAt')}{' '}
                        <span className="text-slate-300 font-mono">
                          {formatCsoUpdatedAt(getCsoRankingDisplayDate(csoMeta))}
                        </span>
                      </span>
                    )}
                    {csoError && !csoLoading && (
                      <span className="text-xs text-amber-400">{csoError}</span>
                    )}
                    <CsoRankingUpdateButton
                      lang={lang}
                      user={user}
                      onLogin={onGoogleLogin}
                      onNotify={onNotify}
                      compact
                      onUpdated={(result) => {
                        // Okamžitě zobraz datum ze Stedar (odpověď CF), ať badge nesedí na starém static JSON.
                        const side = usesDoublesCso
                          ? result?.doubles
                          : csoGender === 'women'
                            ? result?.women
                            : result?.men;
                        const updatedAt = side?.updatedAt || result?.updatedAt;
                        if (updatedAt) {
                          setCsoMeta((prev) => ({
                            ...(prev || {}),
                            gender: csoGender,
                            updatedAt,
                            // generatedAt = pin proti přepsání starým static JSON při re-fetchi
                            generatedAt: updatedAt,
                            totalPlayers:
                              side?.totalPlayers ?? prev?.totalPlayers ?? null,
                          }));
                        }
                        setCsoReloadKey((k) => k + 1);
                      }}
                    />
                  </div>
                  )}
                  {fromPreReg ? (
                    <p className="text-xs text-slate-400 leading-snug">{t('tournRosterFromPreregHint')}</p>
                  ) : pairDrawDone ? (
                    <p className="text-xs text-slate-400">{t('tournRandomAddLocked')}</p>
                  ) : (
                  <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                        {t('playerName') || 'Jméno hráče'}
                      </label>
                      <AdminTapTextField
                        fieldRef={playerNameFieldRef}
                        id="tournament-setup-player-name"
                        value={editingIndex !== null ? editName : playerName}
                        onValueChange={handlePlayerNameChange}
                        onEnterPress={() => {
                          vkOpt?.closeKeyboard?.();
                          setShowSuggestions(false);
                          if (useCsoRanking) {
                            const ok =
                              editingIndex !== null ? handleSaveEdit() : handleAddPlayer();
                            if (ok) {
                              requestAnimationFrame(() => {
                                playerNameFieldRef.current?.focus();
                                playerNameFieldRef.current?.click();
                              });
                            }
                            return;
                          }
                          requestAnimationFrame(() => {
                            playerRankingFieldRef.current?.focus();
                            playerRankingFieldRef.current?.click();
                          });
                        }}
                        placeholder={t('tournPlayerPlaceholder') || 'Jméno nebo jméno a příjmení'}
                        className={inputBase}
                      />
                      {useCsoRanking && showSuggestions && nameSuggestions.length > 0 && (
                        <ul
                          className="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl"
                          role="listbox"
                          id="tournament-setup-cso-suggestions"
                        >
                          {nameSuggestions.map((entry, index) => (
                            <li key={entry.rank} role="option" aria-selected={suggestionHighlight === index}>
                              <button
                                type="button"
                                ref={(el) => setSuggestionOptionRef(index, el)}
                                className={`w-full px-3 py-2 text-left flex justify-between gap-2 items-center ${
                                  suggestionHighlight === index
                                    ? 'bg-emerald-900/50'
                                    : 'hover:bg-emerald-900/40'
                                }`}
                                onClick={() => selectCsoPlayer(entry)}
                                onMouseEnter={() => setSuggestionHighlight(index)}
                              >
                                <span className="font-medium text-white truncate">{entry.name}</span>
                                <span className="text-xs text-slate-400 font-mono shrink-0">#{entry.rank}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                        {t('tournRanking') || 'Ranking'}
                        {useCsoRanking && (
                          <span className="ml-2 normal-case font-normal text-emerald-400">
                            ({t('tournCsoLiveRank') || 'živý žebříček'})
                          </span>
                        )}
                      </label>
                      {useCsoRanking ? (
                        <div className={`${inputBase} w-full font-mono text-emerald-300 flex items-center`}>
                          {(() => {
                            const liveName = editingIndex !== null ? editName : playerName;
                            const live =
                              selectedCsoRank != null
                                ? selectedCsoRank
                                : resolvePlayerLiveRank(liveName, csoList);
                            return live != null ? `#${live}` : '–';
                          })()}
                        </div>
                      ) : (
                      <AdminTapTextField
                        fieldRef={playerRankingFieldRef}
                        id="tournament-setup-player-ranking"
                        value={editingIndex !== null ? editRanking : playerRanking}
                        onValueChange={(v) => {
                          if (editingIndex !== null) setEditRanking(v);
                          else setPlayerRanking(v);
                          setSelectedCsoRank(null);
                        }}
                        onEnterPress={() => {
                          vkOpt?.closeKeyboard?.();
                          const ok =
                            editingIndex !== null ? handleSaveEdit() : handleAddPlayer();
                          if (ok) {
                            requestAnimationFrame(() => {
                              playerNameFieldRef.current?.focus();
                              playerNameFieldRef.current?.click();
                            });
                          }
                        }}
                        filterChar={(c) => /^\d$/.test(c)}
                        placeholder="–"
                        className={`${inputBase} w-full font-mono`}
                      />
                      )}
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
                        setSelectedCsoRank(null);
                        setShowSuggestions(false);
                        setNameSuggestions([]);
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
                  </>
                  )}
                </div>
              <div className="flex flex-col w-full min-w-0">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {hasTeams
                      ? `${t('tournTeamList') || t('tournPlayerList')} (${players.length})`
                      : `${t('tournPlayerList') || 'Registrovaní hráči'} (${players.length})`}
                  </span>
                  {isRandomDoubles && !pairDrawDone && (
                    <span className="text-xs text-amber-400">{t('tournNeedPairDraw')}</span>
                  )}
                  {pairDrawDone && competitiveSlots.length < minPlayersRequired && (
                    <span className="text-xs text-amber-400">
                      {minPlayersRequired <= 2 ? t('tournMinTeamsKo') : t('tournMinTeams')}
                    </span>
                  )}
                  {!isRandomDoubles && players.length < minPlayersRequired && (
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
                          const ra = getDisplayRanking(a);
                          const rb = getDisplayRanking(b);
                          const na = ra != null ? ra : Infinity;
                          const nb = rb != null ? rb : Infinity;
                          return na - nb;
                        })
                        .map((p) => (
                          <li
                            key={p._origIdx}
                            id={`tourn-player-${p._origIdx}`}
                            className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${
                              highlightPlayerIndex === p._origIdx
                                ? 'bg-emerald-900/40 border-emerald-500 ring-2 ring-emerald-500/50'
                                : dupName[p._origIdx]
                                  ? 'bg-amber-900/20 border-amber-500/60'
                                  : 'bg-slate-800 border-slate-700'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="flex items-center gap-2">
                                <UserPlus className="w-4 h-4 text-slate-500 shrink-0" />
                                <span className="font-bold text-white line-clamp-2 leading-tight">{p.name}</span>
                                {getDisplayRanking(p) != null && (
                                  <span className="text-xs text-slate-500 font-mono">
                                    ({getDisplayRanking(p)})
                                  </span>
                                )}
                              </div>
                              {p.kind === 'team' && Array.isArray(p.members) && (
                                <span className="text-[10px] text-slate-500 truncate">
                                  {p.members.map((m) => m.name).filter(Boolean).join(' · ')}
                                </span>
                              )}
                              {dupName[p._origIdx] && (
                                <span className="text-[10px] text-amber-400 font-medium">
                                  {t('tournDupName') || 'Duplicitní jméno'}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {!fromPreReg && p.kind !== 'team' && (
                              <button
                                type="button"
                                onClick={() => handleEditPlayer(p._origIdx)}
                                className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-slate-400 hover:bg-slate-700 hover:text-emerald-400 transition-colors"
                                title={t('editThrow') || 'Upravit'}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              )}
                              {!fromPreReg && (
                              <button
                                type="button"
                                onClick={() => handleDeletePlayer(p._origIdx)}
                                className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors"
                                title="Smazat"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              )}
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
            <div className="w-full flex justify-end gap-2 mt-4 sm:hidden">
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canContinueStep2}
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
          <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start animate-in fade-in duration-200">
            <div
              className={`space-y-4 ${fmtBracketOnly ? 'lg:col-span-12 max-w-3xl lg:mx-auto w-full' : 'lg:col-span-5'}`}
            >
              <div className="flex items-center justify-end gap-2 mb-0 lg:mb-0">
                <h2 className="flex-1 text-center text-xl font-black tracking-widest uppercase text-emerald-400 px-2">
                  {stepLabels.tournStep3}
                </h2>
                <div className="w-24 sm:w-40 shrink-0 flex justify-end">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={
                      competitiveSlots.length < minPlayersRequired ||
                      hasAnyDuplicates() ||
                      isCustomInvalid ||
                      isGenerating ||
                      (isRandomDoubles && !pairDrawDone)
                    }
                    className={`${btnBase} w-full bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Target className="w-5 h-5" />
                    )}
                    {isGenerating
                      ? t('tournGenerating') || 'Generuji turnaj…'
                      : t('tournGenerate') || 'Vygenerovat turnaj'}
                  </button>
                </div>
              </div>

              {/* Levý blok – nastavení legů, typu hry a ukončení */}
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
                  <NumericStepper
                    useAdminTap
                    allowEmpty
                    value={rawNumBoards === '' || rawNumBoards == null ? '' : numBoards}
                    onChange={(v) =>
                      setTournamentDraft((prev) => ({
                        ...prev,
                        numBoards: v === '' ? '' : v,
                      }))
                    }
                    min={1}
                    max={99}
                    quickValues={[2, 4, 6, 8, 10, 12]}
                    decreaseLabel={t('numericDecrease') || 'Snížit'}
                    increaseLabel={t('numericIncrease') || 'Zvýšit'}
                    hint={t('tournNumBoardsHint') || 'Počet fyzických terčů v herně (1–99)'}
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
            </div>

            {/* Pravý blok – přehled hráčů a sbalené vzory formátu */}
            <div className={`lg:col-span-7 min-w-0 ${fmtBracketOnly ? 'hidden' : ''}`}>
              <div className="flex flex-col gap-4 min-w-0">
                <div className="p-4 border rounded-xl bg-slate-900 border-slate-800 space-y-4">
                  <p className="text-base font-black text-emerald-400">
                    {t('tournPlayersTotal') || 'Celkem přihlášeno'}: {players.length} {t('tournPlayersMany') || 'hráčů'}
                  </p>
                </div>
                <details className="rounded-xl border border-slate-700 bg-slate-900/80 group">
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('tournVariantChoose') || 'Vyberte formát turnaje'}
                      </span>
                      <span className="block text-sm font-black text-emerald-400 mt-0.5">
                        {isCustomFormat
                          ? t('tournVariantCustom')
                          : t(selectedVariant?.labelKey) || t('tournVariantStandard')}
                      </span>
                    </span>
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wide group-open:rotate-180 transition-transform">
                      ▾
                    </span>
                  </summary>
                  <div className="px-3 pb-3 space-y-3 border-t border-slate-800 pt-3">
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
                        promotersCount: prev.customAdvancePerGroup ?? 2,
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
                        <NumericStepper
                          useAdminTap
                          value={customNumGroups}
                          onChange={(v) => {
                            const n = Math.max(1, Math.min(99, Number(v) || 1));
                            setTournamentDraft((prev) => ({
                              ...prev,
                              customNumGroups: n,
                              numGroups: n,
                            }));
                          }}
                          min={1}
                          max={99}
                          decreaseLabel={t('numericDecrease') || 'Snížit'}
                          increaseLabel={t('numericIncrease') || 'Zvýšit'}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                          {t('tournCustomAdvancePerGroup') || 'Počet postupujících z každé skupiny'}
                        </label>
                        <NumericStepper
                          useAdminTap
                          value={customAdvancePerGroup}
                          onChange={(v) => {
                            const n = Math.max(1, Math.min(99, Number(v) || 1));
                            setTournamentDraft((prev) => ({
                              ...prev,
                              customAdvancePerGroup: n,
                              advancePerGroup: n,
                              promotersCount: n,
                            }));
                          }}
                          min={1}
                          max={99}
                          decreaseLabel={t('numericDecrease') || 'Snížit'}
                          increaseLabel={t('numericIncrease') || 'Zvýšit'}
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

                <div className="flex flex-col gap-3 min-w-0">
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
                          promotersCount: v.advancePerGroup === 'all' ? 'all' : v.advancePerGroup,
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
                </details>
              </div>
            </div>

            {validationError && (
              <div
                className="lg:col-span-12 p-3 rounded-lg bg-red-900/30 border border-red-500/50 text-red-400 text-sm font-bold"
                role="alert"
              >
                {validationError}
              </div>
            )}

            {/* Akce jsou vždy v horní liště (vlevo / uprostřed / vpravo). */}
          </div>
        )}
      </div>

      {step === 1 && (
        <StickyActionBar>
          <button
            type="button"
            onClick={handleStep1Continue}
            className={`${btnBase} w-full bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500`}
          >
            {t('tournContinue') || 'Pokračovat'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </StickyActionBar>
      )}

      {step === 2 && (
        <StickyActionBar>
          <button
            type="button"
            onClick={() => setStep(3)}
            disabled={players.length < minPlayersRequired || hasAnyDuplicates()}
            className={`${btnBase} w-full bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40`}
          >
            {t('tournContinue') || 'Pokračovat'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </StickyActionBar>
      )}

      {step === 3 && (
        <StickyActionBar>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={
              players.length < minPlayersRequired ||
              hasAnyDuplicates() ||
              isCustomInvalid ||
              isGenerating
            }
            className={`${btnBase} w-full bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 disabled:opacity-40`}
          >
            {isGenerating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Target className="w-5 h-5" />
            )}
            {isGenerating
              ? t('tournGenerating') || 'Generuji turnaj…'
              : t('tournGenerate') || 'Vygenerovat turnaj'}
          </button>
        </StickyActionBar>
      )}

      <PlayerDuplicateModal
        open={!!dupModal}
        playerName={dupModal?.name || ''}
        title={t('playerDupTitle')}
        message={(t('playerDupMessageList') || 'Hráč {name} už je v seznamu hráčů zapsán.').replace(
          '{name}',
          dupModal?.name || ''
        )}
        cancelLabel={t('playerDupCancel')}
        addAnywayLabel={t('playerDupAddAnyway')}
        goToExistingLabel={t('playerDupGoExisting')}
        onCancel={() => {
          if (dupModal?.mode === 'select') {
            clearPlayerForm();
            if (editingIndex !== null) {
              setEditingIndex(null);
              setEditName('');
              setEditRanking('');
            }
          }
          setDupModal(null);
        }}
        onAddAnyway={() => {
          const modal = dupModal;
          setDupModal(null);
          if (!modal) return;
          if (modal.mode === 'edit') {
            handleSaveEdit({ force: true });
            return;
          }
          // add | select — přidej s override
          if (modal.mode === 'select') {
            commitAddPlayer(modal.name, modal.ranking, modal.csoPlayerId, { duplicateOk: true });
            return;
          }
          handleAddPlayer({ force: true });
        }}
        onGoToExisting={() => {
          const idx = dupModal?.existingIndex;
          setDupModal(null);
          clearPlayerForm();
          setEditingIndex(null);
          setEditName('');
          setEditRanking('');
          if (idx == null) return;
          handleEditPlayer(idx);
          window.setTimeout(() => {
            document.getElementById(`tourn-player-${idx}`)?.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
            });
          }, 50);
        }}
      />
    </main>
  );
}
