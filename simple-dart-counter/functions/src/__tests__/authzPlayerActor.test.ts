import { describe, expect, it } from 'vitest';
import { hashCancelToken, hashOnlinePin } from '../authz';
import { canActAsPlayer } from '../playerActor';
import type { CallableRequest } from 'firebase-functions/v2/https';

function req(opts: { uid?: string; email?: string; anonymous?: boolean } = {}): CallableRequest {
  if (!opts.uid) return { auth: undefined, data: {}, rawRequest: {} } as CallableRequest;
  return {
    auth: {
      uid: opts.uid,
      token: {
        email: opts.email,
        firebase: { sign_in_provider: opts.anonymous ? 'anonymous' : 'google.com' },
      },
    },
    data: {},
    rawRequest: {},
  } as unknown as CallableRequest;
}

describe('canActAsPlayer', () => {
  it('Google uid na přihlášce stačí', () => {
    expect(canActAsPlayer({ player: { authUid: 'u1' } }, req({ uid: 'u1' }), '')).toBe(true);
    expect(canActAsPlayer({ player: { authUid: 'u1' } }, req({ uid: 'u2' }), '')).toBe(false);
  });

  it('anonymní auth se nepočítá jako Google', () => {
    expect(
      canActAsPlayer(
        { player: { authUid: 'anon' } },
        req({ uid: 'anon', anonymous: true }),
        ''
      )
    ).toBe(false);
  });

  it('platný cancelToken projde', () => {
    const token = 'a'.repeat(64);
    const hash = hashCancelToken(token);
    expect(canActAsPlayer({ cancelTokenHash: hash }, req(), token)).toBe(true);
    expect(canActAsPlayer({ cancelTokenHash: hash }, req(), 'wrong')).toBe(false);
  });

  it('legacy bez hash a bez identity povolí (přechod)', () => {
    expect(canActAsPlayer({ player: { name: 'Ada' } }, req(), '')).toBe(true);
  });

  it('nová přihláška s hashem bez tokenu nepustí cizího', () => {
    expect(
      canActAsPlayer({ cancelTokenHash: hashCancelToken('secret'), player: { email: 'a@b.cz' } }, req(), '')
    ).toBe(false);
  });
});

describe('hashOnlinePin', () => {
  it('je deterministický pro stejný PIN', () => {
    expect(hashOnlinePin('1234')).toBe(hashOnlinePin('1234'));
    expect(hashOnlinePin('1234')).not.toBe(hashOnlinePin('1235'));
    expect(hashOnlinePin('1234')).toHaveLength(64);
  });
});
