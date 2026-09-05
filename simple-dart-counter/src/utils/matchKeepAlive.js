/**
 * Parknutý zápas musí zůstat namountovaný (skrytý), jinak GameX01/GameCricket
 * ztratí skóre. Obrazovka statistik / historie nesmí strom odpojit.
 */

export function isMatchParkedKept(parkedSession) {
  return parkedSession?.kind === 'match' && parkedSession.mountKept === true;
}

export function shouldMountMatchSurface(appState, parkedSession) {
  return appState === 'playing' || isMatchParkedKept(parkedSession);
}

export function shouldKeepMatchUnderStats({ appState, selectedMatchDetail, parkedSession } = {}) {
  const statsScreen = appState === 'match_finished' || Boolean(selectedMatchDetail);
  return statsScreen && isMatchParkedKept(parkedSession);
}
