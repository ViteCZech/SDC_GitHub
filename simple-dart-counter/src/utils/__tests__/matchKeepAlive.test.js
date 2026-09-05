import { describe, expect, it } from 'vitest';
import {
  isMatchParkedKept,
  shouldKeepMatchUnderStats,
  shouldMountMatchSurface,
} from '../matchKeepAlive';

const parkedMatch = { kind: 'match', mountKept: true, title: 'A vs B' };

describe('matchKeepAlive', () => {
  it('mountuje plochu při playing i při park keep-alive', () => {
    expect(shouldMountMatchSurface('playing', null)).toBe(true);
    expect(shouldMountMatchSurface('home', parkedMatch)).toBe(true);
    expect(shouldMountMatchSurface('history', parkedMatch)).toBe(true);
    expect(shouldMountMatchSurface('tutorial', parkedMatch)).toBe(true);
    expect(shouldMountMatchSurface('home', null)).toBe(false);
    expect(shouldMountMatchSurface('match_finished', null)).toBe(false);
  });

  it('historie / stats nad parkovaným zápasem nesmí odpojit strom', () => {
    expect(
      shouldKeepMatchUnderStats({
        appState: 'history',
        selectedMatchDetail: { id: 1 },
        parkedSession: parkedMatch,
      })
    ).toBe(true);
    expect(
      shouldKeepMatchUnderStats({
        appState: 'home',
        selectedMatchDetail: { id: 1 },
        parkedSession: parkedMatch,
      })
    ).toBe(true);
    expect(
      shouldKeepMatchUnderStats({
        appState: 'history',
        selectedMatchDetail: { id: 1 },
        parkedSession: null,
      })
    ).toBe(false);
    expect(
      shouldKeepMatchUnderStats({
        appState: 'match_finished',
        selectedMatchDetail: { id: 1 },
        parkedSession: null,
      })
    ).toBe(false);
  });

  it('turnajový park není match keep-alive', () => {
    expect(isMatchParkedKept({ kind: 'tournament', mountKept: true })).toBe(false);
    expect(isMatchParkedKept({ kind: 'match', mountKept: false })).toBe(false);
  });
});
