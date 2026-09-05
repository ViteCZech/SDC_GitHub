const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function buildIceServersFromEnv(
  env: Record<string, string | undefined> = (process.env ?? {}) as Record<string, string | undefined>
): {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
} {
  const urls = String(env.TURN_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const username = String(env.TURN_USERNAME ?? '').trim();
  const credential = String(env.TURN_CREDENTIAL ?? '').trim();
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    ...STUN_SERVERS,
  ];
  if (urls.length && username && credential) {
    iceServers.push({
      urls: urls.length === 1 ? urls[0] : urls,
      username,
      credential,
    });
  }
  return { iceServers };
}
