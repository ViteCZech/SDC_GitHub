// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { UI_RESUME_KEY, clearUiResume, loadUiResume, saveUiResume } from '../uiResumeStorage';

afterEach(() => {
  localStorage.clear();
});

describe('uiResumeStorage', () => {
  it('neukládá playing — živá hra má vlastní reconnect', () => {
    saveUiResume({ appState: 'playing' });
    expect(loadUiResume()).toBeNull();
  });

  it('uloží prereg_catalog a znovu ho načte', () => {
    saveUiResume({
      appState: 'prereg_catalog',
      preregReturnToCatalog: true,
      activePreRegTournamentId: 't1',
    });
    const loaded = loadUiResume();
    expect(loaded.appState).toBe('prereg_catalog');
    expect(loaded.preregReturnToCatalog).toBe(true);
    expect(loaded.activePreRegTournamentId).toBe('t1');
  });

  it('home zachová tournamentDraft z předchozího resume', () => {
    saveUiResume({ appState: 'tournament_setup', tournamentDraft: { name: 'Open' }, tournamentSetupStep: 2 });
    saveUiResume({ appState: 'home' });
    const loaded = loadUiResume();
    expect(loaded.appState).toBe('home');
    expect(loaded.tournamentDraft).toEqual({ name: 'Open' });
    expect(loaded.tournamentSetupStep).toBe(2);
  });

  it('starší než 7 dní ignoruje; clear smaže', () => {
    localStorage.setItem(
      UI_RESUME_KEY,
      JSON.stringify({ appState: 'about', savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 })
    );
    expect(loadUiResume()).toBeNull();
    saveUiResume({ appState: 'about' });
    clearUiResume();
    expect(loadUiResume()).toBeNull();
  });
});
