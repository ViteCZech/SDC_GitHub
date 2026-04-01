import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import VirtualKeyboard from '../components/VirtualKeyboard';

export const AdminVirtualKeyboardContext = createContext(null);

/**
 * Vazba na interní klávesnici: append/delete volají rodičovský stav (funkční setState).
 * onClose po stisku „Hotovo“ — např. obnovení výchozích jmen.
 */
export function AdminVirtualKeyboardProvider({ children, lang, onVisibilityChange }) {
  const bindingRef = useRef(null);
  const [open, setOpen] = useState(false);

  const closeKeyboard = useCallback(() => {
    bindingRef.current?.onClose?.();
    bindingRef.current = null;
    setOpen(false);
    onVisibilityChange?.(false);
  }, [onVisibilityChange]);

  const openKeyboard = useCallback(
    (binding) => {
      bindingRef.current = binding;
      setOpen(true);
      onVisibilityChange?.(true);
    },
    [onVisibilityChange]
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
    isKeyboardOpen: open,
  };

  return (
    <AdminVirtualKeyboardContext.Provider value={value}>
      {children}
      {open && (
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
