import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  savePublicMatch: vi.fn(),
  deletePublicMatch: vi.fn(),
  deletePublicMatchesForUser: vi.fn(),
  getOwnerTournamentData: vi.fn(),
  listTournamentRegistrations: vi.fn(),
  createManualRegistration: vi.fn(),
  adminConfirmPair: vi.fn(),
  verifyAdminInviteToken: vi.fn(),
  claimAdminInviteAccess: vi.fn(),
  publicResultsLoaded: false,
  onlineGamesLoaded: false,
  matchHistoryLoaded: false,
  preRegLoaded: false,
}));

vi.mock('../../../firebase', () => ({ db: { name: 'eur3' } }));

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

vi.mock('../../publicResultsService', () => {
  mocked.publicResultsLoaded = true;
  return {
    getPublicResultById: mocked.getPublicResultById,
    listenPublicResultsFeed: mocked.listenPublicResultsFeed,
  };
});

vi.mock('../../onlineGamesService', () => {
  mocked.onlineGamesLoaded = true;
  return {
    getOnlineGameById: mocked.getOnlineGameById,
    cancelOnlineGame: mocked.cancelOnlineGame,
    abandonOnlineGameSession: mocked.abandonOnlineGameSession,
  };
});

vi.mock('../../matchHistoryCloud', () => {
  mocked.matchHistoryLoaded = true;
  return {
    savePublicMatch: mocked.savePublicMatch,
    deletePublicMatch: mocked.deletePublicMatch,
    deletePublicMatchesForUser: mocked.deletePublicMatchesForUser,
  };
});

vi.mock('../../tournamentPreRegService', () => {
  mocked.preRegLoaded = true;
  return {
    getOwnerTournamentData: mocked.getOwnerTournamentData,
    listTournamentRegistrations: mocked.listTournamentRegistrations,
    createManualRegistration: mocked.createManualRegistration,
    adminConfirmPair: mocked.adminConfirmPair,
    verifyAdminInviteToken: mocked.verifyAdminInviteToken,
    claimAdminInviteAccess: mocked.claimAdminInviteAccess,
  };
});

import { createCloudSyncAdapter } from '../cloudSyncAdapter';

describe('createCloudSyncAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps deferred services out of the static import graph', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../cloudSyncAdapter.js'), 'utf8');
    expect(src).not.toMatch(/from ['"]\.\.\/publicResultsService['"]/);
    expect(src).not.toMatch(/from ['"]\.\.\/onlineGamesService['"]/);
    expect(src).not.toMatch(/from ['"]\.\.\/matchHistoryCloud['"]/);
    expect(src).not.toMatch(/from ['"]\.\.\/tournamentPreRegService['"]/);
    expect(src).toMatch(/import\(['"]\.\.\/publicResultsService['"]\)/);
    expect(src).toMatch(/import\(['"]\.\.\/onlineGamesService['"]\)/);
    expect(src).toMatch(/import\(['"]\.\.\/matchHistoryCloud['"]\)/);
    expect(src).toMatch(/import\(['"]\.\.\/tournamentPreRegService['"]\)/);
  });

  it('maps tournament and tablet APIs 1:1 without loading deferred services', async () => {
    const adapter = createCloudSyncAdapter();
    expect(adapter.mode).toBe('cloud');
    expect(adapter.isBackendReady()).toBe(true);
    expect(mocked.publicResultsLoaded).toBe(false);
    expect(mocked.onlineGamesLoaded).toBe(false);
    expect(mocked.matchHistoryLoaded).toBe(false);
    expect(mocked.preRegLoaded).toBe(false);

    const tournamentUnsub = vi.fn();
    mocked.listenToCloudTournament.mockReturnValue(tournamentUnsub);

    const snap = { tournamentData: { name: 'Friday' }, groups: [], groupMatches: [], tournamentBracket: [] };
    const cb = vi.fn();
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
    expect(mocked.publicResultsLoaded).toBe(false);
    expect(mocked.onlineGamesLoaded).toBe(false);
    expect(mocked.matchHistoryLoaded).toBe(false);
    expect(mocked.preRegLoaded).toBe(false);
  });

  it('does not attach a public feed if unsubscribed before the module loads', async () => {
    const adapter = createCloudSyncAdapter();
    mocked.listenPublicResultsFeed.mockReturnValue(vi.fn());
    const unsub = adapter.listenPublicFeed(vi.fn(), vi.fn());
    unsub();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocked.listenPublicResultsFeed).not.toHaveBeenCalled();
  });

  it('lazy-loads public results and unsubscribes the inner listener', async () => {
    const adapter = createCloudSyncAdapter();
    const publicUnsub = vi.fn();
    mocked.listenPublicResultsFeed.mockReturnValue(publicUnsub);
    const cb = vi.fn();
    const errCb = vi.fn();

    const unsub = adapter.listenPublicFeed(cb, errCb);
    expect(typeof unsub).toBe('function');
    await vi.waitFor(() => {
      expect(mocked.listenPublicResultsFeed).toHaveBeenCalledWith(cb, errCb);
    });
    expect(mocked.publicResultsLoaded).toBe(true);
    unsub();
    expect(publicUnsub).toHaveBeenCalledTimes(1);

    await adapter.getPublicResultById('res-1');
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

    expect(mocked.onlineGamesLoaded).toBe(true);
    expect(mocked.matchHistoryLoaded).toBe(true);
    expect(mocked.preRegLoaded).toBe(true);
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
