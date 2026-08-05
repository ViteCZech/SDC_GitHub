import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Loader2,
  MapPin,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import { translations } from '../../translations';
import { getPublicTournamentsList } from '../../services/tournamentPreRegService';
import { normalizeForSearch } from '../../utils/csoRanking';
import { calculatePrizePool } from '../../utils/prizePool';
import {
  canRegisterFromCatalog,
  formatLocationLabel,
  getTournamentCatalogBadge,
  sortByNearestStart,
} from '../../utils/preregTournamentList';
import PreRegPageShell from './PreRegPageShell';

const TABS = [
  { id: 'OPEN', match: (s) => s === 'REGISTRATION_OPEN' },
  {
    id: 'ACTIVE',
    match: (s) => s === 'REGISTRATION_CLOSED' || s === 'IN_PROGRESS',
  },
  { id: 'FINISHED', match: (s) => s === 'FINISHED' },
];

const BADGE_KEYS = {
  OPEN: 'preregCatalogBadgeOpen',
  FULL: 'preregCatalogBadgeFull',
  ACTIVE: 'preregCatalogBadgeActive',
  FINISHED: 'preregCatalogBadgeFinished',
  OTHER: 'preregCatalogBadgeOther',
};

const BADGE_CLASS = {
  OPEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  FULL: 'bg-red-500/20 text-red-400 border-red-500/40',
  ACTIVE: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  FINISHED: 'bg-slate-600/30 text-slate-400 border-slate-600',
  OTHER: 'bg-slate-700/50 text-slate-400 border-slate-600',
};

function formatStartsAt(startsAt, lang) {
  if (!startsAt) return '–';
  try {
    const d = startsAt.toDate ? startsAt.toDate() : new Date(startsAt);
    if (Number.isNaN(d.getTime())) return '–';
    const locale = lang === 'pl' ? 'pl-PL' : lang === 'en' ? 'en-GB' : 'cs-CZ';
    return d.toLocaleString(locale, {
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

function TournamentCard({ lang, tournament, onRegister, t }) {
  const badge = getTournamentCatalogBadge(tournament);
  const confirmed = tournament.counters?.confirmed ?? 0;
  const capacity = tournament.meta?.capacity;
  const unlimited = capacity == null || capacity === 0;
  const entryFee = tournament.finance?.entryFee;
  const prizePool = calculatePrizePool({
    entryFee,
    confirmedCount: confirmed,
    payoutPercent: tournament.finance?.payoutPercent ?? null,
    sponsorMoney: tournament.finance?.addedSponsorMoney ?? null,
  });
  const registerEnabled = canRegisterFromCatalog(tournament);

  return (
    <article className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-black text-white text-lg leading-tight">
            {tournament.meta?.name || t('preregUntitled')}
          </h2>
          <span
            className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border shrink-0 ${BADGE_CLASS[badge] ?? BADGE_CLASS.OTHER}`}
          >
            {t(BADGE_KEYS[badge] ?? BADGE_KEYS.OTHER)}
          </span>
        </div>
        <p className="text-sm text-slate-400 flex items-start gap-1.5">
          <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
          {formatLocationLabel(tournament)}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatStartsAt(tournament.meta?.startsAt, lang)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {unlimited
              ? `${confirmed} ${t('preregCatalogPlayers')}`
              : `${confirmed} / ${capacity} ${t('preregCatalogPlayers')}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {entryFee != null && Number(entryFee) > 0 && (
            <span className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
              {t('preregEntryFee')}: {Number(entryFee).toLocaleString('cs-CZ')} Kč
            </span>
          )}
          {prizePool.prizePool > 0 && (
            <span className="px-2 py-1 rounded-lg bg-emerald-900/30 border border-emerald-500/30 text-emerald-400">
              {t('preregAdminPrizePool')}: {prizePool.prizePool.toLocaleString('cs-CZ')} Kč
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRegister?.(tournament.id)}
        className={`shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black uppercase tracking-wide text-sm text-white ${
          registerEnabled
            ? 'bg-emerald-600 hover:bg-emerald-500'
            : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
        }`}
      >
        {registerEnabled ? t('preregCatalogRegisterBtn') : t('preregCatalogViewBtn')}
        <ArrowRight className="w-4 h-4" />
      </button>
    </article>
  );
}

/**
 * @param {{
 *   lang: string,
 *   onBack: () => void,
 *   onOpenTournament: (tournamentId: string) => void,
 * }} props
 */
export default function PublicTournamentDirectory({ lang, onBack, onOpenTournament }) {
  const t = (k) => translations[lang]?.[k] || k;

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('OPEN');
  const [searchQuery, setSearchQuery] = useState('');
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (isFetchingRef.current) return;

    let cancelled = false;
    isFetchingRef.current = true;
    setLoading(true);
    setError('');

    getPublicTournamentsList()
      .then((list) => {
        if (!cancelled) setTournaments(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err?.message ?? t('preregCatalogErrLoad')));
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
  }, [lang]);

  const filteredTournaments = useMemo(() => {
    const tab = TABS.find((x) => x.id === activeTab);
    const q = normalizeForSearch(searchQuery);

    let list = tournaments.filter((item) => tab?.match(item.status));

    if (q) {
      list = list.filter((item) => {
        const name = normalizeForSearch(item.meta?.name || '');
        const city = normalizeForSearch(item.meta?.location?.city || '');
        const venue = normalizeForSearch(
          item.meta?.location?.venueName || item.meta?.venue || ''
        );
        const region = normalizeForSearch(item.meta?.location?.region || '');
        return name.includes(q) || city.includes(q) || venue.includes(q) || region.includes(q);
      });
    }

    list.sort(sortByNearestStart);
    return list;
  }, [tournaments, activeTab, searchQuery]);

  const tabCounts = useMemo(() => {
    const counts = { OPEN: 0, ACTIVE: 0, FINISHED: 0 };
    for (const item of tournaments) {
      if (item.status === 'REGISTRATION_OPEN') counts.OPEN += 1;
      else if (item.status === 'REGISTRATION_CLOSED' || item.status === 'IN_PROGRESS') {
        counts.ACTIVE += 1;
      } else if (item.status === 'FINISHED') counts.FINISHED += 1;
    }
    return counts;
  }, [tournaments]);

  return (
    <PreRegPageShell>
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> {t('tournBack')}
        </button>

        <header>
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <Trophy className="w-6 h-6" />
            <span className="text-xs font-black uppercase tracking-widest">{t('preregCatalogTitle')}</span>
          </div>
          <h1 className="text-2xl font-black text-white">{t('preregCatalogHeading')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('preregCatalogSubtitle')}</p>
        </header>

        {!loading && tournaments.length > 0 && (
          <div className="space-y-3 sticky top-0 z-10 -mx-1 px-1 py-2 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/80">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('preregCatalogSearchPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
                    activeTab === tab.id
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {t(`preregCatalogTab${tab.id}`)} ({tabCounts[tab.id] ?? 0})
                </button>
              ))}
            </div>
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

        {!loading && !error && tournaments.length === 0 && (
          <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-slate-400">
            {t('preregCatalogEmpty')}
          </div>
        )}

        {!loading && tournaments.length > 0 && filteredTournaments.length === 0 && (
          <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-slate-400">
            {t('preregCatalogNoMatch')}
          </div>
        )}

        {!loading && filteredTournaments.length > 0 && (
          <ul className="space-y-3">
            {filteredTournaments.map((item) => (
              <li key={item.id}>
                <TournamentCard
                  lang={lang}
                  tournament={item}
                  t={t}
                  onRegister={onOpenTournament}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PreRegPageShell>
  );
}
