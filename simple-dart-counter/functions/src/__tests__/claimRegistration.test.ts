import { describe, expect, it } from 'vitest';
import {
  canAttachGoogleUserToRegistration,
  normalizeEmail,
  officialCsoId,
} from '../claimRegistration';

const reg = (player: Record<string, unknown>) => ({ player });

describe('claimRegistration', () => {
  it('normalizeEmail trimuje a sjednocuje na lowercase', () => {
    expect(normalizeEmail('  Jan@Club.cz ')).toBe('jan@club.cz');
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it('officialCsoId bere jen prefix cso:', () => {
    expect(officialCsoId('cso:123')).toBe('cso:123');
    expect(officialCsoId('name:jan novak')).toBeNull();
    expect(officialCsoId('123')).toBeNull();
  });

  it('bez Google uid nelze claimovat', () => {
    expect(
      canAttachGoogleUserToRegistration(
        reg({ email: 'a@b.cz', csoPlayerId: 'cso:1' }),
        null,
        'a@b.cz',
        'email',
        'cso:1'
      )
    ).toBe(false);
  });

  it('stejný uid už vlastní přihlášku → claim', () => {
    expect(
      canAttachGoogleUserToRegistration(
        reg({ authUid: 'uid-1' }),
        'uid-1',
        null,
        'identity',
        null
      )
    ).toBe(true);
  });

  it('cizí uid claim zablokuje', () => {
    expect(
      canAttachGoogleUserToRegistration(
        reg({ authUid: 'uid-other', email: 'a@b.cz' }),
        'uid-1',
        'a@b.cz',
        'email',
        null
      )
    ).toBe(false);
  });

  it('reason email: shoda e-mailu stačí, jméno nestačí', () => {
    expect(
      canAttachGoogleUserToRegistration(
        reg({ email: 'a@b.cz' }),
        'uid-1',
        'a@b.cz',
        'email',
        null
      )
    ).toBe(true);
    expect(
      canAttachGoogleUserToRegistration(
        reg({ email: 'other@b.cz' }),
        'uid-1',
        'a@b.cz',
        'email',
        null
      )
    ).toBe(false);
  });

  it('reason identity: rekreační jméno bez e-mailu a bez ČŠO ID se neclaimuje', () => {
    expect(
      canAttachGoogleUserToRegistration(
        reg({ name: 'Jan Novák', csoPlayerId: 'name:jan novak' }),
        'uid-1',
        null,
        'identity',
        'name:jan novak'
      )
    ).toBe(false);
  });

  it('reason identity: oficiální ČŠO ID bez e-mailu se claimuje', () => {
    expect(
      canAttachGoogleUserToRegistration(
        reg({ csoPlayerId: 'cso:999' }),
        'uid-1',
        null,
        'identity',
        'cso:999'
      )
    ).toBe(true);
    expect(
      canAttachGoogleUserToRegistration(
        reg({ csoPlayerId: 'cso:999' }),
        'uid-1',
        null,
        'identity',
        'cso:111'
      )
    ).toBe(false);
  });

  it('reason identity: existující e-mail musí sedět i při shodě ČŠO', () => {
    expect(
      canAttachGoogleUserToRegistration(
        reg({ email: 'admin@club.cz', csoPlayerId: 'cso:999' }),
        'uid-1',
        'player@club.cz',
        'identity',
        'cso:999'
      )
    ).toBe(false);
    expect(
      canAttachGoogleUserToRegistration(
        reg({ email: 'player@club.cz', csoPlayerId: 'cso:999' }),
        'uid-1',
        'player@club.cz',
        'identity',
        'cso:999'
      )
    ).toBe(true);
  });
});
