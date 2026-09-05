import { describe, expect, it } from 'vitest';
import { splitTournamentSecrets } from '../tournamentSync';

describe('splitTournamentSecrets', () => {
  it('oddělí heslo a tokeny od veřejného stavu', () => {
    const { publicData, secrets } = splitTournamentSecrets({
      name: 'Pátek',
      tabletPassword: 'ab12',
      boardAuthTokens: { 1: 'tok' },
      pin: '1234',
    });
    expect(publicData).toMatchObject({ name: 'Pátek', pin: '1234' });
    expect(publicData).not.toHaveProperty('tabletPassword');
    expect(publicData).not.toHaveProperty('boardAuthTokens');
    expect(secrets).toEqual({ tabletPassword: 'ab12', boardAuthTokens: { 1: 'tok' } });
  });

  it('bez tajemství vrací secrets null', () => {
    const { publicData, secrets } = splitTournamentSecrets({ name: 'X' });
    expect(publicData).toEqual({ name: 'X' });
    expect(secrets).toBeNull();
  });
});
