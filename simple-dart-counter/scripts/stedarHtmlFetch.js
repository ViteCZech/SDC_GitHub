import { Agent, fetch as undiciFetch } from 'undici';

export const STEDAR_FETCH_HEADERS = {
  'User-Agent': 'SDC-Ranking-Updater/2.1 (+https://github.com/)',
  Accept: 'text/html,application/xhtml+xml',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
};

let insecureAgent;

function getInsecureAgent() {
  insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
  return insecureAgent;
}

export function withCacheBust(url) {
  const u = new URL(url);
  u.searchParams.set('_ts', String(Date.now()));
  return u.toString();
}

export function toHttpsUrl(url) {
  const u = new URL(url);
  u.protocol = 'https:';
  return u.toString();
}

export function toHttpUrl(url) {
  const u = new URL(url);
  u.protocol = 'http:';
  return u.toString();
}

function errMsg(err) {
  if (err instanceof Error) {
    const code = err.code;
    const cause = err.cause;
    const causeBit = cause?.code || cause?.message;
    return [code, err.message, causeBit].filter(Boolean).join(': ');
  }
  return String(err);
}

async function readOkHtml(res, url) {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const html = await res.text();
  if (!html || html.length < 50) {
    throw new Error(`Prázdná HTML odpověď pro ${url}`);
  }
  return html;
}

export async function defaultStedarGet(url, init = {}) {
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
 * Stejná strategie jako functions/src/stedarHtmlFetch.ts:
 * HTTPS → HTTPS bez ověření certu → HTTP bez follow redirectu.
 */
export async function fetchStedarHtml(url, get = defaultStedarGet) {
  const httpsUrl = withCacheBust(toHttpsUrl(url));
  const httpUrl = withCacheBust(toHttpUrl(url));
  const errors = [];

  try {
    return await readOkHtml(await get(httpsUrl), httpsUrl);
  } catch (err) {
    errors.push(`https: ${errMsg(err)}`);
    console.warn('Stedar HTTPS fetch failed, trying insecure TLS then HTTP', errMsg(err));
  }

  try {
    const html = await readOkHtml(await get(httpsUrl, { insecure: true }), httpsUrl);
    console.warn('Stedar HTML fetched over insecure HTTPS (certificate not verified)');
    return html;
  } catch (err) {
    errors.push(`https-insecure: ${errMsg(err)}`);
    console.warn('Stedar insecure HTTPS fetch failed', errMsg(err));
  }

  try {
    const res = await get(httpUrl, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`HTTP ${res.status} redirect to ${res.headers.get('location') || '?'}`);
    }
    const html = await readOkHtml(res, httpUrl);
    console.warn('Stedar HTML fetched over plain HTTP');
    return html;
  } catch (err) {
    errors.push(`http: ${errMsg(err)}`);
  }

  throw new Error(`Stedar fetch failed (${errors.join(' | ')})`);
}
