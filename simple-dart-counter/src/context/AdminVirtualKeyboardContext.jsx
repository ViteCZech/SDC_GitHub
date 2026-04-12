import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import VirtualKeyboard from '../components/VirtualKeyboard';

export const AdminVirtualKeyboardContext = createContext(null);

/** Stejná logika jako isPC v App: myš + široké okno → považovat za PC (bez interní klávesnice). */
function computeInternalKeyboardEnabled() {
  if (typeof window === 'undefined') return true;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const wide = window.innerWidth >= 768;
  return !(finePointer && wide);
}

/**
 * Vazba na interní klávesnici: append/delete volají rodičovský stav (funkční setState).
 * onClose po stisku „Hotovo“ — např. obnovení výchozích jmen.
 * Interní klávesnice jen na tablet/mobil; na PC se použije systémová.
 */
export function AdminVirtualKeyboardProvider({ children, lang, onVisibilityChange }) {
  const bindingRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [internalKeyboardEnabled, setInternalKeyboardEnabled] = useState(computeInternalKeyboardEnabled);

  useEffect(() => {
    const sync = () => setInternalKeyboardEnabled(computeInternalKeyboardEnabled());
    sync();
    window.addEventListener('resize', sync);
    const mq = window.matchMedia('(pointer: fine)');
    mq.addEventListener('change', sync);
    return () => {
      window.removeEventListener('resize', sync);
      mq.removeEventListener('change', sync);
    };
  }, []);

  const closeKeyboard = useCallback(() => {
    bindingRef.current?.onClose?.();
    bindingRef.current = null;
    setOpen(false);
    onVisibilityChange?.(false);
  }, [onVisibilityChange]);

  useEffect(() => {
    if (!internalKeyboardEnabled && open) closeKeyboard();
  }, [internalKeyboardEnabled, open, closeKeyboard]);

  const openKeyboard = useCallback(
    (binding) => {
      if (!internalKeyboardEnabled) return;
      bindingRef.current = binding;
      setOpen(true);
      onVisibilityChange?.(true);
    },
    [onVisibilityChange, internalKeyboardEnabled]
  );

  const onChar = useCallback((c) => {
    bindingRef.current?.onAppend?.(c);
  }, []);

  const onDelete = useCallback(() => {
    bindingRef.current?.onDelete?.();
  }, []);

  const value = {
    openKeyboard,
    closeKeyboard,
    isKeyboardOpen: open && internalKeyboardEnabled,
    internalKeyboardEnabled,
  };

  return (
    <AdminVirtualKeyboardContext.Provider value={value}>
      {children}
      {open && internalKeyboardEnabled && (
        <VirtualKeyboard onChar={onChar} onDelete={onDelete} onClose={closeKeyboard} lang={lang} />
      )}
    </AdminVirtualKeyboardContext.Provider>
  );
}

export function useAdminVirtualKeyboard() {
  const ctx = useContext(AdminVirtualKeyboardContext);
  if (!ctx) {
    throw new Error('useAdminVirtualKeyboard must be used within AdminVirtualKeyboardProvider');
  }
  return ctx;
}

/** Mimo provider vrací null (fallback na klasický input). */
export function useAdminVirtualKeyboardOptional() {
  return useContext(AdminVirtualKeyboardContext);
}
