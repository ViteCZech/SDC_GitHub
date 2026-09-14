import { describe, expect, it } from 'vitest';
import {
  TABLET_KIOSK_LOCK_STORAGE_KEY,
  clearTabletKioskLock,
  isTabletKioskSessionValid,
  loadTabletKioskLocked,
  normalizeKioskPinCandidate,
  persistTabletKioskLocked,
  resolveTabletKioskPin,
  verifyTabletKioskPin,
} from '../tabletKioskLock';

const memStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

describe('tabletKioskLock', () => {
  it('normalizuje jen 4místný číselný PIN', () => {
    expect(normalizeKioskPinCandidate('1234')).toBe('1234');
    expect(normalizeKioskPinCandidate(' 1234 ')).toBe('1234');
    expect(normalizeKioskPinCandidate('ab12')).toBe('');
    expect(normalizeKioskPinCandidate('123')).toBe('');
    expect(normalizeKioskPinCandidate('12345')).toBe('');
    expect(normalizeKioskPinCandidate(null)).toBe('');
  });

  it('preferuje heslo tabletu, fallback je PIN turnaje', () => {
    expect(resolveTabletKioskPin({ tabletPassword: '9876', activePin: '1234' })).toBe('9876');
    expect(resolveTabletKioskPin({ tabletPassword: 'ab12', activePin: '1234' })).toBe('1234');
    expect(resolveTabletKioskPin({ tabletPassword: '', activePin: '', tournamentPin: '4321' })).toBe('4321');
    expect(resolveTabletKioskPin({})).toBe('');
  });

  it('verifikace PINu rozlišuje shodu i formát', () => {
    expect(verifyTabletKioskPin('1234', '1234')).toBe(true);
    expect(verifyTabletKioskPin('1234', '0000')).toBe(false);
    expect(verifyTabletKioskPin('1234', '123')).toBe(false);
    expect(verifyTabletKioskPin('', '1234')).toBe(false);
  });

  it('relace je platná jen s PINem a deskou', () => {
    expect(isTabletKioskSessionValid({ pin: '1234', board: '1' })).toBe(true);
    expect(isTabletKioskSessionValid({ pin: '123', board: '1' })).toBe(false);
    expect(isTabletKioskSessionValid({ pin: '1234', board: '' })).toBe(false);
  });

  it('výchozí stav je zamčeno; perzistence přežije refresh', () => {
    const s = memStorage();
    expect(loadTabletKioskLocked(s)).toBe(true);
    persistTabletKioskLocked(s, false);
    expect(s.getItem(TABLET_KIOSK_LOCK_STORAGE_KEY)).toBe('unlocked');
    expect(loadTabletKioskLocked(s)).toBe(false);
    persistTabletKioskLocked(s, true);
    expect(loadTabletKioskLocked(s)).toBe(true);
    clearTabletKioskLock(s);
    expect(loadTabletKioskLocked(s)).toBe(true);
  });
});
