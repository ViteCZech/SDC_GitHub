/** Výchozí limit prezence u terče (3 min). */
export const TABLET_CHECKIN_DEFAULT_SECONDS = 180;

/** Po 1. varování (admin potvrdí) → 50 % defaultu. */
export const TABLET_CHECKIN_AFTER_WARN1_SECONDS = Math.round(TABLET_CHECKIN_DEFAULT_SECONDS * 0.5);

/** Po 2. varování → 1 minuta. */
export const TABLET_CHECKIN_AFTER_WARN2_SECONDS = 60;

/** Max. počet admin varování u jednoho zápasu. */
export const TABLET_CHECKIN_MAX_WARNINGS = 3;

/** Sekundy pro další check-in po potvrzení N-tého varování (N = 1|2). Po 3. null. */
export function checkInSecondsAfterWarningAck(warningCount) {
  const n = Number(warningCount) || 0;
  if (n === 1) return TABLET_CHECKIN_AFTER_WARN1_SECONDS;
  if (n === 2) return TABLET_CHECKIN_AFTER_WARN2_SECONDS;
  return null;
}

export function bumpRoleWarningCounts(prevCounts, present) {
  const base = prevCounts && typeof prevCounts === 'object' ? prevCounts : {};
  const next = {
    p1: Number(base.p1) || 0,
    p2: Number(base.p2) || 0,
    referee: Number(base.referee) || 0,
  };
  if (!present?.p1) next.p1 += 1;
  if (!present?.p2) next.p2 += 1;
  if (!present?.referee) next.referee += 1;
  return next;
}
