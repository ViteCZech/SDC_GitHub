import { describe, expect, it } from 'vitest';
import {
  TABLET_LAST_SEEN_OFFLINE_MS,
  buildTabletBoardQrUrl,
  ensureBoardAuthTokens,
  isBoardOnline,
  resolveTotalBoards,
} from '../tabletBoardQr';

describe('tabletBoardQr', () => {
  it('resolveTotalBoards bere totalBoards / numBoards / boardsCount', () => {
    expect(resolveTotalBoards({ totalBoards: 4 })).toBe(4);
    expect(resolveTotalBoards({ numBoards: '2' })).toBe(2);
    expect(resolveTotalBoards({})).toBe(0);
  });

  it('ensureBoardAuthTokens doplní chybějící tokeny a nemění existující', () => {
    const first = ensureBoardAuthTokens({ totalBoards: 2, boardAuthTokens: { 1: 'aaaa' } });
    expect(first.boardAuthTokens['1']).toBe('aaaa');
    expect(first.boardAuthTokens['2']).toMatch(/^[a-z0-9]+$/i);
    expect(first.boardAuthTokens['2']).toHaveLength(16);
    expect(ensureBoardAuthTokens(first)).toBe(first);
  });

  it('buildTabletBoardQrUrl sestaví /tablet s pin, board, token', () => {
    const url = buildTabletBoardQrUrl({ pin: '1234', board: 2, token: 'tok' });
    expect(url).toContain('/tablet');
    expect(url).toContain('t=1234');
    expect(url).toContain('board=2');
    expect(url).toContain('token=tok');
  });

  it('buildTabletBoardQrUrl použije LAN origin', () => {
    const url = buildTabletBoardQrUrl({
      pin: '1234',
      board: 1,
      token: 'abc',
      origin: 'http://192.168.1.10:8787',
    });
    expect(url.startsWith('http://192.168.1.10:8787/tablet')).toBe(true);
    expect(new URL(url).searchParams.get('lanHost')).toBe('192.168.1.10:8787');
  });

  it('isBoardOnline jen při status online', () => {
    const now = Date.now();
    expect(
      isBoardOnline(
        { 1: { status: 'online', lastSeen: { seconds: Math.floor(now / 1000) } } },
        1,
        now
      )
    ).toBe(true);
    expect(isBoardOnline({ 1: { status: 'offline' } }, 1)).toBe(false);
  });

  it('isBoardOnline vrací false při zastaralém lastSeen', () => {
    const now = Date.now();
    const staleSeconds = Math.floor((now - TABLET_LAST_SEEN_OFFLINE_MS - 1_000) / 1000);
    expect(isBoardOnline({ 2: { status: 'online', lastSeen: { seconds: staleSeconds } } }, 2, now)).toBe(
      false
    );
  });
});
