/** Sdílené konstanty LAN relay (klient i Node server). */

export const LAN_DEFAULT_PORT = 8787;
export const LAN_STORAGE_KEY = 'sdcLanRelay';
export const LAN_ADMIN_TOKEN_KEY = 'sdcLanAdminToken';

export const LAN_PATHS = {
  health: '/api/lan/health',
  tournament: (pin) => `/api/lan/tournament/${encodeURIComponent(pin)}`,
  secrets: (pin) => `/api/lan/tournament/${encodeURIComponent(pin)}/secrets`,
  verify: (pin) => `/api/lan/tournament/${encodeURIComponent(pin)}/verify`,
  tabletVerify: (pin) => `/api/lan/tournament/${encodeURIComponent(pin)}/tablet/verify`,
  presence: (pin) => `/api/lan/tournament/${encodeURIComponent(pin)}/presence`,
  match: (pin) => `/api/lan/tournament/${encodeURIComponent(pin)}/match`,
  archive: (pin) => `/api/lan/tournament/${encodeURIComponent(pin)}/archive`,
  ws: '/api/lan/ws',
};

export const LAN_WS_TYPES = {
  snapshot: 'tournament',
  deleted: 'deleted',
  waiting: 'waiting',
  ping: 'ping',
  pong: 'pong',
  error: 'error',
};

/** Metody, které musí mít cloud i LAN adaptér (kontrakt). */
export const SYNC_ADAPTER_METHODS = [
  'mode',
  'isBackendReady',
  'listenTournament',
  'syncTournament',
  'deleteTournament',
  'archiveTournament',
  'verifyTournamentPin',
  'verifyTabletAccess',
  'loadTournamentSecrets',
  'registerTabletPresence',
  'updateMatchFromTablet',
  'mergeGroupMatchesFromCloud',
  'mergeBracketFromCloud',
  'heartbeatTabletPresence',
  'releaseTabletPresence',
  'releaseTabletPresenceOnUnload',
  'listenPublicFeed',
  'getPublicResultById',
  'getOnlineGameById',
  'cancelOnlineGame',
  'abandonOnlineGameSession',
  'savePublicMatch',
  'deletePublicMatch',
  'deletePublicMatchesForUser',
  'getOwnerTournamentData',
  'listTournamentRegistrations',
  'createManualRegistration',
  'adminConfirmPair',
  'verifyAdminInviteToken',
  'claimAdminInviteAccess',
];
