/** Obnova po deployi: starý index/SW tahá hashed chunk, který už na hostingu není. */

export const STALE_ASSET_RECOVERY_KEY = 'sdc_stale_asset_recoveries';
const MAX_AUTO_RECOVERIES = 2;

export function getStaleRecoveryCount() {
  try {
    const n = Number(sessionStorage.getItem(STALE_ASSET_RECOVERY_KEY) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function isLikelyStaleAssetError(error) {
  const msg = String(error?.message || error || '');
  const name = String(error?.name || '');
  return (
    name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /MIME type/i.test(msg) ||
    /SDC_STALE_CHUNK/i.test(msg)
  );
}

async function clearPwaCaches() {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

/**
 * @returns {Promise<boolean>} true pokud se spustil reload
 */
export async function recoverFromStaleAssets() {
  const n = getStaleRecoveryCount();
  if (n >= MAX_AUTO_RECOVERIES) return false;
  try {
    sessionStorage.setItem(STALE_ASSET_RECOVERY_KEY, String(n + 1));
  } catch {
    /* private mode */
  }
  try {
    await clearPwaCaches();
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.location.reload();
    return true;
  }
  return false;
}

export function installStaleAssetRecovery() {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault?.();
    void recoverFromStaleAssets();
  });
}
