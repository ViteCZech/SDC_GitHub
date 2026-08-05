import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

/** Region musí odpovídat nasazení Cloud Functions. */
const FUNCTIONS_REGION = 'europe-west1';

function requireApp() {
  if (!app) throw new Error('Firebase není inicializováno.');
  return app;
}

/**
 * Ruční stažení žebříčků ze Stedar přes Cloud Function.
 * @returns {Promise<{ updatedAt: string, men: { totalPlayers: number }, women: { totalPlayers: number }, totalPlayers: number }>}
 */
export async function updateCsoRankingsNow() {
  const functions = getFunctions(requireApp(), FUNCTIONS_REGION);
  const fn = httpsCallable(functions, 'updateCsoRankingsNow');
  const result = await fn();
  return result.data;
}
