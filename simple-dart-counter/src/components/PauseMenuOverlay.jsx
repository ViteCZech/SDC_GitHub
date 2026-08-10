import React from 'react';
import { Pause, Play, Home, Settings, LogOut, X } from 'lucide-react';

/**
 * Pause / menu overlay nad herní obrazovkou.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title?: string,
 *   actions: Array<{
 *     id: string,
 *     label: string,
 *     onClick: () => void,
 *     variant?: 'default'|'danger'|'primary',
 *     icon?: 'home'|'settings'|'exit'|'play',
 *   }>,
 * }} props
 */
export default function PauseMenuOverlay({ open, onClose, title = 'Pauza', actions = [] }) {
  if (!open) return null;

  const iconFor = (name) => {
    if (name === 'home') return <Home className="w-5 h-5" />;
    if (name === 'settings') return <Settings className="w-5 h-5" />;
    if (name === 'exit') return <LogOut className="w-5 h-5" />;
    if (name === 'play') return <Play className="w-5 h-5" />;
    return null;
  };

  const variantCls = (v) => {
    if (v === 'danger') {
      return 'border-red-500/40 bg-red-950/50 text-red-200 hover:bg-red-900/60';
    }
    if (v === 'primary') {
      return 'border-emerald-500/40 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/60';
    }
    return 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700';
  };

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-white font-black uppercase tracking-widest text-sm">
            <Pause className="w-4 h-4 text-amber-400" />
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Zavřít"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                a.onClick();
              }}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border font-bold text-sm ${variantCls(a.variant)}`}
            >
              {iconFor(a.icon)}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
