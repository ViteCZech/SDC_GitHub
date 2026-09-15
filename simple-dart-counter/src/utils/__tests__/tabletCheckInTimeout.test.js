import { describe, expect, it } from 'vitest';
import {
  bumpRoleWarningCounts,
  checkInSecondsAfterWarningAck,
  TABLET_CHECKIN_DEFAULT_SECONDS,
  TABLET_CHECKIN_AFTER_WARN1_SECONDS,
  TABLET_CHECKIN_AFTER_WARN2_SECONDS,
  TABLET_CHECKIN_MAX_WARNINGS,
} from '../tabletCheckInTimeout';

describe('tabletCheckInTimeout', () => {
  it('exportuje správné konstanty pro timeouty check-inu', () => {
    expect(TABLET_CHECKIN_DEFAULT_SECONDS).toBe(180);
    expect(TABLET_CHECKIN_AFTER_WARN1_SECONDS).toBe(90);
    expect(TABLET_CHECKIN_AFTER_WARN2_SECONDS).toBe(60);
    expect(TABLET_CHECKIN_MAX_WARNINGS).toBe(3);
  });

  it('1. varování zkrátí limit na 90 s, 2. na 60 s, 3. a vyšší už ne', () => {
    expect(checkInSecondsAfterWarningAck(1)).toBe(90);
    expect(checkInSecondsAfterWarningAck(2)).toBe(60);
    expect(checkInSecondsAfterWarningAck(3)).toBeNull();
    expect(checkInSecondsAfterWarningAck(0)).toBeNull();
    expect(checkInSecondsAfterWarningAck(4)).toBeNull();
    expect(checkInSecondsAfterWarningAck('1')).toBe(90);
    expect(checkInSecondsAfterWarningAck('2')).toBe(60);
    expect(checkInSecondsAfterWarningAck(null)).toBeNull();
    expect(checkInSecondsAfterWarningAck(undefined)).toBeNull();
  });

  it('bumpRoleWarningCounts přičte jen chybějícím rolím', () => {
    expect(bumpRoleWarningCounts({}, { p1: true, p2: false, referee: false })).toEqual({
      p1: 0,
      p2: 1,
      referee: 1,
    });
  });

  it('bumpRoleWarningCounts správně kumuluje s existujícími počty', () => {
    const prev = { p1: 1, p2: 0, referee: 2 };
    const next = bumpRoleWarningCounts(prev, { p1: false, p2: true, referee: false });
    expect(next).toEqual({
      p1: 2,
      p2: 0,
      referee: 3,
    });
  });

  it('bumpRoleWarningCounts ošetřuje prázdné nebo nevalidní vstupy', () => {
    expect(bumpRoleWarningCounts(null, null)).toEqual({
      p1: 1,
      p2: 1,
      referee: 1,
    });
    expect(bumpRoleWarningCounts({ p1: 'bad', p2: undefined }, { p1: true, p2: true, referee: true })).toEqual({
      p1: 0,
      p2: 0,
      referee: 0,
    });
  });
});
