import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createCloudSyncAdapter } from '../cloudSyncAdapter';
import { createLanSyncAdapter, SYNC_ADAPTER_METHODS } from '../lanSyncAdapter';
import { startLanRelay } from '../../../../server/lanRelay.js';
import { rememberLanAdminToken } from '../lanRelayConfig.js';

describe('lanSyncAdapter contract', () => {
  it('má stejné veřejné metody jako cloudSyncAdapter', () => {
    const cloud = Object.keys(createCloudSyncAdapter()).sort();
    const lan = Object.keys(createLanSyncAdapter({ host: '127.0.0.1', port: 8787 })).sort();
    expect(lan).toEqual(cloud);
    expect(cloud).toEqual([...SYNC_ADAPTER_METHODS].sort());
  });

  it('mode lan a isBackendReady při zadaném hostu', () => {
    const adapter = createLanSyncAdapter({ host: '127.0.0.1', port: 8787 });
    expect(adapter.mode).toBe('lan');
    expect(adapter.isBackendReady()).toBe(true);
  });
});

describe('lanSyncAdapter + LAN relay', () => {
  const relays = [];

  afterEach(async () => {
    while (relays.length) {
      const r = relays.pop();
      await r.close();
    }
  });

  it('sync, listen (WS), tablet match a presence', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sdc-lan-'));
    const relay = startLanRelay({ port: 0, host: '127.0.0.1', dataDir, uiProxyTarget: '' });
    relays.push(relay);
    const info = await relay.listening;
    const adapter = createLanSyncAdapter({ host: '127.0.0.1', port: info.port });
    rememberLanAdminToken('4321', 'admin-test-token');

    const snapshots = [];
    const unsub = adapter.listenTournament('4321', (data) => snapshots.push(data));

    await adapter.syncTournament('4321', {
      tournamentData: { name: 'LAN Cup', pin: '4321', cloudEnabled: false },
      groups: [{ groupId: 'A', players: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bo' }] }],
      groupMatches: [
        { id: 'm1', matchId: 'm1', groupId: 'A', player1Id: 'a', player2Id: 'b', status: 'pending' },
      ],
      tournamentBracket: [],
    });

    await vi.waitFor(() => {
      expect(snapshots.some((s) => s?.tournamentData?.name === 'LAN Cup')).toBe(true);
    }, { timeout: 4000 });

    expect(await adapter.verifyTournamentPin('4321')).toBe(true);
    const access = await adapter.verifyTabletAccess('4321', '', { board: '1' });
    expect(access.ok).toBe(true);

    await adapter.registerTabletPresence('4321', '1', '', { status: 'online' });
    await adapter.updateMatchFromTablet(
      '4321',
      'group',
      'm1',
      { status: 'completed', winnerId: 'a', result: { p1Legs: 2, p2Legs: 0 } },
      {}
    );

    await vi.waitFor(() => {
      const last = [...snapshots].reverse().find((s) => s?.groupMatches?.[0]);
      expect(last?.groupMatches?.[0]?.status).toBe('completed');
      expect(last?.boardStatuses?.['1']?.status).toBe('online');
    }, { timeout: 4000 });

    unsub();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('po odpojení WS znovu doručí snapshot', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sdc-lan-'));
    const relay = startLanRelay({ port: 0, host: '127.0.0.1', dataDir, uiProxyTarget: '' });
    relays.push(relay);
    const info = await relay.listening;
    const adapter = createLanSyncAdapter({ host: '127.0.0.1', port: info.port });
    rememberLanAdminToken('1111', 'tok-1111');
    await adapter.syncTournament('1111', {
      tournamentData: { name: 'Reconnect', pin: '1111' },
      groups: [],
      groupMatches: [],
      tournamentBracket: [],
    });

    const seen = [];
    const unsub = adapter.listenTournament('1111', (data) => seen.push(data?.tournamentData?.name));
    await vi.waitFor(() => expect(seen).toContain('Reconnect'), { timeout: 4000 });
    unsub();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('listenTournament nehlásí null, dokud turnaj neexistuje', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sdc-lan-'));
    const relay = startLanRelay({ port: 0, host: '127.0.0.1', dataDir, uiProxyTarget: '' });
    relays.push(relay);
    const info = await relay.listening;
    const adapter = createLanSyncAdapter({ host: '127.0.0.1', port: info.port });
    const seen = [];
    const unsub = adapter.listenTournament('9999', (data) => seen.push(data));
    await new Promise((r) => setTimeout(r, 120));
    expect(seen).not.toContain(null);
    unsub();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persistuje turnaj na disk a přežije restart relay', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sdc-lan-'));
    const relay1 = startLanRelay({ port: 0, host: '127.0.0.1', dataDir, uiProxyTarget: '' });
    relays.push(relay1);
    const info1 = await relay1.listening;
    const a1 = createLanSyncAdapter({ host: '127.0.0.1', port: info1.port });
    rememberLanAdminToken('5555', 'tok-5555');
    await a1.syncTournament('5555', {
      tournamentData: { name: 'Persist', pin: '5555' },
      groups: [],
      groupMatches: [],
      tournamentBracket: [],
    });
    await relay1.close();
    relays.pop();

    const relay2 = startLanRelay({ port: 0, host: '127.0.0.1', dataDir, uiProxyTarget: '' });
    relays.push(relay2);
    const info2 = await relay2.listening;
    await relay2.store.ready;
    expect(relay2.store.publicSnapshot('5555')?.tournamentData?.name).toBe('Persist');
    const a2 = createLanSyncAdapter({ host: '127.0.0.1', port: info2.port });
    rememberLanAdminToken('5555', 'tok-5555');
    expect(await a2.verifyTournamentPin('5555')).toBe(true);
    await rm(dataDir, { recursive: true, force: true });
  });
});
