import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Loader2,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import VenueMapLink from '../VenueMapLink';
import { translations } from '../../translations';
import {
  getPublicTournamentData,
  getPublicTournamentsList,
  listMyRegistrationsApi,
  lookupStoredRegistrationApi,
} from '../../services/tournamentPreRegService';
import { normalizeForSearch } from '../../utils/csoRanking';
import { calculatePrizePool } from '../../utils/prizePool';
import {
  canRegisterFromCatalog,
  getTournamentCatalogBadge,
  sortByNearestStart,
  sortByPreferredCityThenStart,
} from '../../utils/preregTournamentList';
import {
  listAllStoredRegistrations,
  loadPreferredCity,
  savePreferredCity,
  saveStoredRegistration,
} from '../../utils/preregStorage';
import {
  blocksNewPreregistration,
  preferActivePreregistration,
} from '../../utils/playerIdentity';
import PreRegPageShell from './PreRegPageShell';
import CompetitionTypeBadge from './CompetitionTypeBadge';

const TABS = [
  { id: 'OPEN', match: (s) => s === 'REGISTRATION_OPEN' },
  {
    id: 'ACTIVE',
    match: (s) => s === 'REGISTRATION_CLOSED' || s === 'IN_PROGRESS',
  },
  { id: 'FINISHED', match: (s) => s === 'FINISHED' },
];

const SCOPES = ['ALL', 'MINE', 'AVAILABLE'];
const SORTS = ['TIME', 'CITY'];

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

function TournamentCard({ lang, tournament, onRegister, t, myStatus }) {
  const badge = getTournamentCatalogBadge(tournament);
  const type = tournament.meta?.competitionType;
  const teamSlots = type === 'doubles' || type === 'mixed';
  const confirmed = teamSlots
    ? Number(tournament.counters?.confirmedTeams ?? 0) || 0
    : tournament.counters?.confirmed ?? 0;
  const people = tournament.counters?.confirmed ?? 0;
  const capacity = tournament.meta?.capacity;
  const unlimited = capacity == null || capacity === 0;
  const unitLabel = teamSlots ? t('preregCatalogTeams') : t('preregCatalogPlayers');
  const entryFee = tournament.finance?.entryFee;
  const prizePool = calculatePrizePool({
    entryFee,
    confirmedCount: confirmed,
    payoutPercent: tournament.finance?.payoutPercent ?? null,
    sponsorMoney: tournament.finance?.addedSponsorMoney ?? null,
  });
  const cancelled = myStatus === 'CANCELLED';
  const blocking = blocksNewPreregistration(myStatus);
  const registerEnabled = canRegisterFromCatalog(tournament) && !blocking;

  return (
    <article className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-black text-white text-lg leading-tight">
            {tournament.meta?.name || t('preregUntitled')}
          </h2>
          <CompetitionTypeBadge type={type} t={t} />
          <span
            className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border shrink-0 ${BADGE_CLASS[badge] ?? BADGE_CLASS.OTHER}`}
          >
            {t(BADGE_KEYS[badge] ?? BADGE_KEYS.OTHER)}
          </span>
          {myStatus && (
            <span
              className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border shrink-0 ${
                cancelled
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
              }`}
            >
              {cancelled ? t('preregCatalogBadgeCancelled') : t('preregCatalogBadgeMine')}
              {!cancelled && myStatus && myStatus !== 'CONFIRMED' ? ` · ${myStatus}` : ''}
            </span>
          )}
        </div>
        <p className="min-w-0">
          <VenueMapLink tournament={tournament} lang={lang} />
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatStartsAt(tournament.meta?.startsAt, lang)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {unlimited
              ? `${confirmed} ${unitLabel}`
              : `${confirmed} / ${capacity} ${unitLabel}`}
            {teamSlots && people > 0 ? ` · ${people} ${t('preregCatalogPlayers')}` : ''}
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
        {blocking
          ? t('preregCatalogMyRegBtn')
          : registerEnabled
            ? t('preregCatalogRegisterBtn')
            : t('preregCatalogViewBtn')}
        <ArrowRight className="w-4 h-4" />
      </button>
    </article>
  );
}

/**
 * @param {{
 *   lang: string,
 *   user?: object|null,
 *   onGoogleLogin?: () => void,
 *   onBack: () => void,
 *   onOpenTournament: (tournamentId: string) => void,
 * }} props
 */
