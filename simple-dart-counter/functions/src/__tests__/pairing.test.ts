import { describe, expect, it } from 'vitest';
import {
  canAppearInPartnerList,
  createdAtMs,
  findOldestWaitlistPair,
  gendersCompatible,
  normalizeGender,
  pairStatusOf,
  publicPairView,
} from '../pairing';

describe('pairing', () => {
  it('normalizeGender bere jen M/F', () => {
    expect(normalizeGender('m')).toBe('M');
    expect(normalizeGender('F')).toBe('F');
    expect(normalizeGender('x')).toBeNull();
  });

  it('mix vyžaduje opačné pohlaví, doubles je bez omezení', () => {
    expect(gendersCompatible('mixed', 'M', 'F')).toBe(true);
    expect(gendersCompatible('mixed', 'M', 'M')).toBe(false);
    expect(gendersCompatible('mixed', 'M', null)).toBe(false);
    expect(gendersCompatible('doubles', 'M', 'M')).toBe(true);
  });

  it('do seznamu partnerů nepatří CONFIRMED / PENDING_INVITE ani storno', () => {
    expect(canAppearInPartnerList({ status: 'CONFIRMED', pair: { status: 'NONE' } })).toBe(true);
    expect(canAppearInPartnerList({ status: 'WAITLIST', pair: { status: 'WAITING_PARTNER' } })).toBe(
      true
    );
    expect(canAppearInPartnerList({ status: 'CONFIRMED', pair: { status: 'CONFIRMED' } })).toBe(
      false
    );
    expect(canAppearInPartnerList({ status: 'CONFIRMED', pair: { status: 'PENDING_INVITE' } })).toBe(
      false
    );
    expect(canAppearInPartnerList({ status: 'CANCELLED', pair: { status: 'NONE' } })).toBe(false);
  });

  it('publicPairView: potvrdit může jen adresát pozvánky', () => {
    const invite = {
      pair: { status: 'PENDING_INVITE', initiatedBy: 'r1', partnerRegistrationId: 'r2' },
    };
    expect(publicPairView('r2', invite).canConfirm).toBe(true);
    expect(publicPairView('r1', invite).canConfirm).toBe(false);
    expect(publicPairView('r2', invite).canDecline).toBe(true);
  });

  it('createdAtMs čte seconds i toMillis', () => {
    expect(createdAtMs({ createdAt: { seconds: 2 } })).toBe(2000);
    expect(createdAtMs({ createdAt: { toMillis: () => 1500 } })).toBe(1500);
    expect(createdAtMs({})).toBe(0);
  });

  it('findOldestWaitlistPair vezme nejstarší potvrzený pár', () => {
    const snap = (id: string, created: number, partnerId: string) =>
      ({
        id,
        data: () => ({
          createdAt: { seconds: created },
          pair: { status: 'CONFIRMED', partnerRegistrationId: partnerId },
        }),
      }) as FirebaseFirestore.QueryDocumentSnapshot;

    const a = snap('a', 10, 'b');
    const b = snap('b', 11, 'a');
    const c = snap('c', 5, 'd');
    const d = snap('d', 6, 'c');
    const waiting = {
      id: 'w',
      data: () => ({
        createdAt: { seconds: 1 },
        pair: { status: 'WAITING_PARTNER', partnerRegistrationId: null },
      }),
    } as FirebaseFirestore.QueryDocumentSnapshot;

    const oldest = findOldestWaitlistPair([waiting, a, b, c, d]);
    expect(oldest?.a.id).toBe('c');
    expect(oldest?.b.id).toBe('d');
  });

  it('pairStatusOf padá na NONE', () => {
    expect(pairStatusOf(undefined)).toBe('NONE');
    expect(pairStatusOf({ pair: { status: 'BROKEN' } })).toBe('BROKEN');
    expect(pairStatusOf({ pair: { status: 'weird' } })).toBe('NONE');
  });
});
