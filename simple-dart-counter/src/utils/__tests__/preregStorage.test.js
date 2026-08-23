// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearStoredRegistration,
  listAllStoredRegistrations,
  loadPreferredCity,
  loadStoredRegistration,
  savePreferredCity,
  saveStoredRegistration,
  upsertPreregSetupTemplate,
} from '../preregStorage';

afterEach(() => {
  localStorage.clear();
});

describe('preregStorage', () => {
  it('uloží a načte přihlášku podle turnaje', () => {
    saveStoredRegistration('t1', {
      registrationId: 'r1',
      status: 'CONFIRMED',
      variableSymbol: '123',
      paymentMethod: 'QR',
      playerName: 'Ada',
      savedAt: '2026-08-01',
    });
    expect(loadStoredRegistration('t1')?.registrationId).toBe('r1');
    expect(listAllStoredRegistrations()).toHaveLength(1);
    clearStoredRegistration('t1');
    expect(loadStoredRegistration('t1')).toBeNull();
  });

  it('poškozený JSON vrací null', () => {
    localStorage.setItem('dartsPrereg_t1', '{not-json');
    expect(loadStoredRegistration('t1')).toBeNull();
  });

  it('preferred city: prázdné smaže klíč', () => {
    savePreferredCity('Brno');
    expect(loadPreferredCity()).toBe('Brno');
    savePreferredCity('  ');
    expect(loadPreferredCity()).toBe('');
  });

  it('upsert šablony přepíše stejný název a drží id', () => {
    upsertPreregSetupTemplate({ id: 'a', title: 'Klub', savedAt: '1', includeBank: false, fields: {} });
    const next = upsertPreregSetupTemplate({
      id: 'b',
      title: 'klub',
      savedAt: '2',
      includeBank: true,
      fields: { city: 'Brno' },
    });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('a');
    expect(next[0].includeBank).toBe(true);
  });
});
