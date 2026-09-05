import { describe, expect, it } from 'vitest';
import { mergeTabletAuthSources, validateTabletAuth } from '../tabletAuth';

describe('validateTabletAuth', () => {
  it('platný board token stačí', () => {
    expect(
      validateTabletAuth(
        { boardAuthTokens: { 1: 'tok-1' }, tabletPassword: 'ab12' },
        '1',
        'tok-1',
        ''
      )
    ).toBe(true);
  });

  it('špatný token nespadne na prázdné heslo', () => {
    expect(
      validateTabletAuth({ boardAuthTokens: { 1: 'tok-1' } }, '1', 'wrong', '')
    ).toBe(false);
  });

  it('prázdné heslo bez tokenu nikdy nepustí', () => {
    expect(validateTabletAuth({ tabletPassword: '' }, '1', '', '')).toBe(false);
    expect(validateTabletAuth({}, '1', '', '')).toBe(false);
    expect(validateTabletAuth(null, '1', '', '')).toBe(false);
  });

  it('neprázdné heslo musí sedět', () => {
    expect(validateTabletAuth({ tabletPassword: 'ab12' }, '1', '', 'ab12')).toBe(true);
    expect(validateTabletAuth({ tabletPassword: 'ab12' }, '1', '', 'zz')).toBe(false);
  });
});

describe('mergeTabletAuthSources', () => {
  it('privátní kolekce má přednost před veřejným dokumentem', () => {
    const merged = mergeTabletAuthSources(
      { tabletPassword: 'sec', boardAuthTokens: { 1: 'a' } },
      { tabletPassword: 'pub', boardAuthTokens: { 1: 'b' } }
    );
    expect(merged.tabletPassword).toBe('sec');
    expect(merged.boardAuthTokens?.['1']).toBe('a');
  });
});
