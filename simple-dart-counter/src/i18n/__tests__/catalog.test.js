import { describe, expect, it } from 'vitest';
import { ensureLocale, normalizeLang, translations } from '../catalog.js';

describe('i18n catalog', () => {
  it('cs je k dispozici ihned', () => {
    expect(translations.cs.newGame).toBe('Nová hra');
    expect(normalizeLang('de')).toBe('cs');
  });

  it('ensureLocale načte en a pl', async () => {
    const en = await ensureLocale('en');
    const pl = await ensureLocale('pl');
    expect(en.newGame).toBe('New Game');
    expect(pl.newGame).toBe('Nowa Gra');
    expect(translations.en.newGame).toBe('New Game');
    expect(translations.pl.newGame).toBe('Nowa Gra');
  });
});
