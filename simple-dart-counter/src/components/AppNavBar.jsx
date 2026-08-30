import React from 'react';
import { ArrowLeft, Home, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Jednotná horní navigace (Zpět + Domů). Fixní výška h-14 — nesmí růst layout.
 *
 * @param {{
 *   showBack?: boolean,
 *   showHome?: boolean,
 *   onBack?: () => void,
 *   onHome?: () => void,
 *   backLabel?: string,
 *   homeLabel?: string,
 *   center?: React.ReactNode,
 *   right?: React.ReactNode,
 *   leftExtra?: React.ReactNode,
 * }} props
 */
export default function AppNavBar({
  showBack = false,
  showHome = false,
  onBack,
  onHome,
  backLabel = 'Zpět',
  homeLabel = 'Domů',
  center = null,
  right = null,
  leftExtra = null,
}) {
  const { isDark, toggleTheme } = useTheme();
  const themeLabel = isDark ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim';

  return (
    <header className="relative z-20 flex items-center justify-between p-2 border-b h-14 bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800 shrink-0">
      <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 shrink-0">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
        {showHome && (
          <button
            type="button"
            onClick={onHome}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
            aria-label={homeLabel}
            title={homeLabel}
          >
            <Home className="w-6 h-6" />
          </button>
        )}
        {leftExtra}
      </div>
      <div className="flex-1 min-w-0 px-2 flex items-center justify-center overflow-hidden">
        {center}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-slate-200 bg-white text-cyan-600 hover:bg-slate-100 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-400 dark:hover:bg-slate-700"
          aria-label={themeLabel}
          title={themeLabel}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {right}
      </div>
    </header>
  );
}
