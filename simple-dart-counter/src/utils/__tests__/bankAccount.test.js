import { describe, expect, it } from 'vitest';
import {
  buildCzechBankAccount,
  parseCzechBankAccount,
  resolveBankAccountString,
} from '../bankAccount';

describe('bankAccount', () => {
  it('sestaví číslo s předčíslím i bez', () => {
    expect(
      buildCzechBankAccount({ accountPrefix: '19', accountNumber: '123456789', bankCode: '0800' })
    ).toBe('19-123456789/0800');
    expect(buildCzechBankAccount({ accountNumber: '123', bankCode: '0100' })).toBe('123/0100');
    expect(buildCzechBankAccount({ accountNumber: '', bankCode: '0800' })).toBeNull();
  });

  it('resolveBankAccountString preferuje CZ IBAN, jinak složí účet', () => {
    expect(resolveBankAccountString({ iban: 'cz65 0800 0000 0019 2000 1454' })).toBe(
      'CZ6508000000001920001454'
    );
    expect(
      resolveBankAccountString({
        accountPrefix: '19',
        accountNumber: '123456789',
        bankCode: '0800',
      })
    ).toBe('19-123456789/0800');
  });

  it('parseCzechBankAccount rozloží starý záznam, IBAN nechá prázdný', () => {
    expect(parseCzechBankAccount('19-123456789/0800')).toEqual({
      accountPrefix: '19',
      accountNumber: '123456789',
      bankCode: '0800',
    });
    expect(parseCzechBankAccount('CZ6508000000001920001454')).toEqual({
      accountPrefix: '',
      accountNumber: '',
      bankCode: '',
    });
  });
});
