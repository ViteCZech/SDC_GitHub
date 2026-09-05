import * as logger from 'firebase-functions/logger';
import { Agent, fetch as undiciFetch } from 'undici';

export const STEDAR_FETCH_HEADERS = {
  'User-Agent': 'SDC-Ranking-Updater/2.1 (+https://github.com/)',
  Accept: 'text/html,application/xhtml+xml',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
};

export type StedarGetInit = {
  insecure?: boolean;
  redirect?: RequestRedirect;
};

export type StedarGet = (url: string, init?: StedarGetInit) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

let insecureAgent: Agent | null = null;

function getInsecureAgent(): Agent {
  insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
  return insecureAgent;
}

export function withCacheBust(url: string): string {
  const u = new URL(url);
  u.searchParams.set('_ts', String(Date.now()));
  return u.toString();
}

export function toHttpsUrl(url: string): string {
  const u = new URL(url);
  u.protocol = 'https:';
  return u.toString();
}

export function toHttpUrl(url: string): string {
  const u = new URL(url);
  u.protocol = 'http:';
  return u.toString();
}

function errMsg(err: unknown): string {
  if (err instanceof Error) {
    const extra = err as { code?: string; cause?: { code?: string; message?: string } };
    const causeBit = extra.cause?.code || extra.cause?.message;
    return [extra.code, err.message, causeBit].filter(Boolean).join(': ');
  }
  return String(err);
}

async function readOkHtml(
  res: { ok: boolean; status: number; text(): Promise<string> },
  url: string
): Promise<string> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const html = await res.text();
  if (!html || html.length < 50) {
    throw new Error(`Prázdná HTML odpověď pro ${url}`);
  }
  return html;
}

export async function defaultStedarGet(url: string, init: StedarGetInit = {}) {
  if (init.insecure) {
    return undiciFetch(url, {
      headers: STEDAR_FETCH_HEADERS,
      dispatcher: getInsecureAgent(),
    });
  }
  return fetch(url, {
    headers: STEDAR_FETCH_HEADERS,
    cache: 'no-store',
    redirect: init.redirect ?? 'follow',
  });
}

/**
 * Stáhne HTML žebříčku ze Stedar.
 * 1) HTTPS s ověřením certifikátu
 * 2) HTTPS bez ověření (expirovaný / self-signed cert)
 * 3) HTTP bez follow (když HTTPS vůbec neběží; 3xx na HTTPS se nebere jako úspěch)
 */
export async function fetchStedarHtml(url: string, get: StedarGet = defaultStedarGet): Promise<string> {
  const httpsUrl = withCacheBust(toHttpsUrl(url));
  const httpUrl = withCacheBust(toHttpUrl(url));
  const errors: string[] = [];

  try {
    return await readOkHtml(await get(httpsUrl), httpsUrl);
  } catch (err) {
    errors.push(`https: ${errMsg(err)}`);
    logger.warn('Stedar HTTPS fetch failed, trying insecure TLS then HTTP', {
      url: httpsUrl,
      error: errMsg(err),
    });
  }

  try {
    const html = await readOkHtml(await get(httpsUrl, { insecure: true }), httpsUrl);
    logger.warn('Stedar HTML fetched over insecure HTTPS (certificate not verified)', { url: httpsUrl });
    return html;
  } catch (err) {
    errors.push(`https-insecure: ${errMsg(err)}`);
    logger.warn('Stedar insecure HTTPS fetch failed', { error: errMsg(err) });
  }

  try {
    const res = await get(httpUrl, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`HTTP ${res.status} redirect to ${res.headers.get('location') || '?'}`);
    }
    const html = await readOkHtml(res, httpUrl);
    logger.warn('Stedar HTML fetched over plain HTTP', { url: httpUrl });
    return html;
  } catch (err) {
    errors.push(`http: ${errMsg(err)}`);
  }

  throw new Error(`Stedar fetch failed (${errors.join(' | ')})`);
}
