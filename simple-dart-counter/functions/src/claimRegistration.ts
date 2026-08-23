/**
 * Přiřazení existující přihlášky k Google účtu — jen když je identita jednoznačná.
 * - stejný účet už ji vlastní
 * - shoda e-mailu
 * - shoda oficiálního ČŠO ID (`cso:…`), ne pouhé jméno
 */

export type ClaimReason = 'email' | 'identity';

type PlayerFields = {
  email?: string | null;
  authUid?: string | null;
  csoPlayerId?: string | null;
};

export function normalizeEmail(email?: string | null): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

export function officialCsoId(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  return s.startsWith('cso:') ? s : null;
}

export function playerEmailOf(reg: Record<string, unknown>): string | null {
  return normalizeEmail((reg.player as PlayerFields | undefined)?.email);
}

export function playerAuthUidOf(reg: Record<string, unknown>): string | null {
  const uid = (reg.player as PlayerFields | undefined)?.authUid;
  return uid ? String(uid) : null;
}

export function canAttachGoogleUserToRegistration(
  reg: Record<string, unknown>,
  authUid: string | null,
  myEmail: string | null,
  reason: ClaimReason,
  candidateCsoId: string | null
): boolean {
  if (!authUid) return false;
  const existingUid = playerAuthUidOf(reg);
  if (existingUid && existingUid !== authUid) return false;
  if (existingUid === authUid) return true;

  const existingEmail = playerEmailOf(reg);
  if (reason === 'email') {
    return !!existingEmail && !!myEmail && existingEmail === myEmail;
  }

  if (existingEmail) {
    return !!myEmail && existingEmail === myEmail;
  }

  const existingCso = officialCsoId((reg.player as PlayerFields | undefined)?.csoPlayerId);
  const mineCso = officialCsoId(candidateCsoId);
  return !!existingCso && !!mineCso && existingCso === mineCso;
}
