import React, { useMemo, useState } from 'react';
import { ArrowLeft, Target } from 'lucide-react';
import { translations } from '../translations';

function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Přechod mezi skupinami a KO pavoukem – výběr postupu a legů pro KO.
 */
export default function TournamentBracketSetup({
  lang = 'cs',
  tournamentData,
  tournamentGroups = [],
  onComplete,
  onBack,
}) {
  const t = (k) => translations[lang]?.[k] ?? k;

  const groups = tournamentGroups?.length ? tournamentGroups : [];

  const initialAdvance =
    tournamentData?.advancePerGroup != null
      ? String(tournamentData.advancePerGroup) === 'all'
        ? 'all'
        : String(tournamentData.advancePerGroup)
      : '2';

  const [advanceMode, setAdvanceMode] = useState(initialAdvance);
  const [bracketKoLegs, setBracketKoLegs] = useState(
    tournamentData?.bracketKoLegs ?? tournamentData?.bracketLegs ?? 3
  );

  const totalAdvancees = useMemo(() => {
    if (!groups.length) return 0;
    if (advanceMode === 'all') {
      return groups.reduce((sum, g) => sum + (g.players?.length || 0), 0);
    }
    const n = Number(advanceMode);
    if (!Number.isFinite(n) || n < 1) return 0;
    return groups.length * n;
  }, [groups, advanceMode]);

  const showByeWarning = useMemo(() => {
    if (totalAdvancees < 2) return false;
    if (totalAdvancees % 2 === 1) return true;
    if (!isPowerOfTwo(totalAdvancees)) return true;
    return false;
  }, [totalAdvancees]);

  const handleGenerate = () => {
    if (totalAdvancees < 2) return;
    const advancePerGroup = advanceMode === 'all' ? 'all' : Number(advanceMode);
    onComplete?.({
      advancePerGroup,
      bracketKoLegs,
      bracketSetupCompletedAt: Date.now(),
    });
  };

  const btnBase =
    'flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all active:scale-95 border border-slate-700';

  return (
    <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950">
      <div className="w-full max-w-2xl mx-auto p-4 pb-24 space-y-6">
        <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400">
          {t('tournBracketSetupTitle') || 'Nastavení vyřazovacího pavouka'}
        </h2>

        <div className="p-4 border rounded-xl bg-slate-900 border-slate-800 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
              {t('tournAdvancePerGroup') || 'Počet postupujících z každé skupiny'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['2', '3', '4'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAdvanceMode(v)}
                  className={`py-4 px-3 rounded-xl font-black border-2 transition-all ${
                    advanceMode === v
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {v}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAdvanceMode('all')}
                className={`py-4 px-3 rounded-xl font-bold text-sm border-2 transition-all sm:col-span-1 col-span-2 ${
                  advanceMode === 'all'
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {t('tournAdvanceAll') || 'Všichni'}
              </button>
            </div>
          </div>

          {showByeWarning && (
            <div className="p-3 rounded-lg bg-amber-900/25 border border-amber-500/50 text-amber-200 text-sm leading-relaxed">
              {t('tournBracketByeWarning') ||
                'Bude použito nasazení s předkolem (vítězové skupin budou mít v 1. kole volný los).'}
            </div>
          )}

          <p className="text-xs text-slate-500">
            {t('tournAdvanceTotalHint') || 'Celkem postupujících do pavouka:'}{' '}
            <span className="font-mono font-bold text-slate-300">{totalAdvancees}</span>
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
              {t('tournBracketKoLegs') || 'Počet vítězných legů pro KO fázi'}
            </label>
            <div className="flex gap-2 flex-wrap items-center">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBracketKoLegs(v)}
                  className={`w-12 h-12 rounded-xl font-black border-2 transition-all ${
                    bracketKoLegs === v
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">{t('tournBracketLegsNote')}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={totalAdvancees < 2}
          className="flex items-center justify-center gap-3 w-full py-5 text-xl font-black text-white rounded-xl bg-emerald-600 hover:bg-emerald-500 border-2 border-emerald-500 shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Target className="w-8 h-8" />
          {t('tournGenerateBracket') || 'Vygenerovat pavouka'}
        </button>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={`${btnBase} w-full bg-slate-800 text-slate-300 hover:bg-slate-700`}
          >
            <ArrowLeft className="w-5 h-5" /> {t('tournBackToGroups') || 'Zpět ke skupinám'}
          </button>
        )}
      </div>
    </main>
  );
}
