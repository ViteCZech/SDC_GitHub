import { cs } from './cs.js';

export const SUPPORTED_LANGS = ['cs', 'en', 'pl'];

/** Aktivní katalogy. `cs` je v hlavním chunku; `en`/`pl` se dotažují lazy. */
export const translations = {
  cs,
};

const loaders = {
  en: () => import('./en.js').then((m) => m.en),
  pl: () => import('./pl.js').then((m) => m.pl),
};

const inflight = {};

export function normalizeLang(lang) {
  return lang === 'en' || lang === 'pl' ? lang : 'cs';
}

/**
 * Zajistí, že `translations[lang]` je k dispozici (cs sync, en/pl dynamický import).
 * @param {string} lang
 * @returns {Promise<object>}
 */
export function ensureLocale(lang) {
  const key = normalizeLang(lang);
  if (key === 'cs') return Promise.resolve(translations.cs);
  if (translations[key]) return Promise.resolve(translations[key]);
  if (!inflight[key]) {
    inflight[key] = loaders[key]().then((pack) => {
      translations[key] = pack;
      return pack;
    });
  }
  return inflight[key];
}

/** Po prvním vykreslení přednačti zbylé jazyky, ať přepnutí vlajky nečeká na síť. */
export function prefetchOtherLocales(current = 'cs') {
  const skip = normalizeLang(current);
  for (const lang of ['en', 'pl']) {
    if (lang !== skip) void ensureLocale(lang);
  }
}
