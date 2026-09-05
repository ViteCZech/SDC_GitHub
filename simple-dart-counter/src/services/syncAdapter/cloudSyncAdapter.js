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
import { getPublicResultById, listenPublicResultsFeed } from '../publicResultsService';
import {
  abandonOnlineGameSession as abandonOnlineGameSessionFn,
  cancelOnlineGame as cancelOnlineGameFn,
  getOnlineGameById as getOnlineGameByIdFn,
} from '../onlineGamesService';
import {
  deletePublicMatch as deletePublicMatchFn,
  deletePublicMatchesForUser as deletePublicMatchesForUserFn,
  isCloudDbReady,
  savePublicMatch as savePublicMatchFn,
} from '../matchHistoryCloud';
import {
  adminConfirmPair as adminConfirmPairFn,
  claimAdminInviteAccess as claimAdminInviteAccessFn,
  createManualRegistration as createManualRegistrationFn,
  getOwnerTournamentData as getOwnerTournamentDataFn,
  listTournamentRegistrations as listTournamentRegistrationsFn,
  verifyAdminInviteToken as verifyAdminInviteTokenFn,
} from '../tournamentPreRegService';

export function createCloudSyncAdapter() {
  return Object.freeze({
    mode: 'cloud',
    isBackendReady() {
      return isCloudDbReady();
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
      return listenPublicResultsFeed(callback, onError);
    },
    getPublicResultById(resultId) {
      return getPublicResultById(resultId);
    },

    getOnlineGameById(gameId) {
      return getOnlineGameByIdFn(gameId);
    },
    cancelOnlineGame(gameId) {
      return cancelOnlineGameFn(gameId);
    },
    abandonOnlineGameSession(gameId, myRole) {
      return abandonOnlineGameSessionFn(gameId, myRole);
    },

    savePublicMatch(record) {
      return savePublicMatchFn(record);
    },
    deletePublicMatch(docId) {
      return deletePublicMatchFn(docId);
    },
    deletePublicMatchesForUser(uid) {
      return deletePublicMatchesForUserFn(uid);
    },

    getOwnerTournamentData(tournamentId) {
      return getOwnerTournamentDataFn(tournamentId);
    },
    listTournamentRegistrations(tournamentId) {
      return listTournamentRegistrationsFn(tournamentId);
    },
    createManualRegistration(tournamentId, input) {
      return createManualRegistrationFn(tournamentId, input);
    },
    adminConfirmPair(tournamentId, regAId, regBId) {
      return adminConfirmPairFn(tournamentId, regAId, regBId);
    },
    verifyAdminInviteToken(tournamentId, token) {
      return verifyAdminInviteTokenFn(tournamentId, token);
    },
    claimAdminInviteAccess(tournamentId, token) {
      return claimAdminInviteAccessFn(tournamentId, token);
    },
  });
}
