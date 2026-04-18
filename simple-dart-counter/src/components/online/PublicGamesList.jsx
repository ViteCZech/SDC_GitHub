import React from 'react';

/**
 * Seznam veřejných čekajících her.
 */
export default function PublicGamesList({ t, games, onJoinGame, joinBusyId }) {
  if (!games.length) {
    return (
      <p className="text-sm text-slate-500 text-center py-6 border border-dashed border-slate-700 rounded-xl">
        {t('onlineNoPublicGames')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3 w-full">
      {games.map((g) => (
        <li
          key={g.id}
          className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
              {t('onlineGameHostLabel')}
            </div>
            <div className="text-base font-black text-white truncate">{g.hostName}</div>
            <div className="text-sm text-slate-300">
              <span className="font-bold text-emerald-400/90">{t('gameFormatLabel')}:</span>{' '}
              <span className="font-mono">{g.gameFormat}</span>
              <span className="mx-2 text-slate-600">·</span>
              <span className="font-bold text-emerald-400/90">{t('onlineLegsLabel')}:</span>{' '}
              <span className="font-mono">{g.legs}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={joinBusyId === g.id}
            onClick={() => onJoinGame(g)}
            className="shrink-0 w-full sm:w-auto px-5 py-3 rounded-xl font-black text-sm uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 disabled:opacity-50 transition-colors sm:min-w-[10rem]"
          >
            {joinBusyId === g.id ? t('onlineJoining') : t('onlineJoinGameButton')}
          </button>
        </li>
      ))}
    </ul>
  );
}
