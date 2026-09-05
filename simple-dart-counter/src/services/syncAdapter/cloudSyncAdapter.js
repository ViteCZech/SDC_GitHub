import { db } from '../../firebase';
import {
  archivePastTournamentAndDeleteActive,
  deleteCloudTournament,
  heartbeatTabletBoardPresence,
  listenToCloudTournament,
  mergeAdminBracketFromTabletCloud,
  mergeAdminGroupMatchesFromTabletCloud,
  registerTabletBoardOnline,
  releaseTabletBoardPresence,
  releaseTabletBoardPresenceOnUnload,
  syncTournamentToCloud,
  updateCloudMatchFromTablet,
  verifyTabletBoardAccess,
  verifyTournamentPin,
  loadTournamentSecrets,
} from '../tournamentSync';

function cachedImport(loader) {
  let pending;
  return () => {
    pending ??= loader();
    return pending;
  };
}

const loadPublicResults = cachedImport(() => import('../publicResultsService'));
const loadOnlineGames = cachedImport(() => import('../onlineGamesService'));
const loadMatchHistory = cachedImport(() => import('../matchHistoryCloud'));
const loadPreReg = cachedImport(() => import('../tournamentPreRegService'));

export function createCloudSyncAdapter() {
  return Object.freeze({
    mode: 'cloud',
    isBackendReady() {
      return !!db;
    },

    listenTournament(pin, callback) {
      return listenToCloudTournament(pin, callback);
    },
    syncTournament(pin, tournamentState) {
      return syncTournamentToCloud(pin, tournamentState);
    },
    deleteTournament(pin) {
      return deleteCloudTournament(pin);
    },
    archiveTournament(ownerId, pin, name, fullData) {
      return archivePastTournamentAndDeleteActive(ownerId, pin, name, fullData);
    },

    verifyTournamentPin(pin) {
      return verifyTournamentPin(pin);
    },
    verifyTabletAccess(pin, tabletPassword, opts = {}) {
      return verifyTabletBoardAccess(pin, tabletPassword, opts);
    },
    loadTournamentSecrets(pin) {
      return loadTournamentSecrets(pin);
    },
    registerTabletPresence(pin, board, token, opts = {}) {
      return registerTabletBoardOnline(pin, board, token, opts);
    },
    updateMatchFromTablet(pin, matchType, matchId, matchUpdates, opts = {}) {
      return updateCloudMatchFromTablet(pin, matchType, matchId, matchUpdates, opts);
    },
    mergeGroupMatchesFromCloud(prevLocal, cloudList) {
      return mergeAdminGroupMatchesFromTabletCloud(prevLocal, cloudList);
    },
    mergeBracketFromCloud(prevLocal, cloudBracket) {
      return mergeAdminBracketFromTabletCloud(prevLocal, cloudBracket);
    },
    heartbeatTabletPresence(presence) {
      return heartbeatTabletBoardPresence(presence);
    },
    releaseTabletPresence(presence) {
      return releaseTabletBoardPresence(presence);
    },
    releaseTabletPresenceOnUnload(presence) {
      return releaseTabletBoardPresenceOnUnload(presence);
    },

    listenPublicFeed(callback, onError) {
      let cancelled = false;
      let innerUnsub = null;
      loadPublicResults()
        .then((mod) => {
          if (cancelled) return;
          innerUnsub = mod.listenPublicResultsFeed(callback, onError);
          if (cancelled) {
            innerUnsub?.();
            innerUnsub = null;
          }
        })
        .catch((err) => {
          if (!cancelled && typeof onError === 'function') onError(err);
        });
      return () => {
        cancelled = true;
        innerUnsub?.();
        innerUnsub = null;
      };
    },
    async getPublicResultById(resultId) {
      const mod = await loadPublicResults();
      return mod.getPublicResultById(resultId);
    },

    async getOnlineGameById(gameId) {
      const mod = await loadOnlineGames();
      return mod.getOnlineGameById(gameId);
    },
    async cancelOnlineGame(gameId) {
      const mod = await loadOnlineGames();
      return mod.cancelOnlineGame(gameId);
    },
    async abandonOnlineGameSession(gameId, myRole) {
      const mod = await loadOnlineGames();
      return mod.abandonOnlineGameSession(gameId, myRole);
    },

    async savePublicMatch(record) {
      const mod = await loadMatchHistory();
      return mod.savePublicMatch(record);
    },
    async deletePublicMatch(docId) {
      const mod = await loadMatchHistory();
      return mod.deletePublicMatch(docId);
    },
    async deletePublicMatchesForUser(uid) {
      const mod = await loadMatchHistory();
      return mod.deletePublicMatchesForUser(uid);
    },

    async getOwnerTournamentData(tournamentId) {
      const mod = await loadPreReg();
      return mod.getOwnerTournamentData(tournamentId);
    },
    async listTournamentRegistrations(tournamentId) {
      const mod = await loadPreReg();
      return mod.listTournamentRegistrations(tournamentId);
    },
    async createManualRegistration(tournamentId, input) {
      const mod = await loadPreReg();
      return mod.createManualRegistration(tournamentId, input);
    },
    async adminConfirmPair(tournamentId, regAId, regBId) {
      const mod = await loadPreReg();
      return mod.adminConfirmPair(tournamentId, regAId, regBId);
    },
    async verifyAdminInviteToken(tournamentId, token) {
      const mod = await loadPreReg();
      return mod.verifyAdminInviteToken(tournamentId, token);
    },
    async claimAdminInviteAccess(tournamentId, token) {
      const mod = await loadPreReg();
      return mod.claimAdminInviteAccess(tournamentId, token);
    },
  });
}
