import { onCall } from 'firebase-functions/v2/https';
import { CALLABLE_PUBLIC } from './authz';
import { buildIceServersFromEnv } from './webrtcIceConfig';

/**
 * ICE config pro online video. TURN credentials žijí v env Functions, ne v JS bundle.
 */
export const getWebRtcIceServers = onCall(CALLABLE_PUBLIC, async () => buildIceServersFromEnv());
