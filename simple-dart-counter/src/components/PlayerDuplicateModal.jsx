import React from 'react';
import { AlertTriangle, Pencil, UserPlus, X } from 'lucide-react';

/**
 * Modal při detekci duplicitního hráče (admin / rychlý turnaj).
 *
 * @param {{
 *   open: boolean,
 *   playerName: string,
 *   title?: string,
 *   message?: string,
 *   cancelLabel?: string,
 *   addAnywayLabel?: string,
 *   goToExistingLabel?: string,
 *   onCancel: () => void,
 *   onAddAnyway: () => void,
 *   onGoToExisting: () => void,
 * }} props
 */
export default function PlayerDuplicateModal({
  open,
  playerName,
  title = 'Duplicitní hráč',
  message,
  cancelLabel = 'Zrušit',
  addAnywayLabel = 'Přidat i přesto',
  goToExistingLabel = 'Přejít na existujícího',
  onCancel,
  onAddAnyway,
  onGoToExisting,
}) {
  if (!open) return null;

  const body =
    message ||
    `Hráč ${playerName || ''} už je v seznamu hráčů zapsán.`;

  return (
    <div
      className="fixed inset-0 z-[4000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-dup-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-slate-900 shadow-2xl p-4 sm:p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="player-dup-title" className="text-lg font-black text-white tracking-tight">
              {title}
            </h3>
            <p className="text-sm text-slate-300 mt-1 leading-snug">{body}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
            aria-label={cancelLabel}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onGoToExisting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm border border-emerald-500/40 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/60"
          >
            <Pencil className="w-4 h-4" />
            {goToExistingLabel}
          </button>
          <button
            type="button"
            onClick={onAddAnyway}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            <UserPlus className="w-4 h-4" />
            {addAnywayLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm border border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
