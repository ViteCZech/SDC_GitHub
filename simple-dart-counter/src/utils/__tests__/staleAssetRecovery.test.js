import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STALE_ASSET_RECOVERY_KEY,
  getStaleRecoveryCount,
  isLikelyStaleAssetError,
  recoverFromStaleAssets,
} from '../staleAssetRecovery';

describe('staleAssetRecovery', () => {
  const mem = {};
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k];
    const store = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k, v) => {
        mem[k] = String(v);
      },
      clear: () => {
        for (const k of Object.keys(mem)) delete mem[k];
      },
    };
    vi.stubGlobal('sessionStorage', store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pozná MIME / dynamic import chyby po deployi', () => {
    expect(
      isLikelyStaleAssetError(
        new Error('Failed to load module script: Expected a JavaScript module but got MIME type of "text/html"')
      )
    ).toBe(true);
    expect(isLikelyStaleAssetError(new Error('SDC_STALE_CHUNK'))).toBe(true);
    expect(isLikelyStaleAssetError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isLikelyStaleAssetError(new Error('something else'))).toBe(false);
  });

  it('reloaduje a po limitu už ne', async () => {
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    mem[STALE_ASSET_RECOVERY_KEY] = '0';
    await expect(recoverFromStaleAssets()).resolves.toBe(true);
    expect(getStaleRecoveryCount()).toBe(1);
    expect(reload).toHaveBeenCalledTimes(1);

    reload.mockClear();
    mem[STALE_ASSET_RECOVERY_KEY] = '2';
    await expect(recoverFromStaleAssets()).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
