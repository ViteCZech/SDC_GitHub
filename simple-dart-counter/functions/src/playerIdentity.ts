/**
 * Identita hráče pro detekci duplicit (Cloud Functions).
 * Ranking se nepoužívá — mění se v čase.
 */

export function normalizePlayerNameKey(name: unknown): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function stableNamePlayerId(name: unknown): string | null {
  const key = normalizePlayerNameKey(name);
  return key ? `name:${key}` : null;
}

export function resolveCsoPlayerId(entry: {
  csoPlayerId?: string | null;
  regNumber?: string | number | null;
  name?: string | null;
} | null | undefined): string | null {
  if (!entry) return null;
  const raw = entry.csoPlayerId ?? entry.regNumber ?? null;
  if (raw != null && String(raw).trim() !== '') {
    const s = String(raw).trim();
    if (s.startsWith('name:') || s.startsWith('cso:')) return s;
    return `cso:${s}`;
  }
  return stableNamePlayerId(entry.name);
}

export function playersAreSame(
  a: { name?: string | null; csoPlayerId?: string | null } | null | undefined,
  b: { name?: string | null; csoPlayerId?: string | null } | null | undefined
): boolean {
  if (!a || !b) return false;
  const idA = a.csoPlayerId ? String(a.csoPlayerId).trim() : '';
  const idB = b.csoPlayerId ? String(b.csoPlayerId).trim() : '';
  if (idA && idB) {
    if (idA === idB) return true;
    if (idA.startsWith('cso:') && idB.startsWith('cso:') && idA !== idB) return false;
  }
  const keyA = normalizePlayerNameKey(a.name);
  const keyB = normalizePlayerNameKey(b.name);
  return !!keyA && keyA === keyB;
}

export const ACTIVE_PREREG_STATUSES = new Set([
  'CONFIRMED',
  'WAITLIST',
  'PENDING_PAYMENT',
]);
