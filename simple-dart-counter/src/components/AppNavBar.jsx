import React from 'react';
import { ArrowLeft, Home } from 'lucide-react';

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
  return (
    <header className="relative z-20 flex items-center justify-between p-2 border-b h-14 bg-slate-900 border-slate-800 shrink-0">
      <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 shrink-0">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
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
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
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
      <div className="flex items-center gap-2 shrink-0">{right}</div>
    </header>
  );
}
