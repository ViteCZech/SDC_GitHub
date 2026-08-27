import { describe, expect, it } from 'vitest';
import { resolveAppNav, shouldParkTournamentSession } from '../appNavigation';

describe('appNavigation', () => {
  it('domů bez submenu nemá šipky; hraní má Pause, ne AppNavBar', () => {
    expect(resolveAppNav({ appState: 'home' })).toEqual({
      showBack: false,
      showHome: false,
      backTarget: null,
    });
    expect(resolveAppNav({ appState: 'playing' }).showBack).toBe(false);
    expect(resolveAppNav({ appState: 'match_finished' }).showHome).toBe(false);
  });

  it('krok setupu 2 se vrací na krok 1, krok 1 opouští setup', () => {
    expect(resolveAppNav({ appState: 'tournament_setup', tournamentSetupStep: 2 }).backTarget).toEqual({
      type: 'setupStep',
      step: 1,
    });
    expect(resolveAppNav({ appState: 'tournament_setup', tournamentSetupStep: 1 }).backTarget).toEqual({
      type: 'leaveTournamentSetup',
    });
  });

  it('veřejná přihláška z katalogu se vrací do katalogu', () => {
    expect(resolveAppNav({ appState: 'prereg_public', preregReturnToCatalog: true }).backTarget).toEqual({
      type: 'preregBackToCatalog',
    });
  });

  it('veřejné výsledky mají správné zpět cíle', () => {
    expect(resolveAppNav({ appState: 'public_results_home' }).backTarget).toEqual({
      type: 'state',
      state: 'home',
    });
    expect(resolveAppNav({ appState: 'public_top_performances' }).backTarget).toEqual({
      type: 'state',
      state: 'public_results_home',
    });
    expect(resolveAppNav({ appState: 'public_results_detail' }).backTarget).toEqual({
      type: 'state',
      state: 'public_results_home',
    });
  });

  it('viewer ve skupinách odchází, admin se vrací k terčům', () => {
    expect(resolveAppNav({ appState: 'tournament_groups', userRole: 'viewer' }).backTarget).toEqual({
      type: 'leaveViewer',
    });
    expect(resolveAppNav({ appState: 'tournament_groups', userRole: 'admin' }).backTarget).toEqual({
      type: 'state',
      state: 'tournament_board_assignment',
    });
  });

  it('parkovat turnaj jen admin/viewer s daty ve správném stavu', () => {
    expect(shouldParkTournamentSession('tournament_groups', 'admin', true)).toBe(true);
    expect(shouldParkTournamentSession('home', 'admin', true)).toBe(false);
    expect(shouldParkTournamentSession('tournament_groups', 'tablet', true)).toBe(false);
    expect(shouldParkTournamentSession('tournament_groups', 'admin', false)).toBe(false);
  });
});
