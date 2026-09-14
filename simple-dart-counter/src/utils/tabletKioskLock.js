/**
 * Kiosk PIN zámek pro tabletový režim u terče.
 *
 * Tablet je kiosk: po přihlášení (PIN turnaje + číslo desky + heslo/token)
 * zůstává zamčený, aby hráči nemohli nechtěně opustit zápas, resetovat desku
 * nebo odejít z relace. Citlivé akce vyžadují 4místný Kiosk PIN.
 *
 * Zdroj Kiosk PINu (první platná 4místná hodnota):
 *  1. heslo tabletu z přihlášení (`tabletPassword`), je-li 4místné číselné,
 *  2. PIN turnaje (`activePin` / `tournamentData.pin`) — „admin PIN turnaje".
 *
 * Stav zamčení (`isKioskLocked`) se drží v `sessionStorage`, aby zámek přežil
 * refresh stránky po celou dobu provozu tabletu u terče.
 */

export const TABLET_KIOSK_LOCK_STORAGE_KEY = 'sdc_tablet_kiosk_locked';

export const TABLET_KIOSK_MAX_ATTEMPTS = 3;
export const TABLET_KIOSK_LOCKOUT_SECONDS = 5;
export const TABLET_KIOSK_PIN_LENGTH = 4;

const FOUR_DIGITS = /^\d{4}$/;

/** Normalizuje kandidáta na Kiosk PIN; vrátí '' pokud není platný 4místný PIN. */
export function normalizeKioskPinCandidate(raw) {
  const v = String(raw ?? '').trim();
  return FOUR_DIGITS.test(v) ? v : '';
}

/**
 * Vyřeší aktivní Kiosk PIN tabletu.
 * @param {{ tabletPassword?: string, activePin?: string, tournamentPin?: string }} src
 * @returns {string} 4místný PIN, nebo '' když nelze odvodit (zámek se neaktivuje).
 */
export function resolveTabletKioskPin({ tabletPassword = '', activePin = '', tournamentPin = '' } = {}) {
  return (
    normalizeKioskPinCandidate(tabletPassword) ||
    normalizeKioskPinCandidate(activePin) ||
    normalizeKioskPinCandidate(tournamentPin)
  );
}

/** Je tabletová relace platná pro aktivaci Kiosk zámku (PIN + deska)? */
export function isTabletKioskSessionValid({ pin = '', board = '' } = {}) {
  return FOUR_DIGITS.test(String(pin ?? '').trim()) && String(board ?? '').trim().length > 0;
}

/** Ověří zadaný PIN proti Kiosk PINu (konstantní délka, trim). */
export function verifyTabletKioskPin(kioskPin, enteredPin) {
  const expected = normalizeKioskPinCandidate(kioskPin);
  const entered = normalizeKioskPinCandidate(enteredPin);
  if (!expected || !entered) return false;
  let diff = 0;
  for (let i = 0; i < TABLET_KIOSK_PIN_LENGTH; i += 1) {
    diff |= expected.charCodeAt(i) ^ entered.charCodeAt(i);
  }
  return diff === 0;
}

/** Načte perzistovaný stav zámku; výchozí je zamčeno (true). */
export function loadTabletKioskLocked(storage) {
  try {
    const raw = storage?.getItem(TABLET_KIOSK_LOCK_STORAGE_KEY);
    if (raw == null) return true;
    return raw !== 'unlocked';
  } catch {
    return true;
  }
}

/** Uloží stav zámku do session storage. */
export function persistTabletKioskLocked(storage, locked) {
  try {
    storage?.setItem(TABLET_KIOSK_LOCK_STORAGE_KEY, locked ? 'locked' : 'unlocked');
  } catch {
    /* storage nedostupné (SSR/testy) — zámek zůstává jen v paměti */
  }
}

/** Vyčistí perzistovaný stav zámku (konec tabletové relace). */
export function clearTabletKioskLock(storage) {
  try {
    storage?.removeItem(TABLET_KIOSK_LOCK_STORAGE_KEY);
  } catch {
    /* ignoruj */
  }
}
