import React, { useState, useEffect, useRef } from 'react';
import { signInAnonymously, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, deleteUser } from 'firebase/auth';
import { collection, addDoc, deleteDoc, doc, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  syncTournamentToCloud,
  deleteCloudTournament,
  archivePastTournamentAndDeleteActive,
  listenToCloudTournament,
  verifyTournamentPin,
  verifyTabletBoardAccess,
  updateCloudMatchFromTablet,
  mergeAdminGroupMatchesFromTabletCloud,
  mergeAdminBracketFromTabletCloud,
  registerTabletBoardOnline,
  releaseTabletBoardPresence,
} from './services/tournamentSync';
import { cancelOnlineGame, getOnlineGameById, abandonOnlineGameSession } from './services/onlineGamesService';
import {
  readLastOnlineSession,
  clearLastOnlineSession,
  persistLastOnlineSession,
} from './online/onlineReconnectStorage';
import { 
  AlertTriangle, ArrowLeft, Bot, CheckCircle, ChevronDown, Cpu, 
  DownloadCloud, FileText, History, Home, Info, Keyboard as KeyboardIcon, 
  Maximize, Minimize, Monitor, MousePointer2, Pause, Play, RefreshCw, RotateCcw, 
  Target, Trash2, Trophy, Undo2, Unplug, User, Cloud, X, BarChart2, List, Swords, ClipboardList, Lock
} from 'lucide-react';

import { translations } from './translations';
import {
  TABLET_CHECKIN_MAX_WARNINGS,
  bumpRoleWarningCounts,
  checkInSecondsAfterWarningAck,
} from './utils/tabletCheckInTimeout';
import GameX01 from './components/GameX01';
import GameCricket from './components/GameCricket';
import GameStats from './Stats';
import TournamentSetup from './components/TournamentSetup';
import TournamentHub from './components/TournamentHub';
import TournamentBoardAssignment from './components/TournamentBoardAssignment';
import TournamentGroupsView from './components/TournamentGroupsView';
import TournamentBracketView from './components/TournamentBracketView';
import TournamentStatisticsView from './components/TournamentStatisticsView';
import TabletWaitingRoom from './components/TabletWaitingRoom';
import TabletBoardQrPanel from './components/TabletBoardQrPanel';
import VenueDisplayView from './components/VenueDisplayView';
import TournamentHistory from './components/TournamentHistory';
import PublicTournamentPage from './components/prereg/PublicTournamentPage';
import PublicTournamentDirectory from './components/prereg/PublicTournamentDirectory';
import TournamentPreRegSetup from './components/prereg/TournamentPreRegSetup';
import RegistrationAdminPanel from './components/prereg/RegistrationAdminPanel';
import MyPreRegTournamentsList from './components/prereg/MyPreRegTournamentsList';
import AppNavBar from './components/AppNavBar';
import PauseMenuOverlay from './components/PauseMenuOverlay';
import ActiveSessionBanner from './components/ActiveSessionBanner';
import { resolveAppNav, shouldParkTournamentSession } from './utils/appNavigation';
import { loadUiResume, saveUiResume } from './utils/uiResumeStorage';
import { parsePreregRouteFromUrl, isPublicTournamentCatalogPath } from './utils/preregAdmin';
import { parseTabletRouteFromUrl, ensureBoardAuthTokens } from './utils/tabletBoardQr';
import { buildVenueDisplayUrl, parseVenueDisplayRouteFromUrl, resolveVenueLang } from './utils/venueDisplay';
import { loadAdminInviteSession, saveAdminInviteSession } from './utils/preregStorage';
import {
  adminConfirmPair,
  createManualRegistration,
  getOwnerTournamentData,
  listTournamentRegistrations,
  verifyAdminInviteToken,
  claimAdminInviteAccess,
} from './services/tournamentPreRegService';
import { HomeOnlineMenuTile, HomeOnlineSubmenu } from './components/HomeOnlineMenu';
import { distributePlayersToFixedGroups, generateGroupMatches } from './utils/tournamentGenerator';
import {
  generateBracketStructure,
  getBracketWinLegsForRound,
  autoAssignSequentialBoardsToRound,
  updateBracketReferees,
  assignBracketJitBoardsAndReferees,
  getBracketFirstRoundChalkerShortage,
  propagateBracketWinners,
  isRealPendingBracketMatch,
  calculateGroupStandings,
  isTournamentBracketOnlyFormat,
  sortPlayersForBracketSeeding,
  calculateLiveTournamentEndPrediction,
  isEntireTournamentFinished,
} from './utils/tournamentLogic';
import {
  hasDrawRankingSnapshot,
  isTournamentRankingLocked,
  stripPlayerRankingsForLive,
  withRankingsLocked,
} from './utils/tournamentRanking';
import { findDuplicateRegistration, normalizePlayerNameKey, resolveCsoPlayerId } from './utils/playerIdentity';
import { allowsPairing, normalizeCompetitionType, normalizeFeeMode } from './utils/preregCompetition';
import { isTeamPlayer } from './utils/doublesSeeding';
import { formatRefereeNames, resolveRefereePerson } from './utils/doublesReferee';
import {
  adaptGroupParallelPlay,
  matchPhaseSignature,
  parallelAssignSignature,
  pickParallelGroupMatches,
} from './utils/groupParallelPlay';
import {
  buildDoublesSettingsFromSlots,
  findTournamentSlot,
} from './utils/doublesThrowOrder';
import { AdminVirtualKeyboardProvider, useAdminVirtualKeyboard } from './context/AdminVirtualKeyboardContext';

const APP_VERSION = "v1.10.2";
const ACTIVE_PREREG_STATUSES = new Set(['CONFIRMED', 'WAITLIST', 'PENDING_PAYMENT']);

function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/** Veřejná předregistrace: /t/:tournamentId (?invite=token pro admin) */
function parsePreregTournamentIdFromPath() {
  return parsePreregRouteFromUrl()?.tournamentId ?? null;
}

function createDefaultTournamentDraft() {
  return {
    name: '',
    format: 'groups_bracket',
    groupLegs: 2,
    bracketLegs: 3,
    startScore: 501,
    outMode: 'double',
    numBoards: 2,
    players: [],
    /** Stejný význam jako advancePerGroup – pro Referee Engine když ještě není v tournamentData */
    promotersCount: 2,
    /** map groupId -> raw text z inputu (např. "1, 2") – přežije Zpět z přiřazení terčů */
    boardAssignments: {},
    /** Číslo terče z rozcestníku „tablet“ (Firebase později) */
    hubTabletBoard: '',
    /** PIN turnaje – přiřadí se hned při vstupu do administrace (před dokončením setupu) */
    pin: '',
    /** Síťová hra / tablety – pouze po přihlášení (Google); ukládá se do tournamentData */
    cloudEnabled: false,
    /** Heslo pro herní tablety (max. 5 znaků, odlišné od PIN); jen při cloudEnabled */
    tabletPassword: '',
    /** Žebříček ČŠO (Stedar) pro našeptávač v kroku 2: 'men' | 'women' */
    csoRankingGender: 'men',
    /** Zapnout oficiální žebříček ČŠO (našeptávač + auto-ranking) v kroku 2 */
    useCsoRanking: false,
    /** singles | random_doubles | doubles | mixed — doubles/mixed přijdou z importu párů */
    competitionType: 'singles',
    pairDrawRoster: null,
    pairDrawReserve: null,
  };
}

const safeStorage = {
  getItem: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  setItem: (key, value) => { try { localStorage.setItem(key, value); } catch {} },
  removeItem: (key) => { try { localStorage.removeItem(key); } catch {} },
  clear: () => { try { localStorage.clear(); } catch {} },
};

const TOURNAMENT_WIP_KEY = 'dartsTournamentSetupWip';

const SESSION_ROLE_KEY = 'dartsSessionRole';
const SESSION_PIN_KEY = 'dartsSessionPin';
const SESSION_BOARD_KEY = 'dartsSessionBoard';
const SESSION_TABLET_PW_KEY = 'dartsSessionTabletPw';
const SESSION_BOARD_TOKEN_KEY = 'dartsSessionBoardToken';

function persistSpectatorSession(role, pin, boardStr = '', tabletPassword = '', boardToken = '') {
  if (role !== 'viewer' && role !== 'tablet') return;
  const p = String(pin ?? '').trim();
  if (!/^\d{4}$/.test(p)) return;
  safeStorage.setItem(SESSION_ROLE_KEY, role);
  safeStorage.setItem(SESSION_PIN_KEY, p);
  if (role === 'tablet') {
    safeStorage.setItem(SESSION_BOARD_KEY, String(boardStr ?? '').trim());
    const bt = String(boardToken ?? '').trim();
    const tp = String(tabletPassword ?? '').trim().slice(0, 5);
    if (bt) {
      safeStorage.setItem(SESSION_BOARD_TOKEN_KEY, bt);
      safeStorage.removeItem(SESSION_TABLET_PW_KEY);
    } else {
      safeStorage.removeItem(SESSION_BOARD_TOKEN_KEY);
      if (tp) safeStorage.setItem(SESSION_TABLET_PW_KEY, tp);
      else safeStorage.removeItem(SESSION_TABLET_PW_KEY);
    }
  } else {
    safeStorage.removeItem(SESSION_BOARD_KEY);
    safeStorage.removeItem(SESSION_TABLET_PW_KEY);
    safeStorage.removeItem(SESSION_BOARD_TOKEN_KEY);
  }
}

function clearSpectatorSession() {
  safeStorage.removeItem(SESSION_ROLE_KEY);
  safeStorage.removeItem(SESSION_PIN_KEY);
  safeStorage.removeItem(SESSION_BOARD_KEY);
  safeStorage.removeItem(SESSION_TABLET_PW_KEY);
  safeStorage.removeItem(SESSION_BOARD_TOKEN_KEY);
}

function loadStoredTabletPassword() {
  try {
    return String(safeStorage.getItem(SESSION_TABLET_PW_KEY) ?? '').trim().slice(0, 5);
  } catch {
    return '';
  }
}

