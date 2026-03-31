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

  const resetForm = () => {
    setPin('');
    setBoard('');
    setPanel(null);
  };

  if (panel === 'tablet') {
    return (
      <main className="flex flex-col flex-1 w-full max-w-lg mx-auto overflow-y-auto bg-slate-950 p-4 pb-24">
        <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-6">
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
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
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
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg mb-6 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          placeholder="1"
        />
        <button
          type="button"
          onClick={() => onTabletJoin?.(pin.trim(), board.trim())}
          className="w-full py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 mb-3"
        >
          {th('join')}
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
        >
          {translations[lang]?.tournBack ?? 'Zpět'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
        >
          <Home className="w-5 h-5" /> {translations[lang]?.backMenu ?? 'Zpět do menu'}
        </button>
      </main>
    );
  }

  if (panel === 'viewer') {
    return (
      <main className="flex flex-col flex-1 w-full max-w-lg mx-auto overflow-y-auto bg-slate-950 p-4 pb-24">
        <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-6">
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
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg mb-6 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          placeholder="0000"
        />
        <button
          type="button"
          onClick={() => onViewerJoin?.(pin.trim())}
          className="w-full py-4 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 mb-3"
        >
          {th('join')}
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
        >
          {translations[lang]?.tournBack ?? 'Zpět'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
        >
          <Home className="w-5 h-5" /> {translations[lang]?.backMenu ?? 'Zpět do menu'}
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col flex-1 w-full max-w-lg mx-auto overflow-y-auto bg-slate-950 p-4 pb-24">
      <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-8">
        {translations[lang]?.tournament ?? 'Turnaj'}
      </h2>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => onChooseAdmin?.()}
          className="flex items-center gap-4 w-full p-5 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-left transition-colors"
        >
          <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400">
            <Shield className="w-8 h-8" />
          </div>
          <span className="font-black text-white text-base uppercase tracking-wide">{th('adminMode')}</span>
        </button>

        <button
          type="button"
          onClick={() => setPanel('tablet')}
          className="flex items-center gap-4 w-full p-5 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-left transition-colors"
        >
          <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400">
            <Tablet className="w-8 h-8" />
          </div>
          <span className="font-black text-white text-base uppercase tracking-wide">{th('tabletMode')}</span>
        </button>

        <button
          type="button"
          onClick={() => setPanel('viewer')}
          className="flex items-center gap-4 w-full p-5 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-left transition-colors"
        >
          <div className="p-3 rounded-xl bg-violet-500/20 text-violet-400">
            <Eye className="w-8 h-8" />
          </div>
          <span className="font-black text-white text-base uppercase tracking-wide">{th('viewerMode')}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenHistory?.()}
          className="flex items-center gap-4 w-full p-5 rounded-2xl border-2 border-dashed border-slate-600 bg-slate-900/50 hover:bg-slate-900 text-left transition-colors"
        >
          <div className="p-3 rounded-xl bg-slate-600/30 text-slate-300">
            <History className="w-8 h-8" />
          </div>
          <span className="font-black text-slate-300 text-base uppercase tracking-wide">{th('historyMode')}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-10 flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
      >
        <Home className="w-5 h-5" /> {translations[lang]?.backMenu ?? 'Zpět do menu'}
      </button>
    </main>
  );
}