export default function PublicTournamentDirectory({
  lang,
  user = null,
  onGoogleLogin,
  onOpenTournament,
}) {
  const t = (k) => translations[lang]?.[k] || k;

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('OPEN');
  const [scope, setScope] = useState('ALL');
  const [sortMode, setSortMode] = useState('TIME');
  const [preferredCity, setPreferredCity] = useState(() => loadPreferredCity());
  const [searchQuery, setSearchQuery] = useState('');
  const [myByTournamentId, setMyByTournamentId] = useState(() => new Map());
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState('');
  const isFetchingRef = useRef(false);

  const isGoogleUser = !!user && !user.isAnonymous;

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
          const code = err?.code;
          const msg =
            code === 'permission-denied'
              ? t('preregCatalogErrPermission')
              : code === 'failed-precondition'
                ? t('preregCatalogErrIndex')
                : String(err?.message ?? t('preregCatalogErrLoad'));
          setError(msg);
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

  // Lokální + serverové „mé přihlášky“
  useEffect(() => {
    let cancelled = false;

    const mergeLocal = async (baseMap) => {
      const map = new Map(baseMap);
      const local = listAllStoredRegistrations();
      await Promise.all(
        local.map(async (row) => {
          let status = row.status;
          try {
            const fresh = await lookupStoredRegistrationApi(row.tournamentId, row.registrationId);
            if (fresh?.status) {
              status = fresh.status;
              const { tournamentId: _tid, ...rest } = row;
              saveStoredRegistration(row.tournamentId, {
                ...rest,
                status: fresh.status,
                playerName: fresh.playerName ?? row.playerName,
                variableSymbol: fresh.variableSymbol ?? row.variableSymbol ?? null,
                paymentMethod: fresh.paymentMethod ?? row.paymentMethod ?? null,
                amount: fresh.amount ?? row.amount ?? null,
                savedAt: row.savedAt || new Date().toISOString(),
              });
            }
          } catch {
            /* keep local */
          }
          let tournament =
            tournaments.find((x) => x.id === row.tournamentId) || null;
          if (!tournament) {
            try {
              tournament = await getPublicTournamentData(row.tournamentId);
            } catch {
              tournament = {
                id: row.tournamentId,
                meta: { name: row.playerName || row.tournamentId },
                status: null,
              };
            }
          }
          if (cancelled) return;
          const incoming = {
            tournamentId: row.tournamentId,
            registrationId: row.registrationId,
            status,
            playerName: row.playerName ?? null,
            source: 'local',
            tournament,
          };
          map.set(
            row.tournamentId,
            preferActivePreregistration(map.get(row.tournamentId), incoming)
          );
        })
      );
      return map;
    };

    (async () => {
      setMyLoading(true);
      setMyError('');
      try {
        let map = new Map();
        if (isGoogleUser) {
          try {
            const items = await listMyRegistrationsApi();
            for (const item of items) {
              const incoming = {
                ...item,
                source: 'server',
                tournament: item.tournament
                  ? { id: item.tournamentId, ...item.tournament }
                  : null,
              };
              map.set(
                item.tournamentId,
                preferActivePreregistration(map.get(item.tournamentId), incoming)
              );
            }
          } catch (err) {
            if (!cancelled) {
              setMyError(String(err?.message ?? t('preregCatalogMyErrLoad')));
            }
          }
        }
        map = await mergeLocal(map);
        if (!cancelled) setMyByTournamentId(map);
      } finally {
        if (!cancelled) setMyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isGoogleUser, user?.uid, tournaments, lang]);

  const catalogCities = useMemo(() => {
    const set = new Set();
    for (const item of tournaments) {
      const city = String(item?.meta?.location?.city ?? '').trim();
      if (city) set.add(city);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'cs'));
  }, [tournaments]);

  const mineList = useMemo(() => {
    const list = [...myByTournamentId.values()]
      .map((row) => {
        const fromCatalog = tournaments.find((x) => x.id === row.tournamentId);
        const tournament = fromCatalog || row.tournament;
        if (!tournament) return null;
        return { ...tournament, id: row.tournamentId, _my: row };
      })
      .filter(Boolean);

    const sorter =
      sortMode === 'CITY'
        ? sortByPreferredCityThenStart(preferredCity)
        : sortByNearestStart;
    list.sort(sorter);
    return list;
  }, [myByTournamentId, tournaments, sortMode, preferredCity]);

  const filteredTournaments = useMemo(() => {
    if (scope === 'MINE') {
      let list = mineList;
      const q = normalizeForSearch(searchQuery);
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
      return list;
    }

    const tab = TABS.find((x) => x.id === activeTab);
    const q = normalizeForSearch(searchQuery);

    let list = tournaments.filter((item) => tab?.match(item.status));

    if (scope === 'AVAILABLE') {
      list = list.filter((item) => !blocksNewPreregistration(myByTournamentId.get(item.id)?.status));
    }

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

    const sorter =
      sortMode === 'CITY'
        ? sortByPreferredCityThenStart(preferredCity)
        : sortByNearestStart;
    list = [...list].sort(sorter);
    return list;
  }, [
    tournaments,
    activeTab,
    searchQuery,
    scope,
    sortMode,
    preferredCity,
    mineList,
    myByTournamentId,
  ]);

  const tabCounts = useMemo(() => {
    const counts = { OPEN: 0, ACTIVE: 0, FINISHED: 0 };
    const source =
      scope === 'AVAILABLE'
        ? tournaments.filter((item) => !blocksNewPreregistration(myByTournamentId.get(item.id)?.status))
        : tournaments;
    for (const item of source) {
      if (item.status === 'REGISTRATION_OPEN') counts.OPEN += 1;
      else if (item.status === 'REGISTRATION_CLOSED' || item.status === 'IN_PROGRESS') {
        counts.ACTIVE += 1;
      } else if (item.status === 'FINISHED') counts.FINISHED += 1;
    }
    return counts;
  }, [tournaments, scope, myByTournamentId]);

  const handlePreferredCityChange = (v) => {
    setPreferredCity(v);
    savePreferredCity(v);
  };

  return (
    <PreRegPageShell>
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <Trophy className="w-6 h-6" />
            <span className="text-xs font-black uppercase tracking-widest">{t('preregCatalogTitle')}</span>
          </div>
          <h1 className="text-2xl font-black text-white">{t('preregCatalogHeading')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('preregCatalogSubtitle')}</p>
        </header>

        {!loading && (
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

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {SCOPES.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setScope(id)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
                    scope === id
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {t(`preregCatalogScope${id}`)}
                  {id === 'MINE' ? ` (${myByTournamentId.size})` : ''}
                </button>
              ))}
            </div>

            {scope !== 'MINE' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
                      activeTab === tab.id
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t(`preregCatalogTab${tab.id}`)} ({tabCounts[tab.id] ?? 0})
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {t('preregCatalogSortLabel')}
              </span>
              <div className="grid grid-cols-2 sm:max-w-md gap-2">
                {SORTS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSortMode(id)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
                      sortMode === id
                        ? 'bg-slate-100 border-slate-100 text-slate-900'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t(`preregCatalogSort${id}`)}
                  </button>
                ))}
              </div>
            </div>

            {sortMode === 'CITY' && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={preferredCity}
                  onChange={(e) => handlePreferredCityChange(e.target.value)}
                  placeholder={t('preregCatalogCityPlaceholder')}
                  list="prereg-catalog-cities"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <datalist id="prereg-catalog-cities">
                  {catalogCities.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {t('preregCatalogCityHint')}
                </p>
                {catalogCities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {catalogCities.slice(0, 12).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handlePreferredCityChange(c)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                          preferredCity === c
                            ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {scope === 'MINE' && !isGoogleUser && (
              <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-100 text-sm space-y-2">
                <p>{t('preregCatalogMyLoginHint')}</p>
                {typeof onGoogleLogin === 'function' && (
                  <button
                    type="button"
                    onClick={() => onGoogleLogin()}
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase tracking-wide"
                  >
                    {t('preregCatalogLoginBtn')}
                  </button>
                )}
              </div>
            )}

            {(myLoading || myError) && scope !== 'ALL' && (
              <div className="text-xs text-slate-500 flex items-center gap-2">
                {myLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {myError && <span className="text-amber-400">{myError}</span>}
              </div>
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

        {!loading && !error && scope !== 'MINE' && tournaments.length === 0 && (
          <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-slate-400">
            {t('preregCatalogEmpty')}
          </div>
        )}

        {!loading && scope === 'MINE' && filteredTournaments.length === 0 && !myLoading && (
          <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-slate-400">
            {t('preregCatalogMyEmpty')}
          </div>
        )}

        {!loading && scope !== 'MINE' && tournaments.length > 0 && filteredTournaments.length === 0 && (
          <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-slate-400">
            {t('preregCatalogNoMatch')}
          </div>
        )}

        {!loading && filteredTournaments.length > 0 && (
          <ul className="space-y-3">
            {filteredTournaments.map((item) => {
              const mine = myByTournamentId.get(item.id);
              return (
                <li key={item.id}>
                  <TournamentCard
                    lang={lang}
                    tournament={item}
                    t={t}
                    myStatus={mine?.status || null}
                    onRegister={onOpenTournament}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PreRegPageShell>
  );
}
