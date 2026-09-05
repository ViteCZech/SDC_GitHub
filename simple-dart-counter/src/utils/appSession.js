import { loadUiResume } from './uiResumeStorage';
import { parsePreregRouteFromUrl, isPublicTournamentCatalogPath } from './preregAdmin';
import { parseTabletRouteFromUrl } from './tabletBoardQr';
import { parseVenueDisplayRouteFromUrl } from './venueDisplayRoutes';
import { safeStorage } from './safeStorage';

export { safeStorage };

export const TOURNAMENT_WIP_KEY = 'dartsTournamentSetupWip';
export const SESSION_ROLE_KEY = 'dartsSessionRole';
export const SESSION_PIN_KEY = 'dartsSessionPin';
export const SESSION_BOARD_KEY = 'dartsSessionBoard';
export const SESSION_TABLET_PW_KEY = 'dartsSessionTabletPw';
export const SESSION_BOARD_TOKEN_KEY = 'dartsSessionBoardToken';
export const LOCAL_TOURNAMENT_HISTORY_KEY = 'darts_history_local';

export function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/** Veřejná předregistrace: /t/:tournamentId (?invite=token pro admin) */
export function parsePreregTournamentIdFromPath() {
  return parsePreregRouteFromUrl()?.tournamentId ?? null;
}

export function createDefaultTournamentDraft() {
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

export function persistSpectatorSession(role, pin, boardStr = '', tabletPassword = '', boardToken = '') {
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

export function clearSpectatorSession() {
  safeStorage.removeItem(SESSION_ROLE_KEY);
  safeStorage.removeItem(SESSION_PIN_KEY);
  safeStorage.removeItem(SESSION_BOARD_KEY);
  safeStorage.removeItem(SESSION_TABLET_PW_KEY);
  safeStorage.removeItem(SESSION_BOARD_TOKEN_KEY);
}

export function loadStoredTabletPassword() {
  try {
    return String(safeStorage.getItem(SESSION_TABLET_PW_KEY) ?? '').trim().slice(0, 5);
  } catch {
    return '';
  }
}

export function loadStoredBoardAuthToken() {
  try {
    return String(safeStorage.getItem(SESSION_BOARD_TOKEN_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function loadStoredTabletBoard() {
  try {
    return String(safeStorage.getItem(SESSION_BOARD_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function tabletCloudAuthOpts() {
  const boardToken = loadStoredBoardAuthToken();
  if (boardToken) {
    return {
      board: loadStoredTabletBoard(),
      boardToken,
    };
  }
  return { tabletPassword: loadStoredTabletPassword() };
}

export function writeTournamentWip(pin) {
  safeStorage.setItem(TOURNAMENT_WIP_KEY, JSON.stringify({ pin: String(pin).trim() }));
}

export function clearTournamentWip() {
  safeStorage.removeItem(TOURNAMENT_WIP_KEY);
}

export function mergeDraftFromResume(saved) {
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

export function setSkipUiResumePersist(value) {
  skipUiResumePersist = !!value;
}

export function getSkipUiResumePersist() {
  return skipUiResumePersist;
}

export function getBootUiResumeOnce() {
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
export function loadInitialState(key, fallback) {
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

export function appendLocalTournamentHistory(entry) {
  const prev = loadInitialState(LOCAL_TOURNAMENT_HISTORY_KEY, []);
  const arr = Array.isArray(prev) ? [...prev, entry] : [entry];
  try {
    safeStorage.setItem(LOCAL_TOURNAMENT_HISTORY_KEY, JSON.stringify(arr));
  } catch {}
}

export function loadSafeMatchHistory() {
  const parsed = loadInitialState('dartsMatchHistory', []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Turnaj z localStorage. Vždy vrací { value, hadError } — při prázdné paměti value === null.
 */
export function loadSafeTournamentData() {
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
export function getInitialTournamentBootstrapOnce() {
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
