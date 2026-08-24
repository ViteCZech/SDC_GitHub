import { describe, expect, it } from 'vitest';
import { buildImportedTeams, collectCheckedInPairs, isPreregImportEligible } from '../preregTeamImport';

const pair = (id, partnerId, extra = {}) => ({
  id,
  status: 'CONFIRMED',
  attendance: { checkedIn: true },
  pair: { status: 'CONFIRMED', partnerRegistrationId: partnerId },
  player: { name: extra.name ?? id, csoPlayerId: extra.csoPlayerId ?? null },
  ...extra,
});

describe('preregTeamImport', () => {
  it('collectCheckedInPairs bere potvrzené páry i bez check-inu', () => {
    const regs = [
      pair('a', 'b', { name: 'Ada' }),
      pair('b', 'a', { name: 'Bo' }),
      pair('c', 'd', { name: 'Cy', attendance: { checkedIn: false } }),
      {
        id: 'solo',
        status: 'CONFIRMED',
        attendance: { checkedIn: true },
        pair: { status: 'WAITING_PARTNER' },
        player: { name: 'Solo' },
      },
      {
        id: 'pending',
        status: 'PENDING_PAYMENT',
        attendance: { checkedIn: true },
        pair: { status: 'NONE' },
        player: { name: 'Pend' },
      },
    ];
    const { pairs, leftover, eligibleCount } = collectCheckedInPairs(regs);
    expect(eligibleCount).toBe(4);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(leftover.map((r) => r.id).sort()).toEqual(['c', 'solo']);
  });

  it('buildImportedTeams sestaví tým a sečte ČP dvojice', () => {
    const { teams, leftover } = buildImportedTeams(
      [pair('a', 'b', { name: 'Ada', csoPlayerId: 'cso:1' }), pair('b', 'a', { name: 'Bo', csoPlayerId: 'cso:2' })],
      [
        { rank: 4, name: 'Ada', regNumber: '1' },
        { rank: 10, name: 'Bo', regNumber: '2' },
      ]
    );
    expect(leftover).toHaveLength(0);
    expect(teams).toHaveLength(1);
    expect(teams[0].kind).toBe('team');
    expect(teams[0].name).toBe('Ada / Bo');
    expect(teams[0].ranking).toBe(14);
  });

  it('isPreregImportEligible bere jen CONFIRMED, check-in nerozhoduje', () => {
    expect(isPreregImportEligible({ status: 'CONFIRMED', attendance: { checkedIn: false } })).toBe(true);
    expect(isPreregImportEligible({ status: 'CONFIRMED', attendance: { checkedIn: true } })).toBe(true);
    expect(isPreregImportEligible({ status: 'PENDING_PAYMENT', attendance: { checkedIn: true } })).toBe(false);
    expect(isPreregImportEligible({ status: 'WAITLIST' })).toBe(false);
  });
});
