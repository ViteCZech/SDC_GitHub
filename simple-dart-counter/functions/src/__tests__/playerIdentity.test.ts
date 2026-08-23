import { describe, expect, it } from 'vitest';
import {
  playersAreSame,
  resolveCsoPlayerId,
  stableNamePlayerId,
} from '../playerIdentity';
import { isCancellableStatus } from '../registrationCancel';

describe('playerIdentity (functions)', () => {
  it('resolveCsoPlayerId prefixuje číslo, name: nechá, bez id použije jméno', () => {
    expect(resolveCsoPlayerId({ regNumber: '42' })).toBe('cso:42');
    expect(resolveCsoPlayerId({ csoPlayerId: 'cso:9' })).toBe('cso:9');
    expect(resolveCsoPlayerId({ name: 'Jan Novák' })).toBe('name:jan novak');
    expect(stableNamePlayerId('  Petr  Svoboda ')).toBe('name:petr svoboda');
  });

  it('různá ČŠO ID = různí hráči i při stejném jméně', () => {
    expect(
      playersAreSame(
        { name: 'Jan Novák', csoPlayerId: 'cso:1' },
        { name: 'Jan Novák', csoPlayerId: 'cso:2' }
      )
    ).toBe(false);
  });
});

describe('registrationCancel', () => {
  it('stornovat lze jen aktivní stavy', () => {
    expect(isCancellableStatus('CONFIRMED')).toBe(true);
    expect(isCancellableStatus('WAITLIST')).toBe(true);
    expect(isCancellableStatus('PENDING_PAYMENT')).toBe(true);
    expect(isCancellableStatus('CANCELLED')).toBe(false);
  });
});
