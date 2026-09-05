import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { googleEmailOf, googleUidOf, hashCancelToken, safeEqualHex } from './authz';
import { playerAuthUidOf, playerEmailOf } from './claimRegistration';

/**
 * Hráč smí jednat za přihlášku, pokud:
 * - Google UID nebo e-mail sedí na registraci, nebo
 * - předá platný cancelToken (hash uložený na dokumentu), nebo
 * - legacy dokument bez hash i bez navázané identity (přechodné — jen ID).
 */
export function canActAsPlayer(
  reg: Record<string, unknown>,
  request: CallableRequest,
  cancelToken: string
): boolean {
  const uid = googleUidOf(request);
  const email = googleEmailOf(request);
  const boundUid = playerAuthUidOf(reg);
  const boundEmail = playerEmailOf(reg);

  if (uid && boundUid && boundUid === uid) return true;
  if (uid && boundEmail && email && boundEmail === email) return true;

  const storedHash = String(reg.cancelTokenHash ?? '').trim();
  const provided = String(cancelToken ?? '').trim();
  if (storedHash && provided && safeEqualHex(hashCancelToken(provided), storedHash)) {
    return true;
  }

  if (!storedHash && !boundUid && !boundEmail) {
    return true;
  }

  return false;
}

export function assertPlayerActor(
  reg: Record<string, unknown>,
  request: CallableRequest,
  cancelToken: string
): void {
  if (!canActAsPlayer(reg, request, cancelToken)) {
    throw new HttpsError('permission-denied', 'Nemáte oprávnění k této přihlášce.');
  }
}
