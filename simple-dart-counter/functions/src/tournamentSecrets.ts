import type { Firestore } from 'firebase-admin/firestore';
import { mergeTabletAuthSources, type TabletAuthSource } from './tabletAuth';

export const TOURNAMENT_SECRETS_COLLECTION = 'tournament_secrets';
export const ADMIN_PRIVATE_COLLECTION = 'admin_private';
export const ADMIN_SECRETS_DOC = 'secrets';

export async function loadTabletAuthForPin(
  db: Firestore,
  pin: string,
  tournamentData: TabletAuthSource | null | undefined
): Promise<TabletAuthSource> {
  const secretSnap = await db.collection(TOURNAMENT_SECRETS_COLLECTION).doc(pin).get();
  const secret = secretSnap.exists ? (secretSnap.data() as TabletAuthSource) : null;
  return mergeTabletAuthSources(secret, tournamentData);
}
