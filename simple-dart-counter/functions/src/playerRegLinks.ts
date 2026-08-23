import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/** Top-level index přihlášek hráče (Enterprise Edition — bez collectionGroup fieldOverrides). */
export const PLAYER_REG_LINKS_COLLECTION = 'player_registration_links';

/**
 * Zapíše / doplní index přihlášky pro hráčský katalog („Mé přihlášky“).
 */
export async function upsertPlayerRegistrationLink(
  db: Firestore,
  data: {
    tournamentId: string;
    registrationId: string;
    authUid?: string | null;
    email?: string | null;
    status: string;
    playerName: string;
    nameKey?: string | null;
  }
): Promise<void> {
  const linkId = `${data.tournamentId}_${data.registrationId}`;
  await db.collection(PLAYER_REG_LINKS_COLLECTION).doc(linkId).set(
    {
      tournamentId: data.tournamentId,
      registrationId: data.registrationId,
      authUid: data.authUid ?? null,
      email: data.email ?? null,
      status: data.status,
      playerName: data.playerName,
      nameKey: data.nameKey ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
