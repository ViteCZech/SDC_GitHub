import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, ClipboardList, Loader2, Plus, Trophy, Users } from 'lucide-react';
import { translations } from '../../translations';
import { listOwnerTournaments } from '../../services/tournamentPreRegService';

const STATUS_KEYS = {
  REGISTRATION_OPEN: 'preregListStatusOpen',
  REGISTRATION_CLOSED: 'preregListStatusClosed',
  IN_PROGRESS: 'preregListStatusInProgress',
  FINISHED: 'preregListStatusFinished',
  DRAFT: 'preregListStatusDraft',
};

function formatStartsAt(startsAt) {
  if (!startsAt) return '–';
  try {
    const d = startsAt.toDate ? startsAt.toDate() : new Date(startsAt);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleString('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '–';
  }
}

function statusBadgeClass(status) {
  switch (status) {
    case 'REGISTRATION_OPEN':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    case 'IN_PROGRESS':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    case 'FINISHED':
      return 'bg-slate-600/30 text-slate-400 border-slate-600';
    case 'REGISTRATION_CLOSED':
      return 'bg-red-500/20 text-red-400 border-red-500/40';
    default:
      return 'bg-slate-700/50 text-slate-400 border-slate-600';
  }
}

/**
 * @param {{
 *   lang: string,
 *   user: object|null,
 *   onBack: () => void,
 *   onManage: (tournamentId: string) => void,
 *   onCreateNew: () => void,
 *   onGoogleLogin?: () => void,
 * }} props
 */
export default function MyPreRegTournamentsList({
  lang,
  user,
  onBack,
  onManage,
  onCreateNew,
  onGoogleLogin,
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const isLoggedIn = user && !user.isAnonymous;

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      setTournaments([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    listOwnerTournaments()
      .then((list) => {
        if (!cancelled) setTournaments(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err?.message ?? t('preregListErrLoad')));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, t]);

  return (
    <main className="max-w-2xl mx-auto p-4 pb-24 space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> {t('tournBack')}
      </button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <ClipboardList className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">{t('preregListTitle')}</span>
          </div>
          <h1 className="text-2xl font-black text-white">{t('preregListHeading')}</h1>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          disabled={!isLoggedIn}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-40"
        >
          <Plus className="w-4 h-4" /> {t('preregListCreateBtn')}
        </button>
      </header>

      {!isLoggedIn && (
        <div className="p-4 rounded-xl border border-amber-500/50 bg-amber-900/20 space-y-3">
          <p className="text-sm text-amber-200">{t('preregAdminLoginRequired')}</p>
          {onGoogleLogin && (
            <button
              type="button"
              onClick={onGoogleLogin}
              className="px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-sm"
            >
              Google
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-500/50 text-amber-300 text-sm">
          {error}
        </div>
      )}

      {!loading && isLoggedIn && tournaments.length === 0 && !error && (
        <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center space-y-3">
          <Trophy className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-400">{t('preregListEmpty')}</p>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-slate-800 border border-slate-700 text-emerald-400 hover:bg-slate-700 text-sm"
          >
            <Plus className="w-4 h-4" /> {t('preregListCreateBtn')}
          </button>
        </div>
      )}

      {!loading && tournaments.length > 0 && (
        <ul className="space-y-3">
          {tournaments.map((item) => {
            const confirmed = item.counters?.confirmed ?? 0;
            const waitlist = item.counters?.waitlist ?? 0;
            const statusKey = STATUS_KEYS[item.status] ?? 'preregListStatusUnknown';

            return (
              <li
                key={item.id}
                className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-black text-white truncate">{item.meta?.name || t('preregUntitled')}</h2>
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${statusBadgeClass(item.status)}`}
                    >
                      {t(statusKey)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatStartsAt(item.meta?.startsAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {confirmed}
                      {waitlist > 0 && ` (+${waitlist} ${t('preregListWaitlistShort')})`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onManage?.(item.id)}
                  className="shrink-0 px-4 py-2.5 rounded-xl font-bold bg-slate-800 border border-slate-700 text-emerald-400 hover:bg-slate-700 text-sm"
                >
                  {t('preregListManageBtn')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
