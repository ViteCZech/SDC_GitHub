import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ClipboardList,
  History,
  Loader2,
  Play,
  Plus,
  Search,
  Shield,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { translations } from '../../translations';
import { listOwnerTournaments } from '../../services/tournamentPreRegService';
import { normalizeForSearch } from '../../utils/csoRanking';
import PreRegPageShell from './PreRegPageShell';

const STATUS_KEYS = {
  REGISTRATION_OPEN: 'preregListStatusOpen',
  REGISTRATION_CLOSED: 'preregListStatusClosed',
  IN_PROGRESS: 'preregListStatusInProgress',
  FINISHED: 'preregListStatusFinished',
  DRAFT: 'preregListStatusDraft',
};

const STATUS_FILTERS = ['ALL', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'FINISHED'];

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

function getStartsAtMs(item) {
  const s = item?.meta?.startsAt;
  if (!s) return null;
  try {
    const d = s.toDate ? s.toDate() : new Date(s);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

/** Nejbližší budoucí termín první, pak nedávné minulé, bez data na konci. */
function sortByNearestStart(a, b) {
  const ma = getStartsAtMs(a);
  const mb = getStartsAtMs(b);
  if (ma == null && mb == null) return 0;
  if (ma == null) return 1;
  if (mb == null) return -1;

  const now = Date.now();
  const aFuture = ma >= now;
  const bFuture = mb >= now;
  if (aFuture && bFuture) return ma - mb;
  if (aFuture && !bFuture) return -1;
  if (!aFuture && bFuture) return 1;
  return mb - ma;
}

/**
 * @param {{
 *   lang: string,
 *   user: object|null,
 *   onBack: () => void,
 *   onManage: (tournamentId: string) => void,
 *   onCreateNew: () => void,
 *   onGoogleLogin?: () => void,
 *   onQuickStart?: () => void,
 *   onOpenHistory?: () => void,
 *   onContinueLive?: () => void,
 *   liveTournament?: null | { name?: string, pin?: string, isLive?: boolean },
 * }} props
 */
export default function MyPreRegTournamentsList({
  lang,
  user,
  onBack,
  onManage,
  onCreateNew,
  onGoogleLogin,
  onQuickStart,
  onOpenHistory,
  onContinueLive,
  liveTournament = null,
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const th = (k) => translations[lang]?.tournamentHub?.[k] ?? k;
  const ownerUid = user && !user.isAnonymous ? user.uid : null;

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [nameQuery, setNameQuery] = useState('');
  const isFetchingRef = useRef(false);

  const filteredTournaments = useMemo(() => {
    const q = normalizeForSearch(nameQuery);
    let list = [...tournaments];

    if (statusFilter !== 'ALL') {
      list = list.filter((item) => item.status === statusFilter);
    }

    if (q) {
      list = list.filter((item) => {
        const name = normalizeForSearch(item.meta?.name || '');
        return name.includes(q);
      });
    }

    list.sort(sortByNearestStart);
    return list;
  }, [tournaments, statusFilter, nameQuery]);

  useEffect(() => {
    if (!ownerUid) {
      setLoading(false);
      setTournaments([]);
      setError('');
      return;
    }

    if (isFetchingRef.current) return;

    let cancelled = false;
    isFetchingRef.current = true;
    setLoading(true);
    setError('');

    listOwnerTournaments()
      .then((list) => {
        if (!cancelled) setTournaments(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err?.message ?? translations[lang]?.preregListErrLoad ?? 'preregListErrLoad'));
        }
      })
      .finally(() => {
        isFetchingRef.current = false;
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      isFetchingRef.current = false;
    };
  }, [ownerUid, lang]);

  return (
    <PreRegPageShell wide={false}>
      <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <ClipboardList className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">{th('hostTournaments')}</span>
          </div>
          <h1 className="text-2xl font-black text-white">{t('preregListHeading')}</h1>
          <p className="text-sm text-slate-500 mt-1">{th('hostTournamentsHint')}</p>
          {!loading && ownerUid && tournaments.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              {t('preregListCount')
                .replace('{shown}', String(filteredTournaments.length))
                .replace('{total}', String(tournaments.length))}
            </p>
          )}
        </div>
      </header>

      {/* Aktivní / rozpracovaný turnaj na tomto zařízení */}
      {liveTournament && onContinueLive && (
        <button
          type="button"
          onClick={onContinueLive}
          className="w-full text-left p-4 rounded-xl border border-amber-500/40 bg-amber-950/30 hover:bg-amber-950/50 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
              <Play className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/90">
                {liveTournament.isLive ? th('continueLive') : th('continueSetup')}
              </p>
              <p className="text-sm font-bold text-white truncate mt-0.5">
                {liveTournament.name || th('continueUnnamed')}
                {liveTournament.pin ? (
                  <span className="ml-2 font-mono text-amber-300/80">PIN {liveTournament.pin}</span>
                ) : null}
              </p>
              <p className="text-xs text-slate-400 mt-1">{th('continueLiveHint')}</p>
            </div>
          </div>
        </button>
      )}

      {/* Rychlé akce organizátora */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCreateNew}
          disabled={!ownerUid}
          className="flex items-start gap-3 p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/40 text-left disabled:opacity-40"
        >
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-black text-white uppercase tracking-wide">{t('preregListCreateBtn')}</p>
            <p className="text-xs text-slate-400 mt-1 leading-snug">{th('createWithRegistrationHint')}</p>
          </div>
        </button>
        {onQuickStart && (
          <button
            type="button"
            onClick={onQuickStart}
            className="flex items-start gap-3 p-4 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-left"
          >
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-white uppercase tracking-wide">{th('quickStart')}</p>
              <p className="text-xs text-slate-400 mt-1 leading-snug">{th('quickStartHint')}</p>
            </div>
          </button>
        )}
      </div>

      {onOpenHistory && (
        <button
          type="button"
          onClick={onOpenHistory}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-left"
        >
          <History className="w-5 h-5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-200">{th('historyMode')}</p>
            <p className="text-xs text-slate-500">{th('historyModeHint')}</p>
          </div>
        </button>
      )}

      <div className="pt-2 border-t border-slate-800">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5" />
          {th('registrationSection')}
        </h2>
      </div>

      {!ownerUid && (
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

      {!loading && ownerUid && tournaments.length > 0 && (
        <div className="space-y-3 sticky top-0 z-10 -mx-1 px-1 py-2 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/80">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="search"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder={t('preregListSearchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
                  statusFilter === f
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {f === 'ALL' ? t('preregListFilterAll') : t(STATUS_KEYS[f] ?? 'preregListStatusUnknown')}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && ownerUid && tournaments.length === 0 && !error && (
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

      {!loading && ownerUid && tournaments.length > 0 && filteredTournaments.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center">
          <p className="text-slate-400">{t('preregListNoMatch')}</p>
        </div>
      )}

      {!loading && filteredTournaments.length > 0 && (
        <ul className="space-y-3">
          {filteredTournaments.map((item) => {
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
      </div>
    </PreRegPageShell>
  );
}
