import React from 'react';
import { ArrowRight, Download } from 'lucide-react';
import { translations } from '../../translations';

/**
 * @param {{
 *   lang: string,
 *   registrations: object[],
 *   onImport: (players: Array<{ name: string, ranking: number|null }>) => void,
 * }} props
 */
export default function ImportToTournamentButton({ lang, registrations, onImport }) {
  const t = (k) => translations[lang]?.[k] || k;

  const eligible = (registrations || []).filter(
    (r) => r.status === 'CONFIRMED' && r.attendance?.checkedIn === true
  );

  const handleImport = () => {
    const players = eligible.map((r) => ({
      name: r.player?.name ?? '',
      ranking: r.player?.csoRank != null ? Number(r.player.csoRank) : null,
    })).filter((p) => p.name.trim());

    if (players.length < 2) return;
    onImport(players);
  };

  return (
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
  );
}
