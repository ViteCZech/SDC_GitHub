import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  archivePastTournamentAndDeleteActive: vi.fn(),
  deleteCloudTournament: vi.fn(),
  heartbeatTabletBoardPresence: vi.fn(),
  listenToCloudTournament: vi.fn(),
  mergeAdminBracketFromTabletCloud: vi.fn(),
  mergeAdminGroupMatchesFromTabletCloud: vi.fn(),
  registerTabletBoardOnline: vi.fn(),
  releaseTabletBoardPresence: vi.fn(),
  releaseTabletBoardPresenceOnUnload: vi.fn(),
  syncTournamentToCloud: vi.fn(),
  updateCloudMatchFromTablet: vi.fn(),
  verifyTabletBoardAccess: vi.fn(),
  verifyTournamentPin: vi.fn(),
  loadTournamentSecrets: vi.fn(),
  getPublicResultById: vi.fn(),
  listenPublicResultsFeed: vi.fn(),
  getOnlineGameById: vi.fn(),
  cancelOnlineGame: vi.fn(),
  abandonOnlineGameSession: vi.fn(),
  isCloudDbReady: vi.fn(() => true),
  savePublicMatch: vi.fn(),
  deletePublicMatch: vi.fn(),
  deletePublicMatchesForUser: vi.fn(),
  getOwnerTournamentData: vi.fn(),
  listTournamentRegistrations: vi.fn(),
  createManualRegistration: vi.fn(),
  adminConfirmPair: vi.fn(),
  verifyAdminInviteToken: vi.fn(),
  claimAdminInviteAccess: vi.fn(),
}));

vi.mock('../../tournamentSync', () => ({
  archivePastTournamentAndDeleteActive: mocked.archivePastTournamentAndDeleteActive,
  deleteCloudTournament: mocked.deleteCloudTournament,
  heartbeatTabletBoardPresence: mocked.heartbeatTabletBoardPresence,
  listenToCloudTournament: mocked.listenToCloudTournament,
  mergeAdminBracketFromTabletCloud: mocked.mergeAdminBracketFromTabletCloud,
  mergeAdminGroupMatchesFromTabletCloud: mocked.mergeAdminGroupMatchesFromTabletCloud,
  registerTabletBoardOnline: mocked.registerTabletBoardOnline,
  releaseTabletBoardPresence: mocked.releaseTabletBoardPresence,
  releaseTabletBoardPresenceOnUnload: mocked.releaseTabletBoardPresenceOnUnload,
  syncTournamentToCloud: mocked.syncTournamentToCloud,
  updateCloudMatchFromTablet: mocked.updateCloudMatchFromTablet,
  verifyTabletBoardAccess: mocked.verifyTabletBoardAccess,
  verifyTournamentPin: mocked.verifyTournamentPin,
  loadTournamentSecrets: mocked.loadTournamentSecrets,
}));

vi.mock('../../publicResultsService', () => ({
  getPublicResultById: mocked.getPublicResultById,
  listenPublicResultsFeed: mocked.listenPublicResultsFeed,
}));

vi.mock('../../onlineGamesService', () => ({
  getOnlineGameById: mocked.getOnlineGameById,
  cancelOnlineGame: mocked.cancelOnlineGame,
  abandonOnlineGameSession: mocked.abandonOnlineGameSession,
}));

vi.mock('../../matchHistoryCloud', () => ({
  isCloudDbReady: mocked.isCloudDbReady,
  savePublicMatch: mocked.savePublicMatch,
  deletePublicMatch: mocked.deletePublicMatch,
  deletePublicMatchesForUser: mocked.deletePublicMatchesForUser,
}));

vi.mock('../../tournamentPreRegService', () => ({
  getOwnerTournamentData: mocked.getOwnerTournamentData,
  listTournamentRegistrations: mocked.listTournamentRegistrations,
  createManualRegistration: mocked.createManualRegistration,
  adminConfirmPair: mocked.adminConfirmPair,
  verifyAdminInviteToken: mocked.verifyAdminInviteToken,
  claimAdminInviteAccess: mocked.claimAdminInviteAccess,
}));

import { createCloudSyncAdapter } from '../cloudSyncAdapter';

