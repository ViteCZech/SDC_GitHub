import React, { useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { translations } from '../translations';
import { updateCsoRankingsNow } from '../services/csoRankingService';
import { clearCsoRankingCache, formatCsoUpdatedAt } from '../utils/csoRanking';

/**
 * Tlačítko pro ruční stažení žebříčků ze Stedar (Cloud Function).
 * Volání běží asynchronně; UI zůstává responsivní díky loading stavu.
 * @param {{
 *   lang: string,
 *   user: object|null,
 *   onUpdated?: (result: object) => void,
 *   onNotify?: (message: string, type?: 'success'|'error') => void,
 *   onLogin?: () => void,
 *   compact?: boolean,
 * }} props
 */
export default function CsoRankingUpdateButton({
  lang,
  user,
  onUpdated,
  onNotify,
  onLogin,
  compact = false,
}) {
  const t = (k, vars) => {
    let s = translations[lang]?.[k] || k;
    if (vars) {
      for (const [key, val] of Object.entries(vars)) {
        s = s.replace(`{${key}}`, String(val));
      }
    }
    return s;
  };

  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef(false);
  const isLoggedIn = user && !user.isAnonymous;

  const handleClick = () => {
    if (inFlightRef.current || loading) return;

    if (!isLoggedIn) {
      onNotify?.(t('csoUpdateLoginRequired'), 'error');
      onLogin?.();
      return;
    }

    inFlightRef.current = true;
    setLoading(true);

    // Odloží síťové volání za paint spinneru, aby UI nestihlo zamrznout před indikací načítání.
    window.setTimeout(() => {
      void (async () => {
        try {
          const result = await updateCsoRankingsNow();
          clearCsoRankingCache();
          // Nejdřív aktualizuj meta/badge z odpovědi CF (nespoléhej jen na re-fetch, ten může spadnout na static JSON).
          onUpdated?.(result);
          onNotify?.(
            t('csoUpdateSuccess', {
              total: result?.totalPlayers ?? 0,
              updatedAt: formatCsoUpdatedAt(result?.updatedAt, lang === 'pl' ? 'pl-PL' : lang === 'en' ? 'en-GB' : 'cs-CZ') || '',
            }),
            'success'
          );
        } catch (err) {
          const code = err?.code;
          const msg =
            code === 'functions/unauthenticated'
              ? t('csoUpdateLoginRequired')
              : code === 'functions/deadline-exceeded'
                ? t('csoUpdateError')
                : err?.message || t('csoUpdateError');
          onNotify?.(msg, 'error');
        } finally {
          inFlightRef.current = false;
          setLoading(false);
        }
      })();
    }, 0);
  };

  const btnCls = compact
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50'
    : 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide border border-emerald-500/40 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50 w-full sm:w-auto';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      className={btnCls}
      title={t('csoUpdateBtnHint')}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        <RefreshCw className="w-4 h-4 shrink-0" />
      )}
      {t('csoUpdateBtn')}
    </button>
  );
}
