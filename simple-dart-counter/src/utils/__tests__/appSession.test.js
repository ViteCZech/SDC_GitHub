import { beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_BOARD_KEY,
  SESSION_PIN_KEY,
  SESSION_ROLE_KEY,
  SESSION_TABLET_PW_KEY,
  clearSpectatorSession,
  createDefaultTournamentDraft,
  generatePin,
  loadSafeTournamentData,
  mergeDraftFromResume,
  persistSpectatorSession,
  tabletCloudAuthOpts,
} from '../appSession';

const memory = new Map();

function installMemoryStorage() {
  memory.clear();
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => {
      memory.set(key, String(value));
    },
    removeItem: (key) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
  };
}

describe('appSession', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('generatePin vrací čtyřmístný řetězec', () => {
    for (let i = 0; i < 20; i++) {
      expect(generatePin()).toMatch(/^\d{4}$/);
    }
  });

  it('persistuje tablet relaci s tokenem a smaže heslo', () => {
    persistSpectatorSession('tablet', '1234', '2', 'pw12', 'tok-abc');
    expect(localStorage.getItem(SESSION_ROLE_KEY)).toBe('tablet');
    expect(localStorage.getItem(SESSION_PIN_KEY)).toBe('1234');
    expect(localStorage.getItem(SESSION_BOARD_KEY)).toBe('2');
    expect(localStorage.getItem(SESSION_TABLET_PW_KEY)).toBeNull();
    expect(tabletCloudAuthOpts()).toEqual({ board: '2', boardToken: 'tok-abc' });
    clearSpectatorSession();
    expect(localStorage.getItem(SESSION_ROLE_KEY)).toBeNull();
    expect(tabletCloudAuthOpts()).toEqual({ tabletPassword: '' });
  });

  it('ignoruje neplatný PIN a nemění relaci', () => {
    persistSpectatorSession('viewer', '12');
    expect(localStorage.getItem(SESSION_ROLE_KEY)).toBeNull();
  });

  it('mergeDraftFromResume doplní defaulty a ochrání players', () => {
    const merged = mergeDraftFromResume({ name: 'Pátek', players: 'bad' });
    expect(merged.name).toBe('Pátek');
    expect(merged.players).toEqual([]);
    expect(merged.format).toBe(createDefaultTournamentDraft().format);
  });

  it('loadSafeTournamentData migruje legacy formát skupin', () => {
    localStorage.setItem(
      'dartsTournamentData',
      JSON.stringify({ name: 'Cup', players: [], tournamentFormat: 'groups_ko' })
    );
    const { value, hadError } = loadSafeTournamentData();
    expect(hadError).toBe(false);
    expect(value.tournamentFormat).toBe('groups_bracket');
  });

  it('loadSafeTournamentData smaže poškozená data', () => {
    localStorage.setItem('dartsTournamentData', '{"noPlayers":true}');
    const { value, hadError } = loadSafeTournamentData();
    expect(value).toBeNull();
    expect(hadError).toBe(true);
    expect(localStorage.getItem('dartsTournamentData')).toBeNull();
  });
});
