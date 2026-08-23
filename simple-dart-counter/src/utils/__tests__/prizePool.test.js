import { describe, expect, it } from 'vitest';
import {
  calculatePrizePool,
  distributePrizePool,
  getDistributionTemplate,
} from '../prizePool';

describe('prizePool', () => {
  it('bez startovného nebo hráčů vrací nuly', () => {
    expect(calculatePrizePool({ entryFee: null, confirmedCount: 10 })).toEqual({
      gross: 0,
      net: 0,
      organizerFee: 0,
      prizePool: 0,
    });
    expect(calculatePrizePool({ entryFee: 100, confirmedCount: 0 })).toEqual({
      gross: 0,
      net: 0,
      organizerFee: 0,
      prizePool: 0,
    });
  });

  it('počítá hrubý, čistý a poplatek organizátora (včetně sponzora)', () => {
    const out = calculatePrizePool({
      entryFee: 100,
      confirmedCount: 10,
      payoutPercent: 70,
      sponsorMoney: 200,
    });
    expect(out.gross).toBe(1200);
    expect(out.net).toBe(840);
    expect(out.organizerFee).toBe(360);
    expect(out.prizePool).toBe(840);
  });

  it('bez payoutPercent vyplácí 100 %', () => {
    expect(calculatePrizePool({ entryFee: 50, confirmedCount: 4 }).prizePool).toBe(200);
  });

  it('do 32 hráčů TOP4, nad 32 TOP8', () => {
    expect(getDistributionTemplate(32)).toBe('TOP4');
    expect(getDistributionTemplate(33)).toBe('TOP8');
    expect(getDistributionTemplate(0)).toBeNull();
  });

  it('distributePrizePool zaokrouhluje dolů podle poměrů', () => {
    const rows = distributePrizePool(1000, 'TOP4');
    expect(rows.map((r) => r.amount)).toEqual([500, 250, 125]);
    expect(distributePrizePool(0, 'TOP4')).toEqual([]);
  });
});
