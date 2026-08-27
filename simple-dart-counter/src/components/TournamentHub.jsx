import React, { useState } from 'react';
import { CalendarPlus, Eye, Tablet, Trophy, Users } from 'lucide-react';
import { translations } from '../translations';

/**
 * Rozcestník turnaje — 3 role:
 * 1) Pořádat (Moje turnaje / registrace / rychlý start)
 * 2) Připojit se (tablet + divák)
 * 3) Procházet veřejný katalog
 */
export default function TournamentHub({
  lang = 'cs',
  onTabletJoin,
  onViewerJoin,
  onOpenPreReg,
  onOpenCatalog,
  // Rychlý start + historie se volají z Moje turnaje (MyPreRegTournamentsList).
  onChooseAdmin: _onChooseAdmin,
  onOpenHistory: _onOpenHistory,
}) {
  const th = (k) => translations[lang]?.tournamentHub?.[k] ?? k;
  const [panel, setPanel] = useState(null); // null | 'join' | 'tablet' | 'viewer'
  const [pin, setPin] = useState('');
  const [board, setBoard] = useState('');
  const [tabletPassword, setTabletPassword] = useState('');

  const normalizePin = (v) => String(v || '').replace(/\D/g, '').slice(0, 4);
  const normalizeBoard = (v) => String(v || '').replace(/\D/g, '').slice(0, 2);

  const resetForm = () => {
    setPin('');
    setBoard('');
    setTabletPassword('');
    setPanel(null);
  };

  const shellMain =
    'flex flex-col flex-1 w-full max-w-md md:max-w-4xl lg:max-w-5xl mx-auto overflow-y-auto bg-slate-950 px-3 pt-3 pb-20 sm:px-6 sm:pt-4 sm:pb-24 min-h-0';
  const shortH =
    '[@media(max-height:520px)]:px-2 [@media(max-height:520px)]:pt-2 [@media(max-height:520px)]:pb-16 [@media(max-height:520px)]:sm:px-4 [@media(max-height:520px)]:sm:pt-3';

  const fieldInput =
    'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/60 [@media(max-height:520px)]:py-2 [@media(max-height:520px)]:text-base';

  const tileBtn =
    'flex flex-col items-stretch gap-3 p-5 rounded-2xl border transition-transform active:scale-[0.99] text-left min-h-0 [@media(max-height:520px)]:gap-2 [@media(max-height:520px)]:p-3 [@media(max-height:520px)]:rounded-xl';
  const tileIconWrap =
    'flex items-center justify-center rounded-xl shrink-0 p-2.5 w-fit';
  const tileIcon = 'w-7 h-7 [@media(max-height:520px)]:w-6 [@media(max-height:520px)]:h-6';

  if (panel === 'tablet') {
    return (
      <main className={`${shellMain} ${shortH}`}>
        <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-4 md:mb-6 [@media(max-height:520px)]:text-base [@media(max-height:520px)]:mb-3 [@media(max-height:520px)]:tracking-wide">
          {th('tabletMode')}
        </h2>
        <div className="grid w-full grid-cols-1 md:grid-cols-3 gap-4 md:gap-4 mb-4 md:mb-6">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              {th('enterPin')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(normalizePin(e.target.value))}
              className={fieldInput}
              placeholder="0000"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              {th('enterBoard')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              value={board}
              onChange={(e) => setBoard(normalizeBoard(e.target.value))}
              className={fieldInput}
              placeholder="1"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              {th('enterTabletPassword')}
            </label>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={5}
              value={tabletPassword}
              onChange={(e) => setTabletPassword(e.target.value.slice(0, 5))}
              className={fieldInput}
              placeholder="•••"
            />
          </div>
        </div>
        <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <button
            type="button"
            onClick={() =>
              onTabletJoin?.(normalizePin(pin), normalizeBoard(board), String(tabletPassword || '').trim())
            }
            className="w-full py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 [@media(max-height:520px)]:py-3"
          >
            {th('join')}
          </button>
          <button
            type="button"
            onClick={() => {
              setPin('');
              setBoard('');
              setTabletPassword('');
              setPanel('join');
            }}
            className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 [@media(max-height:520px)]:py-2.5"
          >
            {translations[lang]?.tournBack ?? 'Zpět'}
          </button>
        </div>
      </main>
    );
  }

  if (panel === 'viewer') {
    return (
      <main className={`${shellMain} ${shortH}`}>
        <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-4 md:mb-6 [@media(max-height:520px)]:text-base [@media(max-height:520px)]:mb-3 [@media(max-height:520px)]:tracking-wide">
          {th('viewerMode')}
        </h2>
        <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 md:items-end mb-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              {th('enterPin')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(normalizePin(e.target.value))}
              maxLength={4}
              className={fieldInput}
              placeholder="0000"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onViewerJoin?.(normalizePin(pin))}
              className="w-full py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 [@media(max-height:520px)]:py-3"
            >
              {th('join')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPin('');
                setPanel('join');
              }}
              className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 [@media(max-height:520px)]:py-2.5"
            >
              {translations[lang]?.tournBack ?? 'Zpět'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (panel === 'join') {
    return (
      <main className={`${shellMain} ${shortH}`}>
        <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-2 [@media(max-height:520px)]:text-base">
          {th('joinSection')}
        </h2>
        <p className="text-sm text-slate-500 mb-6 [@media(max-height:520px)]:mb-3 [@media(max-height:520px)]:text-xs">
          {th('joinSectionHint')}
        </p>
        <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setPanel('tablet')}
            className={`${tileBtn} border-slate-700 bg-slate-800/80 hover:bg-slate-800`}
          >
            <div className={`${tileIconWrap} bg-cyan-500/20 text-cyan-400`}>
              <Tablet className={tileIcon} />
            </div>
            <div>
              <div className="text-sm font-black text-white uppercase tracking-wide">{th('tabletMode')}</div>
              <div className="text-xs text-slate-500 mt-1 leading-snug">{th('tabletModeHint')}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPanel('viewer')}
            className={`${tileBtn} border-slate-700 bg-slate-800/80 hover:bg-slate-800`}
          >
            <div className={`${tileIconWrap} bg-violet-500/20 text-violet-400`}>
              <Eye className={tileIcon} />
            </div>
            <div>
              <div className="text-sm font-black text-white uppercase tracking-wide">{th('viewerMode')}</div>
              <div className="text-xs text-slate-500 mt-1 leading-snug">{th('viewerModeHint')}</div>
            </div>
          </button>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
        >
          {translations[lang]?.tournBack ?? 'Zpět'}
        </button>
      </main>
    );
  }

  return (
    <main className={`${shellMain} ${shortH}`}>
      <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-2 [@media(max-height:520px)]:text-base [@media(max-height:520px)]:mb-1">
        {translations[lang]?.tournament ?? 'Turnaj'}
      </h2>
      <p className="text-sm text-slate-500 mb-8 [@media(max-height:520px)]:mb-4 [@media(max-height:520px)]:text-xs">
        {th('hubIntro')}
      </p>

      <div className="grid w-full grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onOpenPreReg?.()}
          className={`${tileBtn} border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-950/50`}
        >
          <div className="flex items-start gap-4">
            <div className={`${tileIconWrap} bg-emerald-500/20 text-emerald-400`}>
              <CalendarPlus className={tileIcon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-lg font-black text-white uppercase tracking-wide">
                {th('hostTournaments')}
              </div>
              <div className="text-sm text-slate-400 mt-1 leading-snug">{th('hostTournamentsHint')}</div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPanel('join')}
          className={`${tileBtn} border-slate-700 bg-slate-800/80 hover:bg-slate-800`}
        >
          <div className="flex items-start gap-4">
            <div className={`${tileIconWrap} bg-cyan-500/20 text-cyan-400`}>
              <Users className={tileIcon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-lg font-black text-white uppercase tracking-wide">
                {th('joinSection')}
              </div>
              <div className="text-sm text-slate-400 mt-1 leading-snug">{th('joinSectionHint')}</div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onOpenCatalog?.()}
          className={`${tileBtn} border-slate-700 bg-slate-800/80 hover:bg-slate-800`}
        >
          <div className="flex items-start gap-4">
            <div className={`${tileIconWrap} bg-sky-500/20 text-sky-400`}>
              <Trophy className={tileIcon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-lg font-black text-white uppercase tracking-wide">
                {th('browseTournaments')}
              </div>
              <div className="text-sm text-slate-400 mt-1 leading-snug">{th('browseTournamentsHint')}</div>
            </div>
          </div>
        </button>
      </div>
    </main>
  );
}
