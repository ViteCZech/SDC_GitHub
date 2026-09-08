import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { translations } from '../translations';
import { useSyncAdapter } from '../context/SyncAdapterContext';
import {
  VENUE_BOARDS_PER_PAGE,
  VENUE_BOARDS_PER_PAGE_WITH_BRACKET,
  VENUE_CALL_MS,
  VENUE_CAROUSEL_MS,
  VENUE_GROUPS_PER_PAGE,
  VENUE_LISTEN_TIMEOUT_MS,
  boardsOccupancySignature,
  buildVenueFinishedSummary,
  buildVenueDisplayModel,
  buildVenueGroupSnapshots,
  chunkVenuePages,
  detectVenueMatchCalls,
  formatTvPlayerName,
  isVenueTournamentFinished,
  resolveVenueBoardColumns,
  venueBestOfFromWinLegs,
} from '../utils/venueDisplay';

function tv(lang, key) {
  return translations[lang]?.venueDisplay?.[key] ?? translations.cs?.venueDisplay?.[key] ?? key;
}

function tt(lang, key, fallback = key) {
  return translations[lang]?.[key] ?? translations.cs?.[key] ?? fallback;
}

function matchIdOf(m) {
  if (!m) return '';
  const id = m.matchId ?? m.id;
  return id != null ? String(id) : '';
}

function isTerminalMatch(m) {
  return m?.status === 'completed' || m?.status === 'walkover' || m?.walkover === true;
}

function toFiniteNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function resolvePlayerName(raw, side, playerNameById) {
  const rawName = side === 1
    ? raw?.player1Name ?? raw?.p1Name
    : raw?.player2Name ?? raw?.p2Name;
  const trimmedRaw = String(rawName ?? '').trim();
  if (trimmedRaw) return trimmedRaw;
  const pid = side === 1 ? raw?.player1Id : raw?.player2Id;
  const fromMap = pid != null ? playerNameById.get(String(pid)) : '';
  return fromMap || (pid != null && String(pid).trim() ? String(pid).trim() : '—');
}

function resolveRefereeName(raw, playerNameById) {
  const explicit = raw?.referee?.name ?? raw?.refereeName;
  if (String(explicit ?? '').trim()) return String(explicit).trim();
  const refId = raw?.referee?.id ?? raw?.refereeId ?? raw?.chalkerId;
  if (refId == null || String(refId).trim() === '') return '';
  return playerNameById.get(String(refId)) || String(refId);
}

function resolveLegs(raw, fallback) {
  const r = raw?.result && typeof raw.result === 'object' ? raw.result : {};
  const p1 = toFiniteNumber(r.p1Legs ?? raw?.legsP1 ?? raw?.score1 ?? raw?.score?.p1 ?? fallback?.legsP1);
  const p2 = toFiniteNumber(r.p2Legs ?? raw?.legsP2 ?? raw?.score2 ?? raw?.score?.p2 ?? fallback?.legsP2);
  return {
    p1: p1 ?? 0,
    p2: p2 ?? 0,
  };
}

function resolveSets(raw) {
  const p1 = toFiniteNumber(raw?.p1Sets ?? raw?.result?.p1Sets);
  const p2 = toFiniteNumber(raw?.p2Sets ?? raw?.result?.p2Sets);
  const setScores = Array.isArray(raw?.setScores)
    ? raw.setScores
    : Array.isArray(raw?.result?.setScores)
      ? raw.result.setScores
      : [];
  return {
    hasSets: (p1 != null && p2 != null) || setScores.length > 0,
    p1: p1 ?? 0,
    p2: p2 ?? 0,
    setScores,
  };
}

function resolveAverages(raw) {
  const p1 = toFiniteNumber(raw?.p1Avg ?? raw?.result?.p1Avg);
  const p2 = toFiniteNumber(raw?.p2Avg ?? raw?.result?.p2Avg);
  return {
    p1: p1 != null && p1 > 0 ? p1 : null,
    p2: p2 != null && p2 > 0 ? p2 : null,
  };
}

function resolveThrowingPlayerName(raw, names, playerNameById) {
  const explicit = raw?.currentThrowerName ?? raw?.throwerName ?? raw?.activeThrowerName ?? raw?.currentPlayerName;
  if (String(explicit ?? '').trim()) return String(explicit).trim();
  const throwerId = raw?.currentThrowerId ?? raw?.throwerId ?? raw?.activeThrowerId;
  if (throwerId != null && String(throwerId).trim()) {
    const mapped = playerNameById.get(String(throwerId));
    if (mapped) return mapped;
  }
  const side = String(raw?.currentPlayer ?? raw?.activePlayer ?? '').trim().toLowerCase();
  if (side === 'p1') return names?.player1Name || '';
  if (side === 'p2') return names?.player2Name || '';
  return '';
}

function resolveThrowingPlayerId(raw) {
  const throwerId = raw?.currentThrowerId ?? raw?.throwerId ?? raw?.activeThrowerId;
  if (throwerId == null) return '';
  const id = String(throwerId).trim();
  return id || '';
}

function resolveRemainingLegPoints(raw, fallback) {
  const pickScore = (...values) => {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return Math.max(0, Math.round(parsed));
    }
    return null;
  };
  const p1 = pickScore(
    raw?.p1Score,
    raw?.liveScore?.p1,
    raw?.currentScore?.p1,
    raw?.scoreRemaining?.p1,
    raw?.pointsRemaining?.p1,
    raw?.remaining?.p1,
    fallback?.remainingP1
  );
  const p2 = pickScore(
    raw?.p2Score,
    raw?.liveScore?.p2,
    raw?.currentScore?.p2,
    raw?.scoreRemaining?.p2,
    raw?.pointsRemaining?.p2,
    raw?.remaining?.p2,
    fallback?.remainingP2
  );
  return { p1, p2 };
}

function resolveMissingPresence(raw, names, lang) {
  if (!raw || raw.tabletStatus !== 'timeout_warning') return [];
  const present = raw.tabletCheckInPresent;
  const labels = [];
  const p1Name = names?.player1Name || tv(lang, 'player');
  const p2Name = names?.player2Name || tv(lang, 'player');
  const refereeName = names?.refereeName || tv(lang, 'referee');
  const addIfMissing = (isPresent, label) => {
    if (isPresent) return;
    labels.push(label);
  };

  if (present && typeof present === 'object') {
    addIfMissing(!!present.p1, p1Name);
    addIfMissing(!!present.p2, p2Name);
    addIfMissing(!!present.referee, refereeName);
    return labels;
  }

  return [p1Name, p2Name, refereeName];
}

function matchStatusPriority(match) {
  const status = String(match?.status ?? '').toLowerCase();
  if (status === 'playing' || status === 'in_progress') return 0;
  if (String(match?.tabletStatus ?? '') === 'checked_in') return 1;
  if (status === 'pending') return 2;
  if (status === 'completed' || status === 'walkover') return 4;
  return 3;
}

function resolveMatchStatus(match) {
  return String(match?.status ?? '').toLowerCase();
}

function isLiveMatch(match) {
  const status = resolveMatchStatus(match);
  return status === 'playing' || status === 'in_progress';
}

