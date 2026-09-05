/**
 * Strukturované porovnání JSON-like hodnot (turnaj, pavouk).
 * `undefined` v objektech se bere jako chybějící klíč — stejné chování jako JSON.stringify,
 * ale bez alokace obřích stringů a bez závislosti na pořadí klíčů.
 */
export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a).filter((k) => a[k] !== undefined);
  const bKeys = Object.keys(b).filter((k) => b[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || b[k] === undefined) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}
