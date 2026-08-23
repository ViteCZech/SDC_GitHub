import { describe, expect, it } from 'vitest';
import { generateSpdString } from '../spdQr';

describe('spdQr', () => {
  it('bez účtu nic, s účtem SPD 1.0 a IBAN CZ', () => {
    expect(generateSpdString({ accountNumber: '' })).toBeNull();
    const spd = generateSpdString({
      accountNumber: '19-2000145399/0800',
      amount: 250,
      variableSymbol: '2026001',
      message: 'Turnaj * Brno',
    });
    expect(spd).toMatch(/^SPD\*1\.0\*ACC:CZ\d+/);
    expect(spd).toContain('*AM:250.00');
    expect(spd).toContain('*CC:CZK');
    expect(spd).toContain('*X-VS:2026001');
    expect(spd).toContain('*MSG:Turnaj   Brno');
  });

  it('přijme IBAN i s malými písmeny a mezerami', () => {
    const spd = generateSpdString({ accountNumber: 'cz65 0800 0000 0019 2000 1454' });
    expect(spd).toBe('SPD*1.0*ACC:CZ6508000000001920001454');
  });
});