function isDoneMatch(match) {
  const status = resolveMatchStatus(match);
  return status === 'completed' || status === 'walkover' || match?.walkover === true;
}

function hasMeaningfulScore(match) {
  if (!match) return false;
  if (Number(match?.hasSets ? match?.p1Sets : match?.legsP1) > 0) return true;
  if (Number(match?.hasSets ? match?.p2Sets : match?.legsP2) > 0) return true;
  if (Number(match?.legsP1) > 0 || Number(match?.legsP2) > 0) return true;
  return false;
}

function shouldShowScoreBlock(match) {
  if (!match) return false;
  if (isLiveMatch(match) || isDoneMatch(match)) return true;
  return hasMeaningfulScore(match);
}

const GROUP_DENSITY_RULES = [
  { maxRows: 4, perScreen: 8, columns: 4 },
  { maxRows: 5, perScreen: 6, columns: 3 },
  { maxRows: Number.POSITIVE_INFINITY, perScreen: 4, columns: 2 },
];

function resolveGroupDensity(groups) {
  const list = Array.isArray(groups) ? groups : [];
  if (list.length <= 2) {
    return {
      perScreen: 2,
      columns: Math.max(1, list.length),
    };
  }
  const maxPlayersInGroup = list.reduce((max, group) => {
    const rows = Array.isArray(group?.rows) ? group.rows.length : 0;
    return Math.max(max, rows);
  }, 0);
  const matched = GROUP_DENSITY_RULES.find((rule) => maxPlayersInGroup <= rule.maxRows) || GROUP_DENSITY_RULES[GROUP_DENSITY_RULES.length - 1];
  return {
    perScreen: matched.perScreen,
    columns: matched.columns,
  };
}

function formatBoardBadge(boards, lang) {
  const list = (boards || []).map((b) => String(b ?? '').trim()).filter(Boolean);
  if (list.length === 0) return tv(lang, 'boardUnassigned') || 'Terč čeká';
  if (list.length === 1) return `${tv(lang, 'board') || 'Terč'} ${list[0]}`;
  return `${tv(lang, 'boards') || 'Terče'} ${list.join(', ')}`;
}

