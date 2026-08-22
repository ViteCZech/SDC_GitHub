/**
 * Obnova obrazovky po zabití PWA/TWA (typicky zavření externího odkazu na Androidu).
 * Ukládat jen stavy bez živé hry — playing/online mají vlastní reconnect.
 */

export const UI_RESUME_KEY = 'dartsUiResume';
export const UI_RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const UI_RESUME_STATES = [
  'setup',
  'history',
  'profile',
  'tutorial',
  'about',
  'tournament_hub',
  'tournament_setup',
  'tournament_board_assignment',
  'tournament_groups',
  'tournament_bracket',
  'tournament_stats',
  'tournament_history',
  'prereg_list',
  'prereg_setup',
  'prereg_admin',
  'prereg_catalog',
  'prereg_public',
];

const RESUME_SET = new Set(UI_RESUME_STATES);

function canUseStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * @param {object|null|undefined} payload
 */
export function saveUiResume(payload) {
  if (!canUseStorage() || !payload || typeof payload !== 'object') return;
  const appState = String(payload.appState || '');
  if (appState === 'home') {
    try {
      const prevRaw = localStorage.getItem(UI_RESUME_KEY);
      const prev = prevRaw ? JSON.parse(prevRaw) : {};
      localStorage.setItem(
        UI_RESUME_KEY,
        JSON.stringify({
          ...prev,
          appState: 'home',
          tournamentDraft: payload.tournamentDraft ?? prev.tournamentDraft ?? null,
          tournamentSetupStep: payload.tournamentSetupStep ?? prev.tournamentSetupStep ?? 1,
          savedAt: Date.now(),
        })
      );
    } catch {
      /* kvóta / private mode */
    }
    return;
  }
  if (!RESUME_SET.has(appState)) return;
  try {
    localStorage.setItem(
      UI_RESUME_KEY,
      JSON.stringify({
        appState,
        tournamentSetupStep: payload.tournamentSetupStep ?? 1,
        tournamentDraft: payload.tournamentDraft ?? null,
        userRole: payload.userRole ?? null,
        activePin: payload.activePin ?? '',
        activePreRegTournamentId: payload.activePreRegTournamentId ?? null,
        preregTournamentId: payload.preregTournamentId ?? null,
        preregReturnToCatalog: !!payload.preregReturnToCatalog,
        homeSubmenu: payload.homeSubmenu ?? null,
        savedAt: Date.now(),
      })
    );
  } catch {
    /* ignore */
  }
}

export function clearUiResume() {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(UI_RESUME_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {object|null}
 */
export function loadUiResume() {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(UI_RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const age = Date.now() - Number(parsed.savedAt || 0);
    if (!Number.isFinite(age) || age < 0 || age > UI_RESUME_MAX_AGE_MS) return null;
    const appState = String(parsed.appState || '');
    if (appState !== 'home' && !RESUME_SET.has(appState)) return null;
    return parsed;
  } catch {
    return null;
  }
}
