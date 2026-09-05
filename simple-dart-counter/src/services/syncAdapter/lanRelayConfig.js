import { LAN_ADMIN_TOKEN_KEY, LAN_DEFAULT_PORT, LAN_PATHS, LAN_STORAGE_KEY } from './lanProtocol.js';

function safeStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode */
  }
  return null;
}

/**
 * @param {string|null|undefined} raw
 * @returns {{ host: string, port: number, protocol: 'http'|'https' }|null}
 */
export function parseLanHost(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  try {
    const withProto = /^[a-z]+:\/\//i.test(text) ? text : `http://${text}`;
    const url = new URL(withProto);
    const host = String(url.hostname || '').trim();
    if (!host) return null;
    const port = Number(url.port) || (url.protocol === 'https:' ? 443 : LAN_DEFAULT_PORT);
    return {
      host,
      port,
      protocol: url.protocol === 'https:' ? 'https' : 'http',
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ host?: string, port?: number, protocol?: string }|null|undefined} cfg
 */
export function lanHttpBase(cfg) {
  if (!cfg?.host) return '';
  const proto = cfg.protocol === 'https' ? 'https' : 'http';
  const port = Number(cfg.port) || LAN_DEFAULT_PORT;
  const hide = (proto === 'http' && port === 80) || (proto === 'https' && port === 443);
  return hide ? `${proto}://${cfg.host}` : `${proto}://${cfg.host}:${port}`;
}

/**
 * @param {{ host?: string, port?: number, protocol?: string }|null|undefined} cfg
 */
export function lanWsBase(cfg) {
  const http = lanHttpBase(cfg);
  if (!http) return '';
  return http.replace(/^http/, 'ws');
}

/**
 * @param {Pick<Location, 'hostname'|'port'|'protocol'|'search'|'origin'>|null} [loc]
 * @returns {{ host: string, port: number, protocol: 'http'|'https' }|null}
 */
export function resolveLanRelayConfig(loc = typeof window !== 'undefined' ? window.location : null) {
  if (typeof window !== 'undefined' && window.__SDC_LAN_RELAY__) {
    const meta = window.__SDC_LAN_RELAY__;
    if (meta.sameOrigin && loc) {
      return {
        host: loc.hostname || '127.0.0.1',
        port: Number(loc.port) || Number(meta.port) || LAN_DEFAULT_PORT,
        protocol: loc.protocol === 'https:' ? 'https' : 'http',
      };
    }
    if (meta.host) {
      return {
        host: String(meta.host),
        port: Number(meta.port) || LAN_DEFAULT_PORT,
        protocol: meta.protocol === 'https' ? 'https' : 'http',
      };
    }
  }
  if (loc?.search) {
    const q = new URLSearchParams(loc.search);
    const fromQuery = parseLanHost(q.get('lanHost') || q.get('lan'));
    if (fromQuery) return fromQuery;
  }
  const stored = readStoredLanRelayConfig();
  if (stored) return stored;
  return null;
}

export function readStoredLanRelayConfig() {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(LAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parseLanHost(
      parsed?.host ? `${parsed.protocol === 'https' ? 'https' : 'http'}://${parsed.host}:${parsed.port || LAN_DEFAULT_PORT}` : raw
    );
  } catch {
    return null;
  }
}

export function rememberLanRelayConfig(cfg) {
  const parsed = cfg?.host ? { host: cfg.host, port: Number(cfg.port) || LAN_DEFAULT_PORT, protocol: cfg.protocol === 'https' ? 'https' : 'http' } : parseLanHost(cfg);
  if (!parsed) return null;
  const store = safeStorage();
  try {
    store?.setItem(LAN_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
  return parsed;
}

export function clearLanRelayConfig() {
  const store = safeStorage();
  try {
    store?.removeItem(LAN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readLanAdminToken(pin) {
  const id = String(pin ?? '').trim();
  if (!/^\d{4}$/.test(id)) return '';
  const store = safeStorage();
  try {
    return String(store?.getItem(`${LAN_ADMIN_TOKEN_KEY}:${id}`) ?? '').trim();
  } catch {
    return '';
  }
}

export function rememberLanAdminToken(pin, token) {
  const id = String(pin ?? '').trim();
  const tok = String(token ?? '').trim();
  if (!/^\d{4}$/.test(id) || !tok) return;
  const store = safeStorage();
  try {
    store?.setItem(`${LAN_ADMIN_TOKEN_KEY}:${id}`, tok);
  } catch {
    /* ignore */
  }
}

export function generateLanAdminToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}

/** Výchozí cíl na stejném notebooku pořadatele. */
export function localOrganizerLanConfig(port = LAN_DEFAULT_PORT) {
  return { host: '127.0.0.1', port: Number(port) || LAN_DEFAULT_PORT, protocol: 'http' };
}

/**
 * @param {{ host: string, port: number, protocol?: string }} cfg
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchLanRelayHealth(cfg, fetchImpl = typeof fetch !== 'undefined' ? fetch : null) {
  if (!fetchImpl || !cfg?.host) return { ok: false, error: 'offline' };
  try {
    const res = await fetchImpl(`${lanHttpBase(cfg)}${LAN_PATHS.health}`);
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const data = await res.json();
    return { ...data, ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'offline' };
  }
}
