import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  parseLanHost,
  lanHttpBase,
  lanWsBase,
  rememberLanRelayConfig,
  resolveLanRelayConfig,
  clearLanRelayConfig,
  localOrganizerLanConfig,
} from '../lanRelayConfig';

describe('lanRelayConfig', () => {
  const mem = {};
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k];
    globalThis.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k, v) => {
        mem[k] = String(v);
      },
      removeItem: (k) => {
        delete mem[k];
      },
    };
    clearLanRelayConfig();
  });
  afterEach(() => {
    clearLanRelayConfig();
  });

  it('parseLanHost čte host:port i URL', () => {
    expect(parseLanHost('192.168.1.9:8787')).toEqual({
      host: '192.168.1.9',
      port: 8787,
      protocol: 'http',
    });
    expect(parseLanHost('https://hall.local:9443')).toEqual({
      host: 'hall.local',
      port: 9443,
      protocol: 'https',
    });
  });

  it('lanHttpBase / lanWsBase', () => {
    expect(lanHttpBase({ host: '10.0.0.2', port: 8787, protocol: 'http' })).toBe('http://10.0.0.2:8787');
    expect(lanWsBase({ host: '10.0.0.2', port: 8787, protocol: 'http' })).toBe('ws://10.0.0.2:8787');
  });

  it('resolveLanRelayConfig čte query lanHost a localStorage', () => {
    rememberLanRelayConfig(localOrganizerLanConfig(8787));
    expect(resolveLanRelayConfig({ hostname: 'x', search: '', protocol: 'http:' })).toEqual({
      host: '127.0.0.1',
      port: 8787,
      protocol: 'http',
    });
    expect(
      resolveLanRelayConfig({ hostname: 'tv', search: '?lanHost=192.168.0.5:8787', protocol: 'http:' })
    ).toEqual({ host: '192.168.0.5', port: 8787, protocol: 'http' });
  });
});
