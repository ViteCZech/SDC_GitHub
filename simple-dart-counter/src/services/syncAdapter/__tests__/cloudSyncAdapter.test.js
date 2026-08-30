import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  archivePastTournamentAndDeleteActive: vi.fn(),
  deleteCloudTournament: vi.fn(),
  heartbeatTabletBoardPresence: vi.fn(),
  listenToCloudTournament: vi.fn(),
  registerTabletBoardOnline: vi.fn(),
  releaseTabletBoardPresence: vi.fn(),
  releaseTabletBoardPresenceOnUnload: vi.fn(),
  syncTournamentToCloud: vi.fn(),
  updateCloudMatchFromTablet: vi.fn(),
  verifyTabletBoardAccess: vi.fn(),
  verifyTournamentPin: vi.fn(),
  getPublicResultById: vi.fn(),
  listenPublicResultsFeed: vi.fn(),
}));

vi.mock('../../tournamentSync', () => ({
  archivePastTournamentAndDeleteActive: mocked.archivePastTournamentAndDeleteActive,
  deleteCloudTournament: mocked.deleteCloudTournament,
  heartbeatTabletBoardPresence: mocked.heartbeatTabletBoardPresence,
  listenToCloudTournament: mocked.listenToCloudTournament,
  registerTabletBoardOnline: mocked.registerTabletBoardOnline,
  releaseTabletBoardPresence: mocked.releaseTabletBoardPresence,
  releaseTabletBoardPresenceOnUnload: mocked.releaseTabletBoardPresenceOnUnload,
  syncTournamentToCloud: mocked.syncTournamentToCloud,
  updateCloudMatchFromTablet: mocked.updateCloudMatchFromTablet,
  verifyTabletBoardAccess: mocked.verifyTabletBoardAccess,
  verifyTournamentPin: mocked.verifyTournamentPin,
}));

vi.mock('../../publicResultsService', () => ({
  getPublicResultById: mocked.getPublicResultById,
  listenPublicResultsFeed: mocked.listenPublicResultsFeed,
}));

import { createCloudSyncAdapter } from '../cloudSyncAdapter';

describe('createCloudSyncAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps all tournament, tablet and public APIs 1:1', async () => {
    const adapter = createCloudSyncAdapter();
    expect(adapter.mode).toBe('cloud');

    const tournamentUnsub = vi.fn();
    mocked.listenToCloudTournament.mockReturnValue(tournamentUnsub);
    const publicUnsub = vi.fn();
    mocked.listenPublicResultsFeed.mockReturnValue(publicUnsub);

    const snap = { tournamentData: { name: 'Friday' }, groups: [], groupMatches: [], tournamentBracket: [] };
    const cb = vi.fn();
    const errCb = vi.fn();
    const releasePayload = { pin: '1234', board: '1' };

    expect(adapter.listenTournament('1234', cb)).toBe(tournamentUnsub);
    await adapter.syncTournament('1234', snap);
    await adapter.deleteTournament('1234');
    await adapter.archiveTournament('owner-1', '1234', 'Friday', snap);
    await adapter.verifyTournamentPin('1234');
    await adapter.verifyTabletAccess('1234', 'abc', { board: '1' });
    await adapter.registerTabletPresence('1234', '1', 'token', { status: 'online' });
    await adapter.updateMatchFromTablet('1234', 'group', 'm-1', { status: 'done' }, { boardToken: 'bt' });
    await adapter.heartbeatTabletPresence(releasePayload);
    await adapter.releaseTabletPresence(releasePayload);
    adapter.releaseTabletPresenceOnUnload(releasePayload);
    expect(adapter.listenPublicFeed(cb, errCb)).toBe(publicUnsub);
    await adapter.getPublicResultById('res-1');

    expect(mocked.listenToCloudTournament).toHaveBeenCalledWith('1234', cb);
    expect(mocked.syncTournamentToCloud).toHaveBeenCalledWith('1234', snap);
    expect(mocked.deleteCloudTournament).toHaveBeenCalledWith('1234');
    expect(mocked.archivePastTournamentAndDeleteActive).toHaveBeenCalledWith('owner-1', '1234', 'Friday', snap);
    expect(mocked.verifyTournamentPin).toHaveBeenCalledWith('1234');
    expect(mocked.verifyTabletBoardAccess).toHaveBeenCalledWith('1234', 'abc', { board: '1' });
    expect(mocked.registerTabletBoardOnline).toHaveBeenCalledWith('1234', '1', 'token', { status: 'online' });
    expect(mocked.updateCloudMatchFromTablet).toHaveBeenCalledWith(
      '1234',
      'group',
      'm-1',
      { status: 'done' },
      { boardToken: 'bt' }
    );
    expect(mocked.heartbeatTabletBoardPresence).toHaveBeenCalledWith(releasePayload);
    expect(mocked.releaseTabletBoardPresence).toHaveBeenCalledWith(releasePayload);
    expect(mocked.releaseTabletBoardPresenceOnUnload).toHaveBeenCalledWith(releasePayload);
    expect(mocked.listenPublicResultsFeed).toHaveBeenCalledWith(cb, errCb);
    expect(mocked.getPublicResultById).toHaveBeenCalledWith('res-1');
  });
});
