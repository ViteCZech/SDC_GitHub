/**
 * Pravidla pro výsledek zápasu na tabletu (CF).
 * Hotový zápas se nesmí vrátit na pending; novější completedAt vyhraje.
 */

export function isMatchTerminal(
  m: { status?: string; walkover?: boolean } | null | undefined
): boolean {
  const s = m?.status;
  return s === 'completed' || s === 'walkover' || m?.walkover === true;
}

export function applyMatchPatchPreservingTerminal(
  current: Record<string, unknown> | null | undefined,
  patches: Record<string, unknown>
): Record<string, unknown> {
  const cur = current && typeof current === 'object' ? current : {};
  const patch = patches && typeof patches === 'object' ? patches : {};
  const merged = { ...cur, ...patch };

  if (isMatchTerminal(cur) && !isMatchTerminal(merged)) {
    const telemetry: Record<string, unknown> = {};
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

export function findGroupMatchIndex(matches: unknown[], matchId: string): number {
  if (!Array.isArray(matches)) return -1;
  const want = String(matchId ?? '').trim();
  if (!want) return -1;
  return matches.findIndex((m) => {
    const row = m as { matchId?: string; id?: string };
    const mid = row.matchId ?? row.id;
    return mid != null && String(mid) === want;
  });
}

export function findBracketMatchLoc(
  bracket: unknown[],
  matchId: string
): { roundIndex: number; matchIndex: number } | null {
  if (!Array.isArray(bracket)) return null;
  const want = String(matchId ?? '').trim();
  if (!want) return null;
  for (let ri = 0; ri < bracket.length; ri++) {
    const list = (bracket[ri] as { matches?: unknown[] })?.matches;
    if (!Array.isArray(list)) continue;
    const mi = list.findIndex((m) => {
      const row = m as { id?: string; matchId?: string };
      const id = row.id ?? row.matchId;
      return id != null && String(id) === want;
    });
    if (mi >= 0) return { roundIndex: ri, matchIndex: mi };
  }
  return null;
}

function deriveTournamentStatus(args: {
  tournamentData: unknown;
  groupMatches: unknown[];
  tournamentBracket: unknown[];
}): string {
  if (!args.tournamentData) return 'preparing';
  const gm = Array.isArray(args.groupMatches) ? args.groupMatches : [];
  const bracketMatches = Array.isArray(args.tournamentBracket)
    ? args.tournamentBracket.flatMap((r) => {
        const matches = (r as { matches?: unknown[] })?.matches;
        return Array.isArray(matches) ? matches : [];
      })
    : [];
  const allMatches = [...gm, ...bracketMatches] as Array<{ status?: string; walkover?: boolean }>;
  if (allMatches.length === 0) return 'running';
  return allMatches.every(isMatchTerminal) ? 'finished' : 'running';
}

/**
 * Patch dokumentu turnaje: jen pole, která tablet opravdu mění (ne celý set).
 */
export function buildTabletMatchDocPatch(args: {
  raw: Record<string, unknown>;
  matchType: 'group' | 'bracket';
  matchId: string;
  patches: Record<string, unknown>;
}): { groupMatches?: unknown[]; tournamentBracket?: unknown[]; status: string; lastUpdated: string } {
  const groupMatches = Array.isArray(args.raw.groupMatches) ? [...args.raw.groupMatches] : [];
  const tournamentBracket = Array.isArray(args.raw.tournamentBracket)
    ? args.raw.tournamentBracket.map((round) => {
        const r = round as { matches?: unknown[] };
        return Array.isArray(r?.matches) ? { ...r, matches: [...r.matches] } : round;
      })
    : [];

  if (args.matchType === 'group') {
    const idx = findGroupMatchIndex(groupMatches, args.matchId);
    if (idx < 0) {
      throw new Error('not-found-group');
    }
    const current = groupMatches[idx] as Record<string, unknown>;
    groupMatches[idx] = applyMatchPatchPreservingTerminal(current, args.patches);
  } else {
    const loc = findBracketMatchLoc(tournamentBracket, args.matchId);
    if (!loc) {
      throw new Error('not-found-bracket');
    }
    const round = tournamentBracket[loc.roundIndex] as { matches: unknown[] };
    const current = round.matches[loc.matchIndex] as Record<string, unknown>;
    const matches = round.matches.map((m, mi) =>
      mi === loc.matchIndex ? applyMatchPatchPreservingTerminal(current, args.patches) : m
    );
    tournamentBracket[loc.roundIndex] = { ...round, matches };
  }

  const status = deriveTournamentStatus({
    tournamentData: args.raw.tournamentData ?? null,
    groupMatches,
    tournamentBracket,
  });

  const lastUpdated = new Date().toISOString();
  if (args.matchType === 'group') {
    return { groupMatches, status, lastUpdated };
  }
  return { tournamentBracket, status, lastUpdated };
}
