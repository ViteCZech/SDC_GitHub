import { describe, expect, it } from 'vitest';
import { buildIceServersFromEnv } from '../webrtcIceConfig';

describe('buildIceServersFromEnv', () => {
  it('bez TURN vrací STUN', () => {
    const { iceServers } = buildIceServersFromEnv({});
    expect(iceServers.every((s) => String(s.urls).startsWith('stun:'))).toBe(true);
  });

  it('přidá TURN z env', () => {
    const { iceServers } = buildIceServersFromEnv({
      TURN_URLS: 'turn:example.org:3478,turns:example.org:5349',
      TURN_USERNAME: 'user',
      TURN_CREDENTIAL: 'secret',
    });
    const turn = iceServers[iceServers.length - 1];
    expect(turn.username).toBe('user');
    expect(turn.urls).toEqual(['turn:example.org:3478', 'turns:example.org:5349']);
  });
});
