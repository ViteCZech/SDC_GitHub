import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ListOrdered, MapPin, Trophy, Users } from 'lucide-react';
import TournamentGroupsView from '../TournamentGroupsView';
import TournamentBracketView from '../TournamentBracketView';
import TournamentStatisticsView from '../TournamentStatisticsView';
import { translations } from '../../translations';
import { useSyncAdapter } from '../../context/SyncAdapterContext';
import ContextHelpButton from '../ContextHelpButton';

const EMPTY_PUBLIC_RESULTS_DICT = Object.freeze({});

function toDateLabel(value, lang) {
  if (!value) return '—';
  const locale = lang === 'cs' ? 'cs-CZ' : lang === 'pl' ? 'pl-PL' : 'en-US';
  try {
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    }
  } catch {}
  return '—';
}

function getRoundLabel(roundIndex, roundsCount, lang) {
  const diff = roundsCount - roundIndex;
  if (diff === 1) return lang === 'cs' ? 'Finále' : lang === 'pl' ? 'Finał' : 'Final';
  if (diff === 2) return lang === 'cs' ? 'Semifinále' : lang === 'pl' ? 'Półfinał' : 'Semi-final';
  if (diff === 3) return lang === 'cs' ? 'Čtvrtfinále' : lang === 'pl' ? 'Ćwierćfinał' : 'Quarter-final';
  const n = Math.pow(2, diff);
  if (!Number.isFinite(n) || n < 2) return `Round ${roundIndex + 1}`;
  return `Last ${n}`;
}

function renderScore(match) {
  const p1 = match?.result?.p1Legs ?? match?.score?.p1;
  const p2 = match?.result?.p2Legs ?? match?.score?.p2;
  if (p1 == null || p2 == null) return '—';
  return `${p1}:${p2}`;
}

function buildPlayerNameMap(record) {
  const map = new Map();

  for (const g of record?.groups || []) {
    for (const p of g?.players || []) {
      const id = p?.id ?? p?.playerId;
      const name = String(p?.name ?? '').trim();
      if (id != null && name) map.set(String(id), name);
    }
  }

  for (const p of record?.tournamentData?.players || []) {
    const id = p?.id ?? p?.playerId;
    const name = String(p?.name ?? '').trim();
    if (id != null && name) map.set(String(id), name);
  }

  return map;
}

