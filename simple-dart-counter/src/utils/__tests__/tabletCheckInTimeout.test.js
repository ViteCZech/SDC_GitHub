import { describe, expect, it } from 'vitest';
import {
  bumpRoleWarningCounts,
  checkInSecondsAfterWarningAck,
} from '../tabletCheckInTimeout';

describe('tabletCheckInTimeout', () => {
  it('1. varování zkrátí limit na 90 s, 2. na 60 s, 3. už ne', () => {
    expect(checkInSecondsAfterWarningAck(1)).toBe(90);
    expect(checkInSecondsAfterWarningAck(2)).toBe(60);
    expect(checkInSecondsAfterWarningAck(3)).toBeNull();
  });

  it('bumpRoleWarningCounts přičte jen chybějícím rolím', () => {
    expect(bumpRoleWarningCounts({}, { p1: true, p2: false, referee: false })).toEqual({
      p1: 0,
      p2: 1,
      referee: 1,
    });
  });
});
