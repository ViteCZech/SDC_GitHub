import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ListOrdered, MapPin, Trophy, Users } from 'lucide-react';
import TournamentGroupsView from '../TournamentGroupsView';
import TournamentBracketView from '../TournamentBracketView';
import TournamentStatisticsView from '../TournamentStatisticsView';
import { translations } from '../../translations';
import { getPublicResultById } from '../../services/publicResultsService';

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

function MatchesTab({ record, lang }) {
  const groupMatches = Array.isArray(record?.groupMatches) ? record.groupMatches : [];
  const bracket = Array.isArray(record?.tournamentBracket) ? record.tournamentBracket : [];
  const groupById = new Map((record?.groups || []).map((g) => [String(g.groupId ?? g.id), g]));
  const tournamentName = record?.name || '';

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-xs uppercase tracking-widest font-black text-emerald-400 mb-3">
          {lang === 'cs' ? 'Skupinové zápasy' : lang === 'pl' ? 'Mecze grupowe' : 'Group matches'}
        </h3>
        {groupMatches.length === 0 ? (
          <p className="text-sm text-slate-500">
            {lang === 'cs' ? 'Žádné skupinové zápasy.' : lang === 'pl' ? 'Brak meczów grupowych.' : 'No group matches.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {groupMatches.map((m, idx) => {
              const groupId = String(m.groupId ?? m.group ?? '');
              const g = groupById.get(groupId);
              const p1 = m.player1Name || m.player1Id || '—';
              const p2 = m.player2Name || m.player2Id || '—';
              return (
                <li key={m.matchId ?? m.id ?? `${groupId}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500 uppercase tracking-wider">
                        {(lang === 'cs' ? 'Skupina' : lang === 'pl' ? 'Grupa' : 'Group')} {(g?.groupId ?? groupId) || '—'}
                      </div>
                      <div className="text-sm font-semibold text-slate-200">{p1} vs {p2}</div>
                    </div>
                    <span className="font-mono text-lg font-black text-emerald-300">{renderScore(m)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-xs uppercase tracking-widest font-black text-purple-300 mb-3">
          {lang === 'cs' ? 'Vyřazovací část' : lang === 'pl' ? 'Drabinka' : 'Knockout'}
        </h3>
        {bracket.length === 0 ? (
          <p className="text-sm text-slate-500">
            {lang === 'cs' ? 'Pavouk zatím není dostupný.' : lang === 'pl' ? 'Drabinka nie jest jeszcze dostępna.' : 'Bracket is not available yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {bracket.map((round, ri) => (
              <div key={round.round ?? ri} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">
                  {getRoundLabel(ri, bracket.length, lang)}
                </div>
                <ul className="space-y-2">
                  {(round.matches || []).map((m, mi) => (
                    <li key={m.id ?? m.matchId ?? `${ri}-${mi}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-200 truncate">
                        {(m.player1Name || m.player1Id || '?')} vs {(m.player2Name || m.player2Id || '?')}
                      </span>
                      <span className="font-mono font-black text-amber-300">{renderScore(m)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
}) {
  const dict = translations?.[lang]?.publicResults ?? translations?.cs?.publicResults ?? {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [record, setRecord] = useState(null);
  const [tab, setTab] = useState('matches');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setRecord(null);

    void getPublicResultById(resultId)
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
  }, [resultId, dict.notFound, dict.loadError]);

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
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{record.name}</h1>
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
