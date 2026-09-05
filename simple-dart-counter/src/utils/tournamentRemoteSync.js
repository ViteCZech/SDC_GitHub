/**
 * Má se turnaj synchronizovat přes aktuální sync adaptér (cloud nebo LAN)?
 * @param {{ adapter?: { mode?: string, isBackendReady?: () => boolean }, tournamentData?: object|null, user?: { isAnonymous?: boolean }|null }} args
 */
export function shouldRemoteSyncTournament({ adapter, tournamentData, user } = {}) {
  if (!adapter || typeof adapter.isBackendReady !== 'function' || !adapter.isBackendReady()) {
    return false;
  }
  if (adapter.mode === 'lan') {
    return !tournamentData?.cloudEnabled;
  }
  return !!tournamentData?.cloudEnabled && !!user && !user.isAnonymous;
}

export function isLanAdapter(adapter) {
  return adapter?.mode === 'lan';
}
