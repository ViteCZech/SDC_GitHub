import { describe, expect, it } from 'vitest';
import { clampDateTimeLocal, isDeadlineAfterStart } from '../preregAdmin';

describe('preregAdmin datetime', () => {
  it('isDeadlineAfterStart: stejný okamžik není po startu', () => {
    expect(isDeadlineAfterStart('2026-08-29T10:00', '2026-08-29T10:00')).toBe(false);
    expect(isDeadlineAfterStart('2026-08-29T12:00', '2026-08-29T10:00')).toBe(true);
    expect(isDeadlineAfterStart('2026-08-29T09:00', '2026-08-29T10:00')).toBe(false);
  });

  it('clampDateTimeLocal ořízne uzávěrku, která by spadla po startu (default 12:00 vs start 10:00)', () => {
    expect(clampDateTimeLocal('2026-08-29T12:00', { max: '2026-08-29T10:00' })).toBe(
      '2026-08-29T10:00'
    );
  });

  it('clampDateTimeLocal nechá platnou uzávěrku před startem', () => {
    expect(clampDateTimeLocal('2026-08-29T09:00', { max: '2026-08-29T10:00' })).toBe(
      '2026-08-29T09:00'
    );
  });
});
