import React from 'react';
import { ArrowLeft, Globe } from 'lucide-react';
import OnlineHub from './OnlineHub';

const tileBtnClass =
  'flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95';

/**
 * Dlaždice „Online Hra“ na úvodní mřížce.
 */
export function HomeOnlineMenuTile({ t, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className={tileBtnClass}>
      <Globe className="w-7 h-7 text-cyan-400" />
      <span className="text-sm font-bold text-white">{t('menuOnline')}</span>
    </button>
  );
}

/**
 * Podmenu úvodní obrazovky – online lobby (záložky Založit / Najít).
 */
export function HomeOnlineSubmenu({ t, onBack, settings, onOnlineGameStart }) {
  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-4 md:col-span-2 md:max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="flex justify-center w-full gap-3 py-4 text-lg font-black text-white transition-transform shadow-lg border-2 border-emerald-500/70 bg-slate-800 hover:bg-slate-700 rounded-2xl active:scale-95"
      >
        <ArrowLeft className="w-7 h-7 shrink-0" />
        {t('backToMenu')}
      </button>
      <div className="flex flex-col items-center gap-2 py-1">
        <Globe className="w-10 h-10 text-emerald-400" />
        <h2 className="text-xl font-black tracking-widest text-white text-center uppercase">{t('menuOnline')}</h2>
      </div>
      <OnlineHub t={t} settings={settings} onOnlineGameStart={onOnlineGameStart} />
    </div>
  );
}