describe('createCloudSyncAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.isCloudDbReady.mockReturnValue(true);
  });

  it('maps all tournament, tablet and public APIs 1:1', async () => {
    const adapter = createCloudSyncAdapter();
    expect(adapter.mode).toBe('cloud');
    expect(adapter.isBackendReady()).toBe(true);

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
    await adapter.loadTournamentSecrets('1234');
    await adapter.registerTabletPresence('1234', '1', 'token', { status: 'online' });
    await adapter.updateMatchFromTablet('1234', 'group', 'm-1', { status: 'done' }, { boardToken: 'bt' });
    adapter.mergeGroupMatchesFromCloud([{ id: 'local-group' }], [{ id: 'cloud-group' }]);
    adapter.mergeBracketFromCloud([{ round: 1 }], [{ round: 1 }]);
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
    expect(mocked.loadTournamentSecrets).toHaveBeenCalledWith('1234');
    expect(mocked.registerTabletBoardOnline).toHaveBeenCalledWith('1234', '1', 'token', { status: 'online' });
    expect(mocked.updateCloudMatchFromTablet).toHaveBeenCalledWith(
      '1234',
      'group',
      'm-1',
      { status: 'done' },
      { boardToken: 'bt' }
    );
    expect(mocked.mergeAdminGroupMatchesFromTabletCloud).toHaveBeenCalledWith(
      [{ id: 'local-group' }],
      [{ id: 'cloud-group' }]
    );
    expect(mocked.mergeAdminBracketFromTabletCloud).toHaveBeenCalledWith([{ round: 1 }], [{ round: 1 }]);
    expect(mocked.heartbeatTabletBoardPresence).toHaveBeenCalledWith(releasePayload);
    expect(mocked.releaseTabletBoardPresence).toHaveBeenCalledWith(releasePayload);
    expect(mocked.releaseTabletBoardPresenceOnUnload).toHaveBeenCalledWith(releasePayload);
    expect(mocked.listenPublicResultsFeed).toHaveBeenCalledWith(cb, errCb);
    expect(mocked.getPublicResultById).toHaveBeenCalledWith('res-1');
  });

  it('maps online games, public match history and prereg admin APIs 1:1', async () => {
    const adapter = createCloudSyncAdapter();
    const match = { id: 'm-1', p1Name: 'A' };
    mocked.getOnlineGameById.mockResolvedValue({ id: 'g-1', status: 'playing' });
    mocked.savePublicMatch.mockResolvedValue('doc-1');
    mocked.getOwnerTournamentData.mockResolvedValue({ id: 't-1' });
    mocked.listTournamentRegistrations.mockResolvedValue([{ id: 'r-1' }]);
    mocked.createManualRegistration.mockResolvedValue({ id: 'r-2' });
    mocked.verifyAdminInviteToken.mockResolvedValue(true);

    await adapter.getOnlineGameById('g-1');
    await adapter.cancelOnlineGame('g-1');
    await adapter.abandonOnlineGameSession('g-1', 'p1');
    await adapter.savePublicMatch(match);
    await adapter.deletePublicMatch('doc-1');
    await adapter.deletePublicMatchesForUser('uid-1');
    await adapter.getOwnerTournamentData('t-1');
    await adapter.listTournamentRegistrations('t-1');
    await adapter.createManualRegistration('t-1', { playerName: 'Pepa' });
    await adapter.adminConfirmPair('t-1', 'r-a', 'r-b');
    await adapter.verifyAdminInviteToken('t-1', 'tok');
    await adapter.claimAdminInviteAccess('t-1', 'tok');

    expect(mocked.getOnlineGameById).toHaveBeenCalledWith('g-1');
    expect(mocked.cancelOnlineGame).toHaveBeenCalledWith('g-1');
    expect(mocked.abandonOnlineGameSession).toHaveBeenCalledWith('g-1', 'p1');
    expect(mocked.savePublicMatch).toHaveBeenCalledWith(match);
    expect(mocked.deletePublicMatch).toHaveBeenCalledWith('doc-1');
    expect(mocked.deletePublicMatchesForUser).toHaveBeenCalledWith('uid-1');
    expect(mocked.getOwnerTournamentData).toHaveBeenCalledWith('t-1');
    expect(mocked.listTournamentRegistrations).toHaveBeenCalledWith('t-1');
    expect(mocked.createManualRegistration).toHaveBeenCalledWith('t-1', { playerName: 'Pepa' });
    expect(mocked.adminConfirmPair).toHaveBeenCalledWith('t-1', 'r-a', 'r-b');
    expect(mocked.verifyAdminInviteToken).toHaveBeenCalledWith('t-1', 'tok');
    expect(mocked.claimAdminInviteAccess).toHaveBeenCalledWith('t-1', 'tok');
  });
});