function normalizeForCompare(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveThrowingSide(match) {
  const throwerId = String(match?.throwingPlayerId ?? '').trim();
  if (throwerId) {
    if (String(match?.player1Id ?? '').trim() === throwerId) return 'p1';
    if (String(match?.player2Id ?? '').trim() === throwerId) return 'p2';
  }
  const thrower = normalizeForCompare(match?.throwingPlayerName);
  if (!thrower) return null;
  const p1 = normalizeForCompare(match?.player1Name);
  const p2 = normalizeForCompare(match?.player2Name);
  const hit = (player) => player && (player === thrower || player.includes(thrower) || thrower.includes(player));
  if (hit(p1)) return 'p1';
  if (hit(p2)) return 'p2';
  return null;
}

function resolveMatchVisualMeta(match, lang) {
  const status = String(match?.status ?? '').toLowerCase();
  const tabletStatus = String(match?.tabletStatus ?? '').toLowerCase();
  if (status === 'playing' || status === 'in_progress') {
    return {
      key: 'live',
      label: tv(lang, 'statusPlaying'),
      cardClass: 'border-red-500/70 bg-red-500/10',
      pillClass: 'border-red-400/70 bg-red-500/20 text-red-100',
      pulseClass: 'bg-red-300',
      icon: null,
    };
  }
  if (status === 'completed' || status === 'walkover') {
    return {
      key: 'done',
      label: tv(lang, 'statusDone'),
      cardClass: 'border-emerald-500/55 bg-emerald-500/10',
      pillClass: 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100',
      pulseClass: 'bg-emerald-300',
      icon: CheckCircle2,
    };
  }
  if (tabletStatus === 'timeout_warning') {
    return {
      key: 'warning',
      label: tv(lang, 'presenceWarning'),
      cardClass: 'border-amber-500/70 bg-amber-500/10',
      pillClass: 'border-amber-400/70 bg-amber-500/20 text-amber-100',
      pulseClass: 'bg-amber-300',
      icon: AlertTriangle,
    };
  }
  if (tabletStatus === 'checked_in') {
    return {
      key: 'ready',
      label: tv(lang, 'statusReady'),
      cardClass: 'border-cyan-500/60 bg-cyan-500/10',
      pillClass: 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100',
      pulseClass: 'bg-cyan-300',
      icon: null,
    };
  }
  return {
    key: 'pending',
    label: tv(lang, 'statusPending'),
    cardClass: 'border-slate-700 bg-slate-900/95',
    pillClass: 'border-slate-600 bg-slate-800 text-slate-200',
    pulseClass: 'bg-slate-400',
    icon: Clock3,
  };
}

function resolveMainScore(match, lang) {
  if (match?.hasSets) {
    return {
      value: `${match.p1Sets ?? 0} : ${match.p2Sets ?? 0}`,
      label: tv(lang, 'sets'),
      detail: `${tv(lang, 'legs')} ${match.legsP1 ?? 0}:${match.legsP2 ?? 0}`,
    };
  }
  return {
    value: `${match?.legsP1 ?? 0} : ${match?.legsP2 ?? 0}`,
    label: tv(lang, 'legs'),
    detail: '',
  };
}

function formatAvgValue(avg) {
  const n = Number(avg);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '';
}

function formatRemainingLegPoints(match, lang) {
  const p1 = toFiniteNumber(match?.remainingP1);
  const p2 = toFiniteNumber(match?.remainingP2);
  if (p1 == null && p2 == null) return '';
  const left = p1 == null ? '—' : String(Math.max(0, Math.round(p1)));
  const right = p2 == null ? '—' : String(Math.max(0, Math.round(p2)));
  return `${tv(lang, 'legPointsLeft')}: ${left} : ${right}`;
}

function buildVenueDevMockDoc() {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const groups = letters.map((letter, idx) => {
    const basePlayers = Array.from({ length: idx === 0 ? 8 : 4 }, (_v, pIdx) => {
      const id = `g${letter}-p${pIdx + 1}`;
      return {
        id,
        name: `${letter} Hráč ${pIdx + 1} Dlouhé Příjmení`,
      };
    });
    return {
      groupId: letter,
      name: `Skupina ${letter}`,
      boards: [((idx % 4) + 1)],
      players: basePlayers,
    };
  });
  const groupMatches = [
    {
      matchId: 'm-a-1',
      groupId: 'A',
      board: 1,
      status: 'playing',
      tabletStatus: 'timeout_warning',
      tabletCheckInPresent: { p1: true, p2: false, referee: false },
      player1Id: 'gA-p1',
      player2Id: 'gA-p2',
      referee: { name: 'A Hráč 3' },
      result: { p1Legs: 1, p2Legs: 1, p1Avg: 66.14, p2Avg: 62.01 },
      p1Avg: 66.14,
      p2Avg: 62.01,
      p1Score: 241,
      p2Score: 301,
      currentThrowerId: 'gA-p1',
      currentPlayer: 'p1',
    },
    {
      matchId: 'm-a-2',
      groupId: 'A',
      board: 1,
      status: 'pending',
      player1Id: 'gA-p4',
      player2Id: 'gA-p5',
      referee: { name: 'A Hráč 6' },
    },
    {
      matchId: 'm-b-1',
      groupId: 'B',
      board: 2,
      status: 'playing',
      tabletStatus: 'checked_in',
      player1Id: 'gB-p1',
      player2Id: 'gB-p2',
      referee: { name: 'B Hráč 3' },
      result: { p1Legs: 2, p2Legs: 0, p1Avg: 71.44, p2Avg: 57.3 },
      p1Avg: 71.44,
      p2Avg: 57.3,
      p1Score: 120,
      p2Score: 340,
      currentThrowerId: 'gB-p2',
      currentPlayer: 'p2',
    },
    {
      matchId: 'm-c-1',
      groupId: 'C',
      board: 3,
      status: 'pending',
      player1Id: 'gC-p1',
      player2Id: 'gC-p2',
      referee: { name: 'C Hráč 3' },
    },
    {
      matchId: 'm-d-1',
      groupId: 'D',
      board: 4,
      status: 'completed',
      player1Id: 'gD-p1',
      player2Id: 'gD-p2',
      referee: { name: 'D Hráč 3' },
      result: { p1Legs: 2, p2Legs: 1, p1Avg: 63.9, p2Avg: 60.7 },
    },
  ];
  const tournamentBracket = [
    {
      round: 1,
      matches: [
        {
          id: 'b-qf-1',
          board: 1,
          status: 'playing',
          player1Id: 'gA-p1',
          player2Id: 'gB-p1',
          referee: { name: 'E Hráč 1' },
          p1Sets: 1,
          p2Sets: 0,
          setScores: [{ p1: 2, p2: 1 }, { p1: 1, p2: 0 }],
          score: { p1: 1, p2: 0 },
          p1Avg: 74.12,
          p2Avg: 68.87,
        },
        {
          id: 'b-qf-2',
          board: 2,
          status: 'pending',
          tabletStatus: 'timeout_warning',
          tabletCheckInPresent: { p1: false, p2: true, referee: true },
          player1Id: 'gC-p1',
          player2Id: 'gD-p1',
          referee: { name: 'F Hráč 1' },
          score: { p1: 0, p2: 0 },
        },
      ],
    },
    {
      round: 2,
      matches: [
        {
          id: 'b-sf-1',
          board: 3,
          status: 'pending',
          player1Name: 'Vítěz QF1',
          player2Name: 'Vítěz QF2',
          referee: { name: 'Čeká na poraženého' },
          score: { p1: 0, p2: 0 },
        },
      ],
    },
    {
      round: 3,
      matches: [
        {
          id: 'b-final-1',
          board: 1,
          status: 'pending',
          player1Name: 'Vítěz SF1',
          player2Name: 'Vítěz SF2',
          refereeName: 'Čeká na poraženého',
          score: { p1: 0, p2: 0 },
        },
      ],
    },
  ];
  return {
    status: 'running',
    tournamentData: {
      name: 'TV Demo Open',
      numBoards: 4,
      prelimLegs: 3,
      groups,
    },
    groups,
    groupMatches,
    tournamentBracket,
  };
}

function shouldUseVenueDevMock(pin, invalidPin) {
  if (!import.meta.env.DEV || invalidPin || !pin || typeof window === 'undefined') return false;
  try {
    const search = new URLSearchParams(window.location.search || '');
    return search.get('mock') === '1';
  } catch {
    return false;
  }
}

function PlayerName({ text, className = '' }) {
  const normalized = String(text ?? '').trim() || '—';
  return (
    <span
      className={className}
      title={normalized}
    >
      {normalized}
    </span>
  );
}

function StatusPill({ match, lang }) {
  const meta = resolveMatchVisualMeta(match, lang);
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${meta.pillClass}`}>
      {Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <span className={`h-2 w-2 rounded-full ${meta.pulseClass} ${meta.key === 'live' ? 'animate-pulse' : ''}`} />
      )}
      {meta.label}
    </span>
  );
}

function LiveMatchCard({ board, lang, formatLabel, compact = false }) {
  const match = board.current || board.next;
  if (!match) return null;
  const score = resolveMainScore(match, lang);
  const throwingSide = resolveThrowingSide(match);
  const statusMeta = resolveMatchVisualMeta(match, lang);
  const showScoreBlock = shouldShowScoreBlock(match);
  const liveOrDone = isLiveMatch(match) || isDoneMatch(match);
  const remainingLegPoints = showScoreBlock ? formatRemainingLegPoints(match, lang) : '';

  const playerCell = (side, name, avg, align) => {
    const isThrowing = isLiveMatch(match) && throwingSide === side;
    const avgValue = liveOrDone ? formatAvgValue(avg) : '';
    return (
      <div
        className={`rounded-lg border px-2 py-2 ${compact ? 'min-h-[3.8rem]' : 'min-h-[5rem]'} flex flex-col justify-between ${
          isThrowing ? 'border-emerald-400/70 bg-emerald-500/15' : 'border-slate-700 bg-slate-900/80'
        }`}
      >
        <PlayerName
          text={name}
          className={`${compact ? 'text-xs xl:text-sm' : 'text-sm xl:text-xl'} block min-w-0 truncate whitespace-nowrap font-black text-slate-50 leading-tight ${align}`}
        />
        <div className={`mt-1 min-h-[1rem] flex items-center gap-2 ${align === 'text-right' ? 'justify-end' : ''}`}>
          {isThrowing ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/70 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
              {tv(lang, 'throwingNow') || 'Háže'}
            </span>
          ) : null}
          {avgValue ? (
            <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-mono tabular-nums text-slate-300`}>
              Ø {avgValue}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <article className={`h-full min-h-0 overflow-hidden rounded-xl border flex flex-col px-3 py-3 ${statusMeta.cardClass}`}>
      <header className="flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm xl:text-base font-black uppercase tracking-[0.18em] text-yellow-300">
            {tv(lang, 'callBoard').replace('{n}', String(board.board))}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill match={match} lang={lang} />
            {formatLabel ? (
              <p className="inline-flex rounded-md border border-slate-600 bg-slate-900/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-200">
                {formatLabel}
              </p>
            ) : null}
          </div>
        </div>
        {showScoreBlock ? (
          <div className="text-right shrink-0">
            <p className={`font-mono ${compact ? 'text-xl xl:text-2xl' : 'text-2xl xl:text-4xl'} font-black tabular-nums text-white leading-none`}>
              {score.value}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-slate-300 font-black mt-1">{score.label}</p>
            {remainingLegPoints ? (
              <p className="mt-1 text-[10px] font-mono tabular-nums text-slate-400">{remainingLegPoints}</p>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className={`flex-1 min-h-0 flex items-center ${compact ? 'py-1.5' : 'py-2'}`}>
        <div className="w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2 xl:gap-3">
          {playerCell('p1', match.player1Name, match.p1Avg, 'text-left')}
          <span className={`${compact ? 'text-[10px]' : 'text-xs xl:text-sm'} self-center font-black uppercase tracking-widest text-slate-500 shrink-0`}>
            {tv(lang, 'vs')}
          </span>
          {playerCell('p2', match.player2Name, match.p2Avg, 'text-right')}
        </div>
      </div>

      <footer className={`shrink-0 pt-2 border-t border-slate-700/70 ${compact ? 'space-y-0.5' : 'space-y-1'}`}>
        {showScoreBlock && score.detail && !compact ? (
          <p className="text-[11px] font-mono text-slate-300 tabular-nums">{score.detail}</p>
        ) : null}
        <p className="text-xs xl:text-sm text-slate-300 truncate">
          {tv(lang, 'referee')}:{' '}
          <span className="font-semibold text-slate-100">{match.refereeName || '—'}</span>
        </p>
        {isLiveMatch(match) && match.throwingPlayerName && !throwingSide ? (
          <p className="text-xs xl:text-sm text-emerald-300 truncate">
            {tv(lang, 'throwingNow') || 'Háže'}:{' '}
            <span className="font-semibold">{match.throwingPlayerName}</span>
          </p>
        ) : null}
        {Array.isArray(match.missingPresence) && match.missingPresence.length > 0 ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-100 truncate">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {tv(lang, 'presenceWarning')}: {match.missingPresence.join(', ')}
          </p>
        ) : null}
      </footer>
    </article>
  );
}

function BracketMatchCard({ match, lang, formatLabel }) {
  const wrapped = {
    board: match?.board ?? '—',
    current: match,
    next: null,
  };
  return <LiveMatchCard board={wrapped} lang={lang} formatLabel={formatLabel} compact />;
}

function BoardsGrid({ boards, lang, formatLabel }) {
  if (!boards.length) {
    return (
      <p className="m-auto text-2xl font-black text-slate-600 uppercase tracking-widest text-center px-4">
        {tv(lang, 'preparing')}
      </p>
    );
  }
  const cols = resolveVenueBoardColumns(boards.length);
  return (
    <div
      className="grid gap-3 xl:gap-4 h-full min-h-0 overflow-hidden auto-rows-fr"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {boards.map((board) => (
        <LiveMatchCard key={board.board} board={board} lang={lang} formatLabel={formatLabel} />
      ))}
    </div>
  );
}

function GroupStandingsPanel({ group, lang, dense }) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <colgroup>
        <col className="w-7" />
        <col />
        <col className={dense ? 'w-[2.5rem]' : 'w-[3rem]'} />
        <col className={dense ? 'w-[3.6rem]' : 'w-[4rem]'} />
        <col className={dense ? 'w-[3.6rem]' : 'w-[4rem]'} />
        {!dense ? <col className="w-[3rem]" /> : null}
        <col className={dense ? 'w-[3rem]' : 'w-[3.6rem]'} />
      </colgroup>
      <thead className="sticky top-0 bg-slate-900/95">
        <tr className="border-b border-slate-700 text-slate-500 text-[10px] uppercase tracking-wider">
          <th className="py-1 px-1 font-black w-7">#</th>
          <th className="py-1 px-2 font-black">{tv(lang, 'player')}</th>
          <th className="py-1 pr-2 pl-1 font-black text-right">{tv(lang, 'pts')}</th>
          <th className="py-1 pr-2 pl-1 font-black text-right">{tv(lang, 'matches')}</th>
          <th className="py-1 pr-2 pl-1 font-black text-right">{tv(lang, 'legs')}</th>
          {!dense ? <th className="py-1 pr-2 pl-1 font-black text-right">{tv(lang, 'diff')}</th> : null}
          <th className="py-1 pr-2 pl-1 font-black text-right">{tv(lang, 'avg')}</th>
        </tr>
      </thead>
      <tbody>
        {group.rows.map((row, idx) => (
          <tr
            key={row.id ?? row.name}
            className={`border-t border-slate-800 ${dense ? 'text-[11px] xl:text-sm' : 'text-xs xl:text-sm'} ${row.isAdvancing ? 'bg-emerald-500/15' : ''}`}
          >
            <td className="py-1 px-1 w-7 text-slate-400 font-mono tabular-nums">
              <span className={`inline-flex items-center gap-1 ${row.isAdvancing ? 'text-emerald-300 font-black' : ''}`}>
                {idx + 1}
                {row.isAdvancing ? <span className="text-[10px] font-black">P</span> : null}
              </span>
            </td>
            <td className="py-1.5 px-2 min-w-0">
              <span className={`block text-slate-100 font-semibold whitespace-nowrap overflow-hidden text-ellipsis ${dense ? 'text-[11px] xl:text-sm' : 'text-xs xl:text-sm'}`}>
                {formatTvPlayerName(row.name, { maxChars: 34 })}
              </span>
            </td>
            <td className="py-1 pr-2 pl-1 text-right text-amber-300 font-mono tabular-nums font-bold">
              {row.points ?? row.matchesWon}
            </td>
            <td className="py-1 pr-2 pl-1 text-right text-slate-200 font-mono tabular-nums">
              {row.matchesWon}:{row.matchesLost}
            </td>
            <td className="py-1 pr-2 pl-1 text-right text-slate-200 font-mono tabular-nums">
              {row.legsWon}:{row.legsLost}
            </td>
            {!dense ? (
              <td className="py-1 pr-2 pl-1 text-right text-slate-300 font-mono tabular-nums">
                {row.legDifference > 0 ? '+' : ''}
                {row.legDifference}
              </td>
            ) : null}
            <td className="py-1 pr-2 pl-1 text-right text-slate-300 font-mono tabular-nums">
              {Number(row.average ?? 0).toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GroupSummaryStrip({ group, lang, formatLabel }) {
  const live = group?.liveMatch;
  const upcoming = group?.upcomingMatch;
  const focus = live || upcoming;
  if (!focus) return null;
  const score = shouldShowScoreBlock(focus) ? resolveMainScore(focus, lang) : null;
  return (
    <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/85 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <StatusPill match={focus} lang={lang} />
        {score ? <span className="text-[10px] font-mono tabular-nums text-slate-300">{score.value}</span> : null}
      </div>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
        <PlayerName text={focus.player1Name} className="block min-w-0 truncate whitespace-nowrap text-[11px] font-bold text-slate-100 leading-tight" />
        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{tv(lang, 'vs')}</span>
        <PlayerName text={focus.player2Name} className="block min-w-0 truncate whitespace-nowrap text-[11px] font-bold text-slate-100 leading-tight text-right" />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-300">
        <span className="truncate">{tv(lang, 'referee')}: {focus.refereeName || '—'}</span>
        <span className="text-slate-400 shrink-0">{formatLabel}</span>
      </div>
    </div>
  );
}

function groupHasPlayedMatches(group) {
  const matches = Array.isArray(group?.matches) ? group.matches : [];
  return matches.some((m) => {
    if (!m) return false;
    if (isLiveMatch(m) || isDoneMatch(m)) return true;
    const legs = resolveLegs(m);
    return Number(legs.p1) > 0 || Number(legs.p2) > 0;
  });
}

function GroupSlotCard({ group, lang, groupBestOfLabel, dense = false }) {
  const focus = group.liveMatch || group.upcomingMatch;
  const statusMeta = resolveMatchVisualMeta(
    focus || (group.allDone ? { status: 'completed' } : { status: 'pending' }),
    lang
  );
  const showStandingsTable = groupHasPlayedMatches(group);

  return (
    <section className={`h-full min-h-0 overflow-hidden rounded-2xl border bg-slate-900/95 px-3 py-3 flex flex-col ${statusMeta.cardClass}`}>
      <header className="shrink-0 mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm xl:text-base font-black uppercase tracking-wider text-emerald-300 truncate">
            {group.name}
          </h2>
          <p className="mt-1 inline-flex items-center rounded-md border border-slate-600 bg-slate-800/90 px-2 py-0.5 text-[10px] xl:text-xs font-black uppercase tracking-wide text-slate-200">
            {formatBoardBadge(group.boards, lang)}
          </p>
        </div>
        <div className="shrink-0">
          <StatusPill match={focus || { status: group.allDone ? 'completed' : 'pending' }} lang={lang} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {showStandingsTable ? (
          <GroupStandingsPanel group={group} lang={lang} dense={dense} />
        ) : (
          <div className="h-full min-h-0 rounded-lg border border-dashed border-slate-700 bg-slate-900/70 px-3 py-4 text-sm text-slate-400">
            {tv(lang, 'groupTableAfterFirstResult')}
          </div>
        )}
      </div>
      <GroupSummaryStrip group={group} lang={lang} formatLabel={groupBestOfLabel} />
    </section>
  );
}

function resolveSlideDurationMs(slide) {
  if (!slide) return VENUE_CAROUSEL_MS;
  if (slide.type === 'finished') return 20_000;
  if (slide.type === 'live') {
    const boards = Array.isArray(slide.boards) ? slide.boards : [];
    const matches = boards.map((board) => board?.current || board?.next).filter(Boolean);
    if (matches.length === 0) return 9_000;
    if (matches.some((match) => isLiveMatch(match))) return 13_000;
    return 10_000;
  }
  if (slide.type === 'groups') {
    const groups = Array.isArray(slide.groups) ? slide.groups : [];
    if (groups.length === 0) return 10_000;
    const hasLiveGroup = groups.some((group) => isLiveMatch(group?.liveMatch));
    if (hasLiveGroup) return 18_000;
    const hasPlayedGroup = groups.some((group) => groupHasPlayedMatches(group));
    return hasPlayedGroup ? 16_000 : 12_000;
  }
  return VENUE_CAROUSEL_MS;
}

function GroupsSlide({
  groups,
  lang,
  groupsPerScreen,
  groupsColumns,
  groupBestOfLabel,
  blockIndex = 0,
  blockCount = 1,
}) {
  if (!groups.length) {
    return (
      <p className="m-auto text-2xl font-black text-slate-600 uppercase tracking-widest text-center px-4">
        {tv(lang, 'preparing')}
      </p>
    );
  }

  const groupColumns = Math.max(1, Math.min(groupsColumns || 1, groups.length));
  const dense = groupsPerScreen > 4;
  return (
    <div className="w-full h-full min-h-0 overflow-hidden flex flex-col">
      {blockCount > 1 ? (
        <div className="shrink-0 mb-2 text-right">
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
            {tv(lang, 'groupsPage')} {blockIndex + 1}/{blockCount}
          </span>
        </div>
      ) : null}
      <div
        className="grid gap-3 xl:gap-4 min-h-0 h-full overflow-hidden auto-rows-fr"
        style={{ gridTemplateColumns: `repeat(${groupColumns}, minmax(0, 1fr))` }}
      >
        {groups.map((group) => (
          <GroupSlotCard
            key={group.groupId}
            group={group}
            lang={lang}
            groupBestOfLabel={groupBestOfLabel}
            dense={dense}
          />
        ))}
      </div>
    </div>
  );
}

function TournamentFinishedScreen({ summary, lang }) {
  const first = summary?.podium?.first ?? [];
  const second = summary?.podium?.second ?? [];
  const third = summary?.podium?.third ?? [];
  const statLine = (label, value, accent = 'text-amber-300') => (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{label}</p>
      <p className={`mt-1 text-lg xl:text-2xl font-black ${accent}`}>{value}</p>
    </div>
  );
  const joinNames = (arr) => (arr.length > 0 ? arr.map((name) => formatTvPlayerName(name, { maxChars: 30 })).join(' · ') : '—');

  return (
    <section className="w-full h-full min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 p-4 xl:p-6 flex flex-col">
      <header className="shrink-0">
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">{tv(lang, 'tournamentResults')}</p>
        <h2 className="text-2xl xl:text-4xl font-black text-white mt-1">{tv(lang, 'finished')}</h2>
      </header>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3 xl:gap-4">
        <article className="rounded-xl border border-amber-400/60 bg-amber-500/10 px-4 py-4">
          <p className="text-xs uppercase tracking-widest font-black text-amber-300">1.</p>
          <p className="mt-2 text-xl xl:text-2xl font-black text-white">{joinNames(first)}</p>
        </article>
        <article className="rounded-xl border border-slate-500/60 bg-slate-500/10 px-4 py-4">
          <p className="text-xs uppercase tracking-widest font-black text-slate-300">2.</p>
          <p className="mt-2 text-lg xl:text-xl font-black text-white">{joinNames(second)}</p>
        </article>
        <article className="rounded-xl border border-orange-600/60 bg-orange-600/10 px-4 py-4">
          <p className="text-xs uppercase tracking-widest font-black text-orange-300">3.</p>
          <p className="mt-2 text-lg xl:text-xl font-black text-white">{joinNames(third)}</p>
        </article>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3 xl:gap-4">
        {statLine(
          tv(lang, 'topCheckouts'),
          summary?.highestCheckout
            ? `${summary.highestCheckout.value} · ${formatTvPlayerName(summary.highestCheckout.name, { maxChars: 28 })}`
            : '—'
        )}
        {statLine(
          tv(lang, 'highestMatchAverage'),
          summary?.highestMatchAverage
            ? `${summary.highestMatchAverage.value.toFixed(2)} · ${formatTvPlayerName(summary.highestMatchAverage.name, { maxChars: 28 })}`
            : '—',
          'text-emerald-300'
        )}
        {statLine(tv(lang, 'total180sStat'), String(summary?.total180s ?? 0), 'text-yellow-300')}
        {statLine(tv(lang, 'total140plusStat'), String(summary?.total140plus ?? 0), 'text-cyan-300')}
      </div>
    </section>
  );
}

function CallOverlay({ call, lang }) {
  if (!call) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black px-8 text-center"
      role="alert"
    >
      <p className="font-black uppercase tracking-[0.4em] text-amber-400 text-4xl sm:text-6xl xl:text-8xl">
        {tv(lang, 'callBoard').replace('{n}', String(call.board))}
      </p>
      <p className="mt-8 font-black text-white leading-tight text-4xl sm:text-6xl xl:text-8xl break-words max-w-[96vw]">
        {formatTvPlayerName(call.player1Name, { maxChars: 26 })}
        <span className="mx-4 text-slate-500">{tv(lang, 'vs')}</span>
        {formatTvPlayerName(call.player2Name, { maxChars: 26 })}
      </p>
      {call.refereeName ? (
        <p className="mt-8 text-slate-300 font-bold text-2xl sm:text-4xl xl:text-6xl">
          ({tv(lang, 'referee')}: {call.refereeName})
        </p>
      ) : null}
    </div>
  );
}

/**
 * Kiosk TV obrazovka — jen čte active_tournaments/{pin}.
 */
export default function VenueDisplayView({ pin, lang = 'cs', invalidPin = false }) {
  const syncAdapter = useSyncAdapter();
  const [doc, setDoc] = useState(undefined);
  const [screenIdx, setScreenIdx] = useState(0);
  const [callQueue, setCallQueue] = useState([]);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [slideStartedAtMs, setSlideStartedAtMs] = useState(() => Date.now());
  const prevBoardsRef = useRef(null);
  const skipFirstCallRef = useRef(true);

  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains('dark');
    const hadLight = html.classList.contains('light');
    html.classList.remove('light');
    html.classList.add('dark');
    return () => {
      html.classList.remove('dark', 'light');
      if (hadDark) html.classList.add('dark');
      if (hadLight) html.classList.add('light');
    };
  }, []);

  useEffect(() => {
    if (shouldUseVenueDevMock(pin, invalidPin)) {
      setDoc(buildVenueDevMockDoc());
      return undefined;
    }
    if (invalidPin || !pin) {
      setDoc(null);
      return undefined;
    }
    setDoc(undefined);
    const unsub = syncAdapter.listenTournament(pin, (data) => {
      setDoc(data ?? null);
    });
    const timeoutId = window.setTimeout(() => {
      setDoc((prev) => (prev === undefined ? null : prev));
    }, VENUE_LISTEN_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeoutId);
      unsub?.();
    };
  }, [pin, invalidPin, syncAdapter]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootOverflow: root?.style.overflow,
      rootHeight: root?.style.height,
      rootMinHeight: root?.style.minHeight,
    };
    html.style.overflow = 'hidden';
    html.style.height = '100vh';
    body.style.overflow = 'hidden';
    body.style.height = '100vh';
    if (root) {
      root.style.overflow = 'hidden';
      root.style.height = '100vh';
      root.style.minHeight = '100vh';
    }
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      if (root) {
        root.style.overflow = prev.rootOverflow;
        root.style.height = prev.rootHeight;
        root.style.minHeight = prev.rootMinHeight;
      }
    };
  }, []);

  useEffect(() => {
    let wakeLock = null;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        /* battery saver / permission */
      }
    };
    const release = async () => {
      try {
        if (wakeLock) await wakeLock.release();
      } catch {
        /* ignore */
      }
      wakeLock = null;
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') acquire();
      else release();
    };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      release();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setClockMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const model = useMemo(() => (doc ? buildVenueDisplayModel(doc) : null), [doc]);

  const playerNameById = useMemo(() => {
    const byId = new Map();
    const pushList = (list) => {
      for (const p of list || []) {
        const id = p?.id;
        const name = p?.name;
        if (id == null || !String(id).trim()) continue;
        if (name == null || !String(name).trim()) continue;
        byId.set(String(id), String(name).trim());
      }
    };
    const unpacked = model?.unpacked;
    pushList(unpacked?.tournamentData?.players);
    pushList((unpacked?.groups || []).flatMap((g) => g?.players || []));
    pushList((unpacked?.tournamentData?.groups || []).flatMap((g) => g?.players || []));
    return byId;
  }, [model]);

  const rawMatchById = useMemo(() => {
    const byId = new Map();
    const add = (m) => {
      const id = matchIdOf(m);
      if (id) byId.set(id, m);
    };
    const unpacked = model?.unpacked;
    for (const m of unpacked?.groupMatches || []) add(m);
    for (const round of unpacked?.tournamentBracket || []) {
      for (const m of round?.matches || []) add(m);
    }
    return byId;
  }, [model]);

  const hydrateDisplayMatch = useCallback((summary) => {
    if (!summary) return null;
    const raw = rawMatchById.get(summary.matchId) || null;
    const names = {
      player1Name: summary.player1Name || resolvePlayerName(raw, 1, playerNameById),
      player2Name: summary.player2Name || resolvePlayerName(raw, 2, playerNameById),
      refereeName: summary.refereeName || resolveRefereeName(raw, playerNameById),
    };
    const legs = resolveLegs(raw, summary);
    const sets = resolveSets(raw);
    const averages = resolveAverages(raw);
    const throwingPlayerName = resolveThrowingPlayerName(raw, names, playerNameById);
    const throwingPlayerId = resolveThrowingPlayerId(raw);
    const remainingLegPoints = resolveRemainingLegPoints(raw, summary);
    return {
      ...summary,
      ...names,
      player1Id: summary.player1Id ?? raw?.player1Id ?? null,
      player2Id: summary.player2Id ?? raw?.player2Id ?? null,
      legsP1: legs.p1,
      legsP2: legs.p2,
      hasSets: sets.hasSets,
      p1Sets: sets.p1,
      p2Sets: sets.p2,
      setScores: sets.setScores,
      p1Avg: averages.p1,
      p2Avg: averages.p2,
      throwingPlayerName,
      throwingPlayerId,
      remainingP1: remainingLegPoints.p1,
      remainingP2: remainingLegPoints.p2,
      status: String(raw?.status ?? summary.status ?? 'pending'),
      tabletStatus: String(raw?.tabletStatus ?? summary.tabletStatus ?? ''),
      missingPresence: resolveMissingPresence(raw, names, lang),
      playing:
        summary.playing ||
        raw?.status === 'playing' ||
        raw?.status === 'in_progress' ||
        raw?.tabletStatus === 'checked_in',
    };
  }, [rawMatchById, playerNameById, lang]);

  const enrichedBoards = useMemo(() => {
    if (!model?.boards?.length) return [];
    return model.boards.map((board) => ({
      ...board,
      current: hydrateDisplayMatch(board.current),
      next: hydrateDisplayMatch(board.next),
    }));
  }, [model, hydrateDisplayMatch]);

  const liveMatches = useMemo(() => {
    return enrichedBoards
      .map((board) => ({
        board: board.board,
        current: board.current,
        next: board.next,
      }))
      .filter((entry) => entry.current || entry.next)
      .sort((a, b) => {
        const aMatch = a.current || a.next;
        const bMatch = b.current || b.next;
        const statusDiff = matchStatusPriority(aMatch) - matchStatusPriority(bMatch);
        if (statusDiff !== 0) return statusDiff;
        return Number(a.board) - Number(b.board);
      });
  }, [enrichedBoards]);

  const groupSnapshots = useMemo(
    () => buildVenueGroupSnapshots(model?.unpacked),
    [model]
  );
  const enrichedGroupSnapshots = useMemo(
    () =>
      (groupSnapshots || []).map((group) => ({
        ...group,
        liveMatch: hydrateDisplayMatch(group.liveMatch),
        upcomingMatch: hydrateDisplayMatch(group.upcomingMatch),
      })),
    [groupSnapshots, hydrateDisplayMatch]
  );
  const groupBestOfLabel = useMemo(() => {
    const winLegs = Number(
      model?.unpacked?.tournamentData?.groupsLegs ??
      model?.unpacked?.tournamentData?.legsGroup ??
      2
    ) || 2;
    const bestOf = venueBestOfFromWinLegs(winLegs);
    return tv(lang, 'bestOfLegs').replace('{n}', String(bestOf));
  }, [model, lang]);
  const tournamentFinished = useMemo(
    () => isVenueTournamentFinished(model?.unpacked),
    [model]
  );
  const tournamentFinishedSummary = useMemo(
    () => buildVenueFinishedSummary(model?.unpacked),
    [model]
  );

  const groupDensity = useMemo(
    () => resolveGroupDensity(enrichedGroupSnapshots),
    [enrichedGroupSnapshots]
  );
  const groupsPageSize = useMemo(
    () => Math.max(1, Math.min(VENUE_GROUPS_PER_PAGE, groupDensity.perScreen)),
    [groupDensity]
  );
  const groupsColumns = useMemo(
    () => Math.max(1, Math.min(4, groupDensity.columns)),
    [groupDensity]
  );
  const groupSlides = useMemo(() => {
    const pageSize = groupsPageSize;
    if (!pageSize) return [];
    const blocks = chunkVenuePages(enrichedGroupSnapshots, pageSize);
    return blocks.map((groups, index) => ({
      type: 'groups',
      groups,
      blockIndex: index,
      blockCount: blocks.length,
    }));
  }, [enrichedGroupSnapshots, groupsPageSize]);

  const bracketOverview = useMemo(() => {
    const unpacked = model?.unpacked;
    const rounds = Array.isArray(unpacked?.tournamentBracket) ? unpacked.tournamentBracket : [];
    if (rounds.length === 0) {
      return {
        hasBracket: false,
        phaseName: '',
        formatLabel: '',
        bestOfLegs: 0,
        roundIndex: 0,
        roundCount: 0,
        completedMatches: 0,
        totalMatches: 0,
        matches: [],
      };
    }
    const normalizedRounds = rounds.map((round, roundIndex) => {
      const matches = (round?.matches || []).filter((m) => {
        if (!m || m.isBye) return false;
        const hasP1 = m.player1Id != null || String(m.player1Name ?? m.p1Name ?? '').trim() !== '';
        const hasP2 = m.player2Id != null || String(m.player2Name ?? m.p2Name ?? '').trim() !== '';
        return hasP1 && hasP2;
      });
      return { roundIndex, matches };
    });
    const totalMatches = normalizedRounds.reduce((sum, round) => sum + round.matches.length, 0);
    const completedMatches = normalizedRounds.reduce(
      (sum, round) => sum + round.matches.filter((m) => isTerminalMatch(m)).length,
      0
    );

    let activeRoundIndex = normalizedRounds.findIndex((round) =>
      round.matches.some((m) => !isTerminalMatch(m))
    );
    if (activeRoundIndex < 0) activeRoundIndex = Math.max(0, normalizedRounds.length - 1);
    const activeRound = normalizedRounds[activeRoundIndex];
    const openMatches = (activeRound?.matches || []).filter((m) => !isTerminalMatch(m));
    const sourceMatches = openMatches.length > 0 ? openMatches : (activeRound?.matches || []);
    const matches = sourceMatches
      .map((raw) => {
        const names = {
          player1Name: resolvePlayerName(raw, 1, playerNameById),
          player2Name: resolvePlayerName(raw, 2, playerNameById),
          refereeName: resolveRefereeName(raw, playerNameById),
        };
        const legs = resolveLegs(raw);
        const sets = resolveSets(raw);
        const averages = resolveAverages(raw);
        const throwingPlayerName = resolveThrowingPlayerName(raw, names, playerNameById);
        const throwingPlayerId = resolveThrowingPlayerId(raw);
        const remainingLegPoints = resolveRemainingLegPoints(raw);
        return {
          ...raw,
          ...names,
          legsP1: legs.p1,
          legsP2: legs.p2,
          hasSets: sets.hasSets,
          p1Sets: sets.p1,
          p2Sets: sets.p2,
          setScores: sets.setScores,
          p1Avg: averages.p1,
          p2Avg: averages.p2,
          throwingPlayerName,
          throwingPlayerId,
          remainingP1: remainingLegPoints.p1,
          remainingP2: remainingLegPoints.p2,
          status: String(raw?.status ?? 'pending'),
          tabletStatus: String(raw?.tabletStatus ?? ''),
          missingPresence: resolveMissingPresence(raw, names, lang),
          playing:
            raw?.status === 'playing' ||
            raw?.status === 'in_progress' ||
            raw?.tabletStatus === 'checked_in',
        };
      })
      .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b))
      .slice(0, 8);

    const totalRounds = normalizedRounds.length;
    const td = unpacked?.tournamentData;
    const prelimLegs = td?.prelimLegs;
    const bracketWinLegs = td?.bracketKoLegs ?? td?.bracketLegs ?? td?.groupsLegs ?? 3;
    const activeWinLegs =
      activeRoundIndex === 0 && prelimLegs != null && Number(prelimLegs) > 0
        ? prelimLegs
        : bracketWinLegs;
    const phaseName = (() => {
      if (activeRoundIndex === 0 && prelimLegs != null && Number(prelimLegs) > 0) {
        return tt(lang, 'tournPrelimLabel', 'Předkolo');
      }
      const diff = totalRounds - activeRoundIndex;
      if (diff === 1) return tt(lang, 'tournRoundFinal', 'Finále');
      if (diff === 2) return tt(lang, 'tournRoundSemi', 'Semifinále');
      if (diff === 3) return tt(lang, 'tournRoundQuarter', 'Čtvrtfinále');
      const key = tt(lang, 'tournRoundLastN', 'Top {n}');
      return String(key).replace('{n}', String(Math.pow(2, diff)));
    })();
    const bestOfLegs = venueBestOfFromWinLegs(activeWinLegs);

    return {
      hasBracket: true,
      phaseName,
      bestOfLegs,
      formatLabel: tv(lang, 'bestOfLegs').replace('{n}', String(bestOfLegs)),
      roundIndex: activeRoundIndex,
      roundCount: totalRounds,
      completedMatches,
      totalMatches,
      matches,
    };
  }, [model, playerNameById, lang]);

  useEffect(() => {
    if (!model?.boards) return;
    if (tournamentFinished) {
      setCallQueue([]);
      prevBoardsRef.current = model.boards;
      return;
    }
    const prev = prevBoardsRef.current;
    prevBoardsRef.current = model.boards;
    if (skipFirstCallRef.current) {
      skipFirstCallRef.current = false;
      return;
    }
    if (boardsOccupancySignature(prev) === model.signature) return;
    setScreenIdx(0);
    const calls = detectVenueMatchCalls(prev, model.boards);
    if (calls.length > 0) {
      setCallQueue((q) => [...q, ...calls]);
    }
  }, [model, tournamentFinished]);

  const activeCall = tournamentFinished ? null : (callQueue[0] ?? null);

  useEffect(() => {
    if (!activeCall) return undefined;
    const id = window.setTimeout(() => {
      setCallQueue((q) => q.slice(1));
    }, VENUE_CALL_MS);
    return () => window.clearTimeout(id);
  }, [activeCall]);

  const slides = useMemo(() => {
    if (tournamentFinished) return [{ type: 'finished' }];
    const out = [];
    if (groupSlides.length > 0) out.push(...groupSlides);
    const boardPageSize = bracketOverview.hasBracket
      ? VENUE_BOARDS_PER_PAGE_WITH_BRACKET
      : VENUE_BOARDS_PER_PAGE;
    const boardPages = chunkVenuePages(liveMatches, boardPageSize);
    if (boardPages.length === 0) {
      out.push({ type: 'live', boards: [], pageIndex: 0, pageCount: 1 });
    } else {
      for (let i = 0; i < boardPages.length; i += 1) {
        out.push({
          type: 'live',
          boards: boardPages[i],
          pageIndex: i,
          pageCount: boardPages.length,
        });
      }
    }
    return out;
  }, [groupSlides, liveMatches, bracketOverview.hasBracket, tournamentFinished]);

  const slideCount = slides.length || 1;
  const slidePosition = ((screenIdx % slideCount) + slideCount) % slideCount;
  const activeSlide = slides[slidePosition];
  const activeSlideDurationMs = useMemo(
    () => resolveSlideDurationMs(activeSlide),
    [activeSlide]
  );

  useEffect(() => {
    setScreenIdx(0);
  }, [slides.length, model?.signature]);

  useEffect(() => {
    setSlideStartedAtMs(Date.now());
  }, [slidePosition, slides.length, model?.signature]);

  useEffect(() => {
    if (activeCall || slides.length <= 1) return undefined;
    const id = window.setTimeout(() => {
      setScreenIdx((i) => i + 1);
    }, activeSlideDurationMs);
    return () => window.clearTimeout(id);
  }, [activeCall, slides.length, activeSlideDurationMs, slidePosition, model?.signature]);

  const statusLine = invalidPin
    ? tv(lang, 'invalidPin')
    : doc === undefined
      ? tv(lang, 'loading')
      : doc === null
        ? tv(lang, 'notFound')
        : tournamentFinished
          ? tv(lang, 'finished')
          : model?.name || tv(lang, 'title');

  const showEmpty = invalidPin || doc === null;
  const showLoading = !invalidPin && doc === undefined;
  const viewState = showEmpty ? 'empty' : showLoading ? 'loading' : 'ready';
  const rotationRunning = !activeCall && slides.length > 1 && !showLoading && !showEmpty;
  const rotationElapsedMs = Math.max(0, clockMs - slideStartedAtMs);
  const rotationProgress = rotationRunning ? Math.min(1, rotationElapsedMs / activeSlideDurationMs) : 0;
  const rotationSecondsLeft = rotationRunning
    ? Math.max(0, Math.ceil((activeSlideDurationMs - rotationElapsedMs) / 1000))
    : 0;

  return (
    <div
      data-testid="venue-display"
      className="flex flex-col w-full h-screen bg-black text-white overflow-hidden select-none"
      style={{ height: '100vh', overflow: 'hidden' }}
    >
      <header className="shrink-0 flex items-center justify-between gap-4 px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-slate-900">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">{tv(lang, 'title')}</p>
          <h1 className="text-2xl xl:text-4xl font-black truncate">{statusLine}</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          {pin ? (
            <p className="font-mono text-xs xl:text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
              {tv(lang, 'pinLabel')} {pin}
            </p>
          ) : null}
          {rotationRunning ? (
            <div className="w-52 xl:w-64">
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-[width] duration-700 ease-linear"
                  style={{ width: `${Math.round(rotationProgress * 100)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                <span>{slidePosition + 1}/{slides.length}</span>
                <span>{rotationSecondsLeft}s</span>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main
        className="flex-1 min-h-0 overflow-hidden p-4 xl:p-6 flex flex-col"
        data-testid="venue-display-status"
        data-state={viewState}
      >
        {showLoading ? (
          <p className="m-auto text-4xl font-black text-slate-600 uppercase tracking-widest">{tv(lang, 'loading')}</p>
        ) : null}

        {showEmpty ? (
          <p className="m-auto text-4xl xl:text-6xl font-black text-slate-400 text-center px-6">{statusLine}</p>
        ) : null}

        {model && activeSlide?.type === 'groups' ? (
          <section className="w-full h-full min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/85 p-3 xl:p-4 flex flex-col">
            <div className="mb-3 flex items-start justify-between gap-3 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                  {tv(lang, 'groups')}
                </p>
                <h2 className="text-lg xl:text-2xl font-black text-white">{tv(lang, 'groupTables')}</h2>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                {tv(lang, 'groupsPerScreen').replace('{n}', String(groupsPageSize || 0))}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <GroupsSlide
                groups={activeSlide.groups}
                lang={lang}
                groupsPerScreen={groupsPageSize}
                groupsColumns={groupsColumns}
                groupBestOfLabel={groupBestOfLabel}
                blockIndex={activeSlide.blockIndex}
                blockCount={activeSlide.blockCount}
              />
            </div>
          </section>
        ) : null}

        {model && activeSlide?.type === 'finished' ? (
          <TournamentFinishedScreen summary={tournamentFinishedSummary} lang={lang} />
        ) : null}

        {model && activeSlide?.type === 'live' ? (
          <div
            className={`w-full h-full min-h-0 overflow-hidden grid gap-4 xl:gap-6 ${
              bracketOverview.hasBracket
                ? 'grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]'
                : 'grid-cols-1'
            }`}
          >
            <section className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/85 p-3 xl:p-4 flex flex-col">
              <div className="mb-3 shrink-0 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                    {tv(lang, 'liveMatches')}
                  </p>
                  <h2 className="text-lg xl:text-2xl font-black text-white">{tv(lang, 'currentBoards')}</h2>
                </div>
                {activeSlide.pageCount > 1 ? (
                  <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {tv(lang, 'boardsPage')
                      .replace('{page}', String(activeSlide.pageIndex + 1))
                      .replace('{total}', String(activeSlide.pageCount))}
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <BoardsGrid
                  boards={activeSlide.boards || []}
                  lang={lang}
                  formatLabel={bracketOverview.hasBracket ? bracketOverview.formatLabel : groupBestOfLabel}
                />
              </div>
            </section>

            {bracketOverview.hasBracket ? (
              <section className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/85 p-3 xl:p-4 flex flex-col">
                <div className="mb-3 shrink-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                    {tv(lang, 'bracket')}
                  </p>
                  <h2 className="text-lg xl:text-2xl font-black text-white">
                    {bracketOverview.phaseName}
                  </h2>
                  <p className="mt-1 text-xs xl:text-sm text-slate-300 font-semibold">
                    {bracketOverview.formatLabel}
                    {' · '}
                    {tv(lang, 'phaseRound')
                      .replace('{round}', String(bracketOverview.roundIndex + 1))
                      .replace('{total}', String(bracketOverview.roundCount))}
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden grid gap-2 auto-rows-fr content-start">
                  {bracketOverview.matches.length === 0 ? (
                    <p className="m-auto text-center text-lg font-black text-slate-500 uppercase tracking-wider">
                      {tv(lang, 'noActiveBracketMatches')}
                    </p>
                  ) : (
                    bracketOverview.matches.slice(0, 4).map((match, idx) => (
                      <BracketMatchCard
                        key={match.id ?? match.matchId ?? `${idx}-${match.player1Name}-${match.player2Name}`}
                        match={match}
                        lang={lang}
                        formatLabel={bracketOverview.formatLabel}
                      />
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </main>

      <CallOverlay call={activeCall} lang={lang} />
    </div>
  );
}
