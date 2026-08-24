import { describe, expect, it } from 'vitest';
import {
  clampDateTimeLocal,
  getPublicRegistrationUrl,
  hashAdminPin,
  isDeadlineAfterStart,
  parseOptionalNumber,
  parseOptionalString,
  resolveFilterAfterRestore,
} from '../preregAdmin';

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

describe('preregAdmin helpers', () => {
  it('parseOptionalNumber / String: prázdné je null', () => {
    expect(parseOptionalNumber('')).toBeNull();
    expect(parseOptionalNumber('12.5')).toBe(12.5);
    expect(parseOptionalString('  ')).toBeNull();
    expect(parseOptionalString(' Brno ')).toBe('Brno');
  });

  it('getPublicRegistrationUrl v node je relativní /t/id', () => {
    expect(getPublicRegistrationUrl('abc 1')).toBe('/t/abc%201');
  });

  it('hashAdminPin je SHA-256 hex a prázdný PIN je prázdný řetězec', async () => {
    expect(await hashAdminPin('')).toBe('');
    const h = await hashAdminPin('1234');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(await hashAdminPin('1234'));
    expect(h).not.toBe(await hashAdminPin('1235'));
  });

  it('resolveFilterAfterRestore drží filtr ALL beze změny', () => {
    expect(resolveFilterAfterRestore('ALL', 'CONFIRMED')).toBe('ALL');
  });

  it('resolveFilterAfterRestore nepřepíná na status, když je stejný filtr aktivní', () => {
    expect(resolveFilterAfterRestore('CONFIRMED', 'CONFIRMED')).toBe('CONFIRMED');
  });

  it('resolveFilterAfterRestore vrátí ALL, když by obnovený hráč ve filtru zmizel', () => {
    expect(resolveFilterAfterRestore('CANCELLED', 'CONFIRMED')).toBe('ALL');
    expect(resolveFilterAfterRestore('REFUND_DUE', 'PENDING_PAYMENT')).toBe('ALL');
  });
});
