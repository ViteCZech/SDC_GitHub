import { describe, expect, it } from 'vitest';
import {
  nextLiveSeq,
  parseLiveSeq,
  seqAfterApplyingRemote,
  shouldApplyRemoteLive,
} from '../onlineLiveSync';

const live = (overrides = {}) => ({
  kind: 'x01',
  writeId: 'w2',
  seq: 2,
  gameState: { p1Score: 501 },
  ...overrides,
});

describe('onlineLiveSync', () => {
  it('nextLiveSeq je max(local, applied) + 1', () => {
    expect(nextLiveSeq(3, 5)).toBe(6);
    expect(nextLiveSeq(5, 3)).toBe(6);
    expect(nextLiveSeq(0, 0)).toBe(1);
    expect(nextLiveSeq(undefined, 4)).toBe(5);
  });

  it('ignoruje echo vlastního writeId', () => {
    expect(
      shouldApplyRemoteLive({
        live: live(),
        lastPushedWriteId: 'w2',
        lastPushedSeq: 2,
        lastAppliedSeq: 1,
      })
    ).toEqual({ apply: false, reason: 'echo' });
  });

  it('ignoruje pozdní snapshot staršího seq po novějším vlastním zápisu', () => {
    expect(
      shouldApplyRemoteLive({
        live: live({ writeId: 'w1', seq: 1 }),
        lastPushedWriteId: 'w2',
        lastPushedSeq: 2,
        lastAppliedSeq: 0,
      })
    ).toEqual({ apply: false, reason: 'stale_inflight' });
  });

  it('ignoruje seq už aplikovaný', () => {
    expect(
      shouldApplyRemoteLive({
        live: live({ writeId: 'w1', seq: 2 }),
        lastPushedWriteId: 'w3',
        lastPushedSeq: 3,
        lastAppliedSeq: 2,
      })
    ).toEqual({ apply: false, reason: 'stale_applied' });
  });

  it('aplikuje novější stav soupeře', () => {
    expect(
      shouldApplyRemoteLive({
        live: live({ writeId: 'opp-3', seq: 3 }),
        lastPushedWriteId: 'w2',
        lastPushedSeq: 2,
        lastAppliedSeq: 2,
      })
    ).toEqual({ apply: true, seq: 3 });
  });

  it('starý klient bez seq se aplikuje, pokud to není echo', () => {
    expect(
      shouldApplyRemoteLive({
        live: live({ writeId: 'legacy', seq: undefined }),
        lastPushedWriteId: 'w2',
        lastPushedSeq: 2,
        lastAppliedSeq: 2,
      })
    ).toEqual({ apply: true, seq: 0 });
  });

  it('seqAfterApplyingRemote zvedne počítadla na remote', () => {
    expect(seqAfterApplyingRemote(4, 2, 3)).toBe(4);
    expect(seqAfterApplyingRemote(undefined, 5, 3)).toBe(5);
    expect(parseLiveSeq('3')).toBe(3);
    expect(parseLiveSeq('nope')).toBe(0);
  });
});
