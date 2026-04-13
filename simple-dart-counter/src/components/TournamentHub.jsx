import React, { useState } from 'react';
import { Home, Shield, Tablet, Eye, History } from 'lucide-react';
import { translations } from '../translations';

/**
 * Rozcestník rolí před vstupem do turnajového režimu (bez Firebase – pouze UI).
 * Formát turnaje (Skupiny a Pavouk / Jen Pavouk) a přepínač „Síťová hra / tablety“ (cloud)
 * se volí v kroku 1 průvodce TournamentSetup – vyžaduje přihlášení Google.
 */
export default function TournamentHub({
  lang = 'cs',
  onChooseAdmin,
  onTabletJoin,
  onViewerJoin,
  onOpenHistory,
  onBack,
}) {
  const th = (k) => translations[lang]?.tournamentHub?.[k] ?? k;
  const [panel, setPanel] = useState(null);
  const [pin, setPin] = useState('');
  const [board, setBoard] = useState('');
  const [tabletPassword, setTabletPassword] = useState('');

  const resetForm = () => {
    setPin('');
    setBoard('');
    setTabletPassword('');
    setPanel(null);
  };

  const shellMain =
    'flex flex-col flex-1 w-full max-w-md md:max-w-4xl mx-auto overflow-y-auto bg-slate-950 px-3 pt-3 pb-20 sm:px-6 sm:pt-4 sm:pb-24 min-h-0';
  const shortH =
    '[@media(max-height:520px)]:px-2 [@media(max-height:520px)]:pt-2 [@media(max-height:520px)]:pb-16 [@media(max-height:520px)]:sm:px-4 [@media(max-height:520px)]:sm:pt-3';

  if (panel === 'tablet') {
    return (
      <main className={`${shellMain} ${shortH}`}>
        <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-6 [@media(max-height:520px)]:text-base [@media(max-height:520px)]:mb-3 [@media(max-height:520px)]:tracking-wide">
          {th('tabletMode')}
        </h2>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
          {th('enterPin')}
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 [@media(max-height:520px)]:py-2 [@media(max-height:520px)]:mb-2 [@media(max-height:520px)]:text-base"
          placeholder="0000"
        />
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
          {th('enterBoard')}
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={board}
          onChange={(e) => setBoard(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 [@media(max-height:520px)]:py-2 [@media(max-height:520px)]:mb-2 [@media(max-height:520px)]:text-base"
          placeholder="1"
        />
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
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg mb-6 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 [@media(max-height:520px)]:py-2 [@media(max-height:520px)]:mb-3 [@media(max-height:520px)]:text-base"
          placeholder="•••"
        />
        <button
          type="button"
          onClick={() => onTabletJoin?.(pin.trim(), board.trim(), tabletPassword.trim())}
          className="w-full py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 mb-3 [@media(max-height:520px)]:py-3"
        >
          {th('join')}
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 [@media(max-height:520px)]:py-2.5"
        >
          {translations[lang]?.tournBack ?? 'Zpět'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 [@media(max-height:520px)]:mt-3 [@media(max-height:520px)]:py-3"
        >
          <Home className="w-5 h-5 [@media(max-height:520px)]:w-4 [@media(max-height:520px)]:h-4" /> {translations[lang]?.backMenu ?? 'Zpět do menu'}
        </button>
      </main>
    );
  }

  if (panel === 'viewer') {
    return (
      <main className={`${shellMain} ${shortH}`}>
        <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-6 [@media(max-height:520px)]:text-base [@media(max-height:520px)]:mb-3 [@media(max-height:520px)]:tracking-wide">
          {th('viewerMode')}
        </h2>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
          {th('enterPin')}
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg mb-6 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 [@media(max-height:520px)]:py-2 [@media(max-height:520px)]:mb-3 [@media(max-height:520px)]:text-base"
          placeholder="0000"
        />
        <button
          type="button"
          onClick={() => onViewerJoin?.(pin.trim())}
          className="w-full py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 mb-3 [@media(max-height:520px)]:py-3"
        >
          {th('join')}
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 [@media(max-height:520px)]:py-2.5"
        >
          {translations[lang]?.tournBack ?? 'Zpět'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 [@media(max-height:520px)]:mt-3 [@media(max-height:520px)]:py-3"
        >
          <Home className="w-5 h-5 [@media(max-height:520px)]:w-4 [@media(max-height:520px)]:h-4" /> {translations[lang]?.backMenu ?? 'Zpět do menu'}
        </button>
      </main>
    );
  }

  const tileBtn =
    'flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-transform active:scale-95 text-center min-h-0 [@media(max-height:520px)]:gap-1.5 [@media(max-height:520px)]:p-3 [@media(max-height:520px)]:rounded-xl';
  const tileIconWrap =
    'flex items-center justify-center rounded-xl shrink-0 [@media(max-height:520px)]:p-1.5 p-2';
  const tileIcon = 'w-7 h-7 [@media(max-height:520px)]:w-6 [@media(max-height:520px)]:h-6';
  const tileLabel =
    'text-xs sm:text-sm font-black text-white uppercase tracking-wide leading-tight [@media(max-height:520px)]:text-[11px] px-0.5 break-words';

  return (
    <main className={`${shellMain} ${shortH}`}>
      <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-8 [@media(max-height:520px)]:text-base [@media(max-height:520px)]:mb-3 [@media(max-height:520px)]:tracking-wide">
        {translations[lang]?.tournament ?? 'Turnaj'}
      </h2>

      {/* Stejný princip jako hlavní menu: mřížka na šířku, více sloupců = méně vertikální scroll */}
      <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 landscape:gap-2 [@media(max-height:520px)]:gap-2">
        <button
          type="button"
          onClick={() => onChooseAdmin?.()}
          className={`${tileBtn} border-slate-700 bg-slate-800/80 hover:bg-slate-800`}
        >
          <div className={`${tileIconWrap} bg-amber-500/20 text-amber-400`}>
            <Shield className={tileIcon} />
          </div>
          <span className={tileLabel}>{th('adminMode')}</span>
        </button>

        <button
          type="button"
          onClick={() => setPanel('tablet')}
          className={`${tileBtn} border-slate-700 bg-slate-800/80 hover:bg-slate-800`}
        >
          <div className={`${tileIconWrap} bg-cyan-500/20 text-cyan-400`}>
            <Tablet className={tileIcon} />
          </div>
          <span className={tileLabel}>{th('tabletMode')}</span>
        </button>

        <button
          type="button"
          onClick={() => setPanel('viewer')}
          className={`${tileBtn} border-slate-700 bg-slate-800/80 hover:bg-slate-800`}
        >
          <div className={`${tileIconWrap} bg-violet-500/20 text-violet-400`}>
            <Eye className={tileIcon} />
          </div>
          <span className={tileLabel}>{th('viewerMode')}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenHistory?.()}
          className={`${tileBtn} border-2 border-dashed border-slate-600 bg-slate-900/50 hover:bg-slate-900`}
        >
          <div className={`${tileIconWrap} bg-slate-600/30 text-slate-300`}>
            <History className={tileIcon} />
          </div>
          <span className={`${tileLabel} text-slate-300`}>{th('historyMode')}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 sm:mt-10 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 [@media(max-height:520px)]:mt-4 [@media(max-height:520px)]:py-3"
      >
        <Home className="w-5 h-5 [@media(max-height:520px)]:w-4 [@media(max-height:520px)]:h-4" /> {translations[lang]?.backMenu ?? 'Zpět do menu'}
      </button>
    </main>
  );
}
