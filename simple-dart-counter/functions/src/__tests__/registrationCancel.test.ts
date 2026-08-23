import { describe, expect, it } from 'vitest';
import { applyRegistrationCancel } from '../registrationCancel';
import { mockRef, mockSnap, mockTransaction, patchOf } from './firestoreMock';

describe('applyRegistrationCancel', () => {
  it('storno CONFIRMED singles sníží confirmed, zaplacené označí refundDue', () => {
    const { transaction, updates } = mockTransaction();
    const out = applyRegistrationCancel({
      transaction,
      tournamentRef: mockRef('tour'),
      regRef: mockRef('r1'),
      tourData: { meta: { competitionType: 'singles', waitlistEnabled: false } },
      regData: { status: 'CONFIRMED', payment: { isPaid: true } },
      cancelledBy: 'PLAYER',
      waitlistDocs: [],
    });
    expect(out.previousStatus).toBe('CONFIRMED');
    expect(out.refundDue).toBe(true);
    expect(out.waitlistPromoted).toBe(false);
    expect(patchOf(updates, 'r1')).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'PLAYER',
      'payment.refundDue': true,
    });
    expect(patchOf(updates, 'tour')).toHaveProperty('counters.confirmed');
  });

  it('WAITLIST jen sníží waitlist counter', () => {
    const { transaction, updates } = mockTransaction();
    applyRegistrationCancel({
      transaction,
      tournamentRef: mockRef('tour'),
      regRef: mockRef('r1'),
      tourData: { meta: { competitionType: 'singles' } },
      regData: { status: 'WAITLIST', payment: { isPaid: false } },
      cancelledBy: 'ADMIN',
      waitlistDocs: [],
    });
    expect(patchOf(updates, 'tour')).toHaveProperty('counters.waitlist');
    expect(patchOf(updates, 'tour')).not.toHaveProperty('counters.confirmed');
  });

  it('CONFIRMED singles s waitlistem povýší nejstarší WAITLIST', () => {
    const { transaction, updates } = mockTransaction();
    const older = mockSnap('w-old', { status: 'WAITLIST', createdAt: { seconds: 1 } });
    const newer = mockSnap('w-new', { status: 'WAITLIST', createdAt: { seconds: 9 } });
    const out = applyRegistrationCancel({
      transaction,
      tournamentRef: mockRef('tour'),
      regRef: mockRef('r1'),
      tourData: { meta: { competitionType: 'singles', waitlistEnabled: true } },
      regData: { status: 'CONFIRMED', payment: { isPaid: false } },
      cancelledBy: 'ADMIN',
      waitlistDocs: [newer, older],
    });
    expect(out.waitlistPromoted).toBe(true);
    expect(out.promotedRegistrationId).toBe('w-old');
    expect(patchOf(updates, 'w-old')?.status).toBe('CONFIRMED');
    expect(patchOf(updates, 'tour')).toHaveProperty('counters.waitlist');
  });

  it('rozbije pár partnerovi (BROKEN)', () => {
    const { transaction, updates } = mockTransaction();
    applyRegistrationCancel({
      transaction,
      tournamentRef: mockRef('tour'),
      regRef: mockRef('r1'),
      tourData: { meta: { competitionType: 'doubles', waitlistEnabled: false } },
      regData: { status: 'CONFIRMED', pair: { status: 'CONFIRMED' } },
      cancelledBy: 'PLAYER',
      waitlistDocs: [],
      partnerSnap: mockSnap('r2', { status: 'CONFIRMED' }),
    });
    expect(patchOf(updates, 'r2')).toMatchObject({ 'pair.status': 'BROKEN' });
    expect(patchOf(updates, 'tour')).toHaveProperty('counters.confirmedTeams');
  });
});
