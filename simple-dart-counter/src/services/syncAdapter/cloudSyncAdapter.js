import {
  archivePastTournamentAndDeleteActive,
  deleteCloudTournament,
  heartbeatTabletBoardPresence,
  listenToCloudTournament,
  registerTabletBoardOnline,
  releaseTabletBoardPresence,
  releaseTabletBoardPresenceOnUnload,
  syncTournamentToCloud,
  updateCloudMatchFromTablet,
  verifyTabletBoardAccess,
  verifyTournamentPin,
} from '../tournamentSync';
import { getPublicResultById, listenPublicResultsFeed } from '../publicResultsService';

export function createCloudSyncAdapter() {
  return Object.freeze({
    mode: 'cloud',

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
    registerTabletPresence(pin, board, token, opts = {}) {
      return registerTabletBoardOnline(pin, board, token, opts);
    },
    updateMatchFromTablet(pin, matchType, matchId, matchUpdates, opts = {}) {
      return updateCloudMatchFromTablet(pin, matchType, matchId, matchUpdates, opts);
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
  });
}
