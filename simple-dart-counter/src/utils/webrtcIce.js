import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase.js';

/**
 * ICE servery pro online video. STUN stačí za běžným NAT;
 * TURN (env / Cloud Function) je nutný za symmetric NAT / přísným firewallem.
 */

const FUNCTIONS_REGION = 'europe-west1';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function parseTurnUrls(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildIceServersFromTurnConfig({ urls, username, credential } = {}) {
  const turnUrls = Array.isArray(urls) ? urls.filter(Boolean) : parseTurnUrls(urls);
  const user = String(username || '').trim();
  const cred = String(credential || '').trim();
  const iceServers = [...STUN_SERVERS];
  if (turnUrls.length && user && cred) {
    iceServers.push({ urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls, username: user, credential: cred });
  }
  return iceServers;
}

export function getStaticIceServers() {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  return buildIceServersFromTurnConfig({
    urls: env.VITE_TURN_URLS,
    username: env.VITE_TURN_USERNAME,
    credential: env.VITE_TURN_CREDENTIAL,
  });
}

let cached = null;
let inflight = null;

export function resetIceServersCache() {
  cached = null;
  inflight = null;
}

/**
 * Preferuje Cloud Function (tajemství TURN nejsou v JS bundle), jinak VITE_TURN_* / STUN.
 * @returns {Promise<Array<{ urls: string|string[], username?: string, credential?: string }>>}
 */
export async function getIceServers() {
  if (cached) return cached;
  if (!inflight) {
    inflight = (async () => {
      try {
        if (app) {
          const fn = httpsCallable(getFunctions(app, FUNCTIONS_REGION), 'getWebRtcIceServers');
          const result = await fn();
          const list = result?.data?.iceServers;
          if (Array.isArray(list) && list.length > 0) {
            cached = list;
            return cached;
          }
        }
      } catch (err) {
        console.warn('getWebRtcIceServers', err);
      }
      cached = getStaticIceServers();
      return cached;
    })();
  }
  return inflight;
}

export function prefetchIceServers() {
  void getIceServers();
}

export function rtcPeerConfig(iceServers) {
  return {
    iceServers: Array.isArray(iceServers) && iceServers.length ? iceServers : getStaticIceServers(),
    iceCandidatePoolSize: 10,
  };
}
