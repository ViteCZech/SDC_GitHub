import React, { lazy, Suspense } from 'react';

export function ScreenFallback({ fill = false }) {
  return (
    <div
      className={
        fill
          ? 'w-full h-full min-h-[100dvh] bg-slate-50 dark:bg-slate-950'
          : 'flex-1 w-full min-h-[30vh] bg-slate-50 dark:bg-slate-950'
      }
      aria-busy="true"
    />
  );
}

function lazyScreen(factory, { fill = false } = {}) {
  const Comp = lazy(factory);
  function LazyWrapped(props) {
    return (
      <Suspense fallback={<ScreenFallback fill={fill} />}>
        <Comp {...props} />
      </Suspense>
    );
  }
  return LazyWrapped;
}

export const GameCricket = lazyScreen(() => import('./components/GameCricket.jsx'), { fill: true });
export const TournamentSetup = lazyScreen(() => import('./components/TournamentSetup.jsx'));
export const TournamentHub = lazyScreen(() => import('./components/TournamentHub.jsx'));
export const TournamentBoardAssignment = lazyScreen(() => import('./components/TournamentBoardAssignment.jsx'));
export const TournamentGroupsView = lazyScreen(() => import('./components/TournamentGroupsView.jsx'));
export const TournamentBracketView = lazyScreen(() => import('./components/TournamentBracketView.jsx'));
export const TournamentStatisticsView = lazyScreen(() => import('./components/TournamentStatisticsView.jsx'));
export const TabletWaitingRoom = lazyScreen(() => import('./components/TabletWaitingRoom.jsx'));
export const TabletBoardQrPanel = lazyScreen(() => import('./components/TabletBoardQrPanel.jsx'));
export const PublicResultsHome = lazyScreen(() => import('./components/public/PublicResultsHome.jsx'));
export const PublicTournamentResultsView = lazyScreen(
  () => import('./components/public/PublicTournamentResultsView.jsx')
);
export const PublicTopPerformancesView = lazyScreen(
  () => import('./components/public/PublicTopPerformancesView.jsx')
);
export const TournamentHistory = lazyScreen(() => import('./components/TournamentHistory.jsx'));
export const PublicTournamentPage = lazyScreen(() => import('./components/prereg/PublicTournamentPage.jsx'));
export const PublicTournamentDirectory = lazyScreen(
  () => import('./components/prereg/PublicTournamentDirectory.jsx')
);
export const TournamentPreRegSetup = lazyScreen(() => import('./components/prereg/TournamentPreRegSetup.jsx'));
export const RegistrationAdminPanel = lazyScreen(() => import('./components/prereg/RegistrationAdminPanel.jsx'));
export const MyPreRegTournamentsList = lazyScreen(
  () => import('./components/prereg/MyPreRegTournamentsList.jsx')
);
export const MatchStatsView = lazyScreen(() => import('./components/MatchStatsView.jsx'), { fill: true });
export const UserProfile = lazyScreen(() => import('./components/UserProfile.jsx'));

export function prefetchCricket() {
  return import('./components/GameCricket.jsx');
}

export function prefetchTournamentScreens() {
  return Promise.all([
    import('./components/TournamentHub.jsx'),
    import('./components/TournamentSetup.jsx'),
    import('./components/TournamentBoardAssignment.jsx'),
    import('./components/TournamentGroupsView.jsx'),
    import('./components/TournamentBracketView.jsx'),
    import('./components/TournamentStatisticsView.jsx'),
    import('./components/TabletWaitingRoom.jsx'),
    import('./components/TabletBoardQrPanel.jsx'),
    import('./components/TournamentHistory.jsx'),
  ]);
}

export function prefetchPublicResults() {
  return Promise.all([
    import('./components/public/PublicResultsHome.jsx'),
    import('./components/public/PublicTournamentResultsView.jsx'),
    import('./components/public/PublicTopPerformancesView.jsx'),
  ]);
}

export function prefetchPrereg() {
  return Promise.all([
    import('./components/prereg/PublicTournamentDirectory.jsx'),
    import('./components/prereg/PublicTournamentPage.jsx'),
    import('./components/prereg/TournamentPreRegSetup.jsx'),
    import('./components/prereg/RegistrationAdminPanel.jsx'),
    import('./components/prereg/MyPreRegTournamentsList.jsx'),
  ]);
}

export function prefetchOnlineHub() {
  return import('./components/OnlineHub.jsx');
}

export function prefetchMatchStats() {
  return import('./components/MatchStatsView.jsx');
}

export function prefetchUserProfile() {
  return import('./components/UserProfile.jsx');
}
