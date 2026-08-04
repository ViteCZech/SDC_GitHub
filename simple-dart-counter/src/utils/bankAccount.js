/**
 * Sestaví české číslo účtu ve tvaru [předčíslí-]číslo/kód banky.
 * @param {{ accountPrefix?: string|null, accountNumber?: string|null, bankCode?: string|null }} parts
 * @returns {string|null}
 */
export function buildCzechBankAccount({ accountPrefix, accountNumber, bankCode }) {
  const num = String(accountNumber ?? '').replace(/\D/g, '');
  const bank = String(bankCode ?? '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const prefix = String(accountPrefix ?? '').replace(/\D/g, '');

  if (!num || !bank || bank.length !== 4) return null;
  if (prefix) return `${prefix}-${num}/${bank}`;
  return `${num}/${bank}`;
}

/**
 * @param {{ accountPrefix?: string|null, accountNumber?: string|null, bankCode?: string|null, iban?: string|null, legacyAccountNumber?: string|null }|null|undefined} bankInfo
 * @returns {string|null}
 */
export function resolveBankAccountString(bankInfo) {
  if (!bankInfo) return null;
  const iban = String(bankInfo.iban ?? '').replace(/\s+/g, '');
  if (iban.startsWith('CZ')) return iban.toUpperCase();

  const built = buildCzechBankAccount(bankInfo);
  if (built) return built;

  const legacy = String(bankInfo.legacyAccountNumber ?? bankInfo.accountNumberCombined ?? '').trim();
  if (legacy) return legacy.replace(/\s+/g, '');

  const single = String(bankInfo.accountNumber ?? '').trim();
  if (single.includes('/')) return single.replace(/\s+/g, '');
  return null;
}

/**
 * Rozparsuje uložený řetězec účtu na části (pro editaci starých záznamů).
 * @param {string|null|undefined} raw
 * @returns {{ accountPrefix: string, accountNumber: string, bankCode: string }}
 */
export function parseCzechBankAccount(raw) {
  const empty = { accountPrefix: '', accountNumber: '', bankCode: '' };
  const s = String(raw ?? '').trim();
  if (!s || s.startsWith('CZ')) return empty;

  const match = s.match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
  if (!match) {
    return { accountPrefix: '', accountNumber: s.replace(/\D/g, ''), bankCode: '' };
  }
  return {
    accountPrefix: match[1] ?? '',
    accountNumber: match[2] ?? '',
    bankCode: match[3] ?? '',
  };
}
