import { describe, expect, it } from 'vitest';
import {
  ONLINE_CRICKET_UNSUPPORTED,
  assertOnlineX01Only,
} from '../onlineGameType';

describe('assertOnlineX01Only', () => {
  it('propustí x01 i prázdný typ', () => {
    expect(() => assertOnlineX01Only('x01')).not.toThrow();
    expect(() => assertOnlineX01Only(undefined)).not.toThrow();
  });

  it('odmítne cricket', () => {
    expect(() => assertOnlineX01Only('cricket')).toThrow(ONLINE_CRICKET_UNSUPPORTED);
  });
});