function loadStoredBoardAuthToken() {
  try {
    return String(safeStorage.getItem(SESSION_BOARD_TOKEN_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

function loadStoredTabletBoard() {
  try {
    return String(safeStorage.getItem(SESSION_BOARD_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

function tabletCloudAuthOpts() {
  const boardToken = loadStoredBoardAuthToken();
  if (boardToken) {
    return {
      board: loadStoredTabletBoard(),
      boardToken,
    };
  }
  return { tabletPassword: loadStoredTabletPassword() };
}

function writeTournamentWip(pin) {
  safeStorage.setItem(TOURNAMENT_WIP_KEY, JSON.stringify({ pin: String(pin).trim() }));
}

function clearTournamentWip() {
  safeStorage.removeItem(TOURNAMENT_WIP_KEY);
}

function mergeDraftFromResume(saved) {
  const base = createDefaultTournamentDraft();
  if (!saved || typeof saved !== 'object') return base;
  return {
    ...base,
    ...saved,
    players: Array.isArray(saved.players) ? saved.players : [],
  };
}

let bootUiResumeCache;
/** Tvrdý reset: po vymazání localStorage už znovu neukládat resume (About / turnaj). */
let skipUiResumePersist = false;
function getBootUiResumeOnce() {
  if (bootUiResumeCache !== undefined) return bootUiResumeCache;
  try {
    if (
      isPublicTournamentCatalogPath() ||
      parsePreregRouteFromUrl() ||
      parseTabletRouteFromUrl() ||
      parseVenueDisplayRouteFromUrl()
    ) {
      bootUiResumeCache = null;
      return null;
    }
    const role = safeStorage.getItem(SESSION_ROLE_KEY);
    if (role === 'viewer' || role === 'tablet') {
      bootUiResumeCache = null;
      return null;
    }
    bootUiResumeCache = loadUiResume();
    return bootUiResumeCache;
  } catch {
    bootUiResumeCache = null;
    return null;
  }
}

/** Obecné načtení JSON z localStorage s bezpečným fallbackem. */
function loadInitialState(key, fallback) {
  try {
    const item = safeStorage.getItem(key);
    if (item == null || item === '') return fallback;
    const parsed = JSON.parse(item);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch {
    console.error(`Chyba načítání ${key}:`, key);
    safeStorage.removeItem(key);
    return fallback;
  }
}

const LOCAL_TOURNAMENT_HISTORY_KEY = 'darts_history_local';

function appendLocalTournamentHistory(entry) {
  const prev = loadInitialState(LOCAL_TOURNAMENT_HISTORY_KEY, []);
  const arr = Array.isArray(prev) ? [...prev, entry] : [entry];
  try {
    safeStorage.setItem(LOCAL_TOURNAMENT_HISTORY_KEY, JSON.stringify(arr));
  } catch {}
}

function loadSafeMatchHistory() {
  const parsed = loadInitialState('dartsMatchHistory', []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Turnaj z localStorage. Vždy vrací { value, hadError } — při prázdné paměti value === null.
 */
function loadSafeTournamentData() {
  try {
    const raw = safeStorage.getItem('dartsTournamentData');
    if (!raw) return { value: null, hadError: false };
    const parsed = JSON.parse(raw);
    const isObj = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    const hasPlayers = Array.isArray(parsed?.players);
    const hasFormat = parsed?.tournamentFormat == null || typeof parsed.tournamentFormat === 'string';
    if (!isObj || !hasPlayers || !hasFormat) {
      throw new Error('Invalid data format');
    }
    if (parsed.tournamentFormat === 'groups_ko') parsed.tournamentFormat = 'groups_bracket';
    if (parsed.tournamentFormat === 'ko_only') parsed.tournamentFormat = 'bracket_only';
    return { value: parsed, hadError: false };
  } catch {
    console.error('Chyba při načítání uloženého turnaje. Data byla resetována.');
    safeStorage.removeItem('dartsTournamentData');
    // legacy key cleanup
    safeStorage.removeItem('dartsTournament');
    return { value: null, hadError: true };
  }
}

/** Jednorázové načtení turnaje při startu (data + pavouk z localStorage). */
let __initialTournamentBootstrapOnce = null;
function getInitialTournamentBootstrapOnce() {
  if (__initialTournamentBootstrapOnce === null) {
    const { value, hadError } = loadSafeTournamentData();
    if (!value) {
      __initialTournamentBootstrapOnce = { td: null, bracket: [], hadError };
    } else {
      const bracket = Array.isArray(value.tournamentBracket) ? value.tournamentBracket : [];
      const { tournamentBracket: _tb, ...td } = value;
      __initialTournamentBootstrapOnce = { td, bracket, hadError };
    }
  }
  return __initialTournamentBootstrapOnce;
}

const appId = 'sdc_global_production';

const ACTIVE_TOURNAMENTS_COLL = 'active_tournaments';

/** Jméno hráče z turnaje (flat players + skupiny). */
function resolveTournamentPlayerName(playerId, tournamentData) {
  if (playerId == null || playerId === '') return '';
  const id = String(playerId);
  const td = tournamentData;
  const flat = td?.players;
  if (Array.isArray(flat)) {
    const p = flat.find((x) => String(x.id ?? '') === id);
    if (p?.name != null && String(p.name).trim() !== '') return String(p.name);
  }
  for (const g of td?.groups || []) {
    const pl = (g.players || []).find((x) => String(x.id ?? '') === id);
    if (pl?.name != null && String(pl.name).trim() !== '') return String(pl.name);
  }
  return '';
}

function enrichTabletMatchPlayerNames(raw, tournamentData, tournamentGroups) {
  if (!raw) return raw;
  let groupPlayers = [];
  if (raw.groupId) {
    const grp =
      tournamentGroups.find((g) => g.groupId === raw.groupId) ||
      tournamentData?.groups?.find((g) => g.groupId === raw.groupId);
    groupPlayers = grp?.players || [];
  }
  const p1Raw =
    (raw.player1Name != null && String(raw.player1Name).trim()) ||
    (raw.p1Name != null && String(raw.p1Name).trim()) ||
    groupPlayers.find((p) => p.id === raw.player1Id)?.name ||
    resolveTournamentPlayerName(raw.player1Id, tournamentData) ||
    (raw.player1Id != null ? String(raw.player1Id) : '');
  const p2Raw =
    (raw.player2Name != null && String(raw.player2Name).trim()) ||
    (raw.p2Name != null && String(raw.p2Name).trim()) ||
    groupPlayers.find((p) => p.id === raw.player2Id)?.name ||
    resolveTournamentPlayerName(raw.player2Id, tournamentData) ||
    (raw.player2Id != null ? String(raw.player2Id) : '');
  const p1Slot =
    groupPlayers.find((p) => p.id === raw.player1Id) ||
    findTournamentSlot(raw.player1Id, tournamentData, tournamentGroups);
  const p2Slot =
    groupPlayers.find((p) => p.id === raw.player2Id) ||
    findTournamentSlot(raw.player2Id, tournamentData, tournamentGroups);
  const p1Members = isTeamPlayer(p1Slot) ? p1Slot.members.slice(0, 2) : [];
  const p2Members = isTeamPlayer(p2Slot) ? p2Slot.members.slice(0, 2) : [];
  const referees =
    Array.isArray(raw.referees) && raw.referees.length > 0
      ? raw.referees
      : raw.referee?.name
        ? [raw.referee]
        : [];
  return {
    ...raw,
    player1Name: p1Raw || '?',
    player2Name: p2Raw || '?',
    p1Members,
    p2Members,
    referees,
    refereeName: formatRefereeNames({ ...raw, referees }) || raw.refereeName || '—',
    doubles: p1Members.length >= 2 && p2Members.length >= 2,
  };
}

/** Text výsledku pro rozpis (sety nebo legy). */
function formatCompletedMatchScoreForSchedule(m) {
  if (!m || m.status !== 'completed') return null;
  const s1 = m.p1Sets;
  const s2 = m.p2Sets;
  if (s1 != null && s2 != null && Number.isFinite(Number(s1)) && Number.isFinite(Number(s2))) {
    return `${Number(s1)} : ${Number(s2)}`;
  }
  const r = m.result || {};
  const p1 = Number(r.p1Legs ?? m.legsP1 ?? m.score1 ?? m.score?.p1 ?? 0) || 0;
  const p2 = Number(r.p2Legs ?? m.legsP2 ?? m.score2 ?? m.score?.p2 ?? 0) || 0;
  return `${p1} : ${p2}`;
}

/** Zápas pro tablet na daném terči: pavouk (stejný board) nebo skupina (board ve skupině). */
function pickTabletMatchForBoard({
  tournamentData,
  tournamentMatches,
  tournamentBracket,
  tournamentGroups,
  tabletBoardStr,
}) {
  const b = String(tabletBoardStr ?? '').trim();
  if (!b || !tournamentData) return null;

  const boardMatches = (m) => {
    if (!m || m.isBye) return false;
    const mb = m.board != null ? String(m.board).trim() : '';
    return mb === b && m.player1Id && m.player2Id;
  };

  const isTabletPickupCandidate = (m) => {
    if (!m) return false;
    const s = m.status;
    if (s === 'pending' || s === 'playing') return true;
    if (m.tabletStatus === 'checked_in') return true;
    return false;
  };

  const groupsList = tournamentData.groups?.length ? tournamentData.groups : tournamentGroups;
  const allGroupsFinished =
    !Array.isArray(groupsList) ||
    groupsList.length === 0 ||
    groupsList.every((g) => {
      const gm = (tournamentMatches || []).filter((m) => (m.groupId ?? m.group) === g.groupId);
      return gm.length > 0 && gm.every((m) => m.status === 'completed' || m.status === 'walkover');
    });

  if (Array.isArray(tournamentBracket) && tournamentBracket.length > 0 && allGroupsFinished) {
    for (let ri = 0; ri < tournamentBracket.length; ri++) {
      const matches = tournamentBracket[ri]?.matches || [];
      for (let mi = 0; mi < matches.length; mi++) {
        const m = matches[mi];
        if (!boardMatches(m) || !isTabletPickupCandidate(m)) continue;
        return {
          ...m,
          matchType: 'bracket',
          bracketRoundIndex: ri,
          matchId: m.matchId ?? m.id,
        };
      }
    }
  }

  const groups = tournamentData.groups?.length ? tournamentData.groups : tournamentGroups;
  const group = Array.isArray(groups)
    ? groups.find(
        (gr) => Array.isArray(gr.boards) && gr.boards.some((x) => String(x).trim() === b)
      )
    : null;
  if (!group) return null;

  const gms = (tournamentMatches || [])
    .filter((m) => (m.groupId ?? m.group) === group.groupId)
    .slice()
    .sort((a, c) => (a.round ?? 0) - (c.round ?? 0));
  const groupBoards = (group.boards || []).map((x) => String(x).trim()).filter(Boolean);
  const selected = pickParallelGroupMatches(gms, groupBoards.length || 1);
  const boardIdx = groupBoards.indexOf(b);
  const byBoard = selected.find((m) => String(m.board ?? '').trim() === b);
  const byIndex = boardIdx >= 0 ? selected[boardIdx] : selected[0];
  const m = byBoard || byIndex;
  if (!m || !isTabletPickupCandidate(m)) return null;
  return {
    ...m,
    matchType: 'group',
    matchId: m.matchId ?? m.id,
    groupId: m.groupId ?? group.groupId,
  };
}

/** Rozpis zápasů na terči pro tablet (skupina nebo pavouk). */
function buildTabletBoardSchedule({
  tournamentData,
  tournamentMatches,
  tournamentBracket,
  tournamentGroups,
  tabletBoardStr,
}) {
  const b = String(tabletBoardStr ?? '').trim();
  if (!b || !tournamentData) return [];

  const boardMatches = (m) => {
    if (!m || m.isBye) return false;
    const mb = m.board != null ? String(m.board).trim() : '';
    return mb === b && m.player1Id && m.player2Id;
  };

  const groupsList = tournamentData.groups?.length ? tournamentData.groups : tournamentGroups;
  const allGroupsFinished =
    !Array.isArray(groupsList) ||
    groupsList.length === 0 ||
    groupsList.every((g) => {
      const gm = (tournamentMatches || []).filter((m) => (m.groupId ?? m.group) === g.groupId);
      return gm.length > 0 && gm.every((m) => m.status === 'completed' || m.status === 'walkover');
    });

  const groups = tournamentData.groups?.length ? tournamentData.groups : tournamentGroups;
  const groupOnBoard = Array.isArray(groups)
    ? groups.find(
        (gr) => Array.isArray(gr.boards) && gr.boards.some((x) => String(x).trim() === b)
      )
    : null;

  const playersOf = (gid) => {
    const grp =
      tournamentGroups.find((g) => g.groupId === gid) ||
      tournamentData?.groups?.find((g) => g.groupId === gid);
    return grp?.players || [];
  };

  const nameFor = (m, p1, players) => {
    const id = p1 ? m.player1Id : m.player2Id;
    const fromMatch = p1
      ? (m.player1Name && String(m.player1Name).trim()) || m.p1Name
      : (m.player2Name && String(m.player2Name).trim()) || m.p2Name;
    if (fromMatch) return String(fromMatch);
    const fromGroup = players?.find((p) => p.id === id)?.name;
    if (fromGroup) return fromGroup;
    const fromTd = resolveTournamentPlayerName(id, tournamentData);
    if (fromTd) return fromTd;
    return id != null ? String(id) : '—';
  };

  const refereeForBracket = (m) => m.referee?.name ?? '—';
  const refereeForGroup = (m, players) => {
    const both = formatRefereeNames(m);
    if (both) return both;
    if (m.chalkerId) return players.find((p) => p.id === m.chalkerId)?.name ?? '—';
    return '—';
  };

  const rows = [];

  if (Array.isArray(tournamentBracket) && tournamentBracket.length > 0 && allGroupsFinished) {
    for (let ri = 0; ri < tournamentBracket.length; ri++) {
      const matches = tournamentBracket[ri]?.matches || [];
      for (let mi = 0; mi < matches.length; mi++) {
        const m = matches[mi];
        if (!boardMatches(m)) continue;
        rows.push({
          key: `br-${ri}-${m.id ?? mi}`,
          matchType: 'bracket',
          roundIndex: ri,
          match: m,
          player1Name: nameFor(m, true, []),
          player2Name: nameFor(m, false, []),
          refereeName: refereeForBracket(m),
          status: m.status,
          tabletStatus: m.tabletStatus,
          scoreDisplay: formatCompletedMatchScoreForSchedule(m),
        });
      }
    }
    return rows;
  }

  if (!groupOnBoard) return [];

  const players = playersOf(groupOnBoard.groupId);
  const gms = (tournamentMatches || [])
    .filter((m) => (m.groupId ?? m.group) === groupOnBoard.groupId)
    .slice()
    .sort((a, c) => (a.round ?? 0) - (c.round ?? 0));

  const groupBoards = (groupOnBoard.boards || []).map((x) => String(x).trim()).filter(Boolean);
  const multiBoard = groupBoards.length > 1;
  for (let i = 0; i < gms.length; i++) {
    const m = gms[i];
    const assigned = m.board != null && m.board !== '' ? String(m.board).trim() : '';
    if (multiBoard && assigned !== b) continue;
    rows.push({
      key: `g-${m.matchId ?? m.id ?? i}`,
      matchType: 'group',
      roundIndex: m.round,
      match: m,
      player1Name: nameFor(m, true, players),
      player2Name: nameFor(m, false, players),
      refereeName: refereeForGroup(m, players),
      status: m.status,
      tabletStatus: m.tabletStatus,
      scoreDisplay: formatCompletedMatchScoreForSchedule(m),
    });
  }

  return rows;
}

// --- POMOCNÉ FUNKCE ---
const getTranslatedName = (name, isPlayer1, currentLang) => {
    if (!name) return '';
    const p1Defaults = ['Domácí', 'Home', 'Gospodarze', translations?.cs?.p1Default, translations?.en?.p1Default, translations?.pl?.p1Default];
    const p2Defaults = ['Hosté', 'Away', 'Goście', translations?.cs?.p2Default, translations?.en?.p2Default, translations?.pl?.p2Default];
    const botDefaults = ['Robot', 'Bot', translations?.cs?.botDefault, translations?.en?.botDefault, translations?.pl?.botDefault];
    
    if (isPlayer1 && p1Defaults.includes(name)) return translations[currentLang]?.p1Default || 'Domácí';
    if (!isPlayer1 && botDefaults.includes(name)) return translations[currentLang]?.botDefault || 'Robot';
    if (!isPlayer1 && p2Defaults.includes(name)) return translations[currentLang]?.p2Default || 'Hosté';
    return name;
};

const calculateStats = (legs, p1Name, p2Name) => {
    let p1DartsTotal=0, p1ScoreTotal=0, p2DartsTotal=0, p2ScoreTotal=0;
    const p1High={'60+':0,'100+':0,'140+':0,'180':0}, p2High={'60+':0,'100+':0,'140+':0,'180':0};
    let p1HighCheck=0, p2HighCheck=0;
    const updateHigh = (s, obj) => { if(s===180) obj['180']++; else if(s>=140) obj['140+']++; else if(s>=100) obj['100+']++; else if(s>=60) obj['60+']++; };

    const legDetails = (legs||[]).map((leg, i) => {
        const p1M = leg.history.filter(m => m.player === 'p1');
        const p2M = leg.history.filter(m => m.player === 'p2');
        // Bust hody se do hry nepočítají (score je jen fiktivní), proto je vynecháváme
        const p1Valid = p1M.filter(m => !m.isBust);
        const p2Valid = p2M.filter(m => !m.isBust);

        p1Valid.forEach(m => updateHigh(m.score, p1High)); 
        p2Valid.forEach(m => updateHigh(m.score, p2High));
        const lP1S = p1Valid.reduce((a,b)=>a+(b.score||0),0); 
        const lP2S = p2Valid.reduce((a,b)=>a+(b.score||0),0);
        const lP1D = p1Valid.reduce((a,b)=>a+(b.dartsUsed||3),0); 
        const lP2D = p2Valid.reduce((a,b)=>a+(b.dartsUsed||3),0);
        p1ScoreTotal+=lP1S; p1DartsTotal+=lP1D; 
        p2ScoreTotal+=lP2S; p2DartsTotal+=lP2D;
        const winnerKey = leg.winner;
        const winnerName = winnerKey === 'p1' ? p1Name : p2Name;
        const winThrow = leg.history.find(m => m.player === winnerKey && m.remaining === 0);
        const check = winThrow ? winThrow.score : 0;
        if(winnerKey==='p1') p1HighCheck = Math.max(p1HighCheck, check); else p2HighCheck = Math.max(p2HighCheck, check);
        const winnerDarts = winnerKey === 'p1' ? lP1D : lP2D;
        const winnerScore = winnerKey === 'p1' ? lP1S : lP2S;
        const winnerAvg = winnerDarts > 0 ? (winnerScore / winnerDarts) * 3 : 0;
        return { index: i+1, winner: winnerName, winnerKey: winnerKey, darts: winnerDarts, avg: winnerAvg, checkout: check };
    });
    return { p1Avg: p1DartsTotal ? (p1ScoreTotal/p1DartsTotal)*3 : 0, p2Avg: p2DartsTotal ? (p2ScoreTotal/p2DartsTotal)*3 : 0, p1DartsTotal, p2DartsTotal, legDetails, p1High, p2High, p1HighCheckout: p1HighCheck, p2HighCheckout: p2HighCheck };
};

function doublesResultExtras(resultData) {
  const extras = {};
  if (resultData?.members) extras.members = resultData.members;
  if (resultData?.legStarters) extras.legStarters = resultData.legStarters;
  return extras;
}

function loserRefereePerson(loserId, loserName, matchLike, tournamentData, extraGroups) {
  if (loserId == null) return null;
  return (
    resolveRefereePerson(loserId, {
      groups: extraGroups,
      players: tournamentData?.players,
      match: matchLike,
    }) || { id: loserId, name: String(loserName ?? loserId) }
  );
}

// --- KOMPONENTY MENU / UI ---
const FlagIcon = ({ lang }) => {
    if (lang === 'cs') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" className="w-5 h-3.5 rounded-sm object-cover"><rect width="900" height="600" fill="#D7141A"/><rect width="900" height="300" fill="#FFF"/><polygon points="0,0 0,600 450,300" fill="#11457E"/></svg>;
    if (lang === 'en') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" className="w-5 h-3.5 rounded-sm object-cover"><clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/><path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#C8102E" strokeWidth="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/></svg>;
    if (lang === 'pl') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10" className="w-5 h-3.5 rounded-sm object-cover border border-slate-700/50"><rect width="16" height="10" fill="#fff"/><rect width="16" height="5" y="5" fill="#dc143c"/></svg>;
    return null;
};

const MatchStatsView = ({ data, onClose, onBack, title, lang, onStartMatch, isTournamentMode, onTournamentMatchComplete, onUndoAndResume }) => {
    const t = (k) => translations[lang]?.[k] || k;
    const [savingMatch, setSavingMatch] = useState(false);
    const [saveError, setSaveError] = useState(null); // string | null
    const [pendingSavePayload, setPendingSavePayload] = useState(null); // { matchId, resultData } | null
    const isP1 = data.matchWinner === 'p1';
    const displayP1Name = getTranslatedName(data.p1Name, true, lang);
    
    // Přidání obtížnosti Bota k zobrazenému jménu ve statistikách
    const displayP2Name = getTranslatedName(data.p2Name, false, lang) + (data.isBot ? ` [${data.botLevel === 'custom' ? `AVG ${data.botAvg}` : (translations[lang]?.[`diff${data.botLevel.charAt(0).toUpperCase() + data.botLevel.slice(1)}`] || data.botLevel)}]` : '');
    
    const winColorText = isP1 ? 'text-emerald-500' : 'text-purple-500';
    const winColorBg = isP1 ? 'from-emerald-500/20 to-emerald-600/10' : 'from-purple-500/20 to-purple-600/10';
    const winBorder = isP1 ? 'border-emerald-500/50' : 'border-purple-500/50';

    let cP1Mpr = '0.00', cP2Mpr = '0.00';
    if (data.gameType === 'cricket' && data.completedLegs && data.completedLegs.length > 0) {
        let p1Marks = 0, p2Marks = 0, p1Darts = 0, p2Darts = 0;
        data.completedLegs.forEach(leg => {
            leg.history.forEach(d => {
                if (d.player === 'p1') { p1Darts++; if(d.target !== 0) p1Marks += d.multiplier; }
                else { p2Darts++; if(d.target !== 0) p2Marks += d.multiplier; }
            });
        });
        if (p1Darts > 0) cP1Mpr = ((p1Marks / p1Darts) * 3).toFixed(2);
        if (p2Darts > 0) cP2Mpr = ((p2Marks / p2Darts) * 3).toFixed(2);
    }

    const stats = data.gameType !== 'cricket' ? calculateStats(data.completedLegs, displayP1Name, displayP2Name) : null;
    const isMultiSet = (data.matchSets || 1) > 1;
    const mainP1 = isMultiSet ? (data.p1Sets || 0) : (data.setScores?.[0]?.p1 ?? data.p1Legs ?? 0);
    const mainP2 = isMultiSet ? (data.p2Sets || 0) : (data.setScores?.[0]?.p2 ?? data.p2Legs ?? 0);
    const legsBreakdown = isMultiSet && data.setScores?.length ? `(${data.setScores.map(s => `${s.p1}:${s.p2}`).join(', ')})` : '';

    const buildTournamentSavePayload = () => {
      const fr = data?.finalResult;
      const p1Legs = Number(fr?.player1?.legsWon ?? data?.p1Legs) || 0;
      const p2Legs = Number(fr?.player2?.legsWon ?? data?.p2Legs) || 0;
      const statsPayload =
        stats && data?.gameType !== 'cricket'
          ? {
              p1Avg: stats.p1Avg,
              p2Avg: stats.p2Avg,
              p1DartsTotal: stats.p1DartsTotal,
              p2DartsTotal: stats.p2DartsTotal,
              p1High: stats.p1High,
              p2High: stats.p2High,
              p1HighCheckout: stats.p1HighCheckout,
              p2HighCheckout: stats.p2HighCheckout,
              legDetails: stats.legDetails,
            }
          : {};
      return {
        matchId: data?.tournamentMatchId ?? data?.id,
        resultData: { p1Legs, p2Legs, ...statsPayload, ...doublesResultExtras(data) },
      };
    };

    const runTournamentSave = async (payload) => {
      if (!payload || savingMatch) return;
      setSavingMatch(true);
      setSaveError(null);
      try {
        await onTournamentMatchComplete?.(payload.matchId, payload.resultData);
        setPendingSavePayload(null);
      } catch (error) {
        console.error('KRITICKÁ CHYBA PŘI ULOŽENÍ ZÁPASU:', error);
        const msg = String(
          error?.message ||
            error ||
            translations[lang]?.tablet?.saveMatchError ||
            'Uložení zápasu selhalo.'
        );
        setSaveError(msg);
        setPendingSavePayload(payload);
        // Zůstat na obrazovce se skóre — nepřesměrovávat
      } finally {
        setSavingMatch(false);
      }
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 fixed inset-0 z-[1000] overflow-hidden">
            {saveError && (
              <div
                className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4 bg-black/80"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="match-save-error-title"
              >
                <div className="w-full max-w-md rounded-2xl border-2 border-red-500/60 bg-slate-900 shadow-2xl p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        id="match-save-error-title"
                        className="text-lg font-black text-white tracking-tight"
                      >
                        {t('tournSaveMatchErrorTitle') || 'Chyba při ukládání zápasu'}
                      </h3>
                      <p className="text-sm text-red-200 mt-2 leading-snug break-words whitespace-pre-wrap">
                        {`${t('tournSaveMatchErrorPrefix') || 'Chyba při ukládání zápasu:'} ${saveError}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={savingMatch}
                      onClick={() =>
                        runTournamentSave(pendingSavePayload || buildTournamentSavePayload())
                      }
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${savingMatch ? 'animate-spin' : ''}`} />
                      {savingMatch
                        ? t('tournSavingMatch') || 'UKLÁDÁM…'
                        : t('tournSaveMatchRetry') || 'Zkusit znovu'}
                    </button>
                    <button
                      type="button"
                      disabled={savingMatch}
                      onClick={() => setSaveError(null)}
                      className="w-full py-3.5 px-4 rounded-xl font-bold text-sm border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    >
                      {t('tournSaveMatchCloseError') || 'Zavřít'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="relative z-20 flex items-center justify-center w-full px-4 pb-4 border-b shrink-0 pt-14 sm:p-4 bg-slate-950 border-slate-900/50">
                <div className="absolute z-50 flex gap-2 mt-5 -translate-y-1/2 left-4 top-1/2 sm:mt-0">
                    <button onClick={onBack || onClose} className="p-2 transition-colors border rounded-lg shadow-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700"><ArrowLeft className="w-5 h-5" /></button>
                    <button onClick={onClose} className="p-2 transition-colors border rounded-lg shadow-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700">
                      <Home className="w-5 h-5" />
                    </button>
                </div>
                <div className="w-full text-center">
                    <h2 className={`text-xl sm:text-2xl font-bold uppercase tracking-widest leading-none ${winColorText}`}>{title}</h2>
                    <div className="text-xs sm:text-sm text-slate-500">{data.date}</div>
                </div>
            </div>
            
            <div className="flex-1 w-full overflow-x-hidden overflow-y-auto bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800">
                <div className="w-full max-w-4xl p-4 pb-12 mx-auto space-y-4 md:space-y-3 landscape:space-y-2">
                    <div className="flex justify-center landscape:py-0">
                        <div className={`bg-gradient-to-br ${winColorBg} border ${winBorder} rounded-xl px-6 py-3 flex items-center gap-3 shadow-lg animate-pulse landscape:py-2 landscape:px-4`}>
                            <Trophy className={`w-8 h-8 ${winColorText} landscape:w-6 landscape:h-6`} />
                            <div className="text-center">
                                <div className={`text-[10px] uppercase font-bold tracking-widest ${isP1 ? 'text-emerald-300' : 'text-purple-300'}`}>{t('matchWinner')}</div>
                                <div className="text-2xl font-black text-white landscape:text-xl">{isP1 ? displayP1Name : displayP2Name}</div>
                            </div>
                        </div>
                    </div>

                    {/* Celkové výsledky – v landscape dva sloupce vedle sebe */}
                    <div className={`grid w-full gap-3 landscape:grid-cols-2 landscape:gap-4 md:grid-cols-2`}>
                        <div className="p-3 text-center border rounded-xl bg-slate-900 border-slate-800 landscape:p-2">
                            <div className="mb-1 text-xs font-bold text-slate-400">{displayP1Name}</div>
                            <div className={`text-3xl font-black landscape:text-2xl ${isP1 ? 'text-emerald-500' : 'text-slate-600'}`}>{mainP1}</div>
                            <div className="text-xs font-mono text-slate-500">{isMultiSet ? `S | L ${data.p1Legs || 0}` : 'LEGS'}</div>
                        </div>
                        <div className="p-3 text-center border rounded-xl bg-slate-900 border-slate-800 landscape:p-2">
                            <div className="mb-1 text-xs font-bold text-slate-400">{displayP2Name}</div>
                            <div className={`text-3xl font-black landscape:text-2xl ${!isP1 ? 'text-purple-500' : 'text-slate-600'}`}>{mainP2}</div>
                            <div className="text-xs font-mono text-slate-500">{isMultiSet ? `S | L ${data.p2Legs || 0}` : 'LEGS'}</div>
                        </div>
                    </div>
                    {legsBreakdown && <div className="text-sm font-mono text-slate-400 text-center landscape:text-xs">{legsBreakdown}</div>}

                    {data.gameType === 'cricket' ? (
                        <div className={`flex justify-around w-full p-4 border shadow-md bg-slate-900 rounded-xl border-slate-800 landscape:p-2`}>
                            <div className="text-center"><div className="mb-1 text-xs font-bold tracking-widest uppercase text-slate-500 landscape:text-[10px]">MPR</div><div className="font-mono text-3xl font-black text-emerald-400 landscape:text-2xl">{cP1Mpr}</div></div>
                            <div className="text-center"><div className="mb-1 text-xs font-bold tracking-widest uppercase text-slate-500 landscape:text-[10px]">MPR</div><div className="font-mono text-3xl font-black text-purple-400 landscape:text-2xl">{cP2Mpr}</div></div>
                        </div>
                    ) : (
                        <>
                            {/* Kompaktní 3-sloupcový grid: Průměr | Šipky (legs) | Zavření */}
                            <div className="grid grid-cols-1 gap-2 landscape:grid-cols-3 landscape:gap-3 md:grid-cols-3">
                                <div className="p-3 border rounded-lg bg-slate-900 border-slate-800 landscape:p-2">
                                    <div className="mb-1 text-[10px] font-bold text-center text-slate-500 uppercase tracking-wider">{t('avg3')}</div>
                                    <div className="flex justify-between font-mono text-lg font-bold landscape:text-base"><span className="text-emerald-400">{stats.p1Avg.toFixed(1)}</span><span className="text-purple-400">{stats.p2Avg.toFixed(1)}</span></div>
                                </div>
                                <div className="p-3 border rounded-lg bg-slate-900 border-slate-800 landscape:p-2">
                                    <div className="mb-1 text-[10px] font-bold text-center text-slate-500 uppercase tracking-wider">{t('detailDarts')}</div>
                                    <div className="flex justify-between font-mono text-lg font-bold landscape:text-base">
                                        <span className="text-emerald-400">{stats.p1DartsTotal ?? '-'}</span>
                                        <span className="text-purple-400">{stats.p2DartsTotal ?? '-'}</span>
                                    </div>
                                </div>
                                <div className="p-3 border rounded-lg bg-slate-900 border-slate-800 landscape:p-2">
                                    <div className="mb-1 text-[10px] font-bold text-center text-slate-500 uppercase tracking-wider">{t('highestCheckout')}</div>
                                    <div className="flex justify-between font-mono text-lg font-bold landscape:text-base"><span className="text-emerald-400">{stats.p1HighCheckout}</span><span className="text-purple-400">{stats.p2HighCheckout}</span></div>
                                </div>
                            </div>
                            {data.members && typeof data.members === 'object' && (
                              <div className="w-full overflow-hidden border rounded-lg bg-slate-900 border-slate-800">
                                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800">
                                  {t('doublesMembersAvg')}
                                </div>
                                <div className="divide-y divide-slate-800">
                                  {Object.values(data.members).map((m) => (
                                    <div key={m.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                                      <span className={`font-bold truncate ${m.side === 'p1' ? 'text-emerald-400' : 'text-purple-400'}`}>
                                        {m.name}
                                      </span>
                                      <span className="font-mono text-slate-200">{Number(m.avg || 0).toFixed(1)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="w-full overflow-hidden border rounded-lg bg-slate-900 border-slate-800">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-[10px] uppercase bg-slate-800 text-slate-400"><tr><th className="px-2 py-1.5 landscape:px-2 landscape:py-1">#</th><th className="px-2 py-1.5 landscape:px-2 landscape:py-1">{t('detailWinner')}</th><th className="px-2 py-1.5 text-center landscape:px-2 landscape:py-1">{t('detailDarts')}</th><th className="px-2 py-1.5 text-right landscape:px-2 landscape:py-1">{t('detailCheckout')}</th><th className="px-2 py-1.5 text-right landscape:px-2 landscape:py-1">{t('detailAvg')}</th></tr></thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {stats.legDetails.map(l => {
                                            const rowColor = l.winnerKey === 'p1' ? 'text-emerald-400' : 'text-purple-400';
                                            return (
                                                <tr key={l.index}>
                                                    <td className="px-2 py-1.5 font-bold text-slate-500 landscape:py-1">{l.index}</td>
                                                    <td className={`px-2 py-1.5 font-bold landscape:py-1 ${rowColor}`}>{l.winner}</td>
                                                    <td className={`px-2 py-1.5 text-center font-mono landscape:py-1 ${rowColor}`}>{l.darts}</td>
                                                    <td className={`px-2 py-1.5 text-right font-mono landscape:py-1 ${rowColor}`}>{l.checkout || '-'}</td>
                                                    <td className={`px-2 py-1.5 text-right font-mono landscape:py-1 ${rowColor}`}>{l.avg.toFixed(1)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    
                    {/* Tlačítka: turnajový režim vs. běžná hra */}
                    <div className="flex flex-col gap-2 mt-6">
                        {isTournamentMode ? (
                            <>
                                <button
                                    type="button"
                                    disabled={savingMatch}
                                    onClick={() => runTournamentSave(buildTournamentSavePayload())}
                                    className="flex items-center justify-center w-full gap-3 py-4 text-lg font-black text-white transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 rounded-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <CheckCircle className="w-6 h-6" />{' '}
                                    {savingMatch
                                      ? t('tournSavingMatch') || 'UKLÁDÁM…'
                                      : t('tournSaveMatch') || 'ULOŽIT ZÁPAS'}
                                </button>
                                <button
                                    type="button"
                                    onClick={onUndoAndResume}
                                    className="flex items-center justify-center w-full gap-3 py-4 text-lg font-black transition-all rounded-xl border-2 bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500 active:scale-95"
                                >
                                    <Undo2 className="w-6 h-6" /> {t('tournBackToGame') || 'ZPĚT DO HRY / OPRAVIT'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={onStartMatch} className="flex items-center justify-center w-full gap-3 py-4 text-lg font-black text-white transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 rounded-xl active:scale-95">
                                    <RotateCcw className="w-6 h-6" /> {t('rematch')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- UŽIVATELSKÝ PROFIL S ROZDĚLENÍM X01 A CRICKET ---
const UserProfile = ({ user, matches, onLogout, onDeleteAccount, onLogin, lang, currentP1Name }) => {
    const t = (k) => translations[lang]?.[k] || k;
    const [timeRange, setTimeRange] = useState('all');
    const [gameTab, setGameTab] = useState('x01');
   
    // Zápasy patří uživateli pokud:
    // - mají jeho UID v p1Id/p2Id (cloudové),
    // - nebo jsou čistě lokální (bez p1Id/p2Id) a shoduje se jméno hráče 1
    const myMatches = matches.filter(m => {
        if (m.p1Id === user.uid || m.p2Id === user.uid) return true;
        const isPureLocal = !m.p1Id && !m.p2Id;
        return isPureLocal && m.p1Name === currentP1Name;
    });
    
    const filteredMatches = myMatches.filter(m => {
        const isTargetGame = gameTab === 'x01' ? m.gameType !== 'cricket' : m.gameType === 'cricket';
        if (!isTargetGame) return false;
        if (timeRange === 'all') return true;
        const cutoff = Date.now() - (timeRange * 24 * 60 * 60 * 1000);
        return m.id >= cutoff;
    });

    let x01Wins = 0, total180s = 0, total140s = 0, total100s = 0, checkouts100plus = 0, highestCheckout = 0;
    let sumAvgs = 0, avgCount = 0, sumFirst9 = 0, first9Count = 0, sumCheckouts = 0, checkoutsCount = 0, x01LegsPlayed = 0, x01LegsWon = 0;
    const roundsDist = {};

    let cricWins = 0, cricLegsPlayed = 0, cricLegsWon = 0;
    let sumMarks = 0, sumCricDarts = 0;
    let whiteHorses = 0, highMarks = 0, goodMarks = 0;

    [...filteredMatches].reverse().forEach(m => {
        const isP1 = m.p1Id === user.uid || m.p1Name === currentP1Name;
        const myKey = isP1 ? 'p1' : 'p2';
        
        if (gameTab === 'x01') {
            if (m.matchWinner === myKey) x01Wins++;
            const name1 = getTranslatedName(m.p1Name, true, lang);
            const name2 = getTranslatedName(m.p2Name, false, lang);
            const stats = calculateStats(m.completedLegs, name1, name2);
            
            const myAvg = isP1 ? stats.p1Avg : stats.p2Avg;
            if (myAvg > 0) { sumAvgs += myAvg; avgCount++; }
            
            m.completedLegs.forEach(leg => {
                x01LegsPlayed++;
                if (leg.winner === myKey) x01LegsWon++;
                const myThrows = leg.history.filter(h => h.player === myKey);
                
                myThrows.forEach(th => {
                    if (th.score >= 180) total180s++;
                    else if (th.score >= 140) total140s++;
                    else if (th.score >= 100) total100s++;
                });
                const f9Throws = myThrows.slice(0, 3);
                const f9Score = f9Throws.reduce((a, b) => a + b.score, 0);
                const f9Darts = f9Throws.reduce((a, b) => a + (b.dartsUsed || 3), 0);
                if (f9Darts > 0) { sumFirst9 += (f9Score / f9Darts) * 3; first9Count++; }
                if (leg.winner === myKey) {
                    const winThrow = myThrows.find(th => th.remaining === 0 && !th.isBust);
                    if (winThrow) {
                        sumCheckouts += winThrow.score; checkoutsCount++;
                        if (winThrow.score > highestCheckout) highestCheckout = winThrow.score;
                        if (winThrow.score >= 100) checkouts100plus++;
                    }
                    const totalDarts = myThrows.reduce((a, b) => a + (b.dartsUsed || 3), 0);
                    const round = Math.ceil(totalDarts / 3);
                    roundsDist[round] = (roundsDist[round] || 0) + 1;
                }
            });
        } else {
            if (m.matchWinner === myKey) cricWins++;
            m.completedLegs.forEach(leg => {
                cricLegsPlayed++;
                if (leg.winner === myKey) cricLegsWon++;

                const myThrows = leg.history.filter(h => h.player === myKey);
                let currentRoundMarks = 0;

                myThrows.forEach((th, idx) => {
                    sumCricDarts++;
                    if (th.target !== 0) {
                        sumMarks += th.multiplier;
                        currentRoundMarks += th.multiplier;
                    }
                    if ((idx + 1) % 3 === 0 || idx === myThrows.length - 1) {
                        if (currentRoundMarks >= 9) whiteHorses++;
                        else if (currentRoundMarks >= 7) highMarks++;
                        else if (currentRoundMarks >= 5) goodMarks++;
                        currentRoundMarks = 0;
                    }
                });
            });
        }
    });

    const winRate = filteredMatches.length > 0 ? Math.round(((gameTab === 'x01' ? x01Wins : cricWins) / filteredMatches.length) * 100) : 0;
    const legWinRate = (gameTab === 'x01' ? x01LegsPlayed : cricLegsPlayed) > 0 ? Math.round(((gameTab === 'x01' ? x01LegsWon : cricLegsWon) / (gameTab === 'x01' ? x01LegsPlayed : cricLegsPlayed)) * 100) : 0;
    
    const overallAvg = avgCount > 0 ? (sumAvgs / avgCount).toFixed(1) : '0.0';
    const overallFirst9 = first9Count > 0 ? (sumFirst9 / first9Count).toFixed(1) : '0.0';
    const avgCheckout = checkoutsCount > 0 ? Math.round(sumCheckouts / checkoutsCount) : 0;
    let maxRoundCount = 0; Object.values(roundsDist).forEach(val => { if (val > maxRoundCount) maxRoundCount = val; });
    const overallMPR = sumCricDarts > 0 ? ((sumMarks / sumCricDarts) * 3).toFixed(2) : '0.00';

    const roundEntries = Object.entries(roundsDist)
        .map(([round, cnt]) => ({ round: parseInt(round, 10), count: cnt }))
        .filter(x => !Number.isNaN(x.round))
        .sort((a, b) => a.round - b.round);
    const totalCheckouts = roundEntries.reduce((a, b) => a + (b.count || 0), 0);

    return (
        <main className="relative z-10 flex-1 w-full overflow-y-auto bg-slate-950">
            <div className="flex flex-col w-full max-w-4xl xl:max-w-7xl gap-4 p-4 pb-24 mx-auto sm:p-6">
                
                <div className="flex items-center justify-between p-3 border shadow-md bg-slate-900 border-slate-800 rounded-xl sm:p-4">
                    <div className="flex items-center min-w-0 gap-2 sm:gap-3">
                        <div className="p-2 rounded-full bg-emerald-900/30 shrink-0"><User className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" /></div>
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-sm font-black tracking-widest text-white uppercase truncate sm:text-base">
                                {user.isAnonymous ? (currentP1Name || t('statsUserFallback')) : (user.displayName ? user.displayName.split(' ')[0] : t('statsUserFallback'))}
                            </h2>
                            <span className="text-[9px] sm:text-[10px] text-slate-500 truncate">
                                {user.isAnonymous ? (t('localOfflineProfile') || 'Nikdo není přihlášen') : (user.email || t('localOfflineProfile'))}
                            </span>
                        </div>
                    </div>
                    {user.isAnonymous ? (
                        <button
                            onClick={onLogin}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] sm:text-xs font-bold uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shrink-0 ml-2 shadow-lg flex gap-2 items-center"
                        >
                            <Cloud className="w-4 h-4"/> {t('backupBtn')}
                        </button>
                    ) : (
                        <button onClick={onLogout} className="bg-red-900/20 hover:bg-red-900/40 text-red-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border border-red-500/30 transition-colors shrink-0 ml-2">{t('logout')}</button>
                    )}
                </div>

                <div className="flex flex-col min-[480px]:flex-row gap-3 md:gap-4">
                <div className="flex flex-1 min-w-0 p-1 border rounded-lg bg-slate-900 border-slate-800">
                    {[{v:'x01', l:'X01 (501)'}, {v:'cricket', l:'CRICKET'}].map(f => (
                        <button key={f.v} onClick={() => setGameTab(f.v)} className={`flex-1 py-3 text-xs font-black rounded-md uppercase tracking-wider transition-colors ${gameTab === f.v ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{f.l}</button>
                    ))}
                </div>
                <div className="flex flex-1 min-w-0 p-1 border rounded-lg bg-slate-900 border-slate-800">
                    {[{v:'all', l:t('statsAllTime')}, {v:7, l:t('stats7Days')}, {v:30, l:t('stats30Days')}, {v:90, l:t('stats90Days')}].map(f => (
                        <button key={f.v} onClick={() => setTimeRange(f.v)} className={`flex-1 py-2 text-[10px] sm:text-xs font-bold rounded-md uppercase tracking-wider transition-colors ${timeRange === f.v ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{f.l}</button>
                    ))}
                </div>
                </div>

                {gameTab === 'x01' && (
                    <div className="flex flex-col gap-4 duration-300 animate-in fade-in landscape:gap-2">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 landscape:grid-cols-4 landscape:gap-2 landscape:p-1">
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl landscape:p-2"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('avg3')}</span><span className="font-mono text-2xl font-black sm:text-3xl landscape:text-xl text-emerald-400">{overallAvg}</span></div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl landscape:p-2"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('statsFirst9')}</span><span className="font-mono text-2xl font-black text-indigo-400 sm:text-3xl landscape:text-xl">{overallFirst9}</span></div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl landscape:p-2">
                                <span className="text-[8px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('winRate')}</span>
                                <div className="flex items-center gap-2"><span className="font-mono text-2xl font-black text-blue-400 sm:text-3xl landscape:text-xl">{winRate}%</span><span className="text-sm font-bold text-slate-600">|</span><span className="font-mono text-2xl font-black sm:text-3xl landscape:text-xl text-cyan-400">{legWinRate}%</span></div>
                                <span className="text-[8px] sm:text-[9px] text-slate-500 mt-1">{filteredMatches.length} {t('matches')} / {x01LegsPlayed} {t('legs')}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-3 text-center border bg-slate-900 border-slate-800 sm:p-4 rounded-xl landscape:p-2"><span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('statsAvgCheckout')}</span><span className="font-mono text-2xl font-black text-orange-400 sm:text-3xl landscape:text-xl">{avgCheckout}</span></div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 landscape:grid-cols-6 sm:gap-3 landscape:gap-2">
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('stats100p')}</span><span className="font-mono text-xl font-black text-white">{total100s}</span></div>
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('stats140p')}</span><span className="font-mono text-xl font-black text-white">{total140s}</span></div>
                            <div className="flex flex-col items-center justify-center p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('total180s')}</span><span className="font-mono text-xl font-black text-red-400">{total180s}</span></div>
                            <div className="flex flex-col items-center justify-center col-span-3 p-2 text-center border bg-slate-900 border-slate-800 sm:p-3 rounded-xl landscape:col-span-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('highestCheckout')}</span>
                                <div className="flex items-center gap-3"><span className="font-mono text-2xl font-black text-yellow-400">{highestCheckout}</span><span className="text-[9px] text-slate-500 border-l border-slate-700 pl-3">{checkouts100plus}x {t('checkout100')}</span></div>
                            </div>
                        </div>

                        <div className="p-4 border bg-slate-900 rounded-xl border-slate-800">
                            <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {t('statsRoundDist')}
                            </div>
                            {totalCheckouts === 0 ? (
                                <div className="text-xs text-slate-600">-</div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {roundEntries.map(({ round, count }) => {
                                        const pct = Math.round((count / totalCheckouts) * 100);
                                        return (
                                            <div key={round} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
                                                <div className="text-xs font-bold text-slate-500">R{round}</div>
                                                <div className="h-3 rounded bg-slate-800 overflow-hidden border border-slate-700">
                                                    <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                                                </div>
                                                <div className="text-xs font-mono font-bold text-emerald-400 text-right">{pct}%</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {gameTab === 'cricket' && (
                    <div className="flex flex-col gap-4 duration-300 animate-in fade-in landscape:gap-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 landscape:grid-cols-2 landscape:gap-2">
                            <div className="flex flex-col items-center justify-center p-6 text-center border shadow-lg bg-slate-900 border-slate-800 rounded-xl landscape:p-3"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">{t('totalMprInfo')}</span><span className="font-mono text-5xl font-black text-emerald-400 landscape:text-3xl">{overallMPR}</span></div>
                            <div className="flex flex-col items-center justify-center p-6 text-center border bg-slate-900 border-slate-800 rounded-xl landscape:p-3">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">{t('winRate')}</span>
                                <div className="flex items-center gap-4"><span className="font-mono text-4xl font-black text-blue-400 landscape:text-2xl">{winRate}%</span><span className="text-2xl font-bold text-slate-600 landscape:text-xl">|</span><span className="font-mono text-4xl font-black text-cyan-400 landscape:text-2xl">{legWinRate}%</span></div>
                                <span className="text-[9px] text-slate-500 mt-2">{filteredMatches.length} {t('matches')} / {cricLegsPlayed} {t('legs')}</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 sm:gap-3 landscape:mt-0 landscape:gap-2">
                            <div className="relative flex flex-col items-center justify-center p-4 overflow-hidden text-center border bg-slate-900 border-slate-800 rounded-xl landscape:p-2">
                                <div className="absolute top-0 right-0 w-8 h-8 rounded-bl-full bg-yellow-500/10"></div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2 z-10">{t('whiteHorse')}</span>
                                <span className="z-10 font-mono text-3xl font-black text-yellow-400 landscape:text-2xl">{whiteHorses}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 text-center border bg-slate-900 border-slate-800 rounded-xl landscape:p-2">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2">{t('marks7plus')}</span>
                                <span className="font-mono text-3xl font-black text-white landscape:text-2xl">{highMarks}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 text-center border bg-slate-900 border-slate-800 rounded-xl landscape:p-2">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-2">{t('marks5plus')}</span>
                                <span className="font-mono text-3xl font-black text-slate-300 landscape:text-2xl">{goodMarks}</span>
                            </div>
                        </div>
                    </div>
                )}
                <button onClick={onDeleteAccount} className="w-full py-3 mt-4 text-sm font-bold tracking-widest text-red-400 uppercase transition-all border shadow-md bg-red-900/20 hover:bg-red-900/40 border-red-500/30 rounded-xl active:scale-95">{t('deleteAccount')}</button>
            </div>
        </main>
    );
};

// --- HLAVNÍ KOMPONENTA (ROUTER) ---
function AppMain({ lang, setLang }) {
  const { openKeyboard, isKeyboardOpen, internalKeyboardEnabled } = useAdminVirtualKeyboard();
  const [user, setUser] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [appState, setAppState] = useState(() => {
    if (isPublicTournamentCatalogPath()) return 'prereg_catalog';
    const route = parsePreregRouteFromUrl();
    if (route?.inviteToken) return 'prereg_admin';
    if (route?.tournamentId) return 'prereg_public';
    const resume = getBootUiResumeOnce();
    if (resume?.appState && resume.appState !== 'home') return resume.appState;
    return 'home';
  });
  const [preregTournamentId, setPreregTournamentId] = useState(() => {
    if (isPublicTournamentCatalogPath()) return null;
    const fromPath = parsePreregTournamentIdFromPath();
    if (fromPath) return fromPath;
    const r = getBootUiResumeOnce();
    if (r?.appState === 'prereg_public' || r?.appState === 'prereg_admin') {
      return r.preregTournamentId ?? null;
    }
    return null;
  });
  /** Po otevření turnaje z katalogu — zpět vede na /tournaments místo domů. */
  const [preregReturnToCatalog, setPreregReturnToCatalog] = useState(() => {
    const r = getBootUiResumeOnce();
    return r?.appState === 'prereg_public' ? !!r.preregReturnToCatalog : false;
  });
  /** UUID turnaje v admin panelu předregistrace (vlastník přes Google). */
  const [activePreRegTournamentId, setActivePreRegTournamentId] = useState(() => {
    const route = parsePreregRouteFromUrl();
    if (route?.inviteToken) return route.tournamentId;
    if (route?.tournamentId) return null;
    const r = getBootUiResumeOnce();
    if (r?.appState === 'prereg_admin') return r.activePreRegTournamentId ?? null;
    return null;
  });
  /** Invite token z URL / session pro spolupořaditele. */
  const [activePreRegInviteToken, setActivePreRegInviteToken] = useState(() => {
    const route = parsePreregRouteFromUrl();
    return route?.inviteToken ?? null;
  });
  /** ID předregistračního turnaje, ze kterého proběhl import do živého enginu. */
  const [preRegImportSourceId, setPreRegImportSourceId] = useState(null);
  const skipNextNameFocusRef = useRef(false);
  const [homeSubmenu, setHomeSubmenu] = useState(null);
  /** Pause overlay na herní obrazovce. */
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  /**
   * Zaparkovaná relace pro resume lištu na Domů.
   * match + mountKept: herní strom zůstane namountovaný (skrytý), ať se neztratí stav GameX01/Cricket.
   * tournament: návrat do admin/viewer stavu turnaje.
   */
  const [parkedSession, setParkedSession] = useState(null);
  /** ID aktivní online hry ve Firestore (GameX01 / GameCricket). */
  const [onlineGameId, setOnlineGameId] = useState(null);
  /** Na tomto zařízení: hostitel = p1, hostující host = p2 (null = neonline). */
  const [myOnlineRole, setMyOnlineRole] = useState(null);
  /** Lokální kamera/mikrofon vybrané v online lobby (přenáší se do WebRTC). */
  const [onlineLocalStream, setOnlineLocalStream] = useState(null);
  /** Obnova čekárny hostitele po F5 (dokument ve stavu waiting). */
  const [onlineHostResumeWaitingSession, setOnlineHostResumeWaitingSession] = useState(null);
  /** Po obnově stránky: ID hry, u které už existuje liveGameState — neodesílat prázdný p1 seed. */
  const [skipOnlineInitialSeedGameId, setSkipOnlineInitialSeedGameId] = useState(null);
  const [tournamentMatchContext, setTournamentMatchContext] = useState(null);
  const tournamentMatchContextRef = useRef(null);
  useEffect(() => {
    tournamentMatchContextRef.current = tournamentMatchContext;
  }, [tournamentMatchContext]);
  /** Zabrání dvojímu zápisu historie při `status: completed` + lokálním dokončení. */
  const processedOnlineMatchHistoryRef = React.useRef(new Set());
  const t = (k) => translations[lang]?.[k] || k;

  const rosterIdentityFromPlayer = (rawPlayer) => {
    const name = String(rawPlayer?.name ?? '').trim();
    if (!name) return null;
    const csoPlayerId = resolveCsoPlayerId({
      name,
      csoPlayerId: rawPlayer?.csoPlayerId ?? null,
    });
    const nameKey = normalizePlayerNameKey(name) || null;
    return {
      name,
      csoPlayerId,
      nameKey,
      dedupeKey: csoPlayerId || `name:${nameKey || name.toLowerCase()}`,
    };
  };

  const syncRosterOnSiteRegistrations = async ({
    tournamentId,
    rosterPlayers,
    competitionType,
  }) => {
    const sourceTournamentId = String(tournamentId ?? '').trim();
    if (!sourceTournamentId || !Array.isArray(rosterPlayers) || rosterPlayers.length === 0) {
      return { createdCount: 0, pairedCount: 0 };
    }

    const sourceTournament = await getOwnerTournamentData(sourceTournamentId);
    const resolvedCompetitionType = normalizeCompetitionType(
      sourceTournament?.meta?.competitionType ?? competitionType
    );
    const pairingOn = allowsPairing(resolvedCompetitionType);
    const pairFeeMode = pairingOn && normalizeFeeMode(sourceTournament) === 'pair';
    const activeRegistrations = await listTournamentRegistrations(sourceTournamentId);
    const trackedRegs = activeRegistrations.filter((row) =>
      ACTIVE_PREREG_STATUSES.has(String(row?.status ?? ''))
    );
    const trackedByIdentity = new Map();
    for (const reg of trackedRegs) {
      const player = reg?.player ?? {};
      const identity = rosterIdentityFromPlayer({
        name: player.name,
        csoPlayerId: player.csoPlayerId ?? (player.nameKey ? `name:${player.nameKey}` : null),
      });
      if (!identity || trackedByIdentity.has(identity.dedupeKey)) continue;
      trackedByIdentity.set(identity.dedupeKey, reg);
    }

    const ensureRegistration = async (candidate, { markPaid = true } = {}) => {
      if (!candidate?.name) return null;
      const existing = trackedByIdentity.get(candidate.dedupeKey) ||
        findDuplicateRegistration(trackedRegs, {
          name: candidate.name,
          csoPlayerId: candidate.csoPlayerId,
        });
      if (existing) {
        trackedByIdentity.set(candidate.dedupeKey, existing);
        return existing;
      }

      const created = await createManualRegistration(sourceTournamentId, {
        playerName: candidate.name,
        csoPlayerId: candidate.csoPlayerId ?? null,
        nameKey: candidate.nameKey ?? null,
        paymentMethod: 'CASH',
        isPaid: !!markPaid,
        checkedIn: true,
        duplicateOk: true,
        source: 'ON_SITE',
        forceConfirmed: true,
      });
      const createdReg = {
        id: created.registrationId,
        status: 'CONFIRMED',
        source: 'ON_SITE',
        player: {
          name: candidate.name,
          csoPlayerId: candidate.csoPlayerId ?? null,
          nameKey: candidate.nameKey ?? null,
        },
        payment: {
          isPaid: !!markPaid,
        },
        pair: {
          status: 'NONE',
          partnerRegistrationId: null,
        },
      };
      trackedRegs.push(createdReg);
      trackedByIdentity.set(candidate.dedupeKey, createdReg);
      return createdReg;
    };

    const uniqueIndividuals = new Map();
    const paidFlagByIdentity = new Map();
    const teamIdentityPairs = [];
    for (const player of rosterPlayers) {
      if (isTeamPlayer(player) && Array.isArray(player?.members)) {
        const members = player.members
          .map((member) => rosterIdentityFromPlayer(member))
          .filter(Boolean);
        members.forEach((member, memberIdx) => {
          if (!uniqueIndividuals.has(member.dedupeKey)) {
            uniqueIndividuals.set(member.dedupeKey, member);
          }
          if (!paidFlagByIdentity.has(member.dedupeKey)) {
            paidFlagByIdentity.set(member.dedupeKey, !(pairFeeMode && memberIdx > 0));
          }
        });
        if (pairingOn && members.length >= 2) {
          teamIdentityPairs.push([members[0], members[1]]);
        }
        continue;
      }

      const single = rosterIdentityFromPlayer(player);
      if (!single || uniqueIndividuals.has(single.dedupeKey)) continue;
      uniqueIndividuals.set(single.dedupeKey, single);
      if (!paidFlagByIdentity.has(single.dedupeKey)) {
        paidFlagByIdentity.set(single.dedupeKey, true);
      }
    }

    let createdCount = 0;
    for (const individual of uniqueIndividuals.values()) {
      const before = trackedByIdentity.has(individual.dedupeKey);
      await ensureRegistration(individual, {
        markPaid: paidFlagByIdentity.get(individual.dedupeKey) !== false,
      });
      if (!before) createdCount += 1;
    }

    let pairedCount = 0;
    if (pairingOn && teamIdentityPairs.length > 0) {
      for (const [first, second] of teamIdentityPairs) {
        const regA = await ensureRegistration(first, {
          markPaid: paidFlagByIdentity.get(first.dedupeKey) !== false,
        });
        const regB = await ensureRegistration(second, {
          markPaid: paidFlagByIdentity.get(second.dedupeKey) !== false,
        });
        if (!regA?.id || !regB?.id || regA.id === regB.id) continue;

        const aPartner = String(regA?.pair?.partnerRegistrationId ?? '').trim();
        const bPartner = String(regB?.pair?.partnerRegistrationId ?? '').trim();
        const aStatus = String(regA?.pair?.status ?? 'NONE');
        const bStatus = String(regB?.pair?.status ?? 'NONE');
        const alreadyTogether =
          aStatus === 'CONFIRMED' &&
          bStatus === 'CONFIRMED' &&
          aPartner === regB.id &&
          bPartner === regA.id;
        const takenByOther =
          (aStatus === 'CONFIRMED' && aPartner && aPartner !== regB.id) ||
          (bStatus === 'CONFIRMED' && bPartner && bPartner !== regA.id);
        if (alreadyTogether || takenByOther) continue;

        await adminConfirmPair(sourceTournamentId, regA.id, regB.id);
        pairedCount += 1;
        const nextA = {
          ...regA,
          pair: { ...(regA?.pair ?? {}), status: 'CONFIRMED', partnerRegistrationId: regB.id },
        };
        const nextB = {
          ...regB,
          pair: { ...(regB?.pair ?? {}), status: 'CONFIRMED', partnerRegistrationId: regA.id },
        };
        trackedByIdentity.set(first.dedupeKey, nextA);
        trackedByIdentity.set(second.dedupeKey, nextB);
      }
    }

    return { createdCount, pairedCount };
  };

  const stopMediaStream = (s) => {
    if (!s) return;
    try {
      s.getTracks().forEach((tr) => tr.stop());
    } catch {
      /* ignore */
    }
  };

  const handleOnlineSessionEnded = React.useCallback(() => {
    clearLastOnlineSession();
    setSkipOnlineInitialSeedGameId(null);
    setOnlineLocalStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    setOnlineGameId(null);
    setMyOnlineRole(null);
    if (!tournamentMatchContextRef.current) {
      setHomeSubmenu('online');
      setAppState('home');
    }
  }, []);

  const handleOnlineGameStart = React.useCallback((gameData, gameId, role, localStream = null) => {
    const legs = Math.min(30, Math.max(1, Number(gameData?.legs) || 1));
    const gt = gameData?.gameType === 'cricket' ? 'cricket' : 'x01';
    const r = role === 'p2' ? 'p2' : 'p1';
    setOnlineLocalStream(localStream || null);
    setSettings((prev) => ({
      ...prev,
      gameType: gt,
      startScore: gt === 'x01' ? Number(gameData?.startScore) || prev.startScore : prev.startScore,
      outMode:
        gt === 'x01' && ['double', 'single'].includes(gameData?.outMode)
          ? gameData.outMode
          : gt === 'x01'
            ? 'double'
            : prev.outMode,
      matchMode: 'first_to',
      matchTarget: legs,
      matchSets: 1,
      p1Name: String(gameData?.hostName || '').trim() || prev.p1Name,
      p2Name: String(gameData?.guestName || '').trim() || prev.p2Name,
      isBot: false,
      startPlayer: gameData?.startPlayer === 'p2' ? 'p2' : 'p1',
      doubles: false,
      teams: null,
    }));
    setOnlineGameId(String(gameId));
    setMyOnlineRole(r);
    persistLastOnlineSession(String(gameId), r);
    setHomeSubmenu(null);
    setAppState('playing');
  }, []);

  const consumeOnlineHostResume = React.useCallback(() => {
    setOnlineHostResumeWaitingSession(null);
  }, []);

  /** Obnova online relace po obnovení stránky (persistované lastOnline* v localStorage). */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const sp = safeStorage.getItem(SESSION_ROLE_KEY);
      if (sp === 'viewer' || sp === 'tablet') return;

      const meta = readLastOnlineSession();
      if (!meta?.gameId) return;

      let data;
      try {
        data = await getOnlineGameById(meta.gameId);
      } catch {
        console.warn('resume online game');
        if (!cancelled) clearLastOnlineSession();
        return;
      }
      if (cancelled) return;
      if (!data) {
        clearLastOnlineSession();
        return;
      }

      const st = data.status;
      if (st !== 'waiting' && st !== 'playing') {
        clearLastOnlineSession();
        return;
      }

      const role = meta.role === 'p2' ? 'p2' : 'p1';

      if (st === 'waiting') {
        if (role !== 'p1') {
          clearLastOnlineSession();
          return;
        }
        setOnlineHostResumeWaitingSession({
          gameId: data.id,
          pin: data.pin ?? null,
          hostName: data.hostName,
          gameFormat: data.gameFormat,
          legs: data.legs,
          isPublic: !!data.isPublic,
        });
        setHomeSubmenu('online');
        setAppState('home');
        return;
      }

      if (st === 'playing' && role === 'p2' && !String(data.guestName || '').trim()) {
        clearLastOnlineSession();
        return;
      }

      const live = data.liveGameState;
      const hasLiveX01 =
        data.gameType !== 'cricket' && !!(live && live.kind === 'x01' && live.gameState);
      setSkipOnlineInitialSeedGameId(hasLiveX01 ? meta.gameId : null);

      handleOnlineGameStart(data, meta.gameId, role, null);
      setAppState('playing');
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [handleOnlineGameStart]);

  useEffect(() => {
    if (appState !== 'home') setHomeSubmenu(null);
  }, [appState]);

  // Deep-link: #about nebo /t/:tournamentId (?invite= pro admin panel)
  useEffect(() => {
    const applyRoutes = async () => {
      const h = String(window.location.hash || '').toLowerCase();
      if (h === '#about') {
        setAppState('about');
        return;
      }

      if (isPublicTournamentCatalogPath()) {
        setAppState('prereg_catalog');
        setPreregTournamentId(null);
        setPreregReturnToCatalog(false);
        return;
      }

      const route = parsePreregRouteFromUrl();
      if (!route) return;

      setPreregTournamentId(route.tournamentId);

      if (route.inviteToken) {
        const valid = await verifyAdminInviteToken(route.tournamentId, route.inviteToken);
        if (valid) {
          saveAdminInviteSession(route.tournamentId, route.inviteToken);
          setActivePreRegTournamentId(route.tournamentId);
          setActivePreRegInviteToken(route.inviteToken);
          setAppState('prereg_admin');
          window.history.replaceState(null, '', `/t/${encodeURIComponent(route.tournamentId)}`);
          return;
        }
      }

      setAppState('prereg_public');
    };

    void applyRoutes();
    const onRoute = () => {
      void applyRoutes();
    };
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);
    return () => {
      window.removeEventListener('hashchange', onRoute);
      window.removeEventListener('popstate', onRoute);
    };
  }, []);

  /** Po přihlášení Google uplatnit invite token (spolupořaditel). */
  const claimedInviteRef = useRef(new Set());

  useEffect(() => {
    const uid = user?.uid;
    if (!uid || user?.isAnonymous) return;
    const tournamentId = activePreRegTournamentId;
    if (!tournamentId) return;

    const token =
      activePreRegInviteToken ??
      loadAdminInviteSession(tournamentId)?.token ??
      null;
    if (!token) return;

    const claimKey = `${tournamentId}:${token}:${uid}`;
    if (claimedInviteRef.current.has(claimKey)) return;
    claimedInviteRef.current.add(claimKey);

    void claimAdminInviteAccess(tournamentId, token).catch(() => {
      claimedInviteRef.current.delete(claimKey);
    });
  }, [user?.uid, user?.isAnonymous, activePreRegTournamentId, activePreRegInviteToken]);

  const [settings, setSettings] = useState({
    gameType: 'x01',
    startScore: 501, outMode: 'double',
    p1Name: translations[lang]?.p1Default || 'Domácí', p1Id: null,
    p2Name: translations[lang]?.p2Default || 'Hosté', p2Id: null,
    quickButtons: [41, 45, 60, 100, 140, 180],
    matchMode: 'first_to', matchTarget: 3, matchSets: 1,
    isBot: false, botLevel: 'pro', botAvg: 65,
    startPlayer: 'p1'
  });

  const [matchHistory, setMatchHistory] = useState(() => loadSafeMatchHistory());
  const [selectedMatchDetail, setSelectedMatchDetail] = useState(null); 
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPC, setIsPC] = useState(false);
  const [tutorialTab, setTutorialTab] = useState('x01');
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [showCustomFormat, setShowCustomFormat] = useState(false);
  const [customSetsValue, setCustomSetsValue] = useState(1);
  const [customLegsValue, setCustomLegsValue] = useState(3);
  const [matchFinishRestoreState, setMatchFinishRestoreState] = useState(null);

  // Keep screen awake on scoring/tablet/admin-bracket screens (when supported).
  useEffect(() => {
    let wakeLock = null;
    let cancelled = false;

    const shouldKeepAwake =
      appState === 'tournament_tablet' ||
      (appState === 'playing' && tournamentMatchContextRef.current?.type === 'tablet') ||
      (appState === 'tournament_bracket' && userRoleRef.current === 'admin');

    const release = async () => {
      try {
        if (wakeLock) await wakeLock.release();
      } catch {}
      wakeLock = null;
    };

    const acquire = async () => {
      if (!shouldKeepAwake) {
        await release();
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => {
          // No-op: we re-acquire on visibilitychange if needed.
        });
      } catch {
        // Ignore: permission / not supported / battery saver.
      }
    };

    const onVisibilityChange = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') {
        release();
      } else {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, [appState]);
  const [tournamentMatches, setTournamentMatches] = useState([]);
  const [startupStorageError, setStartupStorageError] = useState(() => {
    const loaded = getInitialTournamentBootstrapOnce();
    return loaded.hadError ? 'Předchozí turnaj byl poškozen nebo je ze staré verze. Začínáme čistý turnaj.' : null;
  });
  const [tournamentData, setTournamentData] = useState(() => getInitialTournamentBootstrapOnce().td ?? null);
  const [tournamentDraft, setTournamentDraft] = useState(() =>
    mergeDraftFromResume(getBootUiResumeOnce()?.tournamentDraft)
  );
  const [tournamentSetupStep, setTournamentSetupStep] = useState(() => {
    const s = Number(getBootUiResumeOnce()?.tournamentSetupStep);
    return Number.isFinite(s) && s >= 1 && s <= 7 ? s : 1;
  });
  const [tournamentBracket, setTournamentBracket] = useState(
    () => getInitialTournamentBootstrapOnce().bracket ?? []
  );
  const hasBracketGenerated = Array.isArray(tournamentBracket) && (tournamentBracket?.length ?? 0) > 0;
  /** Režim přístupu k turnaji (cloud rozcestník); null = zatím nevybráno v hubu */
  const [userRole, setUserRole] = useState(() => {
    const r = getBootUiResumeOnce();
    if (!r?.appState || r.appState === 'home') return null;
    if (r.appState === 'tournament_setup' || r.appState === 'tournament_board_assignment') {
      return r.userRole || 'admin';
    }
    return r.userRole ?? null;
  });
  /** PIN zadaný při připojení tabletu / diváka (Firebase později) */
  const [activePin, setActivePin] = useState(() => {
    const r = getBootUiResumeOnce();
    if (r?.appState && r.appState !== 'home') return String(r.activePin ?? '');
    return '';
  });
  const userRoleRef = useRef(userRole);
  userRoleRef.current = userRole;

  /** Obnova obrazovky po zavření externího odkazu (ČŠO / mapy) v PWA/TWA. */
  useEffect(() => {
    if (skipUiResumePersist) return;
    saveUiResume({
      appState,
      tournamentSetupStep,
      tournamentDraft,
      userRole,
      activePin,
      activePreRegTournamentId,
      preregTournamentId,
      preregReturnToCatalog,
      homeSubmenu,
    });
  }, [
    appState,
    tournamentSetupStep,
    tournamentDraft,
    userRole,
    activePin,
    activePreRegTournamentId,
    preregTournamentId,
    preregReturnToCatalog,
    homeSubmenu,
  ]);

  /** Po přijetí sloučených dat z tabletu přes onSnapshot: přeruší outbound sync, aby se neposlal starý stav zpět (echo loop). */
  const isIncomingCloudUpdate = useRef(false);
  const inboundCloudSyncGen = useRef(0);
  /** Vždy nejnovější payload pro sync do cloudu (žádné stale closure v debounced setTimeout). */
  const tournamentSyncPayloadRef = useRef({
    tournamentData: null,
    groups: [],
    groupMatches: [],
    tournamentBracket: [],
  });

  /** JIT: detekce navýšení počtu terčů v pavouku (aby se hned zaplnily čekající zápasy). */
  const prevBracketBoardsRef = useRef(null);
  const bracketAutoFixTimerRef = useRef(null);
  const bracketJitTimerRef = useRef(null);

  /** Obnova relace diváka / tabletu po F5 (localStorage). */
  useEffect(() => {
    const role = safeStorage.getItem(SESSION_ROLE_KEY);
    const pin = safeStorage.getItem(SESSION_PIN_KEY);
    if (!role || !pin) return;
    if (role !== 'viewer' && role !== 'tablet') {
      clearSpectatorSession();
      return;
    }
    const p = String(pin).trim();
    if (!/^\d{4}$/.test(p)) {
      clearSpectatorSession();
      return;
    }
    setTournamentData(null);
    setTournamentMatches([]);
    setTournamentBracket([]);
    setTournamentMatchContext(null);
    setUserRole(role);
    setActivePin(p);
    if (role === 'tablet') {
      const b = safeStorage.getItem(SESSION_BOARD_KEY) ?? '';
      setTournamentDraft((prev) => ({ ...prev, hubTabletBoard: String(b).trim() }));
      setAppState('tournament_tablet');
    } else {
      setAppState('tournament_groups');
    }
  }, []);

  // Globální toast notifikace (nahrazuje alert)
  /** Admin: klepnutím na PIN v horní liště zobrazí heslo pro herní tablety */
  const [adminPinBarShowTabletPassword, setAdminPinBarShowTabletPassword] = useState(false);
  useEffect(() => {
    setAdminPinBarShowTabletPassword(false);
  }, [activePin, tournamentData?.tournamentId]);

  const [notification, setNotification] = useState(null); // { message: string, type: 'error'|'success' }
  const showNotification = (message, type = 'error') => {
    setNotification({ message: String(message ?? ''), type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };
  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;
  const tRef = useRef(t);
  tRef.current = t;

  /** Deep-link /tablet?t=PIN&board=N&token=… — automatické připojení herního tabletu. */
  const tabletQrHandledRef = useRef(false);
  useEffect(() => {
    const tabletRoute = parseTabletRouteFromUrl();
    if (!tabletRoute) return;
    if (tabletQrHandledRef.current) return;
    tabletQrHandledRef.current = true;

    const run = async () => {
      const { pin, board, token } = tabletRoute;
      const access = await verifyTabletBoardAccess(pin, '', { board, boardToken: token });
      if (!access.ok) {
        showNotificationRef.current(
          access.reason === 'bad_password'
            ? tRef.current('tournamentHub.invalidTabletPassword')
            : tRef.current('tournamentHub.invalidPin'),
          'error'
        );
        window.history.replaceState(null, '', '/');
        return;
      }
      try {
        await registerTabletBoardOnline(pin, board, token);
      } catch (err) {
        console.warn('registerTabletBoardOnline:', err);
        showNotificationRef.current(
          String(err?.message || tRef.current('tournamentHub.syncError') || 'Chyba synchronizace s cloudem.'),
          'error'
        );
      }
      setTournamentData(null);
      setTournamentMatches([]);
      setTournamentBracket([]);
      setTournamentMatchContext(null);
      setActivePin(pin);
      setUserRole('tablet');
      setTournamentDraft((prev) => ({ ...prev, hubTabletBoard: board }));
      persistSpectatorSession('tablet', pin, board, '', token);
      setAppState('tournament_tablet');
      window.history.replaceState(null, '', '/');
    };
    void run();
  }, []);
  useEffect(() => {
    if (!startupStorageError) return;
    showNotification(startupStorageError, 'error');
    setStartupStorageError(null);
  }, [startupStorageError]);

  const handleEnsureBoardAuthTokens = React.useCallback((nextTd) => {
    if (!nextTd?.boardAuthTokens) return;
    setTournamentData((prev) => {
      if (!prev || prev.boardAuthTokens) return prev;
      const merged = { ...prev, boardAuthTokens: nextTd.boardAuthTokens };
      try {
        safeStorage.setItem('dartsTournamentData', JSON.stringify(merged));
      } catch {}
      return merged;
    });
  }, []);

  // Globální confirm modal (nahrazuje window.confirm)
  const [confirmState, setConfirmState] = useState(null); // { message, onConfirm, confirmLabel?, cancelLabel?, title? }
  const requestConfirm = (message, onConfirm, opts = {}) => {
    setConfirmState({
      message: String(message ?? ''),
      onConfirm: typeof onConfirm === 'function' ? onConfirm : () => {},
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      title: opts.title,
    });
  };

  const handleOnlinePeerAbandonedMatch = React.useCallback(() => {
    showNotification(t('onlinePeerAbandonedMatch'), 'error');
    handleOnlineSessionEnded();
    setHomeSubmenu('online');
  }, [handleOnlineSessionEnded, t, showNotification]);

  const syncOnlineDocStartPlayer = React.useCallback((sp) => {
    const v = sp === 'p2' ? 'p2' : 'p1';
    setSettings((prev) => ({ ...prev, startPlayer: v }));
  }, []);

  const handleOnlineExitMatchRequest = React.useCallback(() => {
    if (!onlineGameId || !myOnlineRole) return;
    requestConfirm(
      t('onlineExitMatchBody'),
      async () => {
        try {
          await abandonOnlineGameSession(onlineGameId, myOnlineRole);
        } catch {
          console.warn('abandonOnlineGameSession');
          try {
            await cancelOnlineGame(onlineGameId);
          } catch {
            console.warn('cancelOnlineGame');
            showNotification(t('onlineExitMatchError'), 'error');
          }
        } finally {
          handleOnlineSessionEnded();
          setHomeSubmenu('online');
        }
      },
      {
        title: t('onlineExitMatchTitle'),
        confirmLabel: t('onlineExitMatchConfirmBtn'),
        cancelLabel: t('cancel'),
      }
    );
  }, [onlineGameId, myOnlineRole, t, showNotification, handleOnlineSessionEnded]);

  const handleHardResetApp = () => {
    requestConfirm(
      t('headerHardResetTitle') || 'Resetovat aplikaci? Smažou se všechna lokální data a stránka se znovu načte.',
      () => {
        skipUiResumePersist = true;
        safeStorage.clear();
        window.location.replace('/');
      },
      { confirmLabel: t('resetApp') || 'Resetovat', cancelLabel: t('cancel') || 'Zrušit' }
    );
  };

  const tournamentGroups = React.useMemo(() => {
    if (!tournamentData) return [];
    if (isTournamentBracketOnlyFormat(tournamentData.tournamentFormat)) return [];
    if (tournamentData?.groups?.length) return tournamentData.groups;
    if (!tournamentData?.players?.length) return [];
    const playersWithIds = tournamentData.players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }));
    const numGroups = tournamentData.numGroups ?? Math.max(1, Math.ceil(playersWithIds.length / 4));
    return distributePlayersToFixedGroups(playersWithIds, numGroups).map((g) => ({ ...g, boards: g.boards ?? [] }));
  }, [tournamentData?.players, tournamentData?.groups, tournamentData?.numGroups, tournamentData?.tournamentFormat]);

  const adminTabletTimeoutWarningEntries = React.useMemo(() => {
    const td = tournamentData;
    const entries = [];
    const pname = (pid) => resolveTournamentPlayerName(pid, td) || String(pid ?? '');
    const refereeNameForMatch = (m, phaseKey) => {
      if (m?.referee?.name && String(m.referee.name).trim()) return String(m.referee.name).trim();
      if (m?.refereeName && String(m.refereeName).trim()) return String(m.refereeName).trim();
      if (m?.chalkerId) {
        const fromTd = pname(m.chalkerId);
        if (fromTd) return fromTd;
        if (phaseKey === 'group') {
          const gid = m.groupId ?? m.group;
          const grp =
            (tournamentGroups || []).find((g) => String(g.groupId ?? g.id) === String(gid)) ||
            (td?.groups || []).find((g) => String(g.groupId ?? g.id) === String(gid));
          const fromGroup = (grp?.players || []).find((p) => String(p.id) === String(m.chalkerId))?.name;
          if (fromGroup) return String(fromGroup);
        }
      }
      return '';
    };
    const formatPersonWarn = (name, n) =>
      String(t('adminTabletPresentationTimeoutPersonWarn'))
        .replace('{name}', name)
        .replace('{n}', String(Math.max(1, Number(n) || 1)));
    const missingFromPresent = (m, phaseKey) => {
      const p1 = pname(m.player1Id) || m.player1Name || m.p1Name || '?';
      const p2 = pname(m.player2Id) || m.player2Name || m.p2Name || '?';
      const refName = refereeNameForMatch(m, phaseKey);
      const present = m.tabletCheckInPresent;
      const roles = m.tabletTimeoutRoleWarningCounts || {};
      const refLabel = refName
        ? `${t('adminTabletPresentationTimeoutRefereeRole')}: ${refName}`
        : t('adminTabletPresentationTimeoutRefereeRole');
      const pushMissing = (list, wasPresent, label, roleKey) => {
        if (present && typeof present === 'object' && wasPresent) return;
        list.push(formatPersonWarn(label, roles[roleKey] || 1));
      };
      const missing = [];
      if (present && typeof present === 'object') {
        pushMissing(missing, present.p1, p1, 'p1');
        pushMissing(missing, present.p2, p2, 'p2');
        pushMissing(missing, present.referee, refLabel, 'referee');
        if (missing.length > 0) return missing;
      }
      return [
        formatPersonWarn(p1, roles.p1 || 1),
        formatPersonWarn(p2, roles.p2 || 1),
        formatPersonWarn(refLabel, roles.referee || 1),
      ];
    };
    const groupLabelFor = (m) => {
      const gid = m.groupId ?? m.group;
      if (gid == null || gid === '') return t('adminTabletPresentationTimeoutGroup');
      return String(t('adminTabletPresentationTimeoutGroupNamed')).replace('{id}', String(gid));
    };
    const isPendingWarning = (m) => {
      if (m?.tabletStatus !== 'timeout_warning') return false;
      const warn = Math.min(
        TABLET_CHECKIN_MAX_WARNINGS,
        Math.max(1, Number(m.tabletTimeoutWarningCount) || 1)
      );
      const acked = Number(m.tabletTimeoutAdminAckedCount) || 0;
      return acked < warn;
    };

    for (const m of tournamentMatches || []) {
      if (!isPendingWarning(m)) continue;
      if (!m.player1Id || !m.player2Id) continue;
      if (m.matchId == null && m.id == null) continue;
      const mid = m.matchId ?? m.id;
      const p1 = pname(m.player1Id) || m.player1Name || m.p1Name || '?';
      const p2 = pname(m.player2Id) || m.player2Name || m.p2Name || '?';
      const warningCount = Math.min(
        TABLET_CHECKIN_MAX_WARNINGS,
        Math.max(1, Number(m.tabletTimeoutWarningCount) || 1)
      );
      entries.push({
        key: `g:${String(mid)}`,
        matchId: mid,
        matchType: 'group',
        phaseKey: 'group',
        roundIndex: null,
        board: m.board,
        groupLabel: groupLabelFor(m),
        label: `${p1} vs ${p2}`,
        missingNames: missingFromPresent(m, 'group'),
        warningCount,
      });
    }
    if (Array.isArray(tournamentBracket)) {
      tournamentBracket.forEach((round, ri) => {
        for (const m of round?.matches || []) {
          if (!isPendingWarning(m) || m.isBye) continue;
          if (!m.player1Id || !m.player2Id) continue;
          if (m.id == null && m.matchId == null) continue;
          const mid = m.id ?? m.matchId;
          const p1 = pname(m.player1Id) || m.player1Name || m.p1Name || '?';
          const p2 = pname(m.player2Id) || m.player2Name || m.p2Name || '?';
          const warningCount = Math.min(
            TABLET_CHECKIN_MAX_WARNINGS,
            Math.max(1, Number(m.tabletTimeoutWarningCount) || 1)
          );
          entries.push({
            key: `b:${String(mid)}`,
            matchId: mid,
            matchType: 'bracket',
            phaseKey: 'bracket',
            roundIndex: ri,
            board: m.board,
            groupLabel: null,
            label: `${p1} vs ${p2}`,
            missingNames: missingFromPresent(m, 'bracket'),
            warningCount,
          });
        }
      });
    }
    return entries;
  }, [tournamentData, tournamentMatches, tournamentBracket, tournamentGroups, lang]);

  const adminTabletTimeoutPending = adminTabletTimeoutWarningEntries;

  const adminTabletTimeoutBannerStates = [
    'tournament_board_assignment',
    'tournament_groups',
    'tournament_bracket',
    'tournament_stats',
  ];
  const showAdminTabletPresentationTimeoutBanner =
    userRole === 'admin' &&
    adminTabletTimeoutBannerStates.includes(appState) &&
    adminTabletTimeoutPending.length > 0;

  /** Postup pro engine počtářů: vždy z uloženého turnaje, ne ze zastaralého draftu. */
  const promotersForRefereeEngine = React.useMemo(
    () =>
      tournamentData?.promotersCount ??
      tournamentData?.advancePerGroup ??
      tournamentDraft.promotersCount ??
      2,
    [tournamentData?.promotersCount, tournamentData?.advancePerGroup, tournamentDraft.promotersCount]
  );

  /** Po změně výsledků / terče: uvolnit frontu, doplnit terče pending zápasům a dopočítat počítáře. */
  const applyBracketMaintenance = React.useCallback(
    (bracket) => {
      if (!Array.isArray(bracket) || bracket.length === 0 || !tournamentData) return bracket;
      const availableBoards =
        Number(tournamentData.boardsCount ?? tournamentData.totalBoards ?? tournamentData.numBoards) || 1;
      const regForDirectKo =
        isTournamentBracketOnlyFormat(tournamentData.tournamentFormat) && tournamentData.players?.length
          ? tournamentData.players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }))
          : null;
      return assignBracketJitBoardsAndReferees(bracket, {
        availableBoards,
        groups: tournamentGroups,
        promotersCount: promotersForRefereeEngine,
        groupMatches: tournamentMatches,
        registeredPlayersForDirectKo: regForDirectKo,
        prelimLegs: tournamentData?.prelimLegs ?? null,
      }).bracket;
    },
    [tournamentData, tournamentGroups, tournamentMatches, promotersForRefereeEngine]
  );

  const chalkerShortageNotifiedRef = useRef('');

  tournamentSyncPayloadRef.current = {
    tournamentData: tournamentData ?? null,
    groups: tournamentGroups ?? [],
    groupMatches: tournamentMatches ?? [],
    tournamentBracket: tournamentBracket ?? [],
  };

  /** Admin: poslech cloudu jen pro sloučení změn z tabletu (check-in, výsledek), bez přepsání celého turnaje. */
  useEffect(() => {
    if (userRole !== 'admin') return;
    if (!tournamentData?.cloudEnabled || !user || user.isAnonymous) return;
    if (!db) return;
    const pin = String(activePin ?? '').trim();
    if (!/^\d{4}$/.test(pin)) return;
    const ref = doc(db, ACTIVE_TOURNAMENTS_COLL, pin);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
        if (!exists) return;
        const d = snap.data();
        if (!d || typeof d !== 'object') return;

        // Označ inbound hned — sync timer nesmí mezi callbackem a renderem přepsat cloud starým stavem
        const gen = ++inboundCloudSyncGen.current;
        isIncomingCloudUpdate.current = true;

        setTournamentMatches((prev) => {
          const next = mergeAdminGroupMatchesFromTabletCloud(
            prev,
            Array.isArray(d.groupMatches) ? d.groupMatches : []
          );
          return next;
        });
        setTournamentBracket((prev) => {
          const cloudBr = Array.isArray(d.tournamentBracket) ? d.tournamentBracket : [];
          const merged = mergeAdminBracketFromTabletCloud(prev, cloudBr);
          if (merged === prev) return prev;
          return propagateBracketWinners(merged);
        });

        // Po sloučení ještě chvíli blokuj outbound sync (React setState je async)
        window.setTimeout(() => {
          if (inboundCloudSyncGen.current === gen) {
            isIncomingCloudUpdate.current = false;
          }
        }, 2200);
      },
      (err) => console.warn('Admin tournament listener:', err)
    );
    return () => unsub();
  }, [userRole, activePin, tournamentData?.cloudEnabled, user]);

  /** Pravidelná synchronizace turnaje do Firestore (admin + platný PIN), debounce kvůli šetření zápisů. */
  useEffect(() => {
    if (userRole !== 'admin') return;
    if (!tournamentData?.cloudEnabled || !user || user.isAnonymous || !db) return;
    const pin = String(activePin ?? '').trim();
    if (!/^\d{4}$/.test(pin)) return;

    let cancelled = false;
    let timer = null;

    const attemptSync = () => {
      if (cancelled) return;
      // Po sloučení z tabletu je outbound krátce zamčený — nesmíme sync přeskočit natrvalo
      // (jinak např. auto-přiřazení terče po dohrání skupiny zůstane jen lokálně).
      if (isIncomingCloudUpdate.current) {
        timer = window.setTimeout(attemptSync, 400);
        return;
      }
      const snap = tournamentSyncPayloadRef.current;
      syncTournamentToCloud(pin, {
        tournamentData: snap.tournamentData,
        groups: snap.groups,
        groupMatches: snap.groupMatches,
        tournamentBracket: snap.tournamentBracket,
      }).catch((err) => {
        console.warn('Tournament cloud sync failed:', err);
      });
    };

    timer = window.setTimeout(attemptSync, 1500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    userRole,
    user,
    activePin,
    tournamentData,
    tournamentGroups,
    tournamentMatches,
    tournamentBracket,
  ]);

  /** Přímý pavouk: uložit pavouk do stejného JSON jako turnaj (F5). */
  useEffect(() => {
    if (!tournamentData || !isTournamentBracketOnlyFormat(tournamentData.tournamentFormat)) return;
    try {
      safeStorage.setItem(
        'dartsTournamentData',
        JSON.stringify({ ...tournamentData, tournamentBracket: tournamentBracket ?? [] })
      );
    } catch {}
  }, [tournamentData, tournamentBracket]);

  /** Živá synchronizace z Firestore pro diváka a tablet. */
  useEffect(() => {
    if (userRole !== 'viewer' && userRole !== 'tablet') return;
    const pin = String(activePin ?? '').trim();
    if (!/^\d{4}$/.test(pin)) return;

    const unsub = listenToCloudTournament(pin, (cloudData) => {
      if (cloudData == null) {
        clearSpectatorSession();
        showNotificationRef.current(
          tRef.current('tournament.ended') || 'Turnaj byl ukončen.',
          'error'
        );
        setActivePin('');
        setUserRole(null);
        setTournamentData(null);
        setTournamentMatches([]);
        setTournamentBracket([]);
        setTournamentMatchContext(null);
        try {
          safeStorage.removeItem('dartsTournamentData');
        } catch {}
        setAppState('home');
        return;
      }

      const td = cloudData.tournamentData ?? null;
      const groupsRaw = cloudData.groups;
      const hasCloudGroups = Array.isArray(groupsRaw) && groupsRaw.length > 0;
      const nextTd = td && hasCloudGroups ? { ...td, groups: groupsRaw } : td;

      setTournamentData(nextTd);
      setTournamentMatches(
        Array.isArray(cloudData.groupMatches) ? cloudData.groupMatches : []
      );
      setTournamentBracket(
        Array.isArray(cloudData.tournamentBracket) ? cloudData.tournamentBracket : []
      );

      setAppState((prev) => {
        if (
          userRoleRef.current === 'viewer' &&
          prev === 'tournament_viewer_preparing' &&
          nextTd
        ) {
          return 'tournament_groups';
        }
        return prev;
      });
    });

    return () => unsub();
  }, [userRole, activePin, tournamentData?.cloudEnabled, user]);

  /**
   * Na kroku Pavouk průběžně:
   * - normalizuje neplatné přiřazení terče (např. po snížení počtu terčů)
   * - dopočítá počtáře (referee engine)
   *
   * Pozn.: samotné automatické rozdělování volných terčů napříč pavoukem řeší JIT efekt níže,
   * aby se logiky "kolo po kole" vs "globální fronta" nepřetahovaly a neblikaly.
   */
  useEffect(() => {
    if (userRole !== 'admin') return;
    if (appState !== 'tournament_bracket' || !tournamentData) return;
    if (!Array.isArray(tournamentBracket) || tournamentBracket?.length === 0) return;
    if (tournamentData?.cloudEnabled && isIncomingCloudUpdate.current) return;

    if (bracketAutoFixTimerRef.current) clearTimeout(bracketAutoFixTimerRef.current);
    bracketAutoFixTimerRef.current = window.setTimeout(() => {
      bracketAutoFixTimerRef.current = null;
      if (userRoleRef.current !== 'admin') return;
      if (appState !== 'tournament_bracket' || !tournamentData) return;
      if (!Array.isArray(tournamentBracket) || tournamentBracket?.length === 0) return;
      if (tournamentData?.cloudEnabled && isIncomingCloudUpdate.current) return;

    const defBoards =
      Number(tournamentData.boardsCount ?? tournamentData.totalBoards ?? tournamentData.numBoards) || 1;
    const bracketWithBoards = tournamentBracket.map((round) => {
      const nb =
        round.boardsCount != null && Number(round.boardsCount) >= 1
          ? Math.max(1, Math.floor(Number(round.boardsCount)))
          : defBoards;
      const normalizedMatches = (round.matches || []).map((m) => {
        if (!m) return m;
        const b = Number(m.board);
        const hasBoard = m.board != null && m.board !== '' && Number.isFinite(b);
        const outOfRange = hasBoard && (b < 1 || b > nb);
        // Po snížení počtu terčů zneplatníme staré přiřazení u pending zápasů,
        // aby je JIT fronta mohla deterministicky znovu rozdělit (a UI neblikalo).
        if (outOfRange && m.status === 'pending') {
          return { ...m, board: null, boardLocked: false };
        }
        return m;
      });
      return {
        ...round,
        matches: normalizedMatches,
      };
    });
    const activeBoards =
      Number(tournamentData.boardsCount ?? tournamentData.totalBoards ?? tournamentData.numBoards) || 1;
    const regForDirectKo =
      isTournamentBracketOnlyFormat(tournamentData.tournamentFormat) && tournamentData.players?.length
        ? tournamentData.players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }))
        : null;
    const bracketWithRefs = updateBracketReferees(
      bracketWithBoards,
      tournamentGroups,
      promotersForRefereeEngine,
      activeBoards,
      tournamentMatches,
      regForDirectKo,
      tournamentData?.prelimLegs ?? null
    );
    if (JSON.stringify(bracketWithRefs) !== JSON.stringify(tournamentBracket)) {
      setTournamentBracket(bracketWithRefs);
    }
    }, 200);

    return () => {
      if (bracketAutoFixTimerRef.current) clearTimeout(bracketAutoFixTimerRef.current);
    };
  }, [
    userRole,
    appState,
    tournamentData,
    tournamentBracket,
    tournamentGroups,
    promotersForRefereeEngine,
    tournamentMatches,
  ]);

    /** JIT: průběžně zaplňuje volné terče kompletními pending zápasy napříč pavoukem (always-on). */
  useEffect(() => {
    if (userRole !== 'admin') return;
    if (appState !== 'tournament_bracket' || !tournamentData) return;
    if (!Array.isArray(tournamentBracket) || tournamentBracket.length === 0) return;
    if (tournamentData?.cloudEnabled && isIncomingCloudUpdate.current) return;

    if (bracketJitTimerRef.current) clearTimeout(bracketJitTimerRef.current);
    bracketJitTimerRef.current = window.setTimeout(() => {
      bracketJitTimerRef.current = null;
      if (userRoleRef.current !== 'admin') return;
      if (appState !== 'tournament_bracket' || !tournamentData) return;
      if (!Array.isArray(tournamentBracket) || tournamentBracket.length === 0) return;
      if (tournamentData?.cloudEnabled && isIncomingCloudUpdate.current) return;

    const availableBoards =
      Number(tournamentData.boardsCount ?? tournamentData.totalBoards ?? tournamentData.numBoards) || 1;
    prevBracketBoardsRef.current = availableBoards;

    const regForDirectKo =
      isTournamentBracketOnlyFormat(tournamentData.tournamentFormat) && tournamentData.players?.length
        ? tournamentData.players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }))
        : null;

    const { bracket: withRefs } = assignBracketJitBoardsAndReferees(tournamentBracket, {
      availableBoards,
      groups: tournamentGroups,
      promotersCount: promotersForRefereeEngine,
      groupMatches: tournamentMatches,
      registeredPlayersForDirectKo: regForDirectKo,
      prelimLegs: tournamentData?.prelimLegs ?? null,
    });

    if (JSON.stringify(withRefs) !== JSON.stringify(tournamentBracket)) {
      setTournamentBracket(withRefs);
    }
    }, 200);

    return () => {
      if (bracketJitTimerRef.current) clearTimeout(bracketJitTimerRef.current);
    };
  }, [
    userRole,
    appState,
    tournamentData,
    tournamentBracket,
    tournamentGroups,
    promotersForRefereeEngine,
    tournamentMatches,
  ]);

  /** Upozornění adminovi: nedostatek nepostupujících oproti zápasům bez počtáře v 1. kole pavouku. */
  useEffect(() => {
    if (userRole !== 'admin' || appState !== 'tournament_bracket' || !tournamentData) return;
    if (isTournamentBracketOnlyFormat(tournamentData.tournamentFormat)) return;
    if (!Array.isArray(tournamentBracket) || tournamentBracket.length === 0) return;

    // Stejný výstup jako první efekt „terče + updateBracketReferees“ — ne syrový state, aby shortage
    // neběžel o frame dřív než spočítané přiřazení počtářů. JIT doplnění terčů se projeví při dalším renderu.
    const defBoards =
      Number(tournamentData.boardsCount ?? tournamentData.totalBoards ?? tournamentData.numBoards) || 1;
    const bracketWithBoards = tournamentBracket.map((round) => {
      const nb =
        round.boardsCount != null && Number(round.boardsCount) >= 1
          ? Math.max(1, Math.floor(Number(round.boardsCount)))
          : defBoards;
      return {
        ...round,
        matches: autoAssignSequentialBoardsToRound(round.matches, nb),
      };
    });
    const activeBoards =
      Number(tournamentData.boardsCount ?? tournamentData.totalBoards ?? tournamentData.numBoards) || 1;
    const regForDirectKoShortage =
      isTournamentBracketOnlyFormat(tournamentData.tournamentFormat) && tournamentData.players?.length
        ? tournamentData.players.map((p, i) => ({ ...p, id: p.id ?? `p${i + 1}` }))
        : null;
    const bracketForShortageCheck = updateBracketReferees(
      bracketWithBoards,
      tournamentGroups,
      promotersForRefereeEngine,
      activeBoards,
      tournamentMatches,
      regForDirectKoShortage,
      tournamentData?.prelimLegs ?? null
    );

    const shortage = getBracketFirstRoundChalkerShortage(
      bracketForShortageCheck,
      tournamentGroups,
      promotersForRefereeEngine,
      tournamentMatches
    );
    if (!shortage) {
      chalkerShortageNotifiedRef.current = '';
      return;
    }
    const sig = `${shortage.kind}-${shortage.need}-${shortage.pool}`;
    if (chalkerShortageNotifiedRef.current === sig) return;
    chalkerShortageNotifiedRef.current = sig;
    const tmap = translations[lang] || {};
    const msg =
      shortage.kind === 'empty_pool'
        ? (tmap.tournChalkerShortageEmpty ??
          `Nelze automaticky obsadit počtáře (${shortage.need} zápasů v 1. kole čeká na počtáře): žádní kandidáti z posledních míst skupin. Zvolte počtáře ručně (i mezi hráči, kteří ještě budou hrát).`)
        : (tmap.tournChalkerShortagePartial ??
          `Kandidátů z posledních míst skupin je ${shortage.pool}, ale ${shortage.need} zápasů v 1. kole stále nemá počtáře. Zbytek doplňte ručně.`);
    showNotification(msg, 'error');
  }, [
    userRole,
    appState,
    tournamentData,
    tournamentBracket,
    tournamentGroups,
    promotersForRefereeEngine,
    tournamentMatches,
    lang,
  ]);

  const tabletBoardStr = String(tournamentDraft?.hubTabletBoard ?? '').trim();
  const tabletPresence = React.useMemo(() => {
    const pin = String(activePin ?? '').trim();
    const board = String(tabletBoardStr ?? '').trim();
    if (!/^\d{4}$/.test(pin) || !board) return null;
    const auth = tabletCloudAuthOpts();
    return {
      pin,
      board,
      boardToken: String(auth.boardToken ?? '').trim(),
      tabletPassword: String(auth.tabletPassword ?? '').trim().slice(0, 5),
    };
  }, [activePin, tabletBoardStr]);
  const pinBarTitle =
    tournamentData?.name ??
    tournamentMatchContext?.tabletTitle ??
    (String(tournamentDraft?.name ?? '').trim() || null) ??
    'Turnaj';
  const pinBarDisplayCode =
    tournamentData?.pin ??
    tournamentData?.tournamentId ??
    activePin ??
    (String(tournamentDraft?.pin ?? '').trim() || undefined) ??
    tournamentMatchContext?.tabletPin ??
    '';

  const pinBarTabletPw =
    userRole === 'admin'
      ? String(tournamentData?.tabletPassword ?? tournamentDraft?.tabletPassword ?? '').trim()
      : '';
  const adminPinBarRevealable =
    userRole === 'admin' &&
    pinBarTabletPw.length > 0 &&
    !!(tournamentData?.cloudEnabled || tournamentDraft?.cloudEnabled);

  const showTabletQrNav =
    userRole === 'admin' &&
    !!tournamentData?.cloudEnabled &&
    /^\d{4}$/.test(String(activePin ?? '').trim()) &&
    ['tournament_groups', 'tournament_bracket', 'tournament_stats'].includes(appState);

  const showTournamentPinBar =
    !!pinBarDisplayCode &&
    ((userRole === 'admin' && appState === 'tournament_setup') ||
      (tournamentData &&
        (tournamentData?.pin || tournamentData?.tournamentId) &&
        (['tournament_board_assignment', 'tournament_groups', 'tournament_bracket', 'tournament_stats'].includes(
          appState
        ) ||
          (appState === 'playing' && tournamentMatchContext && tournamentMatchContext.type !== 'tablet'))) ||
      (userRole === 'viewer' &&
        !!activePin &&
        [
          'tournament_viewer_preparing',
          'tournament_groups',
          'tournament_bracket',
          'tournament_stats',
        ].includes(appState)) ||
      (userRole === 'tablet' && appState === 'tournament_tablet') ||
      (appState === 'playing' && tournamentMatchContext?.type === 'tablet'));

  const tabletWaitingStandings = React.useMemo(() => {
    if (!tournamentData?.groups?.length || !tabletBoardStr) return null;
    const g = tournamentData.groups.find(
      (gr) => Array.isArray(gr.boards) && gr.boards.some((b) => String(b) === tabletBoardStr)
    );
    if (!g) return null;
    const gm = tournamentMatches.filter((m) => (m.groupId ?? m.group) === g.groupId);
    return calculateGroupStandings(g.players || [], gm);
  }, [tournamentData, tournamentMatches, tabletBoardStr]);

  const tabletAssignedMatch = React.useMemo(() => {
    const raw = pickTabletMatchForBoard({
      tournamentData,
      tournamentMatches,
      tournamentBracket,
      tournamentGroups,
      tabletBoardStr,
    });
    if (!raw) return null;
    let refereeName = raw.referee?.name;
    const gid = raw.groupId;
    const grp =
      tournamentGroups.find((g) => g.groupId === gid) ||
      tournamentData?.groups?.find((g) => g.groupId === gid);
    const chalkerId = raw.chalkerId ?? raw.referee?.id;
    const chalkerSlot = grp?.players?.find((p) => p.id === chalkerId);
    if (formatRefereeNames(raw)) {
      refereeName = formatRefereeNames(raw);
    } else if (isTeamPlayer(chalkerSlot)) {
      const person = resolveRefereePerson(chalkerSlot, { matches: tournamentMatches });
      if (person?.name) refereeName = person.name;
    } else if (!refereeName && chalkerSlot?.name) {
      refereeName = chalkerSlot.name;
    }
    if (!refereeName) refereeName = '—';
    return enrichTabletMatchPlayerNames({ ...raw, refereeName }, tournamentData, tournamentGroups);
  }, [tournamentData, tournamentMatches, tournamentBracket, tournamentGroups, tabletBoardStr]);

  const tabletAssignedMatchRef = useRef(null);
  tabletAssignedMatchRef.current = tabletAssignedMatch;

  const tabletBoardSchedule = React.useMemo(
    () =>
      buildTabletBoardSchedule({
        tournamentData,
        tournamentMatches,
        tournamentBracket,
        tournamentGroups,
        tabletBoardStr,
      }),
    [tournamentData, tournamentMatches, tournamentBracket, tournamentGroups, tabletBoardStr]
  );

  const tabletTournamentFinished = React.useMemo(
    () => isEntireTournamentFinished(tournamentData, tournamentMatches, tournamentBracket),
    [tournamentData, tournamentMatches, tournamentBracket]
  );

  const isTournamentLive =
    (tournamentMatches?.some((m) => m.status !== 'pending') ?? false) ||
    (Array.isArray(tournamentBracket) &&
      tournamentBracket.some((round) =>
        (round?.matches || []).some((m) => {
          if (!m || m.isBye) return false;
          const s = m.status;
          return s && s !== 'pending';
        })
      ));

  /** Po prvním zápase trvale uzamknout ranking snapshot. */
  useEffect(() => {
    if (!isTournamentLive) return;
    setTournamentData((prev) => withRankingsLocked(prev));
  }, [isTournamentLive]);

  /**
   * Zruší aktivní los + snapshot a vrátí hráče do draftu v režimu živého žebříčku.
   * Blokováno po prvním odehraném zápase.
   */
  const resetDrawToLiveRanking = React.useCallback(() => {
    if (isTournamentRankingLocked(tournamentData, isTournamentLive)) return false;

    const prev = tournamentData;
    const snapshotGender = prev?.rankingSnapshot?.gender;
    const snapshotUseCso = prev?.rankingSnapshot?.useCsoRanking;
    const sourcePlayers =
      prev?.players?.length > 0
        ? prev.players
        : tournamentDraft?.players?.length > 0
          ? tournamentDraft.players
          : [];

    if (sourcePlayers.length > 0) {
      setTournamentDraft((d) => ({
        ...d,
        name: prev?.name || d.name || '',
        pin: prev?.pin || d.pin || '',
        cloudEnabled: prev?.cloudEnabled ?? d.cloudEnabled,
        tabletPassword: prev?.tabletPassword ?? d.tabletPassword,
        format:
          prev?.tournamentFormat === 'bracket_only' ? 'bracket_only' : d.format || 'groups_bracket',
        players: stripPlayerRankingsForLive(sourcePlayers),
        useCsoRanking:
          snapshotUseCso != null ? !!snapshotUseCso : d.useCsoRanking,
        csoRankingGender:
          snapshotGender === 'women' || snapshotGender === 'men'
            ? snapshotGender
            : d.csoRankingGender || 'men',
        boardAssignments: {},
      }));
    }

    setTournamentData(null);
    setTournamentMatches([]);
    setTournamentBracket([]);
    try {
      safeStorage.removeItem('dartsTournamentData');
    } catch {}
    return true;
  }, [tournamentData, tournamentDraft?.players, isTournamentLive]);

  const [tournamentEndEstimateTick, setTournamentEndEstimateTick] = useState(0);
  useEffect(() => {
    const hasTourney = !!(tournamentData?.pin || tournamentData?.tournamentId);
    if (!hasTourney) return undefined;
    const ms = isTournamentLive ? 15000 : 60000;
    const id = window.setInterval(() => setTournamentEndEstimateTick((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [tournamentData?.pin, tournamentData?.tournamentId, isTournamentLive]);

  const liveTournamentEndPrediction = React.useMemo(() => {
    if (!tournamentData) return null;
    const fmt = tournamentData.tournamentFormat || 'groups_bracket';
    const bracketEmpty = !Array.isArray(tournamentBracket) || tournamentBracket.length === 0;
    const rawAdvance =
      tournamentData.promotersCount ??
      tournamentData.promotersPerGroup ??
      tournamentData.advancePerGroup ??
      2;
    return calculateLiveTournamentEndPrediction({
      format: fmt,
      groups: tournamentData.groups?.length ? tournamentData.groups : tournamentGroups,
      groupMatches: tournamentMatches ?? [],
      bracketRounds: tournamentBracket ?? [],
      groupsLegs: Number(tournamentData.groupsLegs ?? tournamentData.legsGroup ?? 3) || 3,
      bracketLegs: Number(tournamentData.bracketKoLegs ?? tournamentData.bracketLegs ?? 3) || 3,
      totalBoards: Number(tournamentData.numBoards ?? tournamentData.totalBoards ?? 0) || 0,
      now: Date.now(),
      structuralBracketFallback:
        bracketEmpty && (tournamentData.players?.length ?? 0) >= 2
          ? {
              players: tournamentData.players,
              format: fmt,
              advancePerGroup: rawAdvance,
              numGroups: tournamentData.numGroups,
              numBoards: tournamentData.numBoards ?? tournamentData.totalBoards,
              bracketKoLegs: Number(tournamentData.bracketKoLegs ?? tournamentData.bracketLegs ?? 3) || 3,
              groupLegs: Number(tournamentData.groupsLegs ?? tournamentData.legsGroup ?? 3) || 3,
            }
          : null,
    });
  }, [
    tournamentData,
    tournamentMatches,
    tournamentBracket,
    tournamentGroups,
    tournamentEndEstimateTick,
  ]);

  const formatTournamentEndClock = React.useCallback(
    (d) =>
      d.toLocaleTimeString(lang === 'cs' ? 'cs-CZ' : lang === 'pl' ? 'pl-PL' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [lang]
  );

  const tournamentPinEndEstimate =
    liveTournamentEndPrediction &&
    ((tournamentMatches?.length ?? 0) > 0 || (tournamentBracket?.length ?? 0) > 0) ? (
      <span className="text-emerald-400/95 font-bold text-[10px] sm:text-xs tabular-nums whitespace-nowrap shrink-0">
        {t('tournEstTournamentEnd') || 'Konec turnaje (odhad)'}:{' '}
        {formatTournamentEndClock(liveTournamentEndPrediction.estimatedTournamentEnd)}
      </span>
    ) : null;

  const clearPlayingTournamentMatchWithoutResult = React.useCallback(() => {
    const ctx = tournamentMatchContextRef.current;
    if (!ctx || ctx.type === 'tablet') return;
    if (ctx.type === 'bracket' && ctx.roundIndex != null && ctx.match?.id != null) {
      const ri = ctx.roundIndex;
      const mid = ctx.match.id;
      setTournamentBracket((prev) =>
        Array.isArray(prev)
          ? prev.map((round, rIdx) => ({
              ...round,
              matches: (round.matches || []).map((m) =>
                rIdx === ri &&
                m.id === mid &&
                (m.status === 'playing' || m.status === 'in_progress')
                  ? { ...m, status: 'pending', startedAt: null }
                  : m
              ),
            }))
          : prev
      );
      return;
    }
    const m = ctx.match;
    if (!m) return;
    const mid = m.matchId ?? m.id;
    const gid = m.groupId ?? m.group;
    setTournamentMatches((prev) =>
      (prev || []).map((x) => {
        const xid = x.matchId ?? x.id;
        const xg = x.groupId ?? x.group;
        return xid === mid && xg === gid && (x.status === 'playing' || x.status === 'in_progress')
          ? { ...x, status: 'pending', startedAt: null }
          : x;
      })
    );
  }, []);

  const viewerTournamentNavStates = ['tournament_groups', 'tournament_bracket', 'tournament_stats'];
  const adminTournamentStepperStates = [
    'tournament_setup',
    'tournament_board_assignment',
    'tournament_groups',
    'tournament_bracket',
    'tournament_stats',
  ];
  const showTournamentStepper =
    (userRole === 'admin' && adminTournamentStepperStates.includes(appState)) ||
    (userRole === 'viewer' && viewerTournamentNavStates.includes(appState));
  const currentStepperStep =
    appState === 'tournament_setup' ? tournamentSetupStep
    : appState === 'tournament_board_assignment' ? 4
    : appState === 'tournament_groups' ? 5
    : appState === 'tournament_bracket' ? 6
    : appState === 'tournament_stats' ? 7
    : 1;
  const canNavigateToStep = (s) => {
    if (userRole === 'viewer') {
      if (![5, 6, 7].includes(s)) return false;
      return !!tournamentData;
    }
    if (userRole !== 'admin') return false;
    if (s === 7) return !!tournamentData;
    if (s <= 3) return !isTournamentLive; // Kroky 1–3 zamčené při live turnaji
    if (hasBracketGenerated && s === 4) return false; // Po pavouku zpět jen ne na přiřazení terčů; skupiny (5) zůstávají
    if (s === 4) return !!tournamentData;
    if (s === 5 && hasBracketGenerated && tournamentData) return true; // Review skupin i s existujícím pavoukem
    if (s === 6 && hasBracketGenerated && tournamentData) return true; // Pavouk vždy dostupný po vygenerování
    return s <= currentStepperStep && !!tournamentData;
  };
  const handleStepperClick = (s) => {
    if (userRole === 'viewer') {
      if (!canNavigateToStep(s)) return;
      if (s === 5) setAppState('tournament_groups');
      else if (s === 6) setAppState('tournament_bracket');
      else if (s === 7) setAppState('tournament_stats');
      return;
    }
    if (userRole !== 'admin') return;
    if (!canNavigateToStep(s)) return;
    if (s === 7) { setAppState('tournament_stats'); return; }
    if (s <= 3) {
      if (
        !isTournamentLive &&
        (hasDrawRankingSnapshot(tournamentData) ||
          (tournamentMatches?.length ?? 0) > 0 ||
          (Array.isArray(tournamentBracket) && tournamentBracket.length > 0) ||
          (tournamentData?.groups?.length ?? 0) > 0)
      ) {
        resetDrawToLiveRanking();
      }
      setAppState('tournament_setup');
      setTournamentSetupStep(s);
      return;
    }
    if (s === 4) setAppState('tournament_board_assignment');
    else if (s === 5) setAppState('tournament_groups');
    else if (s === 6) setAppState('tournament_bracket');
  };

  const handleEndTournament = () => {
    requestConfirm(
      t('tournEndConfirm') ||
        'Opravdu chcete ukončit tento turnaj? Neuložená data budou ztracena.',
      async () => {
        const pinToDelete = String(
          activePin || tournamentData?.pin || tournamentDraft?.pin || ''
        ).trim();
        const snap = tournamentSyncPayloadRef.current;
        const fullSnapshot = {
          tournamentData: snap.tournamentData ?? null,
          groups: snap.groups ?? [],
          groupMatches: snap.groupMatches ?? [],
          tournamentBracket: snap.tournamentBracket ?? [],
        };
        const td = fullSnapshot.tournamentData;
        const name = String(td?.name ?? '').trim();
        const pinOk = /^\d{4}$/.test(pinToDelete);
        const wasCloudTournament = !!td?.cloudEnabled && pinOk && !!db;
        const isCloudArchive = wasCloudTournament && user && !user.isAnonymous;

        if (wasCloudTournament && (!user || user.isAnonymous)) {
          showNotification(
            t('tournamentHub.loginRequiredForCloud') ||
              'Pro připojení tabletů a síťovou hru se musíte přihlásit.',
            'error'
          );
          return;
        }

        if (isCloudArchive) {
          try {
            await archivePastTournamentAndDeleteActive(user.uid, pinToDelete, name, fullSnapshot);
            showNotification(
              t('archiveSuccess') || 'Turnaj byl úspěšně uložen do historie.',
              'success'
            );
          } catch {
            console.warn('archivePastTournamentAndDeleteActive failed');
            showNotification(
              t('tournamentHub.syncError') || 'Chyba při ukládání dokončeného turnaje do cloudu.',
              'error'
            );
            return;
          }
        } else {
          try {
            const id =
              typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `loc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            appendLocalTournamentHistory({
              id,
              date: new Date().toISOString(),
              name: name || '(bez názvu)',
              data: fullSnapshot,
            });
            showNotification(
              t('archiveSuccess') || 'Turnaj byl úspěšně uložen do historie.',
              'success'
            );
          } catch {
            console.warn('appendLocalTournamentHistory failed');
          }
          try {
            await deleteCloudTournament(pinToDelete);
          } catch {
            console.warn('deleteCloudTournament failed');
          }
        }

        setTournamentDraft(createDefaultTournamentDraft());
        setTournamentData(null);
        setTournamentMatches([]);
        setTournamentBracket([]);
        setTournamentMatchContext(null);
        setUserRole(null);
        setActivePin('');
        setPreRegImportSourceId(null);
        clearTournamentWip();
        try {
          safeStorage.removeItem('dartsTournamentData');
        } catch {}
        setAppState('home');
      }
    );
  };

  const handleOpenTournamentEntry = () => {
    if (userRole === null) {
      setAppState('tournament_hub');
      return;
    }
    if (userRole === 'admin') {
      if (tournamentData) {
        setActivePin(String(tournamentData.pin ?? ''));
        const goBracket =
          isTournamentBracketOnlyFormat(tournamentData.tournamentFormat) &&
          Array.isArray(tournamentBracket) &&
          tournamentBracket.length > 0;
        setAppState(goBracket ? 'tournament_bracket' : 'tournament_groups');
      } else {
        let pinToUse = '';
        setTournamentDraft((prev) => {
          pinToUse =
            prev.pin && /^\d{4}$/.test(String(prev.pin)) ? String(prev.pin) : generatePin();
          writeTournamentWip(pinToUse);
          if (prev.pin === pinToUse) return prev;
          return { ...prev, pin: pinToUse };
        });
        setActivePin(pinToUse);
        setTournamentSetupStep(1);
        setAppState('tournament_setup');
      }
      return;
    }
    if (userRole === 'tablet') {
      setAppState('tournament_tablet');
      return;
    }
    setAppState('tournament_groups');
  };

  const handleTournamentHubAdmin = () => {
    setUserRole('admin');
    if (tournamentData) {
      setActivePin(String(tournamentData.pin ?? ''));
      const goBracket =
        isTournamentBracketOnlyFormat(tournamentData.tournamentFormat) &&
        Array.isArray(tournamentBracket) &&
        tournamentBracket.length > 0;
      setAppState(goBracket ? 'tournament_bracket' : 'tournament_groups');
      return;
    }
    let pinToUse = '';
    setTournamentDraft((prev) => {
      pinToUse =
        prev.pin && /^\d{4}$/.test(String(prev.pin)) ? String(prev.pin) : generatePin();
      writeTournamentWip(pinToUse);
      if (prev.pin === pinToUse) return prev;
      return { ...prev, pin: pinToUse };
    });
    setActivePin(pinToUse);
    setTournamentSetupStep(1);
    setAppState('tournament_setup');
  };

  /** Rychlý start = vždy nový průvodce (ne pokračování v live). */
  const handleTournamentQuickStart = () => {
    const startFresh = () => {
      setParkedSession(null);
      setTournamentData(null);
      setTournamentMatches([]);
      setTournamentBracket([]);
      setPreRegImportSourceId(null);
      try {
        safeStorage.removeItem('dartsTournamentData');
      } catch {}
      setUserRole('admin');
      const pinToUse = generatePin();
      setTournamentDraft({
        ...createDefaultTournamentDraft(),
        pin: pinToUse,
      });
      writeTournamentWip(pinToUse);
      setActivePin(pinToUse);
      setTournamentSetupStep(1);
      setAppState('tournament_setup');
    };

    if (tournamentData || isTournamentLive) {
      requestConfirm(
        translations[lang]?.tournamentHub?.quickStartReplaceConfirm ||
          'Na tomto zařízení už je rozpracovaný / živý turnaj. Opravdu ho chcete opustit a spustit rychlý start?',
        startFresh,
        {
          confirmLabel: translations[lang]?.tournamentHub?.quickStart || 'Rychlý start',
          cancelLabel: t('cancel') || 'Zrušit',
        }
      );
      return;
    }
    startFresh();
  };

  const handleTournamentHubTabletJoin = async (pin, board, tabletPassword = '') => {
    if (!pin) {
      showNotification(
        translations[lang]?.tournamentHub?.enterPin || 'Zadejte PIN turnaje',
        'error'
      );
      return;
    }
    const p = String(pin).replace(/\D/g, '').slice(0, 4);
    const b = String(board || '').replace(/\D/g, '').slice(0, 2);
    const tp = String(tabletPassword ?? '').trim();
    const access = await verifyTabletBoardAccess(p, tp);
    if (!access.ok) {
      showNotification(
        access.reason === 'bad_password'
          ? t('tournamentHub.invalidTabletPassword')
          : t('tournamentHub.invalidPin'),
        'error'
      );
      return;
    }
    setTournamentData(null);
    setTournamentMatches([]);
    setTournamentBracket([]);
    setActivePin(p);
    setUserRole('tablet');
    setTournamentDraft((prev) => ({ ...prev, hubTabletBoard: b }));
    persistSpectatorSession('tablet', p, b, tp);
    setAppState('tournament_tablet');
  };

  const handleTournamentHubViewerJoin = async (pin) => {
    if (!pin) {
      showNotification(
        translations[lang]?.tournamentHub?.enterPin || 'Zadejte PIN turnaje',
        'error'
      );
      return;
    }
    const p = String(pin).replace(/\D/g, '').slice(0, 4);
    const ok = await verifyTournamentPin(p);
    if (!ok) {
      showNotification(t('tournamentHub.invalidPin'), 'error');
      return;
    }
    setTournamentData(null);
    setTournamentMatches([]);
    setTournamentBracket([]);
    setActivePin(p);
    setUserRole('viewer');
    persistSpectatorSession('viewer', p);
    setAppState('tournament_viewer_preparing');
  };

  const handleSpectatorDisconnect = () => {
    if (userRole === 'tablet') {
      const pin = String(activePin ?? '').trim();
      const board = String(tournamentDraft?.hubTabletBoard ?? loadStoredTabletBoard()).trim();
      const auth = tabletCloudAuthOpts();
      if (/^\d{4}$/.test(pin) && board) {
        void releaseTabletBoardPresence({
          pin,
          board,
          boardToken: String(auth.boardToken ?? '').trim(),
          tabletPassword: String(auth.tabletPassword ?? '').trim().slice(0, 5),
        }).catch((err) => console.warn('releaseTabletBoardPresence(disconnect):', err));
      }
    }
    clearSpectatorSession();
    setUserRole(null);
    setActivePin('');
    setTournamentData(null);
    setTournamentMatches([]);
    setTournamentBracket([]);
    setTournamentMatchContext(null);
    setParkedSession(null);
    setAppState('tournament_hub');
  };

  const dismissParkedSession = React.useCallback(() => {
    setParkedSession((prev) => {
      if (prev?.kind === 'match' && prev.mountKept && appState !== 'playing') {
        if (tournamentMatchContextRef.current) {
          clearPlayingTournamentMatchWithoutResult();
          setTournamentMatchContext(null);
        }
      }
      return null;
    });
  }, [appState, clearPlayingTournamentMatchWithoutResult]);

  const resumeParkedSession = React.useCallback(() => {
    setParkedSession((prev) => {
      if (!prev) return null;
      if (prev.kind === 'match') {
        setAppState('playing');
        setHomeSubmenu(null);
        return null;
      }
      if (prev.kind === 'tournament') {
        if (prev.userRole) setUserRole(prev.userRole);
        if (prev.returnSetupStep != null) setTournamentSetupStep(prev.returnSetupStep);
        setAppState(prev.returnAppState || 'tournament_groups');
        setHomeSubmenu(null);
        return null;
      }
      return null;
    });
  }, []);

  const goHomeFromNav = React.useCallback(() => {
    setPauseMenuOpen(false);
    setHomeSubmenu(null);

    if (appState === 'playing') {
      const title =
        settings?.p1Name && settings?.p2Name
          ? `${settings.p1Name} vs ${settings.p2Name}`
          : t('navResumeMatch') || 'Pokračovat v zápase';
      setParkedSession({
        kind: 'match',
        mountKept: true,
        title,
        isTournament: !!tournamentMatchContextRef.current,
        isOnline: !!onlineGameId,
      });
      setAppState('home');
      return;
    }

    if (shouldParkTournamentSession(appState, userRole, !!tournamentData)) {
      setParkedSession({
        kind: 'tournament',
        returnAppState: appState,
        returnSetupStep: tournamentSetupStep,
        userRole,
        title: tournamentData?.name || tournamentData?.tournamentName || undefined,
      });
      setAppState('home');
      return;
    }

    setAppState('home');
  }, [
    appState,
    userRole,
    tournamentData,
    tournamentSetupStep,
    settings?.p1Name,
    settings?.p2Name,
    onlineGameId,
    t,
  ]);

  const handleNavBackTarget = React.useCallback(
    (backTarget) => {
      if (!backTarget) return;
      if (backTarget.type === 'clearHomeSubmenu') {
        setHomeSubmenu(null);
        return;
      }
      if (backTarget.type === 'state') {
        if (backTarget.state === 'home') {
          goHomeFromNav();
          return;
        }
        setAppState(backTarget.state);
        return;
      }
      if (backTarget.type === 'setupStep') {
        setTournamentSetupStep(backTarget.step);
        return;
      }
      if (backTarget.type === 'setupStepAndState') {
        if (
          backTarget.state === 'tournament_setup' &&
          !isTournamentLive &&
          (hasDrawRankingSnapshot(tournamentData) ||
            (tournamentMatches?.length ?? 0) > 0 ||
            (Array.isArray(tournamentBracket) && tournamentBracket.length > 0) ||
            tournamentData)
        ) {
          resetDrawToLiveRanking();
        }
        setTournamentSetupStep(backTarget.step);
        setAppState(backTarget.state);
        return;
      }
      if (backTarget.type === 'leaveTournamentSetup') {
        setUserRole(null);
        setAppState('tournament_hub');
        return;
      }
      if (backTarget.type === 'leaveViewer' || backTarget.type === 'leaveTablet') {
        handleSpectatorDisconnect();
        return;
      }
      if (backTarget.type === 'preregBackToCatalog') {
        setPreregReturnToCatalog(false);
        setPreregTournamentId(null);
        setAppState('prereg_catalog');
        window.history.replaceState(null, '', '/tournaments');
      }
    },
    [goHomeFromNav, handleSpectatorDisconnect, resetDrawToLiveRanking, isTournamentLive, tournamentData, tournamentMatches, tournamentBracket]
  );

  const leavePlayingToTournamentBoard = React.useCallback(() => {
    setPauseMenuOpen(false);
    setParkedSession(null);
    const ctx = tournamentMatchContextRef.current;
    clearPlayingTournamentMatchWithoutResult();
    setTournamentMatchContext(null);
    setAppState(
      ctx?.type === 'tablet'
        ? 'tournament_tablet'
        : ctx?.type === 'bracket'
          ? 'tournament_bracket'
          : 'tournament_groups'
    );
  }, [clearPlayingTournamentMatchWithoutResult]);

  const leavePlayingToSetup = React.useCallback(() => {
    setPauseMenuOpen(false);
    setParkedSession(null);
    if (tournamentMatchContextRef.current) {
      leavePlayingToTournamentBoard();
      return;
    }
    if (onlineGameId) {
      handleOnlineExitMatchRequest();
      return;
    }
    setAppState('setup');
  }, [onlineGameId, leavePlayingToTournamentBoard, handleOnlineExitMatchRequest]);

  const navResolved = React.useMemo(
    () =>
      resolveAppNav({
        appState,
        tournamentSetupStep,
        homeSubmenu,
        preregReturnToCatalog,
        userRole,
        hasTournamentData: !!tournamentData,
        canGoToBoardAssignment: canNavigateToStep(4),
      }),
    [appState, tournamentSetupStep, homeSubmenu, preregReturnToCatalog, userRole, tournamentData, hasBracketGenerated, isTournamentLive]
  );

  /** Guard: turnajové obrazovky bez dat → hub + toast */
  useEffect(() => {
    const needsData = [
      'tournament_board_assignment',
      'tournament_groups',
      'tournament_bracket',
      'tournament_stats',
    ].includes(appState);
    if (!needsData || tournamentData) return;
    if (userRole === 'viewer' || userRole === 'tablet') return;
    showNotificationRef.current(t('navTournamentMissing') || 'Turnaj už není k dispozici.', 'error');
    setParkedSession(null);
    setUserRole(null);
    setAppState('tournament_hub');
  }, [appState, tournamentData, userRole, t]);

  const handleTournamentHubHistory = () => {
    setAppState('tournament_history');
  };

  const handleTournamentHubPreReg = () => {
    setActivePreRegTournamentId(null);
    setActivePreRegInviteToken(null);
    setAppState('prereg_list');
  };

  const handleTournamentHubCatalog = () => {
    setPreregReturnToCatalog(false);
    setAppState('prereg_catalog');
    window.history.pushState(null, '', '/tournaments');
  };

  const handleOpenCatalogTournament = (tournamentId) => {
    setPreregTournamentId(tournamentId);
    setPreregReturnToCatalog(true);
    setAppState('prereg_public');
    window.history.pushState(null, '', `/t/${encodeURIComponent(tournamentId)}`);
  };

  const handlePreRegManage = (tournamentId) => {
    setActivePreRegTournamentId(tournamentId);
    setActivePreRegInviteToken(null);
    setAppState('prereg_admin');
  };

  const handlePreRegCreateNew = () => {
    setAppState('prereg_setup');
  };

  const handlePreRegTournamentCreated = (tournamentId) => {
    setActivePreRegTournamentId(tournamentId);
    setActivePreRegInviteToken(null);
    setAppState('prereg_admin');
  };

  const handlePreRegImportToSetup = ({
    players,
    tournamentName,
    importMode = 'fresh',
    competitionType,
  }) => {
    setUserRole('admin');
    if (activePreRegTournamentId) {
      setPreRegImportSourceId(activePreRegTournamentId);
    }

    const normalizeName = (n) => normalizePlayerNameKey(n);
    // Předregistrace neukládá pevný rank — import jen jména; rank se bere živě / při losu.
    const importedPlayers = (players || [])
      .map((p, i) => {
        const name = String(p.name ?? '').trim();
        if (p.kind === 'team') {
          return {
            ...p,
            name,
            id: p.id || `t${i + 1}`,
            ranking: p.ranking ?? null,
          };
        }
        return {
          name,
          ranking: null,
          id: `p${i + 1}`,
          csoPlayerId: p.csoPlayerId || resolveCsoPlayerId(p) || resolveCsoPlayerId({ name }),
        };
      })
      .filter((p) => p.name);

    if (importMode === 'merge') {
      if (isTournamentRankingLocked(tournamentData, isTournamentLive) && tournamentData?.groups?.length) {
        // Po prvním zápase: late add do skupin bez přelosování / změny snapshotu
        setTournamentData((prev) => {
          if (!prev?.groups?.length) return prev;
          const existingNames = new Set(
            (prev.players ?? []).map((p) => normalizeName(p.name))
          );
          const groups = prev.groups.map((g) => ({
            ...g,
            players: [...(g.players ?? [])],
          }));
          const addedPlayers = [];
          let seq = (prev.players ?? []).length;

          for (const p of importedPlayers) {
            if (existingNames.has(normalizeName(p.name))) continue;
            existingNames.add(normalizeName(p.name));
            let minIdx = 0;
            for (let i = 1; i < groups.length; i++) {
              if ((groups[i].players?.length ?? 0) < (groups[minIdx].players?.length ?? 0)) {
                minIdx = i;
              }
            }
            const id = `p-late-${seq + 1}`;
            seq += 1;
            const row = {
              ...p,
              id,
              ranking: p.kind === 'team' ? p.ranking ?? null : null,
            };
            groups[minIdx].players.push(row);
            addedPlayers.push(row);
          }

          if (addedPlayers.length === 0) return prev;
          return {
            ...prev,
            groups,
            players: [...(prev.players ?? []), ...addedPlayers],
          };
        });
        setAppState(
          appState === 'tournament_setup' || appState === 'tournament_board_assignment'
            ? 'tournament_groups'
            : appState
        );
        return;
      }

      // Před live: sloučit do draftu a zrušit los → živý ranking
      if (tournamentData || (tournamentMatches?.length ?? 0) > 0 || (tournamentBracket?.length ?? 0) > 0) {
        const existing = stripPlayerRankingsForLive(
          tournamentData?.players?.length ? tournamentData.players : tournamentDraft.players
        );
        const existingNames = new Set(existing.map((p) => normalizeName(p.name)));
        const toAdd = importedPlayers.filter((p) => !existingNames.has(normalizeName(p.name)));
        resetDrawToLiveRanking();
        setTournamentDraft((prev) => ({
          ...createDefaultTournamentDraft(),
          ...prev,
          name: String(tournamentName || '').trim() || prev.name || tournamentData?.name || '',
          players: [
            ...existing,
            ...toAdd.map((p, i) => ({
              ...p,
              id: p.id ?? `p${existing.length + i + 1}`,
              ranking: p.kind === 'team' ? p.ranking ?? null : null,
            })),
          ],
          useCsoRanking: true,
          competitionType: competitionType || prev.competitionType || 'singles',
        }));
        setTournamentSetupStep(2);
        setAppState('tournament_setup');
        return;
      }

      setTournamentDraft((prev) => {
        const existing = prev.players ?? [];
        const existingNames = new Set(existing.map((p) => normalizeName(p.name)));
        const toAdd = importedPlayers.filter((p) => !existingNames.has(normalizeName(p.name)));
        if (toAdd.length === 0) return prev;
        const merged = [
          ...existing,
          ...toAdd.map((p, i) => ({
            ...p,
            id: p.id ?? `p${existing.length + i + 1}`,
            ranking: p.kind === 'team' ? p.ranking ?? null : null,
          })),
        ];
        return {
          ...prev,
          name: String(tournamentName || '').trim() || prev.name || '',
          players: merged,
          useCsoRanking: true,
          competitionType: competitionType || prev.competitionType || 'singles',
        };
      });
      setTournamentSetupStep(2);
      setAppState('tournament_setup');
      return;
    }

    // fresh = nové rozlosování: zruš snapshot/los, živý ranking
    resetDrawToLiveRanking();
    let pinToUse = '';
    setTournamentDraft((prev) => {
      pinToUse =
        prev.pin && /^\d{4}$/.test(String(prev.pin)) ? String(prev.pin) : generatePin();
      writeTournamentWip(pinToUse);
      return {
        ...createDefaultTournamentDraft(),
        ...prev,
        pin: pinToUse,
        name: String(tournamentName || '').trim(),
        players: importedPlayers.map((p, i) => ({
          ...p,
          id: p.id ?? (p.kind === 'team' ? `t${i + 1}` : `p${i + 1}`),
          ranking: p.kind === 'team' ? p.ranking ?? null : null,
        })),
        useCsoRanking: true,
        competitionType: competitionType || 'singles',
        boardAssignments: {},
      };
    });
    setActivePin(pinToUse);
    setTournamentSetupStep(1);
    setAppState('tournament_setup');
  };

  useEffect(() => {
    if (!tournamentGroups?.length) return;
    setTournamentMatches((prevMatches) => {
      const allMatches = [];
      const prevByKey = new Map();
      for (const m of prevMatches) {
        const key = m.matchId ?? m.id ?? `${m.groupId ?? m.group}-${m.player1Id}-${m.player2Id}-${m.round ?? 'x'}`;
        prevByKey.set(key, m);
      }
      for (const g of tournamentGroups) {
        const schedule = generateGroupMatches(g.players, g.groupId);
        for (let i = 0; i < schedule.length; i++) {
          const m = schedule[i];
          const key = m.id ?? `${g.groupId}-${m.player1Id}-${m.player2Id}-${m.round ?? 'x'}`;
          const existing = prevByKey.get(key);
          allMatches.push({
            ...m,
            matchId: existing?.matchId ?? m.id ?? `${g.groupId}-m${i + 1}`,
            status: existing?.status ?? m.status ?? 'pending',
            result: existing?.result,
            completedAt: existing?.completedAt,
            startedAt: existing?.startedAt,
            chalkerId: existing?.chalkerId ?? m.chalkerId,
            referees: existing?.referees ?? m.referees,
            referee: existing?.referee ?? m.referee,
            board: existing?.board ?? m.board,
          });
        }
      }
      return adaptGroupParallelPlay(allMatches, tournamentGroups);
    });
  }, [tournamentGroups]);

  const groupMatchPhaseKey = React.useMemo(
    () => matchPhaseSignature(tournamentMatches),
    [tournamentMatches]
  );

  useEffect(() => {
    if (!tournamentGroups?.length || !tournamentMatches?.length) return;
    setTournamentMatches((prev) => {
      const next = adaptGroupParallelPlay(prev, tournamentGroups);
      return parallelAssignSignature(prev) === parallelAssignSignature(next) ? prev : next;
    });
  }, [tournamentGroups, groupMatchPhaseKey]);

  // Chytrá fronta terčů: při dokončení skupiny automaticky přiřaď terč první čekající
  useEffect(() => {
    if (userRole !== 'admin') return;
    if (!tournamentData?.groups?.length || !tournamentMatches.length) return;
    const groups = tournamentData.groups;
    const matches = tournamentMatches;

    const isGroupFullyCompleted = (groupId) => {
      const groupMatches = matches.filter((m) => (m.groupId ?? m.group) === groupId);
      if (groupMatches.length === 0) return false;
      return groupMatches.every((m) => m.status === 'completed');
    };

    const completedWithBoard = groups.find(
      (g) =>
        isGroupFullyCompleted(g.groupId) &&
        g.boards?.length > 0 &&
        g.boards[0] !== 'Dohráno' &&
        !g.boardReleased
    );
    const firstWaiting = groups.find(
      (g) =>
        (!g.boards || g.boards.length === 0) &&
        !isGroupFullyCompleted(g.groupId)
    );

    if (completedWithBoard && firstWaiting) {
      const boardNum = completedWithBoard.boards[0];
      const completedId = completedWithBoard.groupId;
      const waitingId = firstWaiting.groupId;

      const nextGroups = groups.map((g) => {
        if (g.groupId === completedId) {
          return { ...g, boards: [], boardReleased: true };
        }
        if (g.groupId === waitingId) {
          return { ...g, boards: [boardNum] };
        }
        return g;
      });
      const nextTd = { ...tournamentData, groups: nextGroups };

      setTournamentData(() => {
        try {
          safeStorage.setItem('dartsTournamentData', JSON.stringify(nextTd));
        } catch {}
        return nextTd;
      });

      setTournamentDraft((prev) => ({
        ...prev,
        boardAssignments: {
          ...(prev.boardAssignments || {}),
          [completedId]: 'Dohráno',
          [waitingId]: String(boardNum),
        },
      }));

      // Okamžitý cloud sync — tablet jinak zůstane na dohrané skupině (debounce + inbound lock).
      const pin = String(activePin ?? '').trim();
      if (nextTd?.cloudEnabled && /^\d{4}$/.test(pin) && user && !user.isAnonymous) {
        const snap = tournamentSyncPayloadRef.current;
        syncTournamentToCloud(pin, {
          tournamentData: nextTd,
          groups: nextGroups,
          groupMatches: snap?.groupMatches ?? tournamentMatches,
          tournamentBracket: snap?.tournamentBracket ?? tournamentBracket,
        }).catch((err) => console.warn('Board reassignment cloud sync failed:', err));
      }

      const msg =
        (translations[lang]?.tournBoardReassigned || 'Systém: Skupina {X} dohrála. Terč {Y} byl automaticky přiřazen Skupině {Z}.')
          .replace('{X}', completedId)
          .replace('{Y}', String(boardNum))
          .replace('{Z}', waitingId);
      showNotification(msg, 'success');
    }
  }, [userRole, tournamentData, tournamentMatches, tournamentBracket, activePin, user, lang]);

  useEffect(() => {
    if (userRole !== 'admin') return;
    if (!tournamentData) return;
    const needsId = !tournamentData.tournamentId;
    const needsPin = !tournamentData.pin;
    if (!needsId && !needsPin) return;
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}`;
    // TODO: KIOSKOVÝ TABLET se bude přihlašovat pomocí tohoto PINu. Kiosk po přihlášení a zadání čísla terče zobrazí pouze zápasy přiřazené danému terči.
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setTournamentData((prev) => {
      if (!prev) return prev;
      if (prev.tournamentId && prev.pin) return prev;
      const next = {
        ...prev,
        ...(needsId && !prev.tournamentId ? { tournamentId: id } : {}),
        ...(needsPin && !prev.pin ? { pin } : {}),
      };
      try {
        safeStorage.setItem('dartsTournamentData', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [userRole, tournamentData]);

  useEffect(() => {
    const check = () => { setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth > 500); setIsPC(window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 768); };
    window.addEventListener('resize', check); check();
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
      const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', handleFsChange);
      return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Hlídač přihlášení pro zálohu offline zápasů
  useEffect(() => {
      // Najde, jestli existují zápasy, které ještě nemají ID hráče a nejsou označené jako zálohované
      const hasUnsynced = matchHistory.some(m => !m.synced && !m.p1Id);
      if (user && !user.isAnonymous && hasUnsynced) {
          setShowSyncPrompt(true);
      }
  }, [user, matchHistory]);

  const handleSyncOfflineMatches = async () => {
      if (!db || !user || user.isAnonymous) return;
      try {
          const unsyncedMatches = matchHistory.filter(m => !m.synced && !m.p1Id);
          if (unsyncedMatches.length === 0) {
              setShowSyncPrompt(false);
              return;
          }
          
          for (const match of unsyncedMatches) {
              const matchToSync = { ...match, p1Id: user.uid, synced: true };
              await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), matchToSync);
          }

          const uploadedIds = new Set(unsyncedMatches.map(m => m.id));
          const updatedHistory = matchHistory.map(m => {
              if (uploadedIds.has(m.id)) {
                  return { ...m, p1Id: user.uid, synced: true };
              }
              return m;
          });
          
          setMatchHistory(updatedHistory); // Přepíše localStorage
          setShowSyncPrompt(false); // Zavře okno
      } catch {
          console.error("Chyba při zálohování");
      }
  };

  // Sledování změny jazyka a aktualizace výchozích jmen v nastavení
  useEffect(() => {
      setSettings(prev => {
          const p1Defaults = ['Domácí', 'Home', 'Gospodarze', translations?.cs?.p1Default, translations?.en?.p1Default, translations?.pl?.p1Default];
          const p2Defaults = ['Hosté', 'Away', 'Goście', translations?.cs?.p2Default, translations?.en?.p2Default, translations?.pl?.p2Default];
          const botDefaults = ['Robot', 'Bot', translations?.cs?.botDefault, translations?.en?.botDefault, translations?.pl?.botDefault];

          let newP1 = prev.p1Name;
          let newP2 = prev.p2Name;

          // Pokud je v políčku defaultní jméno, přepiš ho do nového jazyka
          if (p1Defaults.includes(prev.p1Name)) {
              newP1 = translations[lang]?.p1Default || 'Domácí';
          }
          if (prev.isBot && botDefaults.includes(prev.p2Name)) {
              newP2 = translations[lang]?.botDefault || 'Robot';
          } else if (!prev.isBot && p2Defaults.includes(prev.p2Name)) {
              newP2 = translations[lang]?.p2Default || 'Hosté';
          }

          return { ...prev, p1Name: newP1, p2Name: newP2 };
      });
  }, [lang]);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
        if (u) { setUser(u); } else { try { await signInAnonymously(auth); } catch { setOfflineMode(true); } }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (user && !user.isAnonymous && user.displayName) {
          setSettings(prev => {
              const defaultNames = ['Domácí', 'Home', 'Gospodarze', translations.cs.p1Default, translations.en.p1Default, translations.pl.p1Default];
              if (!prev.p1Name || defaultNames.includes(prev.p1Name)) {
                  return { ...prev, p1Name: user.displayName.split(' ')[0], p1Id: user.uid };
              }
              return { ...prev, p1Id: user.uid };
          });
      } else if (user) {
          setSettings(prev => ({ ...prev, p1Id: user.uid }));
      }
  }, [user, lang]);

  useEffect(() => { safeStorage.setItem('dartsMatchHistory', JSON.stringify(matchHistory)); }, [matchHistory]);

  const handleMatchComplete = async (record, restorePayload = null) => {
      const oid = record?.onlineSessionGameId;
      if (oid) {
        if (processedOnlineMatchHistoryRef.current.has(oid)) return;
        processedOnlineMatchHistoryRef.current.add(oid);
      }
      const fullRecord = { ...record, gameType: settings.gameType, startScore: settings.startScore, outMode: settings.outMode };
      setParkedSession((prev) => (prev?.kind === 'match' ? null : prev));
      setPauseMenuOpen(false);
      // Online: jen uložit historii — bez obrazovky odvetného zápasu (návrat řeší onOnlineSessionEnded → lobby).
      if (oid) {
        setMatchHistory((prev) => [fullRecord, ...prev]);
        if (db && user && !user.isAnonymous) {
          try {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), fullRecord);
          } catch {}
        }
        return;
      }
      if (tournamentMatchContext) {
        fullRecord.tournamentMatchId = tournamentMatchContext.match?.matchId;
        fullRecord.tournamentGroupId = tournamentMatchContext.match?.groupId;
        setSelectedMatchDetail(fullRecord);
        setMatchFinishRestoreState(restorePayload);
        setAppState('match_finished');
      } else {
        setMatchHistory(prev => [fullRecord, ...prev]);
        if(db && user && !user.isAnonymous) { try { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), fullRecord); } catch {} }
        setSelectedMatchDetail(fullRecord);
        setMatchFinishRestoreState(restorePayload);
        setAppState('match_finished');
      }
  };

  const handleStartTournamentMatch = (match, group) => {
    if (!match || !group) return;
    const p1 = group.players.find(p => p.id === match.player1Id);
    const p2 = group.players.find(p => p.id === match.player2Id);
    const legsToWin = tournamentData?.groupsLegs ?? 3;
    const mid = match.matchId ?? match.id;
    const gid = match.groupId ?? match.group;
    const t0 = Date.now();
    setTournamentMatches((prev) =>
      (prev || []).map((m) => {
        const xid = m.matchId ?? m.id;
        const xg = m.groupId ?? m.group;
        return xid === mid && xg === gid ? { ...m, status: 'playing', startedAt: t0 } : m;
      })
    );
    setTournamentMatchContext({ match, group, tournamentData });
    setSettings(prev => ({
      ...prev,
      p1Name: p1?.name ?? match.player1Id ?? 'P1',
      p2Name: p2?.name ?? match.player2Id ?? 'P2',
      p1Id: p1?.id ?? match.player1Id ?? null,
      p2Id: p2?.id ?? match.player2Id ?? null,
      matchMode: 'first_to',
      matchTarget: legsToWin,
      matchSets: 1,
      isBot: false,
      gameType: 'x01',
      startScore: tournamentData?.startScore ?? 501,
      outMode: tournamentData?.outMode ?? 'double',
      ...buildDoublesSettingsFromSlots(p1, p2),
    }));
    setAppState('playing');
  };

  const handleStartBracketMatch = (match, roundIndex) => {
    if (!match || !tournamentData) return;
    const baseLegs =
      tournamentData?.bracketKoLegs ?? tournamentData?.bracketLegs ?? tournamentData?.groupsLegs ?? 3;
    const legsToWin =
      match.winLegs != null && Number.isFinite(Number(match.winLegs))
        ? Math.max(1, Math.floor(Number(match.winLegs)))
        : getBracketWinLegsForRound(roundIndex, baseLegs, tournamentData?.prelimLegs);
    const t0 = Date.now();
    const mid = match.id;
    if (mid != null) {
      setTournamentBracket((prev) =>
        Array.isArray(prev)
          ? prev.map((round, rIdx) => ({
              ...round,
              matches: (round.matches || []).map((m) =>
                rIdx === roundIndex && m.id === mid ? { ...m, status: 'playing', startedAt: t0 } : m
              ),
            }))
          : prev
      );
    }
    setTournamentMatchContext({ match, type: 'bracket', roundIndex, tournamentData });
    const p1Slot = findTournamentSlot(match.player1Id, tournamentData, tournamentGroups);
    const p2Slot = findTournamentSlot(match.player2Id, tournamentData, tournamentGroups);
    setSettings((prev) => ({
      ...prev,
      p1Name: match.player1Name ?? p1Slot?.name ?? match.player1Id ?? 'P1',
      p2Name: match.player2Name ?? p2Slot?.name ?? match.player2Id ?? 'P2',
      p1Id: match.player1Id ?? p1Slot?.id ?? null,
      p2Id: match.player2Id ?? p2Slot?.id ?? null,
      matchMode: 'first_to',
      matchTarget: legsToWin,
      matchSets: 1,
      isBot: false,
      gameType: 'x01',
      startScore: tournamentData?.startScore ?? 501,
      outMode: tournamentData?.outMode ?? 'double',
      ...buildDoublesSettingsFromSlots(p1Slot, p2Slot),
    }));
    setAppState('playing');
  };

  const getBracketMatchLegSnapshot = (match) => {
    if (!match) return null;
    const readLegValue = (...candidates) => {
      for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n) && n >= 0) return Math.max(0, Math.floor(n));
      }
      return null;
    };
    const p1Legs = readLegValue(
      match?.score?.p1,
      match?.result?.p1Legs,
      match?.legsP1,
      match?.score1
    );
    const p2Legs = readLegValue(
      match?.score?.p2,
      match?.result?.p2Legs,
      match?.legsP2,
      match?.score2
    );
    if (p1Legs == null || p2Legs == null) return null;
    return { p1Legs, p2Legs };
  };

  const resolveBracketWinnerByLegTimeline = (match, legTarget) => {
    const target = Math.max(1, Math.floor(Number(legTarget) || 1));
    const sources = [
      Array.isArray(match?.completedLegs) ? match.completedLegs : null,
      Array.isArray(match?.result?.completedLegs) ? match.result.completedLegs : null,
      Array.isArray(match?.legDetails) ? match.legDetails : null,
      Array.isArray(match?.result?.legDetails) ? match.result.legDetails : null,
    ];
    const legs = sources.find((arr) => Array.isArray(arr) && arr.length > 0) || [];
    if (!legs.length) return null;

    let p1 = 0;
    let p2 = 0;
    for (const leg of legs) {
      const wk = String(leg?.winnerKey ?? leg?.winner ?? '').trim().toLowerCase();
      if (wk === 'p1') p1 += 1;
      else if (wk === 'p2') p2 += 1;
      else {
        const wid = leg?.winnerId != null ? String(leg.winnerId) : '';
        if (wid && match?.player1Id != null && wid === String(match.player1Id)) p1 += 1;
        else if (wid && match?.player2Id != null && wid === String(match.player2Id)) p2 += 1;
      }
      if (p1 >= target || p2 >= target) {
        return p1 >= target ? 'p1' : 'p2';
      }
    }
    return null;
  };

  const resolveImmediateBracketWinnerForTarget = (match, legTarget) => {
    const snap = getBracketMatchLegSnapshot(match);
    if (!snap) return null;
    const target = Math.max(1, Math.floor(Number(legTarget) || 1));
    const { p1Legs, p2Legs } = snap;
    const p1Reached = p1Legs >= target;
    const p2Reached = p2Legs >= target;
    if (!p1Reached && !p2Reached) return null;

    if (p1Reached && !p2Reached) {
      return { winnerKey: 'p1', winnerId: match?.player1Id ?? null, p1Legs, p2Legs };
    }
    if (p2Reached && !p1Reached) {
      return { winnerKey: 'p2', winnerId: match?.player2Id ?? null, p1Legs, p2Legs };
    }

    const fromTimeline = resolveBracketWinnerByLegTimeline(match, target);
    if (fromTimeline === 'p1' && match?.player1Id != null) {
      return { winnerKey: 'p1', winnerId: match.player1Id, p1Legs, p2Legs };
    }
    if (fromTimeline === 'p2' && match?.player2Id != null) {
      return { winnerKey: 'p2', winnerId: match.player2Id, p1Legs, p2Legs };
    }
    return null;
  };

  const handleTabletCheckInComplete = async () => {
    const am = tabletAssignedMatchRef.current;
    const pin = String(activePin ?? '').trim();
    if (!am || !/^\d{4}$/.test(pin)) return;
    try {
      await updateCloudMatchFromTablet(
        pin,
        am.matchType,
        am.matchId ?? am.id,
        { tabletStatus: 'checked_in' },
        tabletCloudAuthOpts()
      );
    } catch (err) {
      console.warn('Tablet check-in cloud sync', err);
      showNotification(
        String(err?.message || translations[lang]?.tournamentHub?.syncError || 'Chyba synchronizace s cloudem.'),
        'error'
      );
    }
  };

  const handleTabletTimeoutWarning = async (matchType, matchId, checkInPresent) => {
    const pin = String(activePin ?? '').trim();
    if (!/^\d{4}$/.test(pin) || !matchId) return;
    const am = tabletAssignedMatchRef.current;
    const present =
      checkInPresent && typeof checkInPresent === 'object'
        ? {
            p1: !!checkInPresent.presentP1,
            p2: !!checkInPresent.presentP2,
            referee: !!checkInPresent.presentRef,
          }
        : { p1: false, p2: false, referee: false };
    const prevCount = Number(am?.tabletTimeoutWarningCount) || 0;
    const nextCount = Math.min(TABLET_CHECKIN_MAX_WARNINGS, prevCount + 1);
    const roleCounts = bumpRoleWarningCounts(am?.tabletTimeoutRoleWarningCounts, present);
    try {
      await updateCloudMatchFromTablet(
        pin,
        matchType,
        matchId,
        {
          tabletStatus: 'timeout_warning',
          tabletCheckInPresent: present,
          tabletTimeoutWarningCount: nextCount,
          tabletTimeoutRoleWarningCounts: roleCounts,
          tabletCheckInResume: null,
        },
        tabletCloudAuthOpts()
      );
    } catch (err) {
      console.warn('Tablet timeout warning sync', err);
    }
  };

  /** Admin potvrdil timeout banner: 1./2. → restart check-inu (90s / 60s), 3. → bez resetu. */
  const acknowledgeAdminTabletTimeoutWarnings = React.useCallback(() => {
    const pending = adminTabletTimeoutPending;
    if (!pending.length) return;

    const byId = new Map(pending.map((e) => [String(e.matchId), e]));
    const resumeTokenBase = Date.now();
    let resumeTokenSeq = 0;

    const patchMatch = (m, mid, entry) => {
      const count = Math.min(
        TABLET_CHECKIN_MAX_WARNINGS,
        Math.max(1, Number(entry.warningCount) || Number(m.tabletTimeoutWarningCount) || 1)
      );
      const resumeSeconds = checkInSecondsAfterWarningAck(count);
      if (resumeSeconds != null) {
        resumeTokenSeq += 1;
        return {
          ...m,
          tabletStatus: null,
          tabletTimeoutAdminAckedCount: count,
          tabletTimeoutWarningCount: count,
          tabletCheckInResume: {
            token: resumeTokenBase + resumeTokenSeq,
            seconds: resumeSeconds,
          },
        };
      }
      return {
        ...m,
        tabletTimeoutAdminAckedCount: count,
        tabletTimeoutWarningCount: count,
        tabletCheckInResume: null,
      };
    };

    const hasGroup = pending.some((e) => e.matchType === 'group');
    const hasBracket = pending.some((e) => e.matchType === 'bracket');

    let nextMatches = tournamentMatches;
    let nextBracket = tournamentBracket;

    if (hasGroup) {
      nextMatches = (tournamentMatches || []).map((m) => {
        const mid = m.matchId ?? m.id;
        const entry = byId.get(String(mid));
        if (!entry || entry.matchType !== 'group') return m;
        return patchMatch(m, mid, entry);
      });
      setTournamentMatches(nextMatches);
    }
    if (hasBracket) {
      nextBracket = (tournamentBracket || []).map((round) => ({
        ...round,
        matches: (round?.matches || []).map((m) => {
          const mid = m.id ?? m.matchId;
          const entry = byId.get(String(mid));
          if (!entry || entry.matchType !== 'bracket') return m;
          return patchMatch(m, mid, entry);
        }),
      }));
      setTournamentBracket(nextBracket);
    }

    const pin = String(activePin ?? '').trim();
    if (tournamentData?.cloudEnabled && /^\d{4}$/.test(pin) && user && !user.isAnonymous) {
      const snap = tournamentSyncPayloadRef.current;
      syncTournamentToCloud(pin, {
        tournamentData: snap?.tournamentData ?? tournamentData,
        groups: snap?.groups ?? tournamentGroups,
        groupMatches: nextMatches,
        tournamentBracket: nextBracket,
      }).catch((err) => console.warn('Timeout ack cloud sync failed:', err));
    }
  }, [
    adminTabletTimeoutPending,
    tournamentMatches,
    tournamentBracket,
    tournamentData,
    tournamentGroups,
    activePin,
    user,
  ]);

  const handleTabletStartGame = async (matchId, startingPlayerId) => {
    const am = tabletAssignedMatchRef.current;
    const pin = String(activePin ?? '').trim();
    if (!am || !(am.matchId || am.id)) {
      showNotification(
        translations[lang]?.tablet?.noMatchOnBoard || 'Na tomto terči není aktivní zápas.',
        'error'
      );
      return;
    }
    const mid = am.matchId ?? am.id;
    if (/^\d{4}$/.test(pin)) {
      try {
        await updateCloudMatchFromTablet(
          pin,
          am.matchType,
          mid,
          {
            whoStarts: startingPlayerId,
            tabletStatus: 'ready_to_play',
          },
          tabletCloudAuthOpts()
        );
      } catch (err) {
        console.warn('Tablet start sync', err);
        showNotification(
          String(err?.message || translations[lang]?.tournamentHub?.syncError || 'Chyba synchronizace s cloudem.'),
          'error'
        );
      }
    }

    const td =
      tournamentData ??
      ({
        name: pinBarTitle,
        groupsLegs: tournamentDraft?.groupLegs ?? 3,
        startScore: tournamentDraft?.startScore ?? 501,
        outMode: tournamentDraft?.outMode ?? 'double',
      });

    const legsToWin =
      am.matchType === 'bracket'
        ? (() => {
            const baseLegs =
              td?.bracketKoLegs ??
              td?.bracketLegs ??
              td?.groupsLegs ??
              tournamentDraft?.groupLegs ??
              3;
            const ri = am.bracketRoundIndex ?? 0;
            return am.winLegs != null && Number.isFinite(Number(am.winLegs))
              ? Math.max(1, Math.floor(Number(am.winLegs)))
              : getBracketWinLegsForRound(ri, baseLegs, td?.prelimLegs);
          })()
        : td.groupsLegs ?? tournamentDraft?.groupLegs ?? 3;

    if (am.matchType === 'bracket') {
      setTournamentMatchContext({
        type: 'tablet',
        tabletMatchType: 'bracket',
        match: am,
        roundIndex: am.bracketRoundIndex ?? 0,
        tournamentData: td,
        tabletTitle: td.name ?? pinBarTitle,
        tabletPin: activePin,
      });
      const p1Slot = findTournamentSlot(am.player1Id, td, tournamentGroups);
      const p2Slot = findTournamentSlot(am.player2Id, td, tournamentGroups);
      setSettings((prev) => ({
        ...prev,
        p1Name: am.player1Name ?? p1Slot?.name ?? am.player1Id ?? 'P1',
        p2Name: am.player2Name ?? p2Slot?.name ?? am.player2Id ?? 'P2',
        p1Id: am.player1Id ?? p1Slot?.id ?? null,
        p2Id: am.player2Id ?? p2Slot?.id ?? null,
        matchMode: 'first_to',
        matchTarget: legsToWin,
        matchSets: 1,
        isBot: false,
        gameType: 'x01',
        startScore: td.startScore ?? 501,
        outMode: td.outMode ?? 'double',
        startPlayer: startingPlayerId === am.player2Id ? 'p2' : 'p1',
        ...buildDoublesSettingsFromSlots(p1Slot, p2Slot),
      }));
    } else {
      const group =
        tournamentGroups.find((g) => g.groupId === am.groupId) ||
        td?.groups?.find((g) => g.groupId === am.groupId);
      if (!group) {
        showNotification('Skupina pro zápas nenalezena.', 'error');
        return;
      }
      const p1 = group.players.find((p) => p.id === am.player1Id);
      const p2 = group.players.find((p) => p.id === am.player2Id);
      setTournamentMatchContext({
        type: 'tablet',
        tabletMatchType: 'group',
        match: am,
        group,
        tournamentData: td,
        tabletTitle: td.name ?? pinBarTitle,
        tabletPin: activePin,
      });
      setSettings((prev) => ({
        ...prev,
        p1Name: p1?.name ?? am.player1Name ?? am.player1Id ?? 'P1',
        p2Name: p2?.name ?? am.player2Name ?? am.player2Id ?? 'P2',
        p1Id: p1?.id ?? am.player1Id ?? null,
        p2Id: p2?.id ?? am.player2Id ?? null,
        matchMode: 'first_to',
        matchTarget: legsToWin,
        matchSets: 1,
        isBot: false,
        gameType: 'x01',
        startScore: td.startScore ?? 501,
        outMode: td.outMode ?? 'double',
        startPlayer: startingPlayerId === am.player2Id ? 'p2' : 'p1',
        ...buildDoublesSettingsFromSlots(p1, p2),
      }));
    }
    setAppState('playing');
  };

  const applyRoundSettingsChange = (roundIndex, legs, boards) => {
    // Treat "boards in this round" as the active boards cap for the bracket screen.
    // This prevents ghost boards (T5+) in cloud mode and stabilizes referee assignment.
    setTournamentData((prev) => {
      if (!prev) return prev;
      const nextCap = boards;
      const curCap =
        Number(prev.boardsCount ?? prev.totalBoards ?? prev.numBoards) || 1;
      if (curCap === nextCap) return prev;
      return {
        ...prev,
        boardsCount: nextCap,
        totalBoards: nextCap,
        numBoards: nextCap,
      };
    });

    setTournamentBracket((prev) => {
      if (!Array.isArray(prev) || !prev[roundIndex]?.matches) return prev;
      const updated = prev.map((round, ri) => {
        if (ri !== roundIndex) return round;
        const withLegs = round.matches.map((m) => {
          if (!m) return m;
          const editableStatus =
            m.status === 'pending' || m.status === 'playing' || m.status === 'in_progress';
          let next = editableStatus ? { ...m, winLegs: legs } : m;
          const isRunningLike =
            m.status === 'playing' ||
            m.status === 'in_progress' ||
            m.tabletStatus === 'checked_in' ||
            m.tabletStatus === 'ready_to_play';
          if (isRunningLike) {
            const resolved = resolveImmediateBracketWinnerForTarget(next, legs);
            if (resolved?.winnerId) {
              next = {
                ...next,
                status: 'completed',
                winnerId: resolved.winnerId,
                score: { p1: resolved.p1Legs, p2: resolved.p2Legs },
                score1: resolved.p1Legs,
                score2: resolved.p2Legs,
                legsP1: resolved.p1Legs,
                legsP2: resolved.p2Legs,
                result: {
                  ...(next.result || {}),
                  p1Legs: resolved.p1Legs,
                  p2Legs: resolved.p2Legs,
                },
                completedAt: next.completedAt ?? Date.now(),
                tabletStatus: 'completed',
              };
            }
          }
          // Pokud admin sníží počet terčů pro kolo, zneplatníme staré T5+,
          // aby se přiřazení stabilizovalo a šlo znovu dosadit počtáře.
          const b = Number(next.board);
          const hasBoard = next.board != null && next.board !== '' && Number.isFinite(b);
          if (hasBoard && b > boards && next.status === 'pending') {
            return { ...next, board: null, boardLocked: false };
          }
          return next;
        });
        const roundWithMeta = { ...round, boardsCount: boards, matches: withLegs };
        return {
          ...roundWithMeta,
          matches: autoAssignSequentialBoardsToRound(roundWithMeta.matches, boards),
        };
      });
      return applyBracketMaintenance(propagateBracketWinners(updated));
    });
  };

  const handleUpdateRoundSettings = (roundIndex, newLegs, newBoards) => {
    const legs = Math.max(1, Math.floor(Number(newLegs)));
    const boards = Math.max(1, Math.floor(Number(newBoards)) || 1);
    const round = Array.isArray(tournamentBracket) ? tournamentBracket[roundIndex] : null;
    const matches = Array.isArray(round?.matches) ? round.matches : [];
    const baseLegs =
      tournamentData?.bracketKoLegs ?? tournamentData?.bracketLegs ?? tournamentData?.groupsLegs ?? 3;
    const defaultRoundLegs = getBracketWinLegsForRound(
      roundIndex,
      baseLegs,
      tournamentData?.prelimLegs
    );
    const started = matches
      .map((m) => {
        if (!m) return null;
        const status = m.status;
        const isRunningLike =
          status === 'playing' ||
          status === 'in_progress' ||
          m.tabletStatus === 'checked_in' ||
          m.tabletStatus === 'ready_to_play';
        if (!isRunningLike) return null;
        const currentTarget =
          m.winLegs != null && Number.isFinite(Number(m.winLegs))
            ? Math.max(1, Math.floor(Number(m.winLegs)))
            : defaultRoundLegs;
        if (currentTarget <= legs) return null;
        const boardNum = Number(m.board);
        const boardLabel =
          m.board != null && m.board !== '' && Number.isFinite(boardNum)
            ? `T${Math.max(1, Math.floor(boardNum))}`
            : (t('tournNoBoardAssigned') || 'bez přiřazeného terče');
        const p1 = m.player1Name ?? m.player1Id ?? 'P1';
        const p2 = m.player2Name ?? m.player2Id ?? 'P2';
        const snap = getBracketMatchLegSnapshot(m);
        const scoreText = snap ? `${snap.p1Legs}:${snap.p2Legs}` : '?:?';
        return {
          boardLabel,
          line: `• ${boardLabel}: ${p1} vs ${p2} (${scoreText}, ${currentTarget}→${legs})`,
          canAutoResolveNow: !!resolveImmediateBracketWinnerForTarget(m, legs)?.winnerId,
        };
      })
      .filter(Boolean);

    if (started.length > 0) {
      const boardSummary = [...new Set(started.map((x) => x.boardLabel))].join(', ');
      const autoResolvable = started.filter((x) => x.canAutoResolveNow).length;
      const warningLines = [
        (t('tournBracketLiveLegsWarningIntro') ||
          'Snižujete počet vítězných legů u již rozehraných zápasů.')
          .replace(/\{legs\}/g, String(legs)),
        (t('tournBracketLiveLegsWarningBoards') || 'Rizikové terče: {boards}')
          .replace(/\{boards\}/g, boardSummary || (t('tournNone') || '—')),
        autoResolvable > 0
          ? (t('tournBracketLiveLegsWarningAutoResolve') ||
              'Zápasy s dostupným skóre se po potvrzení uzavřou automaticky: {count}.')
              .replace(/\{count\}/g, String(autoResolvable))
          : (t('tournBracketLiveLegsWarningNoAutoResolve') ||
              'U některých běžících zápasů nemusí být průběžné skóre dostupné pro okamžité uzavření.'),
        '',
        ...started.map((x) => x.line),
        '',
        t('tournBracketLiveLegsWarningQuestion') ||
          'Opravdu chcete změnu použít i na rozehrané zápasy?',
      ];
      requestConfirm(
        warningLines.join('\n'),
        () => applyRoundSettingsChange(roundIndex, legs, boards),
        {
          title: t('tournBracketLiveLegsWarningTitle') || 'Potvrzení změny během rozehrané hry',
          confirmLabel: t('tournBracketLiveLegsWarningConfirm') || 'Použít změnu',
          cancelLabel: t('tournBracketLiveLegsWarningCancel') || 'Beze změny',
        }
      );
      return;
    }

    applyRoundSettingsChange(roundIndex, legs, boards);
  };

  useEffect(() => {
    if (appState !== 'playing' || !tournamentMatchContext || !Array.isArray(tournamentBracket)) return;
    const ctx = tournamentMatchContext;
    const isBracketCtx =
      ctx.type === 'bracket' || (ctx.type === 'tablet' && (ctx.tabletMatchType ?? 'group') === 'bracket');
    if (!isBracketCtx) return;
    const roundIndex =
      ctx.type === 'bracket'
        ? ctx.roundIndex
        : (ctx.roundIndex ?? ctx.match?.bracketRoundIndex ?? null);
    const matchId = ctx.match?.id ?? ctx.match?.matchId;
    if (roundIndex == null || matchId == null) return;
    const round = tournamentBracket[roundIndex];
    if (!round?.matches) return;
    const activeMatch = round.matches.find((m) => String(m?.id ?? m?.matchId ?? '') === String(matchId));
    if (!activeMatch) return;
    const baseLegs =
      tournamentData?.bracketKoLegs ?? tournamentData?.bracketLegs ?? tournamentData?.groupsLegs ?? 3;
    const nextTarget =
      activeMatch.winLegs != null && Number.isFinite(Number(activeMatch.winLegs))
        ? Math.max(1, Math.floor(Number(activeMatch.winLegs)))
        : getBracketWinLegsForRound(roundIndex, baseLegs, tournamentData?.prelimLegs);
    setSettings((prev) => {
      const current = Math.max(1, Math.floor(Number(prev.matchTarget) || 1));
      if (current === nextTarget) return prev;
      return { ...prev, matchTarget: nextTarget };
    });
  }, [appState, tournamentMatchContext, tournamentBracket, tournamentData]);

  const handleUpdateMatchBoard = (roundIndex, matchId, newBoard) => {
    const n = Math.max(1, Math.floor(Number(newBoard)) || 1);
    setTournamentBracket((prev) => {
      if (!Array.isArray(prev) || !prev[roundIndex]?.matches) return prev;
      const withBoard = prev.map((round, ri) => {
        if (ri !== roundIndex) return round;
        return {
          ...round,
          matches: round.matches.map((m) =>
            m.id === matchId ? { ...m, board: n, boardLocked: true } : m
          ),
        };
      });
      return applyBracketMaintenance(withBoard);
    });
  };

  const handleToggleMatchBoardLock = (roundIndex, matchId) => {
    setTournamentBracket((prev) => {
      if (!Array.isArray(prev) || !prev[roundIndex]?.matches) return prev;
      return prev.map((round, ri) => {
        if (ri !== roundIndex) return round;
        return {
          ...round,
          matches: round.matches.map((m) => {
            if (m.id !== matchId) return m;
            const nextLocked = !m.boardLocked;
            return { ...m, boardLocked: nextLocked };
          }),
        };
      });
    });
  };

  const handleSetMatchBoardAuto = (roundIndex, matchId) => {
    setTournamentBracket((prev) => {
      if (!Array.isArray(prev) || !prev[roundIndex]?.matches) return prev;
      return prev.map((round, ri) => {
        if (ri !== roundIndex) return round;
        return {
          ...round,
          matches: round.matches.map((m) =>
            m.id === matchId ? { ...m, boardLocked: false } : m
          ),
        };
      });
    });
  };

  const handleManualBracketPlayerSlot = React.useCallback((roundIndex, matchIndex, slot, player) => {
    const pid = player?.id;
    if (pid == null || String(pid).trim() === '') return;
    setTournamentBracket((prev) => {
      if (!Array.isArray(prev)) return prev;
      const matches = prev[roundIndex]?.matches;
      if (!Array.isArray(matches) || matchIndex < 0 || matchIndex >= matches.length) return prev;
      const cur = matches[matchIndex];
      const otherId = slot === 1 ? cur?.player2Id : cur?.player1Id;
      if (otherId != null && String(otherId) === String(pid)) return prev;
      const next = prev.map((round, ri) => {
        if (ri !== roundIndex) return round;
        return {
          ...round,
          matches: matches.map((m, mi) => {
            if (mi !== matchIndex) return m;
            if (slot === 1) {
              return {
                ...m,
                player1Id: pid,
                player1Name: player?.name ?? String(pid),
              };
            }
            return {
              ...m,
              player2Id: pid,
              player2Name: player?.name ?? String(pid),
            };
          }),
        };
      });
      return propagateBracketWinners(next);
    });
  }, []);

  const handleManualRefereeChange = (roundIndex, matchIndex, newReferee) => {
    const refId = newReferee?.id ?? newReferee?.name;
    if (refId == null || String(refId).trim() === '') return;
    setTournamentBracket((prev) => {
      if (!Array.isArray(prev)) return prev;
      const matches = prev[roundIndex]?.matches;
      if (!Array.isArray(matches) || matchIndex < 0 || matchIndex >= matches.length) return prev;
      return prev.map((round, ri) => {
        if (ri !== roundIndex) return round;
        return {
          ...round,
          matches: matches.map((m, mi) => {
            if (mi !== matchIndex) return m;
            const { refereeId: _rid, refereeName: _rnm, refereePickTier: _rt, ...rest } = m ?? {};
            return {
              ...rest,
              referee: { id: refId, name: newReferee?.name ?? refId },
            };
          }),
        };
      });
    });
  };

  const handleBracketDataCommit = (nextBracket) => {
    const propagated = propagateBracketWinners(nextBracket);
    setTournamentBracket(applyBracketMaintenance(propagated));
  };

  const handleBracketWalkover = (roundIndex, matchIndex, winnerId) => {
    if (!tournamentData || winnerId == null) return;
    setTournamentBracket((prev) => {
      if (!Array.isArray(prev) || !prev[roundIndex]?.matches?.[matchIndex]) return prev;
      const m = prev[roundIndex].matches[matchIndex];
      if (
        m.status !== 'pending' &&
        m.status !== 'playing' &&
        m.status !== 'in_progress'
      ) {
        return prev;
      }
      if (!m.player1Id || !m.player2Id) return prev;
      if (winnerId !== m.player1Id && winnerId !== m.player2Id) return prev;

      const baseLegs =
        tournamentData?.legs ??
        tournamentData?.bracketKoLegs ??
        tournamentData?.bracketLegs ??
        tournamentData?.groupsLegs ??
        3;
      const winLegs =
        m.winLegs != null && Number.isFinite(Number(m.winLegs))
          ? Math.max(1, Math.floor(Number(m.winLegs)))
          : getBracketWinLegsForRound(roundIndex, baseLegs, tournamentData?.prelimLegs);

      const p1Wins = winnerId === m.player1Id;
      const p1Legs = p1Wins ? winLegs : 0;
      const p2Legs = p1Wins ? 0 : winLegs;

      const {
        p1Avg: _a1,
        p2Avg: _a2,
        p1DartsTotal: _d1,
        p2DartsTotal: _d2,
        p1High: _h1,
        p2High: _h2,
        p1HighCheckout: _c1,
        p2HighCheckout: _c2,
        legDetails: _ld,
        stats: _st,
        p1Average: _av1,
        p2Average: _av2,
        result: _prevRes,
        ...matchRest
      } = m;

      const updatedMatch = {
        ...matchRest,
        status: 'completed',
        winnerId,
        isWalkover: true,
        score: { p1: p1Legs, p2: p2Legs },
        result: { p1Legs, p2Legs },
        completedAt: Date.now(),
      };

      const updated = prev.map((round, ri) => ({
        ...round,
        matches: round.matches.map((match, mi) =>
          ri === roundIndex && mi === matchIndex ? updatedMatch : match
        ),
      }));
      return propagateBracketWinners(updated);
    });
  };

  const handleBracketWithdrawPlayer = (playerId) => {
    if (!tournamentData || !playerId) return;
    const pId = String(playerId);
    requestConfirm(
      t('tournWithdrawConfirm') ||
        'Opravdu chcete hráče odhlásit z turnaje? Jeho zbývající zápasy budou zkontumovány (0:W).',
      () => {
        setTournamentData((prev) => {
          if (!prev) return prev;
          const players = Array.isArray(prev.players) ? prev.players : null;
          if (!players) return prev;
          const nextPlayers = players.map((p) => {
            const id = p?.id ?? p?.name;
            if (id == null) return p;
            return String(id) === pId ? { ...p, isWithdrawn: true } : p;
          });
          const next = { ...prev, players: nextPlayers };
          try {
            safeStorage.setItem('dartsTournamentData', JSON.stringify(next));
          } catch {}
          return next;
        });

        setTournamentBracket((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          const baseLegs =
            tournamentData?.legs ??
            tournamentData?.bracketKoLegs ??
            tournamentData?.bracketLegs ??
            tournamentData?.groupsLegs ??
            3;

          const updated = prev.map((round, ri) => {
            const matches = (round?.matches || []).map((m) => {
              if (!m) return m;
              if (m.status === 'completed') return m;
              if (m.isBye) return m;
              if (!m.player1Id || !m.player2Id) return m;
              const isP1 = String(m.player1Id) === pId;
              const isP2 = String(m.player2Id) === pId;
              if (!isP1 && !isP2) return m;

              const winnerId = isP1 ? m.player2Id : m.player1Id;
              const winLegs =
                m.winLegs != null && Number.isFinite(Number(m.winLegs))
                  ? Math.max(1, Math.floor(Number(m.winLegs)))
                  : getBracketWinLegsForRound(ri, baseLegs, tournamentData?.prelimLegs);
              const p1Legs = String(winnerId) === String(m.player1Id) ? winLegs : 0;
              const p2Legs = String(winnerId) === String(m.player2Id) ? winLegs : 0;

              return {
                ...m,
                status: 'completed',
                winnerId,
                isWalkover: true,
                withdrawnPlayerId: pId,
                score: { p1: p1Legs, p2: p2Legs },
                result: { ...(m.result || {}), p1Legs, p2Legs },
                completedAt: m.completedAt ?? Date.now(),
              };
            });
            return { ...round, matches };
          });

          return propagateBracketWinners(updated);
        });
      }
    );
  };

  const handleResetMatch = (matchId, groupId) => {
    if (!matchId || !groupId) return;
    setTournamentMatches((prev) =>
      prev.map((m) =>
        (m.matchId ?? m.id) === matchId && (m.groupId ?? m.group) === groupId
          ? {
              ...m,
              status: 'pending',
              score: { p1: 0, p2: 0 },
              result: null,
              winnerId: null,
              completedAt: null,
              startedAt: null,
            }
          : m
      )
    );

    const group = tournamentGroups.find((g) => g.groupId === groupId);
    const resetMatch = tournamentMatches.find((m) => (m.matchId ?? m.id) === matchId && (m.groupId ?? m.group) === groupId);
    if (group && resetMatch) {
      const reopened = {
        ...resetMatch,
        status: 'pending',
        score: { p1: 0, p2: 0 },
        result: null,
        winnerId: null,
        completedAt: null,
        startedAt: null,
      };
      handleStartTournamentMatch(reopened, group);
    }
  };

  const handleWithdrawPlayer = (groupId, playerId) => {
    if (!groupId || !playerId) return;
    const winLegs = Math.max(
      1,
      Number(tournamentData?.legsGroup ?? tournamentData?.groupsLegs ?? 2) || 2
    );
    setTournamentData((prev) => {
      if (!prev?.groups) return prev;
      const nextGroups = prev.groups.map((g) => {
        if ((g.groupId ?? g.id) !== groupId) return g;
        return {
          ...g,
          players: (g.players || []).map((p) =>
            (p.id ?? p.name) === playerId ? { ...p, isWithdrawn: true } : p
          ),
        };
      });
      const next = { ...prev, groups: nextGroups };
      try { safeStorage.setItem('dartsTournamentData', JSON.stringify(next)); } catch {}
      return next;
    });

    setTournamentMatches((prev) =>
      (prev || []).map((m) => {
        const mGroup = m.groupId ?? m.group;
        if (mGroup !== groupId) return m;
        if (m.player1Id !== playerId && m.player2Id !== playerId) return m;

        const withdrawnIsP1 = m.player1Id === playerId;
        const winnerId = withdrawnIsP1 ? m.player2Id : m.player1Id;
        const p1Legs = withdrawnIsP1 ? 0 : winLegs;
        const p2Legs = withdrawnIsP1 ? winLegs : 0;

        return {
          ...m,
          status: 'completed',
          winnerId,
          isWalkover: true,
          withdrawnPlayerId: playerId,
          score1: p1Legs,
          score2: p2Legs,
          legsP1: p1Legs,
          legsP2: p2Legs,
          result: {
            ...(m.result || {}),
            p1Legs,
            p2Legs,
          },
          completedAt: m.completedAt ?? Date.now(),
        };
      })
    );
  };

  const handleLogin = async () => { 
      const provider = new GoogleAuthProvider(); 
      provider.setCustomParameters({ prompt: 'select_account' }); 
      try { await signInWithPopup(auth, provider); } catch {} 
  };

  const toggleFullscreen = async () => {
      try {
          if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
          else await document.exitFullscreen();
      } catch {}
  };

  let legOptions = [];
  if (settings.matchMode === 'first_to') {
      legOptions = [1, 2, 3, 4, 5];
  } else {
      legOptions = [3, 5, 7, 9, 11];
  }

  const p1Defaults = ['Domácí', 'Home', 'Gospodarze', translations?.cs?.p1Default, translations?.en?.p1Default, translations?.pl?.p1Default].filter(Boolean);
  const p2Defaults = ['Hosté', 'Away', 'Goście', translations?.cs?.p2Default, translations?.en?.p2Default, translations?.pl?.p2Default].filter(Boolean);

  const restoreDefaultNameIfEmpty = (fieldKey) => {
    setSettings((prev) => {
      const value = String(prev[fieldKey] || '').trim();
      if (value !== '') return prev;
      if (fieldKey === 'p1Name') return { ...prev, p1Name: translations[lang]?.p1Default || 'Domácí' };
      if (fieldKey === 'p2Name')
        return {
          ...prev,
          p2Name: prev.isBot
            ? translations[lang]?.botDefault || 'Robot'
            : translations[lang]?.p2Default || 'Hosté',
        };
      return prev;
    });
  };

  const openNameKeyboard = (fieldKey) => {
    openKeyboard({
      onAppend: (char) =>
        setSettings((s) => ({ ...s, [fieldKey]: String(s[fieldKey] ?? '') + char })),
      onDelete: () =>
        setSettings((s) => ({
          ...s,
          [fieldKey]: String(s[fieldKey] ?? '').slice(0, -1),
        })),
      onClose: () => restoreDefaultNameIfEmpty(fieldKey),
    });
  };

  const beginNameEdit = (fieldKey, afterClear) => {
    if (fieldKey === 'p2Name' && settings.isBot) return;
    const run = () => {
      skipNextNameFocusRef.current = true;
      setSettings((prev) => {
        if (fieldKey === 'p1Name' && p1Defaults.includes(prev.p1Name)) return { ...prev, p1Name: '' };
        if (fieldKey === 'p2Name' && p2Defaults.includes(prev.p2Name)) return { ...prev, p2Name: '' };
        return prev;
      });
      queueMicrotask(() => afterClear?.());
    };
    const isDefaultName =
      (fieldKey === 'p1Name' && p1Defaults.includes(settings.p1Name)) ||
      (fieldKey === 'p2Name' && p2Defaults.includes(settings.p2Name));
    if (user && !user.isAnonymous && isDefaultName) {
      requestConfirm(t('renameConfirm'), run);
      return;
    }
    run();
  };

  const handleNameFieldFocus = (fieldKey, afterClear) => {
    if (skipNextNameFocusRef.current) {
      skipNextNameFocusRef.current = false;
      return;
    }
    beginNameEdit(fieldKey, afterClear);
  };

  const handleNameFieldClick = (fieldKey) => {
    handleNameFieldFocus(fieldKey, () => openNameKeyboard(fieldKey));
  };

  useEffect(() => {
      if (!legOptions.includes(settings.matchTarget)) {
          setSettings(prev => ({ ...prev, matchTarget: legOptions[0] }));
      }
  }, [settings.matchMode]);

  if (appState === 'match_finished' || selectedMatchDetail) {
      const isTournament = !!tournamentMatchContext;
      return (
          <div className="flex flex-col bg-slate-950 text-slate-100 font-sans relative overflow-hidden w-full h-[100dvh]">
              <MatchStatsView
                data={selectedMatchDetail}
                title={t('matchStats')}
                lang={lang}
                isTournamentMode={isTournament}
                onTournamentMatchComplete={isTournament ? async (matchId, resultData) => {
                  const p1Legs = Number(resultData?.p1Legs) || 0;
                  const p2Legs = Number(resultData?.p2Legs) || 0;
                  const ctx = tournamentMatchContextRef.current;
                  if (ctx?.type === 'tablet') {
                    const pin = String(ctx.tabletPin ?? activePin ?? '').trim();
                    const tmt = ctx.tabletMatchType ?? 'group';
                    const bm = ctx.match;
                    const mid = bm?.matchId ?? bm?.id ?? matchId;
                    const winnerId =
                      p1Legs > p2Legs ? bm?.player1Id : p2Legs > p1Legs ? bm?.player2Id : null;

                    const completedPatch = {
                      status: 'completed',
                      winnerId,
                      score: { p1: p1Legs, p2: p2Legs },
                      score1: p1Legs,
                      score2: p2Legs,
                      legsP1: p1Legs,
                      legsP2: p2Legs,
                      p1Avg: resultData?.p1Avg,
                      p2Avg: resultData?.p2Avg,
                      p1DartsTotal: resultData?.p1DartsTotal,
                      p2DartsTotal: resultData?.p2DartsTotal,
                      p1High: resultData?.p1High,
                      p2High: resultData?.p2High,
                      p1HighCheckout: resultData?.p1HighCheckout,
                      p2HighCheckout: resultData?.p2HighCheckout,
                      legDetails: resultData?.legDetails,
                      ...doublesResultExtras(resultData),
                      result: {
                        p1Legs,
                        p2Legs,
                        p1Avg: resultData?.p1Avg,
                        p2Avg: resultData?.p2Avg,
                        p1DartsTotal: resultData?.p1DartsTotal,
                        p2DartsTotal: resultData?.p2DartsTotal,
                        p1High: resultData?.p1High,
                        p2High: resultData?.p2High,
                        p1HighCheckout: resultData?.p1HighCheckout,
                        p2HighCheckout: resultData?.p2HighCheckout,
                        legDetails: resultData?.legDetails,
                        ...doublesResultExtras(resultData),
                      },
                      completedAt: Date.now(),
                      tabletStatus: 'completed',
                    };

                    if (!/^\d{4}$/.test(pin)) {
                      const pinErr = new Error(
                        translations[lang]?.tournamentHub?.enterPin || 'Zadejte PIN turnaje'
                      );
                      console.error('KRITICKÁ CHYBA PŘI ULOŽENÍ ZÁPASU:', pinErr);
                      throw pinErr;
                    }

                    try {
                      await updateCloudMatchFromTablet(
                        pin,
                        tmt === 'bracket' ? 'bracket' : 'group',
                        mid,
                        completedPatch,
                        tabletCloudAuthOpts()
                      );
                    } catch (err) {
                      console.error('KRITICKÁ CHYBA PŘI ULOŽENÍ ZÁPASU:', err);
                      throw err;
                    }

                    if (tmt === 'bracket' && ctx.roundIndex != null && bm?.id != null) {
                      const ri = ctx.roundIndex;
                      const midBracket = bm.id;
                      const freedBoard = bm?.board != null && bm?.board !== '' ? Number(bm.board) : null;
                      const loserId =
                        p1Legs > p2Legs ? bm?.player2Id : p2Legs > p1Legs ? bm?.player1Id : null;
                      const loserName =
                        loserId === bm?.player1Id
                          ? (bm?.player1Name ?? loserId)
                          : loserId === bm?.player2Id
                            ? (bm?.player2Name ?? loserId)
                            : loserId;
                      const loserRef = loserRefereePerson(
                        loserId,
                        loserName,
                        { ...bm, result: { ...(bm?.result || {}), members: resultData?.members } },
                        tournamentData,
                        tournamentGroups
                      );
                      setTournamentBracket((prev) => {
                        const updated = prev.map((round, rIdx) => ({
                          ...round,
                          matches: round.matches.map((m) =>
                            rIdx === ri && m.id === midBracket ? { ...m, ...completedPatch } : m
                          ),
                        }));
                        const propagated = propagateBracketWinners(updated);
                        const roundMatches = propagated?.[ri]?.matches || [];
                        const waiting = roundMatches.find(
                          (m) =>
                            m &&
                            m.status === 'pending' &&
                            m.board == null &&
                            m.referee == null &&
                            !m.isBye &&
                            m.player1Id != null &&
                            m.player2Id != null
                        );
                        if (waiting && freedBoard != null && Number.isFinite(freedBoard) && freedBoard >= 1) {
                          waiting.board = freedBoard;
                          if (loserRef) waiting.referee = loserRef;
                        }
                        return propagated;
                      });
                    } else {
                      setTournamentMatches((prev) =>
                        prev.map((m) =>
                          (m.matchId && String(m.matchId) === String(mid)) ||
                          (!m.matchId &&
                            m.groupId === bm?.groupId &&
                            m.player1Id === bm?.player1Id &&
                            m.player2Id === bm?.player2Id)
                            ? { ...m, ...completedPatch }
                            : m
                        )
                      );
                    }

                    if (typeof window.__onTournamentMatchComplete === 'function') {
                      window.__onTournamentMatchComplete(matchId, resultData);
                    }
                    setTournamentMatchContext(null);
                    setMatchFinishRestoreState(null);
                    setSelectedMatchDetail(null);
                    setAppState('tournament_tablet');
                    return;
                  }
                  if (ctx?.type === 'bracket' && ctx.match?.id != null && ctx.roundIndex != null) {
                    const ri = ctx.roundIndex;
                    const mid = ctx.match.id;
                    const bm = ctx.match;
                    let winnerId = null;
                    if (p1Legs > p2Legs) winnerId = bm.player1Id;
                    else if (p2Legs > p1Legs) winnerId = bm.player2Id;
                    const freedBoard =
                      bm?.board != null && bm?.board !== '' ? Number(bm.board) : null;
                    const loserId =
                      p1Legs > p2Legs ? bm?.player2Id : p2Legs > p1Legs ? bm?.player1Id : null;
                    const loserName =
                      loserId === bm?.player1Id
                        ? (bm?.player1Name ?? loserId)
                        : loserId === bm?.player2Id
                          ? (bm?.player2Name ?? loserId)
                          : loserId;
                    const loserRef = loserRefereePerson(
                      loserId,
                      loserName,
                      { ...bm, result: { ...(bm?.result || {}), members: resultData?.members } },
                      tournamentData,
                      tournamentGroups
                    );
                    setTournamentBracket((prev) => {
                      const updated = prev.map((round, rIdx) => ({
                        ...round,
                        matches: round.matches.map((m) =>
                          rIdx === ri && m.id === mid
                            ? {
                                ...m,
                                status: 'completed',
                                winnerId,
                                score: { p1: p1Legs, p2: p2Legs },
                                p1Avg: resultData?.p1Avg,
                                p2Avg: resultData?.p2Avg,
                                p1DartsTotal: resultData?.p1DartsTotal,
                                p2DartsTotal: resultData?.p2DartsTotal,
                                p1High: resultData?.p1High,
                                p2High: resultData?.p2High,
                                p1HighCheckout: resultData?.p1HighCheckout,
                                p2HighCheckout: resultData?.p2HighCheckout,
                                legDetails: resultData?.legDetails,
                                ...doublesResultExtras(resultData),
                                result: {
                                  p1Legs,
                                  p2Legs,
                                  p1Avg: resultData?.p1Avg,
                                  p2Avg: resultData?.p2Avg,
                                  p1DartsTotal: resultData?.p1DartsTotal,
                                  p2DartsTotal: resultData?.p2DartsTotal,
                                  p1High: resultData?.p1High,
                                  p2High: resultData?.p2High,
                                  p1HighCheckout: resultData?.p1HighCheckout,
                                  p2HighCheckout: resultData?.p2HighCheckout,
                                  legDetails: resultData?.legDetails,
                                  ...doublesResultExtras(resultData),
                                },
                              }
                            : m
                        ),
                      }));
                      const propagated = propagateBracketWinners(updated);
                      const roundMatches = propagated?.[ri]?.matches || [];
                      const waiting = roundMatches.find(
                        (m) =>
                          m &&
                          m.status === 'pending' &&
                          m.board == null &&
                          m.referee == null &&
                          !m.isBye &&
                          m.player1Id != null &&
                          m.player2Id != null
                      );
                      if (waiting && freedBoard != null && Number.isFinite(freedBoard) && freedBoard >= 1) {
                        waiting.board = freedBoard;
                        if (loserRef) waiting.referee = loserRef;
                      }
                      return propagated;
                    });
                    if (typeof window.__onTournamentMatchComplete === 'function') {
                      window.__onTournamentMatchComplete(matchId, resultData);
                    }
                    setTournamentMatchContext(null);
                    setMatchFinishRestoreState(null);
                    setSelectedMatchDetail(null);
                    setAppState('tournament_bracket');
                    return;
                  }
                  setTournamentMatches((prev) =>
                    prev.map((m) =>
                      (
                        (m.matchId && m.matchId === matchId) ||
                        (!m.matchId &&
                          m.groupId === tournamentMatchContext?.match?.groupId &&
                          m.player1Id === tournamentMatchContext?.match?.player1Id &&
                          m.player2Id === tournamentMatchContext?.match?.player2Id)
                      )
                        ? {
                            ...m,
                            status: 'completed',
                            p1Avg: resultData?.p1Avg,
                            p2Avg: resultData?.p2Avg,
                            p1DartsTotal: resultData?.p1DartsTotal,
                            p2DartsTotal: resultData?.p2DartsTotal,
                            p1High: resultData?.p1High,
                            p2High: resultData?.p2High,
                            p1HighCheckout: resultData?.p1HighCheckout,
                            p2HighCheckout: resultData?.p2HighCheckout,
                            legDetails: resultData?.legDetails,
                            ...doublesResultExtras(resultData),
                            result: {
                              p1Legs,
                              p2Legs,
                              p1Avg: resultData?.p1Avg,
                              p2Avg: resultData?.p2Avg,
                              p1DartsTotal: resultData?.p1DartsTotal,
                              p2DartsTotal: resultData?.p2DartsTotal,
                              p1High: resultData?.p1High,
                              p2High: resultData?.p2High,
                              p1HighCheckout: resultData?.p1HighCheckout,
                              p2HighCheckout: resultData?.p2HighCheckout,
                              legDetails: resultData?.legDetails,
                              ...doublesResultExtras(resultData),
                            },
                            completedAt: Date.now(),
                          }
                        : m
                    )
                  );
                  if (typeof window.__onTournamentMatchComplete === 'function') {
                    window.__onTournamentMatchComplete(matchId, resultData);
                  }
                  setTournamentMatchContext(null);
                  setMatchFinishRestoreState(null);
                  setSelectedMatchDetail(null);
                  setAppState('tournament_groups');
                } : undefined}
                onUndoAndResume={isTournament ? () => {
                  setSelectedMatchDetail(null);
                  setAppState('playing');
                } : undefined}
                onStartMatch={() => {
                  setMatchFinishRestoreState(null);
                  setSelectedMatchDetail(null);
                  setTournamentMatchContext(null);
                  setAppState('playing');
                }}
                onBack={() => {
                  if (appState !== 'match_finished') {
                    setSelectedMatchDetail(null);
                    return;
                  }
                  if (matchFinishRestoreState && selectedMatchDetail?.id && !isTournament) {
                    setMatchHistory(prev => prev.filter(m => m.id !== selectedMatchDetail.id));
                  }
                  const wasBracket = tournamentMatchContextRef.current?.type === 'bracket';
                  const wasTablet = tournamentMatchContextRef.current?.type === 'tablet';
                  const returnToPlayingWithRestore = Boolean(matchFinishRestoreState);
                  const keepTournamentCtx = returnToPlayingWithRestore && isTournament;
                  setSelectedMatchDetail(null);
                  if (!keepTournamentCtx) {
                    setTournamentMatchContext(null);
                  }
                  setAppState(
                    returnToPlayingWithRestore
                      ? 'playing'
                      : isTournament
                        ? wasTablet
                          ? 'tournament_tablet'
                          : wasBracket
                            ? 'tournament_bracket'
                            : 'tournament_groups'
                        : 'setup'
                  );
                }}
                onClose={() => {
                  if (appState !== 'match_finished') {
                    setSelectedMatchDetail(null);
                    return;
                  }
                  const wasBracket = tournamentMatchContextRef.current?.type === 'bracket';
                  const wasTablet = tournamentMatchContextRef.current?.type === 'tablet';
                  setMatchFinishRestoreState(null);
                  setSelectedMatchDetail(null);
                  setTournamentMatchContext(null);
                  setParkedSession(null);
                  if (isTournament && tournamentData) {
                    setParkedSession({
                      kind: 'tournament',
                      returnAppState: wasTablet
                        ? 'tournament_tablet'
                        : wasBracket
                          ? 'tournament_bracket'
                          : 'tournament_groups',
                      returnSetupStep: tournamentSetupStep,
                      userRole,
                      title: tournamentData?.name || tournamentData?.tournamentName || undefined,
                    });
                  }
                  setAppState('home');
                  setHomeSubmenu(null);
                }}
              />
          </div>
      );
  }

  const matchParkedKept =
    parkedSession?.kind === 'match' && parkedSession.mountKept === true;
  const showPlayingVisible = appState === 'playing';
  const mountMatchSurface = showPlayingVisible || matchParkedKept;

  let matchSurfaceNode = null;
  if (mountMatchSurface) {
      const isTournamentPlaying = !!tournamentMatchContext;
      matchSurfaceNode = (
          <div
            className={`bg-slate-950 text-slate-100 font-sans flex flex-col relative w-full h-[100dvh] overflow-hidden ${
              showPlayingVisible ? '' : 'hidden'
            }`}
            aria-hidden={!showPlayingVisible}
          >
              {showTournamentPinBar && (
                  <div className="shrink-0 w-full z-[5000] bg-slate-950 border-b border-slate-800 text-slate-300 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] flex flex-wrap justify-between items-center text-sm gap-x-2 gap-y-1">
                      <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 flex-1">
                      {userRole === 'tablet' && tournamentMatchContext?.type === 'tablet' ? (
                        <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-x-2 text-[11px] sm:text-sm leading-tight pr-1">
                          <span className="truncate font-semibold text-slate-200">{pinBarTitle}</span>
                          <span className="hidden sm:inline text-slate-600 shrink-0">|</span>
                          <span className="truncate text-slate-400">
                            {t('tournBoard') || 'Terč'} {String(tabletBoardStr || '—').trim() || '—'}
                          </span>
                        </div>
                      ) : (
                        <span className="truncate pr-2 min-w-0">🏆 {pinBarTitle}</span>
                      )}
                      {tournamentPinEndEstimate}
                      </div>
                      <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                        <span className="text-slate-500 hidden sm:inline">PIN:</span>
                        {adminPinBarRevealable ? (
                          <button
                            type="button"
                            onClick={() => setAdminPinBarShowTabletPassword((v) => !v)}
                            className="text-2xl font-black text-yellow-400 tracking-widest font-mono tabular-nums rounded-lg px-1 -mx-1 hover:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                            title={t('tournPinTapShowPassword')}
                            aria-expanded={adminPinBarShowTabletPassword}
                          >
                            {pinBarDisplayCode}
                          </button>
                        ) : (
                          <span className="text-2xl font-black text-yellow-400 tracking-widest font-mono tabular-nums">
                            {pinBarDisplayCode}
                          </span>
                        )}
                        {adminPinBarRevealable && adminPinBarShowTabletPassword && (
                          <span className="text-xs sm:text-sm font-mono font-bold text-amber-300 tracking-wide max-w-[min(100%,12rem)] break-all">
                            {t('tournTabletPassword')}: {pinBarTabletPw}
                          </span>
                        )}
                        {userRole === 'admin' && (
                        <button
                          type="button"
                          onClick={handleEndTournament}
                          className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-red-400 hover:text-red-300 px-2 py-1.5 rounded-lg border border-red-500/40 hover:bg-red-950/60 whitespace-nowrap"
                        >
                          {t('tournEndTournament') || 'Ukončit turnaj'}
                        </button>
                        )}
                        {(userRole === 'viewer' || userRole === 'tablet') && (
                          <button
                            type="button"
                            onClick={handleSpectatorDisconnect}
                            title={t('tournamentHub.disconnect') || 'Odpojit'}
                            className="flex items-center gap-1 text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white px-2 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Unplug className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                            <span className="hidden sm:inline">{t('tournamentHub.disconnect') || 'Odpojit'}</span>
                          </button>
                        )}
                      </div>
                  </div>
              )}
              <header className="relative z-20 flex items-center justify-between px-4 py-3 border-b bg-slate-900 border-slate-800 shrink-0">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPauseMenuOpen(true)}
                      className="p-2 transition-colors rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-300"
                      aria-label={t('navPause') || 'Pauza'}
                      title={t('navPause') || 'Pauza'}
                    >
                      <Pause className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex flex-col items-center">
                      <div className="flex items-center gap-2 text-[10px] sm:text-xs font-black tracking-[0.3em] uppercase">
                          <span className="text-slate-500">
                              {settings.gameType === 'cricket' ? 'CRICKET' : `${settings.startScore} ${settings.outMode === 'double' ? 'DO' : 'SO'}`}
                          </span>
                          <span className="text-slate-700">/</span>
                          <div className="flex items-center gap-1">
                              <span className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.4)]">
                                  {settings.matchMode === 'first_to' ? t('firstTo') : t('bestOf')}
                              </span>
                              <span className="text-white">{settings.matchTarget}</span>
                          </div>
                          <span className="text-slate-700">/</span>
                          <div className="flex items-center gap-1">
                              <span className="text-emerald-400">{settings.matchSets || 1}</span>
                              <span className="text-slate-500">{(settings.matchSets || 1) === 1 ? (t('setSingular') || 'Set') : (t('setPlural') || 'Sety')}</span>
                          </div>
                      </div>
                  </div>
                  <div className="flex items-center gap-2">
                      <button onClick={toggleFullscreen} className="p-2 transition-colors rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700">
                          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                      </button>
                      <div className="flex p-1 border rounded-lg bg-slate-800 border-slate-700">
                          {['cs','en','pl'].map(l=><button key={l} onClick={()=>setLang(l)} className={`p-1 rounded transition-all ${lang===l?'bg-slate-600 opacity-100 shadow-sm':'opacity-40 grayscale'}`}><FlagIcon lang={l} /></button>)}
                      </div>
                  </div>
              </header>
              {settings.gameType === 'x01' || settings.doubles ? (
                  <GameX01
                    settings={settings}
                    lang={lang}
                    isLandscape={isLandscape}
                    isPC={isPC}
                    tabletPresence={
                      userRole === 'tablet' && tournamentMatchContext?.type === 'tablet'
                        ? tabletPresence
                        : null
                    }
                    onlineGameId={onlineGameId || undefined}
                    myOnlineRole={myOnlineRole || undefined}
                    onlineLocalStream={onlineLocalStream || undefined}
                    skipOnlineInitialSeedGameId={skipOnlineInitialSeedGameId || undefined}
                    requestConfirm={requestConfirm}
                    onOnlineDocStartPlayer={syncOnlineDocStartPlayer}
                    onAbort={
                      isTournamentPlaying
                        ? () => {
                            const ctx = tournamentMatchContextRef.current;
                            clearPlayingTournamentMatchWithoutResult();
                            setTournamentMatchContext(null);
                            setAppState(
                              ctx?.type === 'bracket'
                                ? 'tournament_bracket'
                                : ctx?.type === 'tablet'
                                  ? 'tournament_tablet'
                                  : 'tournament_groups'
                            );
                          }
                        : () => {
                            if (onlineGameId) {
                              handleOnlineSessionEnded();
                              return;
                            }
                            setAppState('setup');
                          }
                    }
                    onMatchComplete={handleMatchComplete}
                    onOnlineSessionEnded={handleOnlineSessionEnded}
                    onOnlinePeerAbandoned={handleOnlinePeerAbandonedMatch}
                    restoredGameState={matchFinishRestoreState}
                    onRestoredConsumed={() => setMatchFinishRestoreState(null)}
                  />
              ) : (
                  <GameCricket
                    settings={settings}
                    lang={lang}
                    isLandscape={isLandscape}
                    isPC={isPC}
                    onlineGameId={onlineGameId || undefined}
                    onAbort={
                      isTournamentPlaying
                        ? () => {
                            const ctx = tournamentMatchContextRef.current;
                            clearPlayingTournamentMatchWithoutResult();
                            setTournamentMatchContext(null);
                            setAppState(
                              ctx?.type === 'bracket'
                                ? 'tournament_bracket'
                                : ctx?.type === 'tablet'
                                  ? 'tournament_tablet'
                                  : 'tournament_groups'
                            );
                          }
                        : () => {
                            if (onlineGameId) {
                              handleOnlineSessionEnded();
                              return;
                            }
                            setAppState('setup');
                          }
                    }
                    onMatchComplete={handleMatchComplete}
                    myOnlineRole={myOnlineRole || undefined}
                    onOnlinePeerAbandoned={handleOnlinePeerAbandonedMatch}
                  />
              )}
          </div>
      );
  }

  if (showPlayingVisible) {
    const isTournamentPlaying = !!tournamentMatchContext;
    const pauseActions = [];
    pauseActions.push({
      id: 'resume',
      label: t('navResumePlay') || 'Pokračovat ve hře',
      icon: 'play',
      variant: 'primary',
      onClick: () => setPauseMenuOpen(false),
    });
    if (onlineGameId) {
      pauseActions.push({
        id: 'exitOnline',
        label: t('onlineExitMatchTitle') || 'Opustit zápas',
        icon: 'exit',
        variant: 'danger',
        onClick: () => {
          setPauseMenuOpen(false);
          handleOnlineExitMatchRequest();
        },
      });
    } else if (isTournamentPlaying) {
      pauseActions.push({
        id: 'backBoard',
        label: t('navBackToTournament') || 'Zpět na turnaj',
        icon: 'settings',
        variant: 'default',
        onClick: leavePlayingToTournamentBoard,
      });
      pauseActions.push({
        id: 'home',
        label: t('navHome') || 'Domů',
        icon: 'home',
        variant: 'default',
        onClick: goHomeFromNav,
      });
    } else {
      pauseActions.push({
        id: 'setup',
        label: t('navEditSetup') || 'Upravit nastavení / Zrušit zápas',
        icon: 'settings',
        variant: 'default',
        onClick: leavePlayingToSetup,
      });
      pauseActions.push({
        id: 'home',
        label: t('navHome') || 'Domů',
        icon: 'home',
        variant: 'default',
        onClick: goHomeFromNav,
      });
    }

    return (
      <>
        {matchSurfaceNode}
        <PauseMenuOverlay
          open={pauseMenuOpen}
          onClose={() => setPauseMenuOpen(false)}
          title={t('navPause') || 'Pauza'}
          actions={pauseActions}
        />
      </>
    );
  }

  return (
    <div className="bg-slate-950 text-slate-100 font-sans flex flex-col relative w-full h-[100dvh] overflow-hidden">
      {matchSurfaceNode}
      {showTournamentPinBar && (
        <div className="shrink-0 w-full z-[5000] bg-slate-950 border-b border-slate-800 text-slate-300 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] flex flex-wrap justify-between items-center text-sm gap-x-2 gap-y-1">
          <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 flex-1">
          {userRole === 'tablet' && appState === 'tournament_tablet' ? (
            <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-x-2 text-[11px] sm:text-sm leading-tight pr-1">
              <span className="truncate font-semibold text-slate-200">{pinBarTitle}</span>
              <span className="hidden sm:inline text-slate-600 shrink-0">|</span>
              <span className="truncate text-slate-400">
                {t('tournBoard') || 'Terč'} {String(tabletBoardStr || '—').trim() || '—'}
              </span>
            </div>
          ) : (
            <span className="truncate pr-2 min-w-0">🏆 {pinBarTitle}</span>
          )}
          {tournamentPinEndEstimate}
          </div>
          <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
            <span className="text-slate-500 hidden sm:inline">PIN:</span>
            {adminPinBarRevealable ? (
              <button
                type="button"
                onClick={() => setAdminPinBarShowTabletPassword((v) => !v)}
                className="text-2xl font-black text-yellow-400 tracking-widest font-mono tabular-nums rounded-lg px-1 -mx-1 hover:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                title={t('tournPinTapShowPassword')}
                aria-expanded={adminPinBarShowTabletPassword}
              >
                {pinBarDisplayCode}
              </button>
            ) : (
              <span className="text-2xl font-black text-yellow-400 tracking-widest font-mono tabular-nums">
                {pinBarDisplayCode}
              </span>
            )}
            {adminPinBarRevealable && adminPinBarShowTabletPassword && (
              <span className="text-xs sm:text-sm font-mono font-bold text-amber-300 tracking-wide max-w-[min(100%,12rem)] break-all">
                {t('tournTabletPassword')}: {pinBarTabletPw}
              </span>
            )}
            {userRole === 'admin' && (
            <button
              type="button"
              onClick={handleEndTournament}
              className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-red-400 hover:text-red-300 px-2 py-1.5 rounded-lg border border-red-500/40 hover:bg-red-950/60 whitespace-nowrap"
            >
              {t('tournEndTournament') || 'Ukončit turnaj'}
            </button>
            )}
            {(userRole === 'viewer' || userRole === 'tablet') && (
              <button
                type="button"
                onClick={handleSpectatorDisconnect}
                title={t('tournamentHub.disconnect') || 'Odpojit'}
                className="flex items-center gap-1 text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white px-2 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 whitespace-nowrap"
              >
                <Unplug className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden sm:inline">{t('tournamentHub.disconnect') || 'Odpojit'}</span>
              </button>
            )}
          </div>
        </div>
      )}
      <AppNavBar
        showBack={navResolved.showBack}
        showHome={navResolved.showHome}
        onBack={() => handleNavBackTarget(navResolved.backTarget)}
        onHome={goHomeFromNav}
        backLabel={t('navBack') || t('tournBack') || 'Zpět'}
        homeLabel={t('navHome') || 'Domů'}
        leftExtra={
          appState === 'home' ? (
            <div className="text-[10px] font-mono text-slate-500 border border-slate-800 rounded px-1.5 py-0.5">
              {APP_VERSION}
            </div>
          ) : null
        }
        right={
          <>
            {showTabletQrNav ? (
              <>
                <a
                  href={buildVenueDisplayUrl(activePin, undefined, lang)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-amber-400 hover:text-amber-300 hover:bg-slate-700 transition-colors"
                  title={t('venueTvOpen') || 'TV obrazovka haly'}
                  aria-label={t('venueTvOpen') || 'TV obrazovka haly'}
                >
                  <Monitor className="w-4 h-4" />
                </a>
                <TabletBoardQrPanel
                  lang={lang}
                  pin={activePin}
                  tournamentData={tournamentData}
                  onNotify={showNotification}
                  onEnsureTokens={handleEnsureBoardAuthTokens}
                  compact
                />
              </>
            ) : null}
            <button
              onClick={toggleFullscreen}
              className="p-2 transition-colors rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
            <div className="flex p-1 border rounded-lg bg-slate-800 border-slate-700">
              {['cs', 'en', 'pl'].map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`p-1 rounded transition-all ${
                    lang === l ? 'bg-slate-600 opacity-100 shadow-sm' : 'opacity-40 grayscale'
                  }`}
                >
                  <FlagIcon lang={l} />
                </button>
              ))}
            </div>
          </>
        }
      />
      {appState === 'home' && (
        <ActiveSessionBanner
          session={parkedSession}
          onResume={resumeParkedSession}
          onDismiss={dismissParkedSession}
          resumeLabel={
            parkedSession?.kind === 'tournament'
              ? t('navResumeTournament') || 'Vstoupit do administrace turnaje'
              : t('navResumeMatch') || 'Pokračovat v zápase'
          }
          dismissLabel={t('close') || 'Zavřít'}
        />
      )}
      {showTournamentStepper && (
        <nav className="flex overflow-x-auto whitespace-nowrap bg-slate-900 p-2 sm:p-3 text-sm font-semibold border-b border-slate-800 shrink-0 gap-1">
          {(userRole === 'viewer'
            ? [
                [5, t('stepperSkupiny') || '5. Skupiny'],
                [6, t('stepperPavouk') || '6. Pavouk'],
                [7, t('stepperStatistiky') || '7. Statistiky'],
              ]
            : [
                [1, t('stepperTurnaj') || '1. Turnaj'],
                [2, t('stepperHraci') || '2. Hráči'],
                [3, t('stepperFormat') || '3. Formát'],
                [4, t('stepperTerce') || '4. Terče'],
                [5, t('stepperSkupiny') || '5. Skupiny'],
                [6, t('stepperPavouk') || '6. Pavouk'],
                [7, t('stepperStatistiky') || '7. Statistiky'],
              ]
          ).map(([num, label]) => {
            const n = Number(num);
            const isCurrent = n === currentStepperStep;
            const isLocked = userRole === 'admin' && n <= 3 && isTournamentLive;
            const clickable = canNavigateToStep(n) && !isLocked;
            let stepClass =
              'mx-0.5 first:ml-0 last:mr-0 px-3 py-2 min-h-[44px] rounded-lg transition-colors shrink-0 inline-flex items-center gap-1.5 ';
            if (!clickable) {
              stepClass += 'text-slate-500 cursor-not-allowed opacity-60';
            } else if (isCurrent) {
              stepClass += 'text-emerald-400 bg-emerald-950/50 ring-1 ring-emerald-500/40 cursor-pointer';
            } else {
              stepClass += 'text-slate-300 cursor-pointer hover:text-white hover:bg-slate-800';
            }
            return (
              <button
                key={n}
                type="button"
                onClick={() => handleStepperClick(n)}
                disabled={!clickable}
                aria-current={isCurrent ? 'step' : undefined}
                title={isLocked ? t('stepperLockedHint') || 'Turnaj už běží — krok je uzamčen' : undefined}
                className={stepClass}
              >
                {isLocked && <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />}
                {label}
              </button>
            );
          })}
        </nav>
      )}
      {showAdminTabletPresentationTimeoutBanner && (
        <div
          className="shrink-0 z-[2500] w-full border-b-2 border-red-600 bg-gradient-to-r from-red-950 via-red-900 to-amber-950 px-3 py-3 sm:px-4 sm:py-3.5 shadow-lg shadow-black/40"
          role="alert"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <AlertTriangle className="mt-0.5 h-8 w-8 shrink-0 text-amber-300 sm:h-9 sm:w-9" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-wide text-amber-200 sm:text-base">
                  {t('adminTabletPresentationTimeoutTitle')}
                </p>
                <p className="mt-1 text-xs font-semibold leading-snug text-red-100/95 sm:text-sm">
                  {t('adminTabletPresentationTimeoutLead')}
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1.5 text-xs font-bold text-white sm:text-sm">
                  {adminTabletTimeoutPending.map((e) => {
                    const boardPart =
                      e.board != null && e.board !== ''
                        ? String(t('adminTabletPresentationTimeoutBoard')).replace('{n}', String(e.board))
                        : '';
                    const missing =
                      Array.isArray(e.missingNames) && e.missingNames.length > 0
                        ? e.missingNames.join(', ')
                        : '—';
                    const warnLabel = String(t('adminTabletPresentationTimeoutWarnLevel'))
                      .replace('{n}', String(e.warningCount || 1))
                      .replace('{max}', String(TABLET_CHECKIN_MAX_WARNINGS));
                    let whereLabel = '';
                    if (e.phaseKey === 'group') {
                      whereLabel = e.groupLabel || t('adminTabletPresentationTimeoutGroup');
                    } else {
                      const rk = String(t('adminTabletPresentationTimeoutRound')).replace(
                        '{n}',
                        String((e.roundIndex ?? 0) + 1)
                      );
                      whereLabel = `${t('adminTabletPresentationTimeoutBracket')} (${rk})`;
                    }
                    return (
                      <li key={e.key} className="leading-snug">
                        <span>
                          {warnLabel}
                          {' · '}
                          {whereLabel}
                          {boardPart ? ` · ${boardPart}` : ''}
                          {': '}
                          {e.label}
                        </span>
                        <span className="mt-0.5 block font-semibold text-amber-100/95 list-none pl-0">
                          {t('adminTabletPresentationTimeoutMissing')}: {missing}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const pending = adminTabletTimeoutPending;
                if (pending.length === 0) return;
                const lines = pending.map((e) => {
                  const boardPart =
                    e.board != null && e.board !== ''
                      ? ` · ${String(t('adminTabletPresentationTimeoutBoard')).replace('{n}', String(e.board))}`
                      : '';
                  const missing =
                    Array.isArray(e.missingNames) && e.missingNames.length > 0
                      ? e.missingNames.join(', ')
                      : '—';
                  const warnLabel = String(t('adminTabletPresentationTimeoutWarnLevel'))
                    .replace('{n}', String(e.warningCount || 1))
                    .replace('{max}', String(TABLET_CHECKIN_MAX_WARNINGS));
                  let whereLabel = '';
                  if (e.phaseKey === 'group') {
                    whereLabel = e.groupLabel || t('adminTabletPresentationTimeoutGroup');
                  } else {
                    const rk = String(t('adminTabletPresentationTimeoutRound')).replace(
                      '{n}',
                      String((e.roundIndex ?? 0) + 1)
                    );
                    whereLabel = `${t('adminTabletPresentationTimeoutBracket')} (${rk})`;
                  }
                  const nextSec = checkInSecondsAfterWarningAck(e.warningCount || 1);
                  const nextHint =
                    nextSec != null
                      ? String(t('adminTabletPresentationTimeoutNextTimer')).replace(
                          '{sec}',
                          String(nextSec)
                        )
                      : t('adminTabletPresentationTimeoutNoMoreTimer');
                  return `• ${warnLabel} · ${whereLabel}${boardPart}: ${e.label}\n  ${t('adminTabletPresentationTimeoutMissing')}: ${missing}\n  ${nextHint}`;
                });
                const msg = `${t('adminTabletPresentationTimeoutConfirmBody')}\n\n${lines.join('\n')}`;
                requestConfirm(
                  msg,
                  () => {
                    acknowledgeAdminTabletTimeoutWarnings();
                  },
                  {
                    title: t('adminTabletPresentationTimeoutConfirmTitle'),
                    confirmLabel: t('confirmAction') || 'Potvrdit',
                    cancelLabel: t('cancel') || 'Zrušit',
                  }
                );
              }}
              className="w-full shrink-0 rounded-xl border-2 border-amber-400/80 bg-amber-500 px-4 py-3 text-center text-sm font-black uppercase tracking-wider text-slate-950 shadow-md transition hover:bg-amber-400 sm:w-auto sm:min-w-[12rem]"
            >
              {t('adminTabletPresentationTimeoutAckButton')}
            </button>
          </div>
        </div>
      )}
      {showSyncPrompt && (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl text-center">
            <Cloud className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Záloha zápasů</h3>
            <p className="text-slate-400 text-sm mb-6">
                Našli jsme nepřihlášené lokální zápasy ({matchHistory.filter(m => !m.synced && !m.p1Id).length}). Chcete je nyní nahrát a trvale zálohovat pod svým účtem?
            </p>
            <div className="flex gap-3">
                <button 
                    onClick={() => setShowSyncPrompt(false)} 
                    className="flex-1 py-3 rounded-xl font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                    Ignorovat
                </button>
                <button 
                    onClick={handleSyncOfflineMatches} 
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20"
                >
                    Zálohovat
                </button>
            </div>
        </div>
    </div>
)}
      {showCustomFormat && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-sm p-5 border shadow-2xl bg-slate-900 border-slate-700 rounded-2xl">
                <h3 className="mb-4 text-sm font-black tracking-widest text-center text-white uppercase">{t('matchFormat')}</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-800 border-slate-700">
                        <span className="text-xs font-bold text-slate-300">{t('sets') || 'Sety'}</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCustomSetsValue(v => Math.max(1, v - 1))} className="w-8 h-8 font-black text-white rounded bg-slate-700">-</button>
                            <span className="w-8 text-center font-mono font-black text-emerald-400">{customSetsValue}</span>
                            <button onClick={() => setCustomSetsValue(v => Math.min(9, v + 1))} className="w-8 h-8 font-black text-white rounded bg-slate-700">+</button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-800 border-slate-700">
                        <span className="text-xs font-bold text-slate-300">{t('legsPerSet') || 'Legy / set'}</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCustomLegsValue(v => Math.max(1, v - 1))} className="w-8 h-8 font-black text-white rounded bg-slate-700">-</button>
                            <span className="w-8 text-center font-mono font-black text-emerald-400">{customLegsValue}</span>
                            <button onClick={() => setCustomLegsValue(v => Math.min(21, v + 1))} className="w-8 h-8 font-black text-white rounded bg-slate-700">+</button>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-5">
                    <button onClick={() => setShowCustomFormat(false)} className="py-2 text-xs font-bold rounded-lg bg-slate-800 text-slate-400">{t('cancel')}</button>
                    <button
                        onClick={() => {
                            setSettings(prev => ({ ...prev, matchSets: customSetsValue, matchTarget: customLegsValue }));
                            setShowCustomFormat(false);
                        }}
                        className="py-2 text-xs font-bold text-white rounded-lg bg-emerald-600"
                    >
                        {t('saveFormat') || 'Uložit formát'}
                    </button>
                </div>
            </div>
        </div>
      )}
      {/* --- HOME --- */}
      {appState === 'home' && (
        <main
          className={`mx-auto flex w-full flex-1 p-4 sm:p-6 lg:max-w-6xl xl:max-w-7xl ${
            homeSubmenu === 'online'
              ? 'min-h-0 max-w-2xl flex-col items-stretch justify-start overflow-hidden md:max-w-3xl'
              : 'max-w-md flex-col items-center justify-center gap-6 overflow-y-auto md:max-w-4xl md:grid md:grid-cols-2 md:gap-10 lg:gap-12'
          }`}
        >
            {homeSubmenu === 'online' ? (
              <HomeOnlineSubmenu
                t={t}
                onBack={() => setHomeSubmenu(null)}
                settings={settings}
                onOnlineGameStart={handleOnlineGameStart}
                resumeHostWaitingSession={onlineHostResumeWaitingSession}
                onResumeHostWaitingConsumed={consumeOnlineHostResume}
              />
            ) : (
              <>
                {/* Levý sloupec: logo, Nová hra, Google / profil */}
                <div className="flex flex-col w-full gap-4 md:gap-6 items-center">
                    <div className="flex flex-col items-center mb-1">
                        <div className="flex items-center justify-center w-20 h-20 mb-3 rounded-full shadow-lg bg-emerald-600 shadow-emerald-900/50">
                            <Target className="w-10 h-10 text-slate-900" />
                        </div>
                        <h1 className="text-3xl font-black leading-none tracking-widest text-white">SIMPLE DART</h1>
                        <h2 className="mt-1 text-sm font-bold tracking-widest text-emerald-500">COUNTER</h2>
                    </div>

                    <button
                      onClick={() => setAppState('setup')}
                      className="flex justify-center w-full gap-3 py-4 text-xl font-black text-white transition-transform shadow-lg bg-emerald-600 hover:bg-emerald-500 rounded-2xl active:scale-95"
                    >
                      <Play className="fill-current w-7 h-7" /> {t('newGame')}
                    </button>

                    {(!user || user.isAnonymous) ? (
                        <button onClick={handleLogin} className="flex items-center justify-center w-full gap-3 p-3 mt-2 transition-transform border shadow-md bg-slate-900 hover:bg-slate-800 border-slate-700 rounded-xl active:scale-95 md:mt-0">
                            <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            <span className="text-xs font-bold tracking-widest uppercase text-slate-300">{t('loginWithGoogle') || 'Přihlásit přes Google'}</span>
                        </button>
                    ) : (
                        <div className="flex items-center justify-between w-full p-3 mt-2 border shadow-md bg-slate-900 border-slate-700 rounded-xl md:mt-0">
                            <div className="flex flex-col min-w-0 pr-2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Přihlášen jako:</span>
                                <div className="flex items-center gap-1.5 text-slate-300">
                                    <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <span className="text-xs font-bold truncate">{user.email}</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    signOut(auth);
                                    setSettings(prev => ({
                                        ...prev,
                                        p1Name: translations[lang]?.p1Default || 'Domácí',
                                        p1Id: null
                                    }));
                                }} 
                                className="shrink-0 bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-400 text-[10px] uppercase font-bold tracking-widest px-3 py-2 rounded-lg transition-colors"
                            >
                                {t('logout') || 'Odhlásit'}
                            </button>
                        </div>
                    )}
                </div>
                {/* Pravý sloupec: doplňková tlačítka */}
                <div className="grid grid-cols-2 gap-3 w-full">
                    <button onClick={() => setAppState('tutorial')} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><FileText className="w-7 h-7 text-emerald-400" /><span className="text-sm font-bold text-white">{t('tutorial')}</span></button>
                    <button onClick={() => setAppState('history')} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><History className="text-blue-400 w-7 h-7" /><span className="text-sm font-bold text-white">{t('matchHistory')}</span></button>
                    <button onClick={handleOpenTournamentEntry} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><Swords className="w-7 h-7 text-amber-400" /><span className="text-sm font-bold text-white">{t('tournament')}</span></button>
                    <button onClick={() => setAppState('profile')} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><BarChart2 className="text-purple-400 w-7 h-7" /><span className="text-sm">{t('statsPersonal')}</span></button>
                    <HomeOnlineMenuTile t={t} onOpen={() => setHomeSubmenu('online')} />
                    <button onClick={() => setAppState('about')} className="flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95"><Info className="text-yellow-400 w-7 h-7" /><span className="text-sm font-bold text-white">{t('aboutApp')}</span></button>
                </div>
              </>
            )}
        </main>
      )}

      {/* --- TOURNAMENT SETUP --- */}
      {appState === 'tournament_hub' && (
        <TournamentHub
          lang={lang}
          onChooseAdmin={handleTournamentHubAdmin}
          onTabletJoin={handleTournamentHubTabletJoin}
          onViewerJoin={handleTournamentHubViewerJoin}
          onOpenHistory={handleTournamentHubHistory}
          onOpenPreReg={handleTournamentHubPreReg}
          onOpenCatalog={handleTournamentHubCatalog}
          onBack={() => setAppState('home')}
        />
      )}

      {appState === 'tournament_tablet' && userRole === 'tablet' && (
        <div className="flex flex-1 flex-col min-h-0 w-full overflow-hidden">
        <TabletWaitingRoom
          lang={lang}
          hasGroupSchedule={!!tournamentData?.groups?.length}
          groupStandings={tabletWaitingStandings}
          boardSchedule={tabletBoardSchedule}
          activeMatch={tabletAssignedMatch}
          showDemoAssignButton={false}
          tournamentFinished={tabletTournamentFinished}
          tournamentData={tournamentData}
          tournamentGroups={tournamentGroups}
          tournamentMatches={tournamentMatches}
          tournamentBracket={tournamentBracket}
          tabletPresence={tabletPresence}
          onCheckInComplete={handleTabletCheckInComplete}
          onTabletTimeoutWarning={handleTabletTimeoutWarning}
          onStartGame={handleTabletStartGame}
          onBack={handleSpectatorDisconnect}
        />
        </div>
      )}

      {appState === 'tournament_history' && (
        <TournamentHistory
          lang={lang}
          user={user}
          onBack={() => setAppState('tournament_hub')}
        />
      )}

      {appState === 'tournament_viewer_preparing' && userRole === 'viewer' && (
        <main className="flex flex-col items-center justify-center flex-1 w-full max-w-lg md:max-w-4xl lg:max-w-5xl mx-auto overflow-y-auto bg-slate-950 p-4 pb-24 min-h-[50vh]">
          <p className="text-center text-lg sm:text-xl font-bold text-slate-200 px-2">
            {t('tournament.preparing')}
          </p>
          <p className="mt-3 text-center text-xs text-slate-500 px-4">
            {t('navUseHeaderHint') || 'Použijte Domů / Zpět v horní liště.'}
          </p>
        </main>
      )}

      {appState === 'tournament_setup' && (
        <TournamentSetup
          lang={lang}
          step={tournamentSetupStep}
          onStepChange={setTournamentSetupStep}
          tournamentDraft={tournamentDraft}
          setTournamentDraft={setTournamentDraft}
          user={user}
          onGoogleLogin={handleLogin}
          onNotify={showNotification}
          preRegTournamentId={preRegImportSourceId}
          onBackToPreRegAdmin={
            preRegImportSourceId
              ? () => {
                  setActivePreRegTournamentId(preRegImportSourceId);
                  setAppState('prereg_admin');
                }
              : undefined
          }
          onComplete={async (data) => {
            if (isTournamentLive || tournamentData?.rankingsLocked) {
              showNotification(
                t('tournLiveLockedHint') ||
                  'Turnaj už má odehrané zápasy — los a ranking nelze měnit.',
                'error'
              );
              return;
            }
            const generatedPin = String(data.pin || activePin || generatePin()).trim();
            let playersWithIds = (data.players || []).map((p, i) => ({
              ...p,
              id: p.id ?? `p${i + 1}`,
            }));

            if (preRegImportSourceId && playersWithIds.length > 0) {
              try {
                const syncResult = await syncRosterOnSiteRegistrations({
                  tournamentId: preRegImportSourceId,
                  rosterPlayers: playersWithIds,
                  competitionType: data.competitionType,
                });
                if ((syncResult.createdCount ?? 0) > 0) {
                  const msgTemplate =
                    t('preregOnSiteSyncDone') ||
                    'Do předregistrace doplněno {count} hráčů na místě.';
                  showNotification(
                    msgTemplate.replace('{count}', String(syncResult.createdCount)),
                    'success'
                  );
                }
              } catch (syncErr) {
                console.error('on-site roster sync failed', syncErr);
                showNotification(
                  t('preregOnSiteSyncFailed') ||
                    'Nepodařilo se synchronizovat hráče na místě do přihlášek. Opravte to ve správě předregistrace a zkuste znovu.',
                  'error'
                );
                return;
              }
            }
            clearTournamentWip();
            const tournamentId =
              data.tournamentId ||
              (typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `t-${Date.now()}`);

            if (isTournamentBracketOnlyFormat(data.tournamentFormat)) {
              playersWithIds = sortPlayersForBracketSeeding(playersWithIds);
              const syntheticGroups = [
                { groupId: 'direct-ko', name: 'A', players: playersWithIds },
              ];
              const baseLegs = data.bracketKoLegs ?? data.bracketLegs ?? 3;
              const rawBracket = generateBracketStructure(
                syntheticGroups,
                'all',
                baseLegs,
                [],
                data.prelimLegs ?? null
              );
              const availableBoards = Number(data.totalBoards ?? data.numBoards ?? 1) || 1;
              const { bracket: preparedBracket } = assignBracketJitBoardsAndReferees(rawBracket, {
                availableBoards,
                groups: syntheticGroups,
                promotersCount: 'all',
                groupMatches: [],
                registeredPlayersForDirectKo: playersWithIds,
                prelimLegs: data.prelimLegs ?? null,
              });
              const withId = ensureBoardAuthTokens({
                ...data,
                players: playersWithIds,
                pin: generatedPin,
                tournamentId,
                tournamentFormat: 'bracket_only',
                groups: [],
                groupsLegs: null,
                numGroups: null,
                advancePerGroup: 'all',
                promotersCount: 'all',
                status: 'bracket',
              });
              setActivePin(generatedPin);
              setTournamentData(withId);
              setTournamentMatches([]);
              setTournamentBracket(preparedBracket);
              try {
                safeStorage.setItem(
                  'dartsTournamentData',
                  JSON.stringify({ ...withId, tournamentBracket: preparedBracket })
                );
              } catch {}
              setTournamentDraft((prev) => ({ ...prev, boardAssignments: {} }));
              setAppState('tournament_bracket');
              return;
            }

            const withId = ensureBoardAuthTokens({
              ...data,
              players: playersWithIds,
              pin: generatedPin,
              tournamentId,
            });
            setActivePin(generatedPin);
            setTournamentData(withId);
            try {
              safeStorage.setItem('dartsTournamentData', JSON.stringify(withId));
            } catch {}
            setTournamentDraft((prev) => ({
              ...prev,
              boardAssignments: {},
              advancePerGroup: data.advancePerGroup ?? prev.advancePerGroup,
              promotersCount: data.promotersCount ?? data.advancePerGroup ?? prev.promotersCount,
            }));
            setAppState('tournament_board_assignment');
          }}
          onBack={() => {
            setUserRole(null);
            setAppState('tournament_hub');
          }}
        />
      )}

      {/* --- TOURNAMENT BOARD ASSIGNMENT --- */}
      {appState === 'tournament_board_assignment' && tournamentData && (
        <TournamentBoardAssignment
          tournamentData={tournamentData}
          tournamentDraft={tournamentDraft}
          setTournamentDraft={setTournamentDraft}
          tournamentMatches={tournamentMatches}
          onUpdateGroupBoard={(groupId, boards) => {
            const groupMatches = tournamentMatches.filter((m) => (m.groupId ?? m.group) === groupId);
            const isPlaying = groupMatches.some((m) => m.status === 'playing');
            if (isPlaying) {
              const msg = (translations[lang]?.tournBoardChangeConfirm) ||
                '⚠️ Tato skupina právě hraje zápas na terči. Opravdu chcete změnit její přiřazený terč?';
              requestConfirm(msg, () => {
                setTournamentData((prev) => {
                  if (!prev?.groups) return prev;
                  const nextGroups = prev.groups.map((g) =>
                    g.groupId === groupId ? { ...g, boards } : g
                  );
                  const next = { ...prev, groups: nextGroups };
                  try { safeStorage.setItem('dartsTournamentData', JSON.stringify(next)); } catch {}
                  return next;
                });
              });
              return;
            }
            setTournamentData((prev) => {
              if (!prev?.groups) return prev;
              const nextGroups = prev.groups.map((g) =>
                g.groupId === groupId ? { ...g, boards } : g
              );
              const next = { ...prev, groups: nextGroups };
              try { safeStorage.setItem('dartsTournamentData', JSON.stringify(next)); } catch {}
              return next;
            });
          }}
          lang={lang}
          onComplete={(data) => {
            const nextData = ensureBoardAuthTokens(data);
            setTournamentData(nextData);
            const boardAssignments = {};
            for (const g of data?.groups ?? []) {
              boardAssignments[g.groupId] = Array.isArray(g.boards) && g.boards.length > 0 ? g.boards.join(', ') : '';
            }
            setTournamentDraft((prev) => ({ ...prev, boardAssignments }));
            try { safeStorage.setItem('dartsTournamentData', JSON.stringify(nextData)); } catch {}
            setAppState('tournament_groups');
          }}
          onBack={() => setAppState('tournament_setup')}
        />
      )}

      {/* --- TOURNAMENT GROUPS --- */}
      {appState === 'tournament_groups' && (
        <TournamentGroupsView
          tournamentData={tournamentData}
          tournamentMatches={tournamentMatches}
          tournamentGroups={tournamentGroups}
          estimatedTournamentEnd={liveTournamentEndPrediction?.estimatedTournamentEnd ?? null}
          estimatedGroupsPhaseEnd={liveTournamentEndPrediction?.estimatedGroupsPhaseEnd ?? null}
          lang={lang}
          userRole={userRole}
          hasBracket={hasBracketGenerated}
          onBack={() => setAppState('home')}
          onFinishGroups={() => setAppState('tournament_bracket')}
          onDevFillMatches={(nextMatches) => setTournamentMatches(nextMatches)}
          onNotify={showNotification}
          onGenerateBracket={() => {
            const promotersCount =
              tournamentData?.promotersCount ??
              tournamentData?.promotersPerGroup ??
              tournamentData?.advancePerGroup ??
              2;
            const baseLegs =
              tournamentDraft?.bracketLegs ??
              tournamentData?.bracketKoLegs ??
              tournamentData?.bracketLegs ??
              3;
            const rawBracket = generateBracketStructure(
              tournamentGroups,
              promotersCount,
              baseLegs,
              tournamentMatches,
              tournamentData?.prelimLegs ?? null
            );
            const availableBoards =
              Number(
                tournamentData?.boardsCount ?? tournamentData?.totalBoards ?? tournamentData?.numBoards
              ) || 1;
            const { bracket: prepared, stats } = assignBracketJitBoardsAndReferees(rawBracket, {
              availableBoards,
              groups: tournamentGroups,
              promotersCount,
              groupMatches: tournamentMatches,
              prelimLegs: tournamentData?.prelimLegs ?? null,
            });
            setTournamentBracket(prepared);
            setAppState('tournament_bracket');
            if (stats.totalReady > 0) {
              const tmpl =
                t('tournBracketGeneratedHint') ||
                'Pavouk: {onBoards}/{total} zápasů na terčích ({boards} k dispozici), {queued} ve frontě.';
              showNotification(
                tmpl
                  .replace(/\{onBoards\}/g, String(stats.onBoards))
                  .replace(/\{total\}/g, String(stats.totalReady))
                  .replace(/\{queued\}/g, String(stats.queued))
                  .replace(/\{boards\}/g, String(stats.availableBoards))
                  .replace(/\{refs\}/g, String(stats.withReferee)),
                'success'
              );
            }
          }}
          onResumeBracket={() => setAppState('tournament_bracket')}
          onStartMatch={handleStartTournamentMatch}
          onResetMatch={handleResetMatch}
          onWithdrawPlayer={handleWithdrawPlayer}
        />
      )}

      {appState === 'tournament_bracket' && tournamentData && (
        <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 p-4 pb-24">
          <TournamentBracketView
            bracketData={tournamentBracket}
            tournamentData={tournamentData}
            userRole={userRole}
            onStartMatch={handleStartBracketMatch}
            onUpdateRoundSettings={handleUpdateRoundSettings}
            onUpdateMatchBoard={handleUpdateMatchBoard}
            onToggleMatchBoardLock={handleToggleMatchBoardLock}
            onSetMatchBoardAuto={handleSetMatchBoardAuto}
            onManualRefereeChange={handleManualRefereeChange}
            onManualBracketPlayerSlot={handleManualBracketPlayerSlot}
            onBracketWalkover={handleBracketWalkover}
            onBracketWithdrawPlayer={handleBracketWithdrawPlayer}
            onBracketDataCommit={handleBracketDataCommit}
            lang={lang}
          />
        </main>
      )}

      {/* --- TOURNAMENT STATISTICS --- */}
      {appState === 'tournament_stats' && tournamentData && (
        <TournamentStatisticsView
          tournamentData={tournamentData}
          tournamentGroups={tournamentGroups}
          tournamentMatches={tournamentMatches}
          tournamentBracket={tournamentBracket}
          lang={lang}
        />
      )}

      {/* --- ADMIN PŘEDREGISTRACE --- */}
      {(appState === 'prereg_list' ||
        appState === 'prereg_setup' ||
        appState === 'prereg_admin' ||
        appState === 'prereg_public' ||
        appState === 'prereg_catalog') && (
        <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {appState === 'prereg_catalog' && (
        <PublicTournamentDirectory
          lang={lang}
          user={user}
          onGoogleLogin={handleLogin}
          onBack={() => {
            setAppState('tournament_hub');
            window.history.replaceState(null, '', '/');
          }}
          onOpenTournament={handleOpenCatalogTournament}
        />
      )}

      {appState === 'prereg_public' && preregTournamentId && (
        <PublicTournamentPage
          lang={lang}
          user={user}
          tournamentId={preregTournamentId}
          onBack={() => {
            if (preregReturnToCatalog) {
              setPreregReturnToCatalog(false);
              setPreregTournamentId(null);
              setAppState('prereg_catalog');
              window.history.replaceState(null, '', '/tournaments');
              return;
            }
            setAppState('home');
            setPreregTournamentId(null);
            window.history.replaceState(null, '', '/');
          }}
        />
      )}

      {/* --- ADMIN PŘEDREGISTRACE --- */}
      {appState === 'prereg_list' && (
        <MyPreRegTournamentsList
          lang={lang}
          user={user}
          onBack={() => setAppState('tournament_hub')}
          onManage={handlePreRegManage}
          onCreateNew={handlePreRegCreateNew}
          onGoogleLogin={handleLogin}
          onQuickStart={handleTournamentQuickStart}
          onOpenHistory={handleTournamentHubHistory}
          onContinueLive={
            tournamentData || parkedSession?.kind === 'tournament'
              ? () => {
                  if (parkedSession?.kind === 'tournament') {
                    resumeParkedSession();
                    return;
                  }
                  handleTournamentHubAdmin();
                }
              : undefined
          }
          liveTournament={
            tournamentData
              ? {
                  name: tournamentData.name || tournamentData.tournamentName,
                  pin: tournamentData.pin || activePin,
                  isLive: isTournamentLive,
                }
              : parkedSession?.kind === 'tournament'
                ? {
                    name: parkedSession.title,
                    pin: undefined,
                    isLive: true,
                  }
                : null
          }
        />
      )}

      {appState === 'prereg_setup' && (
        <TournamentPreRegSetup
          lang={lang}
          user={user}
          onBack={() => setAppState('prereg_list')}
          onCreated={handlePreRegTournamentCreated}
          onGoogleLogin={handleLogin}
        />
      )}

      {appState === 'prereg_admin' && activePreRegTournamentId && (
        <RegistrationAdminPanel
          key={`${activePreRegTournamentId}-${user?.uid ?? 'anon'}`}
          lang={lang}
          user={user}
          tournamentId={activePreRegTournamentId}
          onBack={() => setAppState('prereg_list')}
          onDeleted={() => {
            setActivePreRegTournamentId(null);
            setActivePreRegInviteToken(null);
          }}
          onImportToSetup={handlePreRegImportToSetup}
          requireImportMode={
            !!preRegImportSourceId &&
            ((tournamentDraft?.players?.length ?? 0) > 0 || !!tournamentData?.groups?.length)
          }
          onGoogleLogin={handleLogin}
          onNotify={showNotification}
        />
      )}
        </div>
      )}

      {/* --- SETUP --- */}
      {appState === 'setup' && (
        <main className={`flex flex-col items-center flex-1 w-full overflow-y-auto p-4 landscape:p-3 ${isKeyboardOpen ? 'pb-[190px] landscape:pb-[150px]' : ''}`}>
          <div className={`w-full max-w-5xl xl:max-w-7xl ${isKeyboardOpen ? 'pb-6 landscape:pb-3' : 'pb-20 landscape:pb-8'}`}>
            <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 md:items-start landscape:grid landscape:grid-cols-2 landscape:gap-3 landscape:items-start w-full">
            <div className="space-y-4">
            <div className="flex p-1 border shadow-md bg-slate-800 rounded-xl border-slate-700">
                <button onClick={() => setSettings({...settings, gameType: 'x01'})} className={`flex-1 py-3 landscape:py-2 text-sm font-black rounded-lg uppercase tracking-widest transition-colors ${settings.gameType === 'x01' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>X01</button>
                <button onClick={() => setSettings({...settings, gameType: 'cricket'})} className={`flex-1 py-3 landscape:py-2 text-sm font-black rounded-lg uppercase tracking-widest transition-colors ${settings.gameType === 'cricket' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>CRICKET</button>
            </div>

            <div className="p-4 landscape:p-3 space-y-4 landscape:space-y-3 border bg-slate-900 rounded-xl border-slate-800">
                <div className="flex justify-between items-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                    <span>{t('players')}</span>
                    <div className="flex items-center gap-1.5 text-emerald-500">
                        <Target className="w-3.5 h-3.5" />
                        <span>{t('whoStarts')}</span>
                    </div>
                </div>
                <div className="flex items-stretch gap-2">
                    {internalKeyboardEnabled ? (
                    <div onClick={() => handleNameFieldClick('p1Name')} className="flex items-center flex-1 gap-3 px-4 py-3 text-sm text-white border rounded-lg shadow-inner cursor-pointer bg-slate-800 border-slate-700">
                        <User className="w-5 h-5 text-slate-400 shrink-0" />
                        <span className="font-bold truncate">{settings.p1Name || t('p1Placeholder')}</span>
                    </div>
                    ) : (
                    <div className="flex items-center flex-1 gap-3 px-4 py-3 text-sm text-white border rounded-lg shadow-inner bg-slate-800 border-slate-700">
                        <User className="w-5 h-5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          autoComplete="name"
                          className="flex-1 min-w-0 bg-transparent font-bold text-white outline-none placeholder:text-slate-500"
                          placeholder={t('p1Placeholder')}
                          value={settings.p1Name}
                          onChange={(e) => setSettings((s) => ({ ...s, p1Name: e.target.value }))}
                          onFocus={() => handleNameFieldFocus('p1Name')}
                          onBlur={() => restoreDefaultNameIfEmpty('p1Name')}
                        />
                    </div>
                    )}
                    <button onClick={() => setSettings({...settings, startPlayer: 'p1'})} className={`w-14 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${settings.startPlayer === 'p1' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-600 hover:text-slate-400'}`}>
                        <Target className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="flex items-stretch gap-2">
                    {settings.isBot ? (
                    <div className="flex-1 rounded-lg px-4 py-3 text-sm flex items-center gap-3 text-emerald-400 bg-emerald-900/10 border border-emerald-900/50">
                        <Cpu className="w-5 h-5 shrink-0" />
                        <span className="font-bold truncate">{getTranslatedName(settings.p2Name, false, lang)}</span>
                    </div>
                    ) : internalKeyboardEnabled ? (
                    <div onClick={() => handleNameFieldClick('p2Name')} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm flex items-center gap-3 text-white cursor-pointer shadow-inner">
                        <User className="w-5 h-5 text-slate-400 shrink-0" />
                        <span className="font-bold truncate">{settings.p2Name || t('p2Placeholder')}</span>
                    </div>
                    ) : (
                    <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm flex items-center gap-3 text-white shadow-inner">
                        <User className="w-5 h-5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          autoComplete="name"
                          className="flex-1 min-w-0 bg-transparent font-bold text-white outline-none placeholder:text-slate-500"
                          placeholder={t('p2Placeholder')}
                          value={settings.p2Name}
                          onChange={(e) => setSettings((s) => ({ ...s, p2Name: e.target.value }))}
                          onFocus={() => handleNameFieldFocus('p2Name')}
                          onBlur={() => restoreDefaultNameIfEmpty('p2Name')}
                        />
                    </div>
                    )}
                    
                    <button 
                        onClick={() => {
                            const newIsBot = !settings.isBot;
                            setSettings({...settings, isBot: newIsBot, p2Name: newIsBot ? translations[lang].botDefault : translations[lang].p2Default})
                        }} 
                        className={`w-14 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${settings.isBot ? 'bg-emerald-600/20 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-600 hover:text-slate-400'}`}
                    >
                        <Cpu className="w-6 h-6" />
                    </button>

                    <button onClick={() => setSettings({...settings, startPlayer: 'p2'})} className={`w-14 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${settings.startPlayer === 'p2' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-600 hover:text-slate-400'}`}>
                        <Target className="w-6 h-6" />
                    </button>
                </div>

                {settings.isBot && (
                    <div className="p-3 mt-2 duration-200 border rounded-lg bg-slate-800/50 border-slate-700 animate-in fade-in zoom-in-95">
                        <label className="text-slate-400 text-[10px] font-bold uppercase mb-2 flex tracking-widest items-center gap-2">
                            <Cpu className="w-4 h-4"/> {t('botDifficulty')}
                        </label>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {[{ id: 'amateur', l: t('diffAmateur'), avg: 45 }, { id: 'pro', l: t('diffPro'), avg: 65 }, { id: 'world_class', l: t('diffWorldClass'), avg: 100 }, { id: 'custom', l: t('diffCustom') || 'Vlastní', avg: settings.botLevel === 'custom' ? settings.botAvg : 60 }].map(b => (
                                <button key={b.id} onClick={() => setSettings({...settings, botLevel: b.id, botAvg: b.avg})} className={`py-2 px-2 rounded-lg font-bold text-xs transition-colors ${settings.botLevel === b.id ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}>{b.l}</button>
                            ))}
                        </div>
                        {settings.botLevel === 'custom' && (
                            <div className="p-3 border rounded-lg bg-slate-900 border-slate-700">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold uppercase text-slate-400">{t('customAvg') || 'Vlastní AVG'}</span>
                                    <span className="font-mono text-lg font-black text-emerald-400">{settings.botAvg}</span>
                                </div>
                                <input 
                                    type="range" min="40" max="120" step="1" 
                                    value={settings.botAvg} 
                                    onChange={(e) => setSettings({...settings, botAvg: parseInt(e.target.value)})} 
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-emerald-500" 
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                                    <span>40</span><span>120</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            </div>
            {settings.gameType === 'x01' && (
                <div className="p-4 landscape:p-3 border bg-slate-900 rounded-xl border-slate-800 animate-in fade-in slide-in-from-top-2">
                    <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3 block">{t('rulesX01') || 'Pravidla X01'}</label>
                    <div className="grid grid-cols-2 gap-3 landscape:gap-2 mb-3">{[301, 501].map(s => <button key={s} onClick={()=>setSettings({...settings, startScore:s})} className={`py-3 landscape:py-2 px-3 rounded-lg font-bold border transition-colors ${settings.startScore===s?'bg-emerald-600 border-emerald-500 text-white':'bg-slate-800 border-slate-700 text-slate-400'}`}>{s}</button>)}</div>
                    <div className="grid grid-cols-2 gap-3 landscape:gap-2">{['single', 'double'].map(m => <button key={m} onClick={()=>setSettings({...settings, outMode:m})} className={`py-3 landscape:py-2 px-3 rounded-lg font-bold text-sm border uppercase transition-colors ${settings.outMode===m?'bg-blue-600 border-blue-500 text-white':'bg-slate-800 border-slate-700 text-slate-400'}`}>{m} OUT</button>)}</div>
                </div>
            )}
            <div className="p-4 landscape:p-3 border bg-slate-900 rounded-xl border-slate-800">
                <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3 block">{t('matchFormat')}</label>
                <div className="flex p-1 mb-4 border rounded-lg bg-slate-800 border-slate-700">
                    <button onClick={() => setSettings({...settings, matchMode: 'first_to'})} className={`flex-1 py-2 landscape:py-1.5 text-xs font-black rounded-md uppercase tracking-widest transition-colors ${settings.matchMode === 'first_to' ? 'bg-slate-100 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('firstTo')}</button>
                    <button onClick={() => setSettings({...settings, matchMode: 'best_of'})} className={`flex-1 py-2 landscape:py-1.5 text-xs font-black rounded-md uppercase tracking-widest transition-colors ${settings.matchMode === 'best_of' ? 'bg-slate-100 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('bestOf')}</button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                    {legOptions.slice(0, -1).map(n => <button key={n} onClick={()=>setSettings({...settings, matchTarget:n, matchSets: 1})} className={`py-3 landscape:py-2 rounded-lg font-bold border transition-colors ${settings.matchSets === 1 && settings.matchTarget===n?'bg-emerald-600 border-emerald-500 text-white':'bg-slate-800 border-slate-700 text-slate-400'}`}>{n}</button>)}
                    <button
                        onClick={() => {
                            setCustomSetsValue(settings.matchSets || 1);
                            setCustomLegsValue(settings.matchTarget || legOptions[0]);
                            setShowCustomFormat(true);
                        }}
                        className={`py-3 landscape:py-2 rounded-lg font-bold border transition-colors ${settings.matchSets > 1 ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                    >
                        ⚙️ {t('custom') || 'Vlastní'}
                    </button>
                </div>
            </div>
            <button onClick={() => {
              setSettings((s) => ({ ...s, doubles: false, teams: null }));
              setAppState('playing');
            }} className="flex items-center justify-center w-full gap-2 py-4 landscape:py-3 mt-2 landscape:mt-0 text-xl font-black transition-all shadow-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-xl shadow-emerald-900/20 active:scale-95 landscape:col-span-2"><Play className="w-6 h-6 fill-current" /> {t('startMatch')}</button>
            </div>
          </div>
        </main>
      )}

      {/* --- HISTORY --- */}
      {appState === 'history' && (
        <main className="flex flex-col items-center flex-1 w-full p-4 overflow-y-auto">
            <div className="w-full max-w-lg md:max-w-4xl lg:max-w-6xl pb-20 space-y-4">
                <h2 className="flex items-center justify-center gap-2 mt-4 mb-6 text-2xl font-black tracking-widest text-white uppercase"><History className="w-6 h-6 text-emerald-500"/> {t('matchHistory')}</h2>
                <div className="mt-2 overflow-hidden border bg-slate-900 rounded-xl border-slate-800">
                    {(() => {
                        const myMatches = matchHistory;
                        if (myMatches.length === 0) return <div className="p-8 text-center text-slate-500">{t('noMatches')}</div>;
                        return (
                            <div className="divide-y divide-slate-800 md:divide-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3 md:border-0">
                                {myMatches.map(m => {
                                    const isMultiSet = (m.matchSets || 1) > 1;
                                    const mainP1 = isMultiSet ? (m.p1Sets || 0) : (m.setScores?.[0]?.p1 ?? m.p1Legs ?? 0);
                                    const mainP2 = isMultiSet ? (m.p2Sets || 0) : (m.setScores?.[0]?.p2 ?? m.p2Legs ?? 0);
                                    const legsBreakdown = isMultiSet && m.setScores?.length ? `(${m.setScores.map(s => `${s.p1}:${s.p2}`).join(', ')})` : '';
                                    return (
                                    <div key={m.id} className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/50 md:flex-col md:items-stretch md:gap-2 md:border md:border-slate-800 md:rounded-xl md:bg-slate-950/60" onClick={() => setSelectedMatchDetail(m)}>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="text-xs text-slate-500">{m.date}</div>
                                                <div className="text-[9px] uppercase font-bold px-1.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                                    {m.gameType === 'cricket' ? 'CRICKET' : `${m.startScore} ${m.outMode === 'double' ? 'DO' : 'SO'}`}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`font-bold ${m.matchWinner === 'p1' ? 'text-emerald-400' : 'text-slate-400'}`}>{getTranslatedName(m.p1Name, true, lang)}</div>
                                                <div className="bg-slate-950 px-3 py-0.5 rounded text-sm font-mono font-bold border border-slate-800 flex gap-1">
                                                    <span className={m.matchWinner === 'p1' ? 'text-emerald-500' : 'text-slate-500'}>{mainP1}</span><span className="text-slate-600">-</span><span className={m.matchWinner === 'p2' ? 'text-purple-500' : 'text-slate-500'}>{mainP2}</span>
                                                </div>
                                                {legsBreakdown && <div className="text-[10px] font-mono text-slate-500">{legsBreakdown}</div>}
                                                
                                                {/* Přidání obtížnosti Bota v seznamu historie zápasů */}
                                                <div className={`font-bold flex items-center gap-1 ${m.matchWinner === 'p2' ? 'text-purple-400' : 'text-slate-400'}`}>
                                                    {getTranslatedName(m.p2Name, false, lang)}
                                                    {m.isBot && <span className="text-[10px] text-emerald-500 font-bold border border-emerald-500/30 px-1 rounded bg-emerald-900/20">{m.botLevel === 'custom' ? `AVG ${m.botAvg}` : (translations[lang]?.[`diff${m.botLevel.charAt(0).toUpperCase() + m.botLevel.slice(1)}`] || m.botLevel)}</span>}
                                                </div>
                                                
                                            </div>
                                        </div>
                                        <button onClick={async (e) => { e.stopPropagation(); setMatchHistory(p => p.filter(x => x.id !== m.id)); if (m.docId && db && user && !offlineMode) { try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'matches', m.docId)); } catch {} } }} className="p-3 transition-colors rounded-lg text-slate-600 hover:text-red-400 hover:bg-slate-800"><Trash2 className="w-5 h-5" /></button>
                                    </div>
                                )})}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </main>
      )}

      {/* --- TUTORIAL --- */}
      {appState === 'tutorial' && (
        <main className="relative z-10 flex flex-col items-center flex-1 w-full max-w-6xl xl:max-w-7xl mx-auto p-4 pb-20 overflow-y-auto sm:p-6">
            <h2 className="flex items-center gap-2 mb-6 text-2xl font-black tracking-widest text-white uppercase w-full"><FileText className="w-6 h-6 text-emerald-500"/> {t('tutorial')}</h2>
            
            <div className="flex w-full max-w-md md:max-w-xl lg:max-w-2xl p-1 mb-6 border shadow-md bg-slate-800 rounded-xl border-slate-700">
                <button onClick={() => setTutorialTab('x01')} className={`flex-1 py-3 text-xs font-black rounded-lg uppercase tracking-widest transition-colors ${tutorialTab === 'x01' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('tutTabX01')}</button>
                <button onClick={() => setTutorialTab('cricket')} className={`flex-1 py-3 text-xs font-black rounded-lg uppercase tracking-widest transition-colors ${tutorialTab === 'cricket' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('tutTabCricket')}</button>
                <button onClick={() => setTutorialTab('tournaments')} className={`flex-1 py-3 text-xs font-black rounded-lg uppercase tracking-widest transition-colors ${tutorialTab === 'tournaments' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t('tutTabTournaments')}</button>
            </div>

            <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
                {tutorialTab === 'x01' && (
                    <>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Target className="w-6 h-6 text-blue-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutX01Title1')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutX01Desc1')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><CheckCircle className="w-6 h-6 text-emerald-500" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutX01Title2')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutX01Desc2')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><KeyboardIcon className="w-6 h-6 text-yellow-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutX01Title3')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutX01Desc3')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><History className="w-6 h-6 text-orange-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutX01Title4')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutX01Desc4')}</p></div>
                        </div>
                    </>
                )}
                {tutorialTab === 'cricket' && (
                    <>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Target className="w-6 h-6 text-purple-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutCricTitle1')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutCricDesc1')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><CheckCircle className="w-6 h-6 text-emerald-500" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutCricTitle2')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutCricDesc2')}</p></div>
                        </div>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800 md:col-span-2">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Trophy className="w-6 h-6 text-yellow-400" /></div>
                            <div className="flex-1 pt-1"><h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutCricTitle3')}</h3><p className="text-sm leading-relaxed text-slate-400">{t('tutCricDesc3')}</p></div>
                        </div>
                    </>
                )}
                {tutorialTab === 'tournaments' && (
                    <>
                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800 md:col-span-2">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Swords className="w-6 h-6 text-amber-400" /></div>
                            <div className="flex-1 pt-1">
                              <h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutTournTitle1')}</h3>
                              <p className="text-sm leading-relaxed text-slate-400">{t('tutTournDesc1')}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Target className="w-6 h-6 text-emerald-500" /></div>
                            <div className="flex-1 pt-1">
                              <h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutTournTitle2')}</h3>
                              <p className="text-sm leading-relaxed text-slate-400">{t('tutTournDesc2')}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><ClipboardList className="w-6 h-6 text-blue-400" /></div>
                            <div className="flex-1 pt-1">
                              <h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutTournTitle3')}</h3>
                              <p className="text-sm leading-relaxed text-slate-400">{t('tutTournDesc3')}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><CheckCircle className="w-6 h-6 text-emerald-500" /></div>
                            <div className="flex-1 pt-1">
                              <h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutTournTitle4')}</h3>
                              <p className="text-sm leading-relaxed text-slate-400">{t('tutTournDesc4')}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Cloud className="w-6 h-6 text-purple-400" /></div>
                            <div className="flex-1 pt-1">
                              <h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutTournTitle5')}</h3>
                              <p className="text-sm leading-relaxed text-slate-400">{t('tutTournDesc5')}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-5 border shadow-lg bg-slate-900 rounded-2xl border-slate-800">
                            <div className="p-3 border bg-slate-800 rounded-xl border-slate-700 shrink-0"><Trophy className="w-6 h-6 text-yellow-400" /></div>
                            <div className="flex-1 pt-1">
                              <h3 className="mb-2 text-sm font-bold tracking-wider text-white uppercase">{t('tutTournTitle6')}</h3>
                              <p className="text-sm leading-relaxed text-slate-400">{t('tutTournDesc6')}</p>
                            </div>
                        </div>
                    </>
                )}
                <div className="grid grid-cols-1 col-span-1 gap-4 pt-4 mt-4 border-t md:col-span-2 border-slate-800 md:grid-cols-2">
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl">
                        <div className="p-2 shrink-0"><Cpu className="w-6 h-6 text-emerald-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">{t('tutCommonTitle1')}</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutCommonDesc1')}</p></div>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl">
                        <div className="p-2 shrink-0"><Target className="w-6 h-6 text-blue-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">{t('tutCommonTitle2')}</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutCommonDesc2')}</p></div>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl">
                        <div className="p-2 shrink-0"><Undo2 className="w-6 h-6 text-orange-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">{t('tutCommonTitle3')}</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutCommonDesc3')}</p></div>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl">
                        <div className="p-2 shrink-0"><Cloud className="w-6 h-6 text-purple-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">{t('tutCommonTitle4')}</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutCommonDesc4')}</p></div>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-slate-900 rounded-2xl md:col-span-2">
                        <div className="p-2 shrink-0"><Trophy className="w-6 h-6 text-emerald-400" /></div>
                        <div className="flex-1 pt-0.5"><h3 className="mb-1 text-sm font-bold tracking-wider text-white uppercase">SETS & LEGS</h3><p className="text-xs leading-relaxed text-slate-500">{t('tutSetsLegs')}</p></div>
                    </div>
                </div>
            </div>
        </main>
      )}

      {/* --- O APLIKACI --- */}
      {appState === 'about' && (
        <main className="relative z-10 flex flex-col items-center flex-1 w-full max-w-lg md:max-w-4xl lg:max-w-5xl p-4 pb-20 mx-auto overflow-y-auto sm:p-6">
            <h2 className="flex items-center gap-2 mb-6 text-2xl font-black tracking-widest text-white uppercase w-full md:text-center"><Info className="w-6 h-6 text-yellow-500"/> {t('aboutApp')}</h2>
            <div className="w-full p-6 md:p-8 border shadow-xl bg-slate-900 rounded-2xl border-slate-800 md:grid md:grid-cols-2 md:gap-8 md:items-center">
                <div className="pb-6 md:pb-0 space-y-2 text-center border-b md:border-b-0 md:border-r border-slate-800 md:pr-8">
                    <div className="flex items-center justify-center w-20 h-20 mx-auto mb-4 rounded-full shadow-lg bg-emerald-600"><Target className="w-10 h-10 text-slate-900" /></div>
                    <h1 className="text-2xl font-black tracking-widest text-white">SIMPLE DART</h1>
                    <h2 className="text-sm font-bold tracking-widest text-emerald-500">COUNTER</h2>
                    <div className="mt-2 font-mono text-xs text-slate-500">Verze {APP_VERSION}</div>
                </div>
                <div className="pt-6 md:pt-0 text-center md:text-left">
                    <p className="text-sm text-slate-400">{t('aboutText')}</p>
                    <button onClick={() => window.location.href = `/privacy.html#${lang}`} className="flex items-center justify-center md:justify-start w-full gap-2 mt-8 text-sm font-bold tracking-widest underline uppercase text-emerald-500 hover:text-emerald-400">
                        {typeof t === 'function' ? t('privacyPolicy') : 'Zásady ochrany soukromí'}
                    </button>
                    <button
                      type="button"
                      onClick={handleHardResetApp}
                      className="mt-4 w-full py-2.5 text-[11px] font-bold tracking-widest uppercase rounded-xl border border-red-500/30 bg-red-950/20 text-red-300/90 hover:bg-red-950/40 transition-colors"
                    >
                      {t('resetApp') || 'Resetovat aplikaci'}
                    </button>
                    <div className="text-center md:text-left text-[10px] text-slate-500 pt-8 md:pt-6 border-t border-slate-800 mt-6 md:mt-8">&copy; {new Date().getFullYear()} Vít (ViteCZech).<br/> Všechna práva vyhrazena.</div>
                </div>
            </div>
        </main>
      )}

      {/* --- PROFIL / STATISTIKY --- */}
      {appState === 'profile' && user && (
          <UserProfile 
              user={user} 
              matches={matchHistory} 
              onLogout={()=>signOut(auth)} 
              onLogin={handleLogin}
              
              // Komplexní smazání účtu včetně historie zápasů
              onDeleteAccount={async () => { 
                requestConfirm(
                  t('deleteAccountConfirm') || 'Opravdu chcete nenávratně smazat účet a veškerou historii zápasů?',
                  async () => {
                    try { 
                        // 1. Smazání z Firebase DB (pokud je online a přihlášen)
                        if (db && !offlineMode && !user.isAnonymous) {
                            const q1 = query(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), where('p1Id', '==', user.uid));
                            const q2 = query(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), where('p2Id', '==', user.uid));
                            
                            const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                            const deletePromises = [];
                            snap1.forEach(d => deletePromises.push(deleteDoc(d.ref)));
                            snap2.forEach(d => deletePromises.push(deleteDoc(d.ref)));
                            
                            await Promise.all(deletePromises);
                        }
    
                        // 2. Vymazání z lokální paměti prohlížeče
                        setMatchHistory(prev => prev.filter(m => m.p1Id !== user.uid && m.p2Id !== user.uid));
                        
                        // 3. Smazání samotného uživatelského účtu
                        await deleteUser(user); 
                        setAppState('home'); 
                        showNotification(t('presetSaved') || 'Uloženo!', 'success');
                    } catch {
                        console.error('Chyba při mazání');
                        showNotification(
                          'Chyba. Z bezpečnostních důvodů vyžaduje Google před smazáním účtu čerstvé přihlášení. Odhlaste se, znovu se přihlaste a akci opakujte.',
                          'error'
                        );
                    } 
                  }
                );
              }} 
              lang={lang}
              currentP1Name={settings.p1Name}
          />
      )}

      {/* --- GLOBAL CONFIRM MODAL --- */}
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
              {confirmState.title || t('confirmModalTitle') || 'Potvrzení'}
            </h3>
            <p className="whitespace-pre-line text-sm text-slate-300">{confirmState.message}</p>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                {confirmState.cancelLabel || t('cancel') || 'Zrušit'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmState.onConfirm;
                  setConfirmState(null);
                  try {
                    await fn?.();
                  } catch {}
                }}
                className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                {confirmState.confirmLabel || t('confirmAction') || 'Potvrdit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL TOAST --- */}
      {notification && notification.message && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 max-w-[min(92vw,28rem)] p-4 rounded-xl shadow-2xl z-[5200] flex items-start gap-3 animate-slide-in border text-white bg-slate-900/95 backdrop-blur-sm ${
            notification.type === 'error' ? 'border-red-500/60' : 'border-emerald-500/60'
          }`}
          role="status"
        >
          {notification.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" aria-hidden />
          ) : (
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" aria-hidden />
          )}
          <p className="text-sm leading-snug">{notification.message}</p>
        </div>
      )}

    </div>
  );
}

export default function App() {
  const venueRoute = parseVenueDisplayRouteFromUrl();
  const [lang, setLang] = useState(() => (venueRoute ? resolveVenueLang() : 'cs'));
  if (venueRoute) {
    return <VenueDisplayView pin={venueRoute.pin} invalidPin={venueRoute.invalid} lang={lang} />;
  }
  return (
    <AdminVirtualKeyboardProvider lang={lang}>
      <AppMain lang={lang} setLang={setLang} />
    </AdminVirtualKeyboardProvider>
  );
}