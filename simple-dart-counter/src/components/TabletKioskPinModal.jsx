import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { translations } from '../translations';
import {
  TABLET_KIOSK_LOCKOUT_SECONDS,
  TABLET_KIOSK_MAX_ATTEMPTS,
  TABLET_KIOSK_PIN_LENGTH,
  verifyTabletKioskPin,
} from '../utils/tabletKioskLock';

/**
 * Dotyková PIN klávesnice Kiosk zámku tabletu.
 * Po 4. číslici PIN automaticky ověří; při 3. neúspěchu zamkne klávesnici na 5 s.
 * Po úspěchu volá `onSuccess` (rodič okamžitě vykoná chráněnou akci).
 */
export default function TabletKioskPinModal({
  open = false,
  lang = 'cs',
  expectedPin = '',
  actionLabel = '',
  onSuccess,
  onCancel,
}) {
  const t = (k, fallback) => translations[lang]?.[k] ?? fallback ?? k;
  const [entered, setEntered] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [errorFlash, setErrorFlash] = useState(false);
  const [lockoutLeft, setLockoutLeft] = useState(0);
  const verifyTimerRef = useRef(null);
  const errorTimerRef = useRef(null);
  /** Brání dvojímu ověření jednoho zadání (efekt se re-spustí i při změně `attempts`). */
  const verifyArmedRef = useRef(false);

  const locked = lockoutLeft > 0;

  const resetAll = useCallback(() => {
    verifyArmedRef.current = false;
    setEntered('');
    setAttempts(0);
    setErrorFlash(false);
    setLockoutLeft(0);
  }, []);

  useEffect(() => {
    if (open) resetAll();
  }, [open, resetAll]);

  useEffect(
    () => () => {
      if (verifyTimerRef.current) window.clearTimeout(verifyTimerRef.current);
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!locked) return undefined;
    const id = window.setInterval(() => {
      setLockoutLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [locked]);

  const wasLockedRef = useRef(false);
  useEffect(() => {
    if (wasLockedRef.current && !locked) setAttempts(0);
    wasLockedRef.current = locked;
  }, [locked]);

  const handleVerify = useCallback(
    (pin) => {
      if (verifyTabletKioskPin(expectedPin, pin)) {
        if (typeof onSuccess === 'function') onSuccess();
        return;
      }
      const next = attempts + 1;
      setAttempts(next);
      setErrorFlash(true);
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = window.setTimeout(
        () => {
          setErrorFlash(false);
          setEntered('');
          if (next >= TABLET_KIOSK_MAX_ATTEMPTS) {
            setLockoutLeft(TABLET_KIOSK_LOCKOUT_SECONDS);
          }
        },
        next >= TABLET_KIOSK_MAX_ATTEMPTS ? 600 : 500
      );
    },
    [attempts, expectedPin, onSuccess]
  );

  useEffect(() => {
    if (!open || locked || entered.length !== TABLET_KIOSK_PIN_LENGTH) {
      verifyArmedRef.current = false;
      return undefined;
    }
    if (verifyArmedRef.current) return undefined;
    verifyArmedRef.current = true;
    verifyTimerRef.current = window.setTimeout(() => handleVerify(entered), 180);
    return () => window.clearTimeout(verifyTimerRef.current);
  }, [entered, open, locked, handleVerify]);

  if (!open) return null;

  const pressDigit = (d) => {
    if (locked || errorFlash) return;
    setEntered((prev) => (prev.length >= TABLET_KIOSK_PIN_LENGTH ? prev : prev + d));
  };

  const pressBackspace = () => {
    if (locked || errorFlash) return;
    setEntered((prev) => prev.slice(0, -1));
  };

  const dots = Array.from({ length: TABLET_KIOSK_PIN_LENGTH }, (_, i) => i < entered.length);

  const keyBtn =
    'flex items-center justify-center rounded-2xl border-2 text-2xl font-black tabular-nums min-h-[3.75rem] touch-manipulation active:scale-95 transition-all select-none';

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('kioskLockTitle', 'Kiosk zámek desky')}
    >
      <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <p className="text-center text-sm font-black uppercase tracking-widest text-slate-400">
          {t('kioskLockTitle', 'Kiosk zámek desky')}
        </p>
        {actionLabel ? (
          <p className="mt-1 text-center text-xs font-bold text-amber-300/90">{actionLabel}</p>
        ) : null}
        <p className="mt-2 text-center text-sm text-slate-300">
          {t('enterPinToUnlock', 'Zadejte 4místný PIN pro odemčení')}
        </p>

        <div className={`mt-4 flex items-center justify-center gap-3 ${errorFlash ? 'animate-pulse' : ''}`}>
          {dots.map((filled, i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-colors ${
                errorFlash
                  ? 'border-red-500 bg-red-500'
                  : filled
                    ? 'border-emerald-400 bg-emerald-400'
                    : 'border-slate-600 bg-transparent'
              }`}
            />
          ))}
        </div>

        <p
          className={`mt-2 min-h-[1.25rem] text-center text-xs font-bold ${
            errorFlash ? 'text-red-400' : locked ? 'text-amber-300' : 'text-transparent'
          }`}
          aria-live="polite"
        >
          {locked
            ? String(t('kioskLockedOut', 'Příliš mnoho pokusů. Zkuste to za {sec} s.')).replace(
                '{sec}',
                String(lockoutLeft)
              )
            : errorFlash
              ? t('incorrectPin', 'Nesprávný PIN')
              : '·'}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2" aria-hidden={locked}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              disabled={locked}
              onClick={() => pressDigit(d)}
              className={`${keyBtn} border-slate-600 bg-slate-800 text-white hover:border-emerald-500/60 disabled:opacity-40`}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={onCancel}
            className={`${keyBtn} border-slate-700 bg-transparent px-1 text-xs font-black uppercase tracking-wide text-slate-400 hover:text-white disabled:opacity-40`}
          >
            {t('cancel', 'Zrušit')}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => pressDigit('0')}
            className={`${keyBtn} border-slate-600 bg-slate-800 text-white hover:border-emerald-500/60 disabled:opacity-40`}
          >
            0
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={pressBackspace}
            aria-label="Backspace"
            className={`${keyBtn} border-slate-600 bg-slate-800 text-slate-300 hover:border-emerald-500/60 disabled:opacity-40`}
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
