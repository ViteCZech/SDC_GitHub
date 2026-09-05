export type TabletAuthSource = {
  boardAuthTokens?: Record<string, string>;
  tabletPassword?: string;
};

export function mergeTabletAuthSources(
  secret: TabletAuthSource | null | undefined,
  tournamentData: TabletAuthSource | null | undefined
): TabletAuthSource {
  const tokens =
    secret?.boardAuthTokens && typeof secret.boardAuthTokens === 'object'
      ? secret.boardAuthTokens
      : tournamentData?.boardAuthTokens && typeof tournamentData.boardAuthTokens === 'object'
        ? tournamentData.boardAuthTokens
        : undefined;
  const password =
    secret?.tabletPassword != null && String(secret.tabletPassword).trim()
      ? String(secret.tabletPassword)
      : tournamentData?.tabletPassword != null
        ? String(tournamentData.tabletPassword)
        : '';
  return {
    boardAuthTokens: tokens,
    tabletPassword: password,
  };
}

/**
 * Tablet musí předložit platný board token, nebo neprázdné heslo.
 * Prázdné / chybějící heslo nikdy neautorizuje.
 */
export function validateTabletAuth(
  source: TabletAuthSource | null | undefined,
  board: string,
  boardToken: string,
  tabletPassword: string
): boolean {
  const token = String(boardToken ?? '').trim();
  const boardKey = String(board ?? '').trim();
  const tokens = source?.boardAuthTokens;
  if (boardKey && token && tokens && typeof tokens === 'object' && tokens[boardKey] != null) {
    if (String(tokens[boardKey]).trim() === token) return true;
  }

  const expected =
    source && source.tabletPassword != null ? String(source.tabletPassword).trim().slice(0, 5) : '';
  if (!expected) return false;
  const provided = String(tabletPassword ?? '').trim().slice(0, 5);
  return provided !== '' && provided === expected;
}
