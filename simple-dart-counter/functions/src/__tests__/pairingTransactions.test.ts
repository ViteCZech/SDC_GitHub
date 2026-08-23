import { describe, expect, it } from 'vitest';
import {
  applyPairConfirm,
  applyPairDecline,
  emptyPair,
  writePairInvite,
} from '../pairing';
import { mockRef, mockTransaction, patchOf } from './firestoreMock';

const doublesTour = {
  meta: { competitionType: 'doubles', capacity: 8, waitlistEnabled: false },
  counters: { confirmedTeams: 2, confirmed: 4 },
  finance: { feeMode: 'split' },
};

function playerReg(name: string, extra: Record<string, unknown> = {}) {
  return {
    status: 'CONFIRMED',
    player: { name },
    pair: { status: 'PENDING_INVITE', initiatedBy: 'a', inviteToken: 'tok' },
    createdAt: { seconds: 10 },
    ...extra,
  };
}

describe('pairing transactions', () => {
  it('writePairInvite zapíše PENDING_INVITE oběma stranám', () => {
    const { transaction, updates } = mockTransaction();
    writePairInvite({
      transaction,
      requesterRef: mockRef('a'),
      requesterName: 'Ada',
      targetRef: mockRef('b'),
      targetData: { player: { name: 'Bo' } },
      initiatedBy: 'a',
      inviteToken: 'inv-1',
      now: 'NOW' as unknown as FirebaseFirestore.FieldValue,
    });
    expect(patchOf(updates, 'a')?.pair).toMatchObject({
      status: 'PENDING_INVITE',
      partnerRegistrationId: 'b',
      partnerName: 'Bo',
      initiatedBy: 'a',
      inviteToken: 'inv-1',
    });
    expect(patchOf(updates, 'b')?.pair).toMatchObject({
      status: 'PENDING_INVITE',
      partnerRegistrationId: 'a',
      partnerName: 'Ada',
      initiatedBy: 'a',
    });
  });

  it('applyPairConfirm potvrdí pár a přičte confirmedTeams', () => {
    const { transaction, updates } = mockTransaction();
    const out = applyPairConfirm({
      transaction,
      tournamentRef: mockRef('tour'),
      tourData: doublesTour,
      aRef: mockRef('a'),
      aData: playerReg('Ada'),
      bRef: mockRef('b'),
      bData: playerReg('Bo', { createdAt: { seconds: 11 } }),
    });
    expect(out.waitlisted).toBe(false);
    expect(patchOf(updates, 'a')?.pair).toMatchObject({
      status: 'CONFIRMED',
      partnerRegistrationId: 'b',
      partnerName: 'Bo',
    });
    expect(patchOf(updates, 'b')?.pair).toMatchObject({
      status: 'CONFIRMED',
      partnerRegistrationId: 'a',
      partnerName: 'Ada',
    });
    expect(patchOf(updates, 'tour')).toHaveProperty('counters.confirmedTeams');
  });

  it('plná kapacita bez waitlistu hodí PAIR_CAPACITY', () => {
    const { transaction } = mockTransaction();
    expect(() =>
      applyPairConfirm({
        transaction,
        tournamentRef: mockRef('tour'),
        tourData: {
          ...doublesTour,
          counters: { confirmedTeams: 8 },
        },
        aRef: mockRef('a'),
        aData: playerReg('Ada'),
        bRef: mockRef('b'),
        bData: playerReg('Bo'),
      })
    ).toThrow('PAIR_CAPACITY');
  });

  it('plná kapacita s waitlistem přesune pár na WAITLIST', () => {
    const { transaction, updates } = mockTransaction();
    const out = applyPairConfirm({
      transaction,
      tournamentRef: mockRef('tour'),
      tourData: {
        ...doublesTour,
        meta: { ...doublesTour.meta, waitlistEnabled: true },
        counters: { confirmedTeams: 8, confirmed: 16 },
      },
      aRef: mockRef('a'),
      aData: playerReg('Ada'),
      bRef: mockRef('b'),
      bData: playerReg('Bo'),
    });
    expect(out.waitlisted).toBe(true);
    expect(patchOf(updates, 'a')?.status).toBe('WAITLIST');
    expect(patchOf(updates, 'b')?.status).toBe('WAITLIST');
    expect(patchOf(updates, 'tour')).toHaveProperty('counters.waitlist');
  });

  it('feeMode pair: později přihlášený bez platby má amount 0', () => {
    const { transaction, updates } = mockTransaction();
    applyPairConfirm({
      transaction,
      tournamentRef: mockRef('tour'),
      tourData: { ...doublesTour, finance: { feeMode: 'pair' } },
      aRef: mockRef('a'),
      aData: playerReg('Ada', { createdAt: { seconds: 5 }, payment: { isPaid: true, amount: 200 } }),
      bRef: mockRef('b'),
      bData: playerReg('Bo', { createdAt: { seconds: 20 }, payment: { isPaid: false, amount: 200 } }),
    });
    expect(patchOf(updates, 'b')).toMatchObject({ 'payment.amount': 0 });
    expect(patchOf(updates, 'a')).not.toHaveProperty('payment.amount');
  });

  it('applyPairDecline: iniciátor zruší pozvánku oběma, adresát nechá DECLINED', () => {
    const invite = {
      pair: { status: 'PENDING_INVITE', initiatedBy: 'a', inviteToken: 't' },
      player: { name: 'Ada' },
    };
    const { transaction: tx1, updates: u1 } = mockTransaction();
    applyPairDecline({
      transaction: tx1,
      actorRef: mockRef('a'),
      actorData: invite,
      partnerRef: mockRef('b'),
      partnerData: { pair: invite.pair, player: { name: 'Bo' } },
    });
    expect(patchOf(u1, 'a')?.pair).toEqual(emptyPair());
    expect(patchOf(u1, 'b')?.pair).toEqual(emptyPair());

    const { transaction: tx2, updates: u2 } = mockTransaction();
    applyPairDecline({
      transaction: tx2,
      actorRef: mockRef('b'),
      actorData: { pair: invite.pair, player: { name: 'Bo' } },
      partnerRef: mockRef('a'),
      partnerData: invite,
    });
    expect(patchOf(u2, 'a')?.pair).toMatchObject({ status: 'DECLINED', partnerRegistrationId: 'b' });
    expect(patchOf(u2, 'b')?.pair).toEqual(emptyPair());
  });
});
