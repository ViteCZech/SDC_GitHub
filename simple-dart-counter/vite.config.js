import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: false,
      workbox: {
        // TOTO JE KLÍČOVÉ: Říká PWA, aby ignorovalo Firebase Auth a .well-known složku
        navigateFallbackDenylist: [/^\/__/, /^\/\.well-known\//],
        globIgnores: [
          '**/TournamentSetup-*.js',
          '**/TournamentHub-*.js',
          '**/TournamentBoardAssignment-*.js',
          '**/TournamentGroupsView-*.js',
          '**/TournamentBracketView-*.js',
          '**/TournamentStatisticsView-*.js',
          '**/TournamentHistory-*.js',
          '**/TournamentPreRegSetup-*.js',
          '**/GameCricket-*.js',
          '**/OnlineHub-*.js',
          '**/OnlineVideoContainer-*.js',
          '**/PostMatchView-*.js',
          '**/PublicResultsHome-*.js',
          '**/PublicTournamentResultsView-*.js',
          '**/PublicTopPerformancesView-*.js',
          '**/PublicTournamentPage-*.js',
          '**/PublicTournamentDirectory-*.js',
          '**/RegistrationAdminPanel-*.js',
          '**/MyPreRegTournamentsList-*.js',
          '**/TabletWaitingRoom-*.js',
          '**/TabletBoardQrPanel-*.js',
          '**/VenueDisplayView-*.js',
          '**/MatchStatsView-*.js',
          '**/UserProfile-*.js',
          '**/en-*.js',
          '**/pl-*.js',
          '**/tournamentPreRegService-*.js',
          '**/publicResultsService-*.js',
          '**/matchHistoryCloud-*.js',
        ],
      }
    })
  ],
  // Zajišťuje, že statické soubory včetně .well-known budou v buildu
  publicDir: 'public',
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.js'],
          setupFiles: ['./src/test/i18nSetup.js'],
          exclude: [
            'src/utils/__tests__/preregStorage.test.js',
            'src/utils/__tests__/uiResumeStorage.test.js',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: [
            'src/**/*.test.jsx',
            'src/utils/__tests__/preregStorage.test.js',
            'src/utils/__tests__/uiResumeStorage.test.js',
          ],
          setupFiles: ['./src/test/setup.js', './src/test/i18nSetup.js'],
        },
      },
    ],
  },
})
