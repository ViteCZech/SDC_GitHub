import React, { useState } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import { translations } from '../../translations';

/**
 * @param {{
 *   lang: string,
 *   registrations: object[],
 *   onImport: (payload: { players: Array<{ name: string, ranking: number|null }>, importMode: string }) => void,
 *   requireImportMode?: boolean,
 * }} props
 */
export default function ImportToTournamentButton({
  lang,
  registrations,
  onImport,
  requireImportMode = false,
}) {
  const t = (k) => translations[lang]?.[k] || k;

  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [pendingPlayers, setPendingPlayers] = useState(null);

  const eligible = (registrations || []).filter(
    (r) => r.status === 'CONFIRMED' && r.attendance?.checkedIn === true
  );

  const buildPlayers = () =>
    eligible
      .map((r) => ({
        name: r.player?.name ?? '',
        ranking: null,
      }))
      .filter((p) => p.name.trim());

  const handleImport = () => {
    const players = buildPlayers();
    if (players.length < 2) return;

    if (requireImportMode) {
      setPendingPlayers(players);
      setModeModalOpen(true);
      return;
    }
    onImport({ players, importMode: 'fresh' });
  };

  const confirmImport = (importMode) => {
    if (!pendingPlayers?.length) return;
    onImport({ players: pendingPlayers, importMode });
    setModeModalOpen(false);
    setPendingPlayers(null);
  };

  return (
    <>
      <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-900/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-emerald-400">
              {t('preregImportTitle')}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t('preregImportHint')} ({eligible.length})
            </p>
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={eligible.length < 2}
            className="flex items-center gap-2 px-4 py-3 rounded-xl font-black uppercase tracking-wide text-sm bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {t('preregImportBtn')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        {eligible.length > 0 && eligible.length < 2 && (
          <p className="text-xs text-amber-400">{t('preregImportMinPlayers')}</p>
        )}
      </div>

      {modeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-lg font-black text-white">{t('preregImportModeTitle')}</h3>
            <p className="text-sm text-slate-400">{t('preregImportModeHint')}</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => confirmImport('fresh')}
                className="w-full py-3 px-4 rounded-xl font-bold text-left bg-slate-800 border border-slate-600 hover:bg-slate-700 text-white"
              >
                <span className="block font-black">{t('preregImportModeFresh')}</span>
                <span className="block text-xs text-slate-400 mt-1">{t('preregImportModeFreshHint')}</span>
              </button>
              <button
                type="button"
                onClick={() => confirmImport('merge')}
                className="w-full py-3 px-4 rounded-xl font-bold text-left bg-emerald-900/30 border border-emerald-500/40 hover:bg-emerald-900/50 text-white"
              >
                <span className="block font-black">{t('preregImportModeMerge')}</span>
                <span className="block text-xs text-slate-400 mt-1">{t('preregImportModeMergeHint')}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setModeModalOpen(false);
                setPendingPlayers(null);
              }}
              className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
