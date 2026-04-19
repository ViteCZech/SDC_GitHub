import React, { useState } from 'react';
import { ArrowLeft, Globe, LogOut, X } from 'lucide-react';
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
export function HomeOnlineSubmenu({
  t,
  onBack,
  settings,
  onOnlineGameStart,
  resumeHostWaitingSession = null,
  onResumeHostWaitingConsumed,
}) {
  const [lobbyChrome, setLobbyChrome] = useState(null);
  const secondary = lobbyChrome?.secondary;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-2 md:col-span-2 md:max-w-2xl">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl p-2.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          title={t('backToMenu')}
          aria-label={t('backToMenu')}
        >
          <ArrowLeft className="h-6 w-6 shrink-0" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <Globe className="h-7 w-7 shrink-0 text-emerald-400" aria-hidden />
          <h2 className="truncate text-center text-base font-black uppercase tracking-widest text-white sm:text-lg">
            {t('menuOnline')}
          </h2>
        </div>
        {secondary ? (
          <button
            type="button"
            disabled={secondary.disabled}
            onClick={() => secondary.onClick?.()}
            title={secondary.title}
            aria-label={secondary.title}
            className="rounded-xl p-2.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:pointer-events-none disabled:opacity-35"
          >
            {secondary.kind === 'leave' ? (
              <LogOut className="h-6 w-6 shrink-0 text-amber-200/90" />
            ) : (
              <X className="h-6 w-6 shrink-0 text-slate-200" />
            )}
          </button>
        ) : (
          <div className="w-10 shrink-0 sm:w-11" aria-hidden />
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 [-webkit-overflow-scrolling:touch]">
        <OnlineHub
          t={t}
          settings={settings}
          onOnlineGameStart={onOnlineGameStart}
          resumeHostWaitingSession={resumeHostWaitingSession}
          onResumeHostWaitingConsumed={onResumeHostWaitingConsumed}
          onLobbyChromeChange={setLobbyChrome}
        />
      </div>
    </div>
  );
}
