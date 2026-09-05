import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { runCsoRankingUpdate } from './csoRankingScraper';
import { requireGoogleUid } from './authz';

const REGION = 'europe-west1';

/** Každý den v 7:00 SEČ (Cloud Scheduler → europe-west1). */
export const updateCsoRankingsScheduled = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Europe/Prague',
    region: REGION,
    retryCount: 2,
  },
  async () => {
    try {
      const result = await runCsoRankingUpdate();
      logger.info('CSO scheduled ranking update completed', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('CSO scheduled ranking update failed', {
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
  }
);

/** Ruční aktualizace z admin UI (vyžaduje přihlášení). */
export const updateCsoRankingsNow = onCall(
  {
    region: REGION,
    invoker: 'public',
    cors: true,
    /** Stedar fetch + parse + Firestore zápis obou žebříčků. */
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request) => {
  const uid = requireGoogleUid(request);

  try {
    logger.info('CSO manual ranking update requested', { uid });
    const result = await runCsoRankingUpdate();
    logger.info('CSO manual ranking update completed', { uid, ...result });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('CSO manual ranking update failed', {
      uid,
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw new HttpsError('internal', message);
  }
});
