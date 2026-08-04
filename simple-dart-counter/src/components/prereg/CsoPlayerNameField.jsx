import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { translations } from '../../translations';
import {
  formatCsoUpdatedAt,
  getCsoRankingUrl,
  loadCsoRanking,
  searchCsoPlayers,
} from '../../utils/csoRanking';

/**
 * Pole jména hráče s volitelným našeptávačem žebříčku ČŠO (Stedar).
 * @param {{
 *   lang: string,
 *   playerName: string,
 *   onPlayerNameChange: (name: string) => void,
 *   csoRank: string,
 *   onCsoRankChange: (rank: string) => void,
 *   inputClassName?: string,
 *   disabled?: boolean,
 *   showRankingField?: boolean,
 * }} props
 */
export default function CsoPlayerNameField({
  lang,
  playerName,
  onPlayerNameChange,
  csoRank,
  onCsoRankChange,
  inputClassName = '',
  disabled = false,
  showRankingField = true,
}) {
  const t = (k) => translations[lang]?.[k] || k;

  const [useCsoRanking, setUseCsoRanking] = useState(true);
  const [csoGender, setCsoGender] = useState('men');
  const [csoList, setCsoList] = useState([]);
  const [csoMeta, setCsoMeta] = useState(null);
  const [csoLoading, setCsoLoading] = useState(false);
  const [csoError, setCsoError] = useState(null);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCsoRank, setSelectedCsoRank] = useState(null);

  useEffect(() => {
    if (!useCsoRanking) {
      setCsoList([]);
      setCsoMeta(null);
      setCsoLoading(false);
      setCsoError(null);
      setNameSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let cancelled = false;
    setCsoLoading(true);
    setCsoError(null);

    loadCsoRanking(csoGender)
      .then((data) => {
        if (!cancelled) {
          setCsoList(data.players ?? []);
          setCsoMeta(data.meta ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCsoError(err?.message ?? t('tournCsoLoadError'));
          setCsoList([]);
          setCsoMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCsoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [useCsoRanking, csoGender, lang]);

  const handleNameChange = (v) => {
    onPlayerNameChange(v);
    setSelectedCsoRank(null);
    if (!useCsoRanking) {
      setShowSuggestions(false);
      setNameSuggestions([]);
      return;
    }
    const hits = searchCsoPlayers(csoList, v);
    setNameSuggestions(hits);
    setShowSuggestions(v.trim().length >= 2 && hits.length > 0);
  };

  const selectCsoPlayer = (entry) => {
    const name = String(entry?.name ?? '').trim();
    const rankStr = entry?.rank != null ? String(entry.rank) : '';
    onPlayerNameChange(name);
    onCsoRankChange(rankStr);
    setSelectedCsoRank(entry?.rank ?? null);
    setShowSuggestions(false);
    setNameSuggestions([]);
  };

  const inputCls =
    inputClassName ||
    'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
              {t('tournUseCsoRanking')}
            </p>
            <p className="text-[10px] text-slate-500 leading-snug">{t('tournUseCsoRankingHint')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={useCsoRanking}
            disabled={disabled}
            onClick={() => setUseCsoRanking((v) => !v)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
              useCsoRanking ? 'bg-emerald-600' : 'bg-slate-700'
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                useCsoRanking ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {useCsoRanking && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-800">
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              {(['men', 'women']).map((g) => (
                <button
                  key={g}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCsoGender(g)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                    csoGender === g
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {g === 'men' ? t('tournMen') : t('tournWomen')}
                </button>
              ))}
            </div>
            <a
              href={getCsoRankingUrl(csoGender)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] text-slate-300 hover:text-white"
            >
              <ExternalLink className="w-3 h-3" />
              {t('tournOpenOfficialRanking')}
            </a>
            {csoLoading && <span className="text-[10px] text-slate-500">{t('tournCsoLoading')}</span>}
            {!csoLoading && !csoError && csoMeta?.updatedAt && (
              <span className="text-[10px] text-slate-500">
                {t('tournCsoUpdatedAt')} {formatCsoUpdatedAt(csoMeta.updatedAt)}
              </span>
            )}
            {csoError && !csoLoading && (
              <span className="text-[10px] text-amber-400">{csoError}</span>
            )}
          </div>
        )}
      </div>

      <div className={showRankingField ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
        <div className="relative">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            {t('preregPlayerName')} *
          </label>
          <input
            value={playerName}
            onChange={(e) => handleNameChange(e.target.value)}
            disabled={disabled}
            placeholder={t('tournPlayerPlaceholder')}
            className={inputCls}
            autoComplete="name"
          />
          {useCsoRanking && showSuggestions && nameSuggestions.length > 0 && (
            <ul
              className="absolute z-30 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl"
              role="listbox"
            >
              {nameSuggestions.map((entry) => (
                <li key={entry.rank} role="option">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-emerald-900/40 flex justify-between gap-2 items-center"
                    onClick={() => selectCsoPlayer(entry)}
                  >
                    <span className="font-medium text-white truncate text-sm">{entry.name}</span>
                    <span className="text-xs text-slate-400 font-mono shrink-0">#{entry.rank}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {showRankingField && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
              {t('tournRanking')}
              {useCsoRanking && selectedCsoRank != null && (
                <span className="ml-1 normal-case font-normal text-emerald-400">
                  ({t('tournCsoFromRanking')})
                </span>
              )}
            </label>
            <input
              value={csoRank}
              onChange={(e) => {
                onCsoRankChange(e.target.value.replace(/\D/g, ''));
                setSelectedCsoRank(null);
              }}
              disabled={disabled}
              placeholder="–"
              className={`${inputCls} font-mono`}
              inputMode="numeric"
            />
          </div>
        )}
      </div>
    </div>
  );
}
