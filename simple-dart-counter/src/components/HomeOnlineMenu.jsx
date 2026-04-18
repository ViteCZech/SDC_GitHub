import React from 'react';
import { ArrowLeft, Globe, LogIn, PlusCircle, Zap } from 'lucide-react';

const tileBtnClass =
  'flex flex-col items-center gap-2 p-4 transition-transform border bg-slate-800 hover:bg-slate-700 border-slate-700 rounded-2xl active:scale-95';

const tileBtnClassFull = `${tileBtnClass} w-full`;

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
 * Podmenu úvodní obrazovky pro online režim (zatím zástupné akce).
 */
export function HomeOnlineSubmenu({
  t,
  onBack,
  onCreateLobby = () => console.log('online: create lobby'),
  onJoinMatch = () => console.log('online: join match'),
  onQuickGame = () => console.log('online: quick game'),
}) {
  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-4 md:col-span-2">
      <button
        type="button"
        onClick={onBack}
        className="flex justify-center w-full gap-3 py-4 text-lg font-black text-white transition-transform shadow-lg border-2 border-emerald-500/70 bg-slate-800 hover:bg-slate-700 rounded-2xl active:scale-95"
      >
        <ArrowLeft className="w-7 h-7 shrink-0" />
        {t('backToMenu')}
      </button>
      <div className="flex flex-col items-center gap-2 py-2">
        <Globe className="w-10 h-10 text-emerald-400" />
        <h2 className="text-xl font-black tracking-widest text-white text-center uppercase">{t('menuOnline')}</h2>
      </div>
      <button type="button" onClick={onCreateLobby} className={tileBtnClassFull}>
        <PlusCircle className="w-7 h-7 text-emerald-400" />
        <span className="text-sm font-bold text-white">{t('onlineCreateLobby')}</span>
      </button>
      <button type="button" onClick={onJoinMatch} className={tileBtnClassFull}>
        <LogIn className="w-7 h-7 text-blue-400" />
        <span className="text-sm font-bold text-white">{t('onlineJoinMatch')}</span>
      </button>
      <button type="button" onClick={onQuickGame} className={tileBtnClassFull}>
        <Zap className="w-7 h-7 text-amber-400" />
        <span className="text-sm font-bold text-white">{t('onlineQuickGame')}</span>
      </button>
    </div>
  );
}
