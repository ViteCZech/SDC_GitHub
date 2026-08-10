import React from 'react';
import { Play, Trophy, X } from 'lucide-react';

/**
 * Lišta pro návrat do zaparkované relace (zápas / turnaj).
 *
 * @param {{
 *   session: null | {
 *     kind: 'match'|'tournament',
 *     title?: string,
 *   },
 *   onResume: () => void,
 *   onDismiss: () => void,
 *   resumeLabel: string,
 *   dismissLabel?: string,
 * }} props
 */
export default function ActiveSessionBanner({
  session,
  onResume,
  onDismiss,
  resumeLabel,
  dismissLabel = 'Zavřít',
}) {
  if (!session) return null;

  const Icon = session.kind === 'tournament' ? Trophy : Play;

  return (
    <div className="shrink-0 w-full border-b border-emerald-500/30 bg-emerald-950/40 px-3 py-2 flex items-center gap-2">
      <button
        type="button"
        onClick={onResume}
        className="flex-1 min-w-0 flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-emerald-900/40"
      >
        <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-xs sm:text-sm font-bold text-emerald-100 truncate">
          {resumeLabel}
          {session.title ? ` — ${session.title}` : ''}
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
        aria-label={dismissLabel}
        title={dismissLabel}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