function MatchesTab({ record, lang }) {
  const groupMatches = Array.isArray(record?.groupMatches) ? record.groupMatches : [];
  const bracket = Array.isArray(record?.tournamentBracket) ? record.tournamentBracket : [];
  const groupById = new Map((record?.groups || []).map((g) => [String(g.groupId ?? g.id), g]));
  const nameById = buildPlayerNameMap(record);
  const tournamentName = record?.name || '';
  const bracketFinalFirst = [...bracket].reverse();

  const resolveName = (id, explicitName) => {
    const explicit = String(explicitName ?? '').trim();
    if (explicit) return explicit;
    const key = id != null ? String(id) : '';
    if (key && nameById.has(key)) return nameById.get(key);
    return key || '—';
  };

  const groupedGroupMatches = groupMatches.reduce((acc, m) => {
    const groupId = String(m.groupId ?? m.group ?? '—');
    if (!acc[groupId]) acc[groupId] = [];
    acc[groupId].push(m);
    return acc;
  }, {});
  const groupIds = Object.keys(groupedGroupMatches).sort((a, b) =>
    a.localeCompare(b, 'cs', { numeric: true, sensitivity: 'base' })
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-xs uppercase tracking-widest font-black text-purple-300 mb-3">
          {lang === 'cs' ? 'Vyřazovací část' : lang === 'pl' ? 'Drabinka' : 'Knockout'}
        </h3>
        {bracketFinalFirst.length === 0 ? (
          <p className="text-sm text-slate-500">
            {lang === 'cs' ? 'Pavouk zatím není dostupný.' : lang === 'pl' ? 'Drabinka nie jest jeszcze dostępna.' : 'Bracket is not available yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {bracketFinalFirst.map((round, idx) => {
              const originalRoundIndex = Math.max(0, bracket.length - 1 - idx);
              return (
              <div key={round.round ?? `round-${originalRoundIndex}`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">
                  {getRoundLabel(originalRoundIndex, bracket.length, lang)}
                </div>
                <ul className="space-y-2">
                  {(round.matches || []).map((m, mi) => (
                    <li key={m.id ?? m.matchId ?? `${originalRoundIndex}-${mi}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-200 truncate">
                        {resolveName(m.player1Id, m.player1Name)} vs {resolveName(m.player2Id, m.player2Name)}
                      </span>
                      <span className="font-mono font-black text-amber-300">{renderScore(m)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-xs uppercase tracking-widest font-black text-emerald-400 mb-3">
          {lang === 'cs' ? 'Skupiny (zápasy)' : lang === 'pl' ? 'Grupy (mecze)' : 'Groups (matches)'}
        </h3>
        {groupMatches.length === 0 ? (
          <p className="text-sm text-slate-500">
            {lang === 'cs' ? 'Žádné skupinové zápasy.' : lang === 'pl' ? 'Brak meczów grupowych.' : 'No group matches.'}
          </p>
        ) : (
          <div className="space-y-3">
            {groupIds.map((groupId) => {
              const g = groupById.get(groupId);
              const matches = groupedGroupMatches[groupId] || [];
              return (
                <div key={groupId} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-2">
                    {(lang === 'cs' ? 'Skupina' : lang === 'pl' ? 'Grupa' : 'Group')} {g?.groupId ?? groupId}
                  </div>
                  <ul className="space-y-2">
                    {matches.map((m, idx) => (
                      <li key={m.matchId ?? m.id ?? `${groupId}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-200 truncate">
                          {resolveName(m.player1Id, m.player1Name)} vs {resolveName(m.player2Id, m.player2Name)}
                        </span>
                        <span className="font-mono font-black text-emerald-300">{renderScore(m)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="text-[11px] text-slate-500">
        {lang === 'cs'
          ? `Veřejný detail: ${tournamentName}`
          : lang === 'pl'
            ? `Szczegóły publiczne: ${tournamentName}`
            : `Public detail: ${tournamentName}`}
      </div>
    </div>
  );
}

export default function PublicTournamentResultsView({
  resultId,
  lang = 'cs',
  onBack,
  onOpenContextHelp,
}) {
  const syncAdapter = useSyncAdapter();
  const dict = useMemo(
    () => translations?.[lang]?.publicResults ?? translations?.cs?.publicResults ?? EMPTY_PUBLIC_RESULTS_DICT,
    [lang]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [record, setRecord] = useState(null);
  const [tab, setTab] = useState('matches');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setRecord(null);

    void syncAdapter.getPublicResultById(resultId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setError(dict.notFound || 'Veřejný výsledek nebyl nalezen.');
          setLoading(false);
          return;
        }
        setRecord(row);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(dict.loadError || 'Nepodařilo se načíst detail turnaje.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resultId, dict.notFound, dict.loadError, syncAdapter]);

  const tabs = useMemo(
    () => [
      { id: 'matches', label: dict.tabMatches || 'Zápasy' },
      { id: 'groups', label: dict.tabGroups || 'Skupiny' },
      { id: 'bracket', label: dict.tabBracket || 'Pavouk' },
      { id: 'results', label: dict.tabResults || 'Výsledky' },
    ],
    [dict]
  );

  if (loading) {
    return (
      <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 p-4 pb-24">
        <div className="max-w-5xl w-full mx-auto rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-400 text-sm">
          {dict.loading || 'Načítám turnaj…'}
        </div>
      </main>
    );
  }

  if (error || !record) {
    return (
      <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 p-4 pb-24">
        <div className="max-w-5xl w-full mx-auto space-y-3">
          <button
            type="button"
            onClick={() => onBack?.()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
          >
            <ChevronLeft className="w-4 h-4" />
            {dict.backToList || 'Zpět na turnaje'}
          </button>
          <div className="rounded-xl border border-red-600/40 bg-red-900/20 p-5 text-red-200 text-sm">
            {error || dict.notFound || 'Turnaj nebyl nalezen.'}
          </div>
        </div>
      </main>
    );
  }

  const hasBracket = Array.isArray(record.tournamentBracket) && record.tournamentBracket.length > 0;

  return (
    <main className="flex flex-col flex-1 w-full overflow-y-auto bg-slate-950 p-4 pb-24">
      <div className="max-w-5xl w-full mx-auto space-y-4">
        <button
          type="button"
          onClick={() => onBack?.()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
        >
          <ChevronLeft className="w-4 h-4" />
          {dict.backToList || 'Zpět na turnaje'}
        </button>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{record.name}</h1>
            <ContextHelpButton
              topicId="public-results"
              lang={lang}
              onOpenContextHelp={onOpenContextHelp}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-slate-300 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-500" />
              {toDateLabel(record.eventStartAt, lang)}
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              {record.playersCount ?? 0}
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-slate-300 flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-slate-500" />
              {record.matchesCount ?? 0}
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-slate-300 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-500" />
              {record.location || '—'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider border transition-colors ${
                tab === item.id
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'matches' && <MatchesTab record={record} lang={lang} />}

        {tab === 'groups' && (
          <TournamentGroupsView
            tournamentData={record.tournamentData}
            tournamentGroups={record.groups}
            tournamentMatches={record.groupMatches}
            hasBracket={hasBracket}
            userRole="viewer"
            lang={lang}
          />
        )}

        {tab === 'bracket' && (
          hasBracket ? (
            <TournamentBracketView
              bracketData={record.tournamentBracket}
              tournamentData={record.tournamentData}
              userRole="viewer"
              lang={lang}
            />
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-500">
              {lang === 'cs' ? 'Pavouk zatím není k dispozici.' : lang === 'pl' ? 'Drabinka nie jest jeszcze dostępna.' : 'Bracket is not available yet.'}
            </div>
          )
        )}

        {tab === 'results' && (
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-yellow-300 text-xs uppercase tracking-widest font-black">
              <Trophy className="w-4 h-4" />
              {dict.tabResults || 'Výsledky'}
            </div>
            <TournamentStatisticsView
              tournamentData={record.tournamentData}
              tournamentGroups={record.groups}
              tournamentMatches={record.groupMatches}
              tournamentBracket={record.tournamentBracket}
              lang={lang}
            />
          </div>
        )}
      </div>
    </main>
  );
}
