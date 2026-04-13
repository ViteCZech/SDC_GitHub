import React, { useEffect, useMemo, useState } from 'react';
import { Home, Cloud, HardDrive, ArrowLeft, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { translations } from '../translations';
import TournamentGroupsView from './TournamentGroupsView';
import TournamentBracketView from './TournamentBracketView';

const LOCAL_KEY = 'darts_history_local';

function readLocalHistory() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocalHistory(rows) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
  } catch {
    /* ignore */
  }
}

function sortMs(entry) {
  const d = entry.date;
  if (d && typeof d.toDate === 'function') return d.toDate().getTime();
  if (typeof d === 'string') return new Date(d).getTime();
  if (typeof d === 'number') return d;
  return 0;
}

function formatWhen(entry) {
  const d = entry.date;
  try {
    if (d && typeof d.toDate === 'function') return d.toDate().toLocaleString();
    if (typeof d === 'string') return new Date(d).toLocaleString();
  } catch {
    /* ignore */
  }
  return '—';
}

/**
 * Historie dokončených turnajů: Firestore `past_tournaments` (přihlášený účet) + localStorage.
 */
export default function TournamentHistory({ lang = 'cs', user, onBack }) {
  const t = (k) => translations[lang]?.[k] ?? k;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { row }

  const selectedSnapshot = useMemo(() => {
    const data = selected?.data;
    if (!data || typeof data !== 'object') return null;
    return {
      tournamentData: data.tournamentData ?? null,
      groups: Array.isArray(data.groups) ? data.groups : [],
      groupMatches: Array.isArray(data.groupMatches) ? data.groupMatches : [],
      tournamentBracket: Array.isArray(data.tournamentBracket) ? data.tournamentBracket : [],
    };
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const local = readLocalHistory().map((e) => ({ ...e, source: 'local' }));
      let cloud = [];
      if (user && !user.isAnonymous && db) {
        try {
          // Prefer new `ownerId`, but also support legacy `userId`.
          const q1 = query(collection(db, 'past_tournaments'), where('ownerId', '==', user.uid));
          const q2 = query(collection(db, 'past_tournaments'), where('userId', '==', user.uid));
          const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
          const mergedDocs = new Map();
          for (const s of [snap1, snap2]) {
            for (const docSnap of s.docs) mergedDocs.set(docSnap.id, docSnap);
          }
          cloud = Array.from(mergedDocs.values()).map((docSnap) => ({
            id: docSnap.id,
            source: 'cloud',
            ...docSnap.data(),
          }));
        } catch (e) {
          console.warn('TournamentHistory cloud load:', e);
        }
      }
      if (cancelled) return;
      const merged = [...cloud, ...local].sort((a, b) => sortMs(b) - sortMs(a));
      setRows(merged);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const requestDelete = (row) => {
    setConfirmDelete({ row });
  };

  const performDelete = async () => {
    const row = confirmDelete?.row;
    setConfirmDelete(null);
    if (!row) return;

    // Optimistic UI update
    setRows((prev) => prev.filter((x) => (x.id ?? x) !== (row.id ?? row)));

    if (row.source === 'cloud') {
      if (!db || !row.id || !(user && !user.isAnonymous)) return;
      try {
        await deleteDoc(doc(db, 'past_tournaments', String(row.id)));
      } catch (e) {
        console.warn('TournamentHistory cloud delete:', e);
      }
      return;
    }

    // local
    try {
      const prev = readLocalHistory();
      const next = prev.filter((x) => String(x?.id) !== String(row.id));
      writeLocalHistory(next);
    } catch (e) {
      console.warn('TournamentHistory local delete:', e);
    }
  };

  if (selected && selectedSnapshot) {
    const title = String(selected.name || '').trim() || '(bez názvu)';
    const td = selectedSnapshot.tournamentData;
    const formatLabel = td?.tournamentFormat ? String(td.tournamentFormat) : '';
    return (
      <main className="flex flex-col flex-1 w-full max-w-5xl mx-auto overflow-y-auto bg-slate-950 p-4 pb-24">
        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" /> {t('tournBack') || 'Zpět'}
          </button>
          <span className="text-xs text-slate-500 font-mono">{formatWhen(selected)}</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-100 truncate">{title}</h2>
              {formatLabel ? (
                <div className="text-[11px] text-slate-400 font-mono mt-1">fmt: {formatLabel}</div>
              ) : null}
            </div>
            <span
              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-slate-700 text-slate-400"
              title={selected.source === 'cloud' ? 'Cloud' : 'Local'}
            >
              {selected.source === 'cloud' ? <Cloud className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />}
              {selected.source === 'cloud' ? 'Cloud' : 'Local'}
            </span>
          </div>
        </div>

        {selectedSnapshot.tournamentData && (
          <div className="space-y-6">
            <TournamentGroupsView
              tournamentData={selectedSnapshot.tournamentData}
              tournamentMatches={selectedSnapshot.groupMatches}
              tournamentGroups={selectedSnapshot.groups}
              lang={lang}
              userRole="viewer"
              hasBracket={Array.isArray(selectedSnapshot.tournamentBracket) && selectedSnapshot.tournamentBracket.length > 0}
              onBack={() => setSelected(null)}
            />
            {Array.isArray(selectedSnapshot.tournamentBracket) && selectedSnapshot.tournamentBracket.length > 0 ? (
              <TournamentBracketView
                bracketData={selectedSnapshot.tournamentBracket}
                tournamentData={selectedSnapshot.tournamentData}
                userRole="viewer"
                lang={lang}
              />
            ) : null}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-col flex-1 w-full max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto overflow-y-auto bg-slate-950 p-4 pb-24">
      <h2 className="text-xl font-black tracking-widest uppercase text-emerald-400 mb-4">
        {t('tournamentHistoryTitle')}
      </h2>

      {confirmDelete?.row && (
        <div
          className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-4 sm:p-5 animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-white tracking-tight mb-2">
              {t('confirmModalTitle') || 'Potvrzení'}
            </h3>
            <p className="text-sm text-slate-300">
              {t('delete') || 'Smazat'}: {String(confirmDelete.row.name || '').trim() || '(bez názvu)'}?
            </p>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                {t('cancel') || 'Zrušit'}
              </button>
              <button
                type="button"
                onClick={performDelete}
                className="flex-1 py-3 rounded-xl font-black text-white bg-red-600 hover:bg-red-500 transition-colors"
              >
                {t('delete') || 'Smazat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 mb-6">{t('tournamentHistoryLoading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 mb-10">{t('tournamentHistoryPlaceholder')}</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-10">
          {rows.map((row) => {
            const key = row.id ?? `${row.source}-${sortMs(row)}-${row.name}`;
            const title = String(row.name || '').trim() || '(bez názvu)';
            return (
              <li
                key={key}
                className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 flex flex-col gap-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-slate-100 leading-snug">{title}</span>
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-slate-700 text-slate-400"
                    title={row.source === 'cloud' ? 'Cloud' : 'Local'}
                  >
                    {row.source === 'cloud' ? (
                      <Cloud className="w-3.5 h-3.5" />
                    ) : (
                      <HardDrive className="w-3.5 h-3.5" />
                    )}
                    {row.source === 'cloud' ? 'Cloud' : 'Local'}
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-mono">{formatWhen(row)}</span>
                <div className="pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="w-full py-2.5 rounded-xl font-black bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
                    >
                      {t('detail') || 'Detail'}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(row)}
                      className="w-full py-2.5 rounded-xl font-black bg-red-950/40 text-red-200 hover:bg-red-950/60 border border-red-500/40"
                      title={t('delete') || 'Smazat'}
                      aria-label={t('delete') || 'Smazat'}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        <Trash2 className="w-4 h-4" />
                        {t('delete') || 'Smazat'}
                      </span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onBack}
        className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 mt-auto"
      >
        <Home className="w-5 h-5" /> {t('backMenu')}
      </button>
    </main>
  );
}
