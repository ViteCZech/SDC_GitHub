import { describe, expect, it } from 'vitest';
import { shouldRemoteSyncTournament, isLanAdapter } from '../tournamentRemoteSync';

describe('shouldRemoteSyncTournament', () => {
  it('LAN syncuje bez Google účtu, dokud není cloudEnabled', () => {
    const adapter = { mode: 'lan', isBackendReady: () => true };
    expect(shouldRemoteSyncTournament({ adapter, tournamentData: { cloudEnabled: false }, user: null })).toBe(
      true
    );
    expect(shouldRemoteSyncTournament({ adapter, tournamentData: { cloudEnabled: true }, user: null })).toBe(
      false
    );
  });

  it('cloud vyžaduje přihlášeného admina', () => {
    const adapter = { mode: 'cloud', isBackendReady: () => true };
    expect(
      shouldRemoteSyncTournament({
        adapter,
        tournamentData: { cloudEnabled: true },
        user: { isAnonymous: false },
      })
    ).toBe(true);
    expect(
      shouldRemoteSyncTournament({
        adapter,
        tournamentData: { cloudEnabled: true },
        user: { isAnonymous: true },
      })
    ).toBe(false);
    expect(isLanAdapter(adapter)).toBe(false);
    expect(isLanAdapter({ mode: 'lan' })).toBe(true);
  });
});
