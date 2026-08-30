export const HELP_TOPIC_DEFAULT = 'x01-mode';

export const HELP_TOPIC_TO_TAB = {
  'x01-mode': 'x01',
  'offline-mode': 'tournaments',
  'public-results': 'tournaments',
  'tv-screen': 'tournaments',
  'group-stage': 'tournaments',
  'tournament-management': 'tournaments',
  'tablet-room': 'tournaments',
};

export function normalizeHelpTopic(topicId) {
  const id = String(topicId || '').trim().toLowerCase();
  return id || HELP_TOPIC_DEFAULT;
}

export function resolveHelpTab(topicId) {
  const normalized = normalizeHelpTopic(topicId);
  return HELP_TOPIC_TO_TAB[normalized] || 'tournaments';
}

export function getCurrentRoute() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
}

function sanitizeStep(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

export function buildHelpReturnState(snapshot = {}) {
  const appState = String(snapshot.appState || 'home');
  return {
    appState,
    returnRoute: String(snapshot.returnRoute || '/'),
    tutorialTab: String(snapshot.tutorialTab || 'x01'),
    homeSubmenu: snapshot.homeSubmenu ?? null,
    tournamentSetupStep: sanitizeStep(snapshot.tournamentSetupStep),
    preregReturnToCatalog: !!snapshot.preregReturnToCatalog,
    preregTournamentId: snapshot.preregTournamentId ?? null,
    activePreRegTournamentId: snapshot.activePreRegTournamentId ?? null,
    publicResultId: snapshot.publicResultId ?? null,
    userRole: snapshot.userRole ?? null,
  };
}

export function resolveHelpBackSectionKey(appState) {
  const state = String(appState || 'home');
  if (state === 'home') return 'helpSectionHome';
  if (state === 'setup' || state === 'playing' || state === 'match_finished') return 'helpSectionGame';
  if (state.startsWith('public_')) return 'helpSectionPublicResults';
  if (state === 'tournament_tablet') return 'helpSectionTablet';
  if (state.startsWith('tournament_')) return 'helpSectionTournament';
  if (state.startsWith('prereg_')) return 'helpSectionRegistration';
  return 'helpSectionHome';
}
