import { describe, expect, it } from 'vitest';
import {
  buildHelpReturnState,
  resolveHelpBackSectionKey,
  resolveHelpTab,
} from '../contextHelp';

describe('contextHelp utils', () => {
  it('mapuje topic na správný tutorial tab', () => {
    expect(resolveHelpTab('x01-mode')).toBe('x01');
    expect(resolveHelpTab('offline-mode')).toBe('tournaments');
    expect(resolveHelpTab('unknown-topic')).toBe('tournaments');
  });

  it('zachová returnState včetně návratové trasy', () => {
    const snapshot = buildHelpReturnState({
      appState: 'public_results_detail',
      returnRoute: '/results/abc123',
      tutorialTab: 'tournaments',
      tournamentSetupStep: 3,
      publicResultId: 'abc123',
      userRole: 'viewer',
    });

    expect(snapshot).toEqual({
      appState: 'public_results_detail',
      returnRoute: '/results/abc123',
      tutorialTab: 'tournaments',
      homeSubmenu: null,
      tournamentSetupStep: 3,
      preregReturnToCatalog: false,
      preregTournamentId: null,
      activePreRegTournamentId: null,
      publicResultId: 'abc123',
      userRole: 'viewer',
    });
  });

  it('vrací klíč názvu původní sekce', () => {
    expect(resolveHelpBackSectionKey('home')).toBe('helpSectionHome');
    expect(resolveHelpBackSectionKey('playing')).toBe('helpSectionGame');
    expect(resolveHelpBackSectionKey('tournament_groups')).toBe('helpSectionTournament');
    expect(resolveHelpBackSectionKey('public_results_home')).toBe('helpSectionPublicResults');
  });
});
