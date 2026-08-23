import React from 'react';
import { Loader2, Shuffle, Undo2, Users } from 'lucide-react';
import { translations } from '../translations';

/**
 * Los párů na místě (random_doubles) — mezi soupiskou jednotlivců a formátem skupin.
 * @param {{
 *   lang: string,
 *   playerCount: number,
 *   teamCount: number,
 *   reserve: object|null,
 *   drawn: boolean,
 *   canDraw: boolean,
 *   busy?: boolean,
 *   onDraw: () => void,
 *   onRedraw: () => void,
 *   onDissolve: () => void,
 * }} props
 */
export default function RandomPairDrawPanel({
  lang,
  playerCount,
  teamCount,
  reserve,
  drawn,
  canDraw,
  busy = false,
  onDraw,
  onRedraw,
  onDissolve,
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const odd = !drawn && playerCount % 2 === 1;

  return (
    <div className="p-4 rounded-xl border border-violet-500/40 bg-violet-950/20 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-widest text-violet-300 flex items-center gap-2">
            <Users className="w-4 h-4 shrink-0" />
            {t('tournRandomDrawTitle')}
          </p>
          <p className="text-xs text-slate-400 mt-1">{t('tournRandomDrawHint')}</p>
        </div>
        {!drawn ? (
          <button
            type="button"
            onClick={onDraw}
            disabled={!canDraw || busy}
            className="flex items-center gap-2 px-4 py-3 rounded-xl font-black uppercase tracking-wide text-sm bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
            {t('tournRandomDrawBtn')}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRedraw}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
              {t('tournRandomRedrawBtn')}
            </button>
            <button
              type="button"
              onClick={onDissolve}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600"
            >
              <Undo2 className="w-4 h-4" />
              {t('tournRandomDissolveBtn')}
            </button>
          </div>
        )}
      </div>

      {!drawn && (
        <p className="text-xs text-slate-400">
          {t('tournRandomDrawCount')
            .replace('{players}', String(playerCount))
            .replace('{pairs}', String(Math.floor(playerCount / 2)))}
        </p>
      )}
      {odd && <p className="text-xs text-amber-300 font-medium">{t('tournRandomOddHint')}</p>}
      {!canDraw && !drawn && playerCount < 2 && (
        <p className="text-xs text-amber-400">{t('tournRandomNeedPlayers')}</p>
      )}

      {drawn && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            {t('tournRandomDrawnCount').replace('{pairs}', String(teamCount))}
          </p>
          {reserve && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                {t('tournRandomReserve')}
              </p>
              <p className="text-sm font-bold text-white mt-0.5">{reserve.name}</p>
              <p className="text-[11px] text-amber-200/80 mt-0.5">{t('tournRandomReserveHint')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
