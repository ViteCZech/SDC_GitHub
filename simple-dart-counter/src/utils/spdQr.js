/**
 * Převod českého čísla účtu [předčíslí-]číslo/kód banky na IBAN (CZ).
 * @param {string} account
 * @returns {string|null}
 */
function czechAccountToIban(account) {
  const normalized = account.replace(/\s+/g, '');
  if (normalized.startsWith('CZ')) return normalized.toUpperCase();

  const match = normalized.match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
  if (!match) return null;

  const prefix = (match[1] ?? '0').padStart(6, '0');
  const number = match[2].padStart(10, '0');
  const bank = match[3];
  const bban = `${bank}${prefix}${number}`;

  const rearranged = `${bban}123500`;
  let remainder = 0;
  for (let i = 0; i < rearranged.length; i += 1) {
    remainder = (remainder * 10 + Number(rearranged[i])) % 97;
  }
  const check = String(98 - remainder).padStart(2, '0');
  return `CZ${check}${bban}`;
}

/**
 * Vygeneruje textový řetězec ve standardu Short Payment Descriptor (SPD 1.0)
 * pro české bankovní QR kódy.
 *
 * @param {{ accountNumber?: string, amount?: number|null, variableSymbol?: string|null, message?: string }} params
 * @returns {string|null}
 */
export function generateSpdString({ accountNumber, amount, variableSymbol, message = '' }) {
  if (!accountNumber) return null;

  const cleanAccount = accountNumber.replace(/\s+/g, '');
  const iban = cleanAccount.startsWith('CZ')
    ? cleanAccount.toUpperCase()
    : czechAccountToIban(cleanAccount);

  if (!iban) return null;

  let spd = `SPD*1.0*ACC:${iban}`;

  if (amount != null && Number(amount) > 0) {
    spd += `*AM:${Number(amount).toFixed(2)}`;
    spd += `*CC:CZK`;
  }

  if (variableSymbol) {
    spd += `*X-VS:${String(variableSymbol).replace(/\D/g, '')}`;
  }

  if (message) {
    const cleanMsg = message
      .substring(0, 60)
      .replace(/\*/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (cleanMsg.trim()) {
      spd += `*MSG:${cleanMsg.trim()}`;
    }
  }

  return spd;
}
