/**
 * Pravidla pro výsledek zápasu: hotový zápas se nesmí tiše vrátit na pending
 * a novější completedAt vyhraje při konfliktu dvou dokončení.
 */

export function isMatchTerminal(m) {
  const s = m?.status;
  return s === 'completed' || s === 'walkover' || m?.walkover === true;
}

export function applyMatchPatchPreservingTerminal(current, patches) {
  const cur = current && typeof current === 'object' ? current : {};
  const patch = patches && typeof patches === 'object' ? patches : {};
  const merged = { ...cur, ...patch };

  if (isMatchTerminal(cur) && !isMatchTerminal(merged)) {
    const telemetry = {};
    for (const key of [
      'tabletStatus',
      'tabletCheckInPresent',
      'tabletCheckInResume',
      'tabletTimeoutWarningCount',
      'tabletTimeoutAdminAckedCount',
      'tabletTimeoutRoleWarningCounts',
      'whoStarts',
    ]) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        telemetry[key] = patch[key];
      }
    }
    return { ...cur, ...telemetry };
  }

  if (isMatchTerminal(cur) && isMatchTerminal(merged)) {
    const left = Number(cur.completedAt) || 0;
    const right = Number(merged.completedAt) || 0;
    if (left > right) return { ...cur };
  }

  return merged;
}
