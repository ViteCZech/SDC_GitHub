import { describe, expect, it } from 'vitest';
import {
  isOnSiteRegistration,
  isOnSiteRegistrationSource,
  resolveRegistrationAmount,
  sumConfirmedEntryFees,
} from '../preregFinance';

describe('preregFinance', () => {
  it('detekuje on-site zdroje včetně legacy ADMIN_MANUAL', () => {
    expect(isOnSiteRegistrationSource('ON_SITE')).toBe(true);
    expect(isOnSiteRegistrationSource('ADMIN_MANUAL')).toBe(true);
    expect(isOnSiteRegistrationSource('PUBLIC')).toBe(false);
    expect(isOnSiteRegistration({ source: 'ON_SITE' })).toBe(true);
  });

  it('preferuje payment.amount, fallbackuje na entryFee', () => {
    expect(resolveRegistrationAmount({ payment: { amount: 250 } }, 200)).toBe(250);
    expect(resolveRegistrationAmount({ payment: { amount: null } }, 200)).toBe(200);
    expect(resolveRegistrationAmount({}, null)).toBe(0);
  });

  it('sčítá jen CONFIRMED a volitelně jen paid řádky', () => {
    const rows = [
      { status: 'CONFIRMED', payment: { amount: 200, isPaid: true } },
      { status: 'CONFIRMED', payment: { amount: 200, isPaid: false } },
      { status: 'WAITLIST', payment: { amount: 200, isPaid: true } },
      { status: 'CONFIRMED', payment: { amount: null, isPaid: true } },
    ];

    expect(sumConfirmedEntryFees(rows, 200)).toBe(600);
    expect(sumConfirmedEntryFees(rows, 200, { paidOnly: true })).toBe(400);
  });
});
