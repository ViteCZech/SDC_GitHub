import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const THEME_DARK = 'dark';
const THEME_LIGHT = 'light';
const VALID_THEMES = new Set([THEME_DARK, THEME_LIGHT]);

export const THEME_STORAGE_KEY = 'sdc_theme';

function normalizeTheme(value) {
  return VALID_THEMES.has(value) ? value : THEME_DARK;
}

function readInitialTheme() {
  if (typeof window === 'undefined') return THEME_DARK;
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return THEME_DARK;
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitialTheme);

  const setTheme = useCallback((nextTheme) => {
    setThemeState((prevTheme) => {
      const resolved = typeof nextTheme === 'function' ? nextTheme(prevTheme) : nextTheme;
      return normalizeTheme(resolved);
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prevTheme) => (prevTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(THEME_DARK, THEME_LIGHT);
    root.classList.add(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* localStorage může být blokovaný */
    }
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === THEME_DARK,
    }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
