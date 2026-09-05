import { describe, expect, it } from 'vitest';
import { buildIceServersFromTurnConfig, getStaticIceServers, rtcPeerConfig } from '../webrtcIce';

describe('webrtcIce', () => {
  it('bez TURN vrací jen STUN', () => {
    const servers = buildIceServersFromTurnConfig({});
    expect(servers.every((s) => String(s.urls).startsWith('stun:'))).toBe(true);
    expect(servers.length).toBeGreaterThanOrEqual(2);
  });

  it('s TURN přidá relay za STUN', () => {
    const servers = buildIceServersFromTurnConfig({
      urls: 'turn:example.org:3478,turns:example.org:5349',
      username: 'u',
      credential: 'p',
    });
    expect(servers[0].urls).toMatch(/^stun:/);
    const turn = servers[servers.length - 1];
    expect(turn.username).toBe('u');
    expect(turn.credential).toBe('p');
    expect(turn.urls).toEqual(['turn:example.org:3478', 'turns:example.org:5349']);
  });

  it('rtcPeerConfig nastaví iceCandidatePoolSize', () => {
    const cfg = rtcPeerConfig([{ urls: 'stun:stun.l.google.com:19302' }]);
    expect(cfg.iceCandidatePoolSize).toBe(10);
    expect(cfg.iceServers).toHaveLength(1);
  });

  it('getStaticIceServers nespadne bez env', () => {
    expect(Array.isArray(getStaticIceServers())).toBe(true);
  });
});
