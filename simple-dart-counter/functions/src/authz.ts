import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';

export const CALLABLE_PUBLIC = {
  region: 'europe-west1' as const,
  invoker: 'public' as const,
  cors: true,
};

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqualHex(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  try {
    return timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
  } catch {
    return false;
  }
}

export function newCancelToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashCancelToken(token: string): string {
  return sha256Hex(String(token ?? '').trim());
}

export function hashOnlinePin(pin: string): string {
  return sha256Hex(`sdc-online-pin:${String(pin ?? '').replace(/\D/g, '').slice(0, 4)}`);
}

export function isAnonymousAuth(request: CallableRequest): boolean {
  return request.auth?.token?.firebase?.sign_in_provider === 'anonymous';
}

export function googleUidOf(request: CallableRequest): string | null {
  if (!request.auth?.uid || isAnonymousAuth(request)) return null;
  return request.auth.uid;
}

export function requireAuthUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Vyžaduje se přihlášení.');
  }
  return uid;
}

export function requireGoogleUid(request: CallableRequest): string {
  const uid = googleUidOf(request);
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Vyžaduje se účet Google (ne anonymní přihlášení).'
    );
  }
  return uid;
}

export function googleEmailOf(request: CallableRequest): string | null {
  if (!googleUidOf(request)) return null;
  const raw = request.auth?.token?.email;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return email || null;
}
