import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Check,
  Copy,
  Link2,
  Loader2,
  Plus,
  QrCode,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { translations } from '../../translations';
import {
  cancelRegistration,
  createManualRegistration,
  getAdminInviteLinkForTournament,
  getOwnerTournamentData,
  listenToRegistrations,
  markRegistrationPaid,
  toggleRegistrationCheckIn,
} from '../../services/tournamentPreRegService';
import { calculatePrizePool, distributePrizePool, getDistributionTemplate } from '../../utils/prizePool';
import { getPublicRegistrationUrl } from '../../utils/preregAdmin';
import ImportToTournamentButton from './ImportToTournamentButton';

const FILTERS = ['ALL', 'CONFIRMED', 'WAITLIST', 'CANCELLED'];

function ManualRegistrationModal({ lang, tournament, onClose, onSaved }) {
  const t = (k) => translations[lang]?.[k] || k;
  const methods = tournament?.finance?.paymentMethods ?? [];

  const [playerName, setPlayerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [csoRank, setCsoRank] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(methods[0] ?? null);
  const [isPaid, setIsPaid] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputCls =
    'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

  const handleSave = async () => {
    if (!playerName.trim()) {
      setError(t('preregErrNameRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await createManualRegistration(tournament.id, {
        playerName: playerName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        csoRank: csoRank.trim() ? Number(csoRank) : null,
        paymentMethod,
        isPaid,
        checkedIn,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(String(err?.message ?? t('preregErrGeneric')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-white uppercase tracking-wide text-sm">{t('preregManualTitle')}</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder={`${t('preregPlayerName')} *`}
          className={inputCls}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('preregEmail')}
          className={inputCls}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('preregPhone')}
          className={inputCls}
        />
        <input
          value={csoRank}
          onChange={(e) => setCsoRank(e.target.value.replace(/\D/g, ''))}
          placeholder={t('tournRanking')}
          className={`${inputCls} font-mono`}
        />

        {methods.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                  paymentMethod === m
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {m === 'QR' ? t('preregPayQr') : t('preregPayCash')}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
          {t('preregManualPaid')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={checkedIn} onChange={(e) => setCheckedIn(e.target.checked)} />
          {t('preregManualCheckIn')}
        </label>

        {error && <p className="text-sm text-amber-400">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3 rounded-xl font-black uppercase tracking-wide bg-emerald-600 text-white disabled:opacity-50"
        >
          {loading ? t('preregSubmitting') : t('save')}
        </button>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   lang: string,
 *   tournamentId: string,
 *   onBack: () => void,
 *   onImportToSetup: (payload: { players: object[], tournamentName: string|null }) => void,
 *   onGoogleLogin?: () => void,
 * }} props
 */
export default function RegistrationAdminPanel({ lang, tournamentId, onBack, onImportToSetup, onGoogleLogin }) {
  const t = (k) => translations[lang]?.[k] || k;

  const [tournament, setTournament] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const isFetchingTournamentRef = useRef(false);

  useEffect(() => {
    if (!tournamentId) return;
    if (isFetchingTournamentRef.current) return;

    let cancelled = false;
    isFetchingTournamentRef.current = true;
    setLoading(true);
    setError('');
    setNeedsLogin(false);

    getOwnerTournamentData(tournamentId)
      .then((data) => {
        if (!cancelled) setTournament(data);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = String(err?.message ?? '');
          if (msg.includes('prereg_auth_required') || msg.includes('prereg_access_denied')) {
            setNeedsLogin(true);
          }
          setError(translations[lang]?.preregErrLoad ?? 'preregErrLoad');
        }
      })
      .finally(() => {
        isFetchingTournamentRef.current = false;
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      isFetchingTournamentRef.current = false;
    };
  }, [tournamentId, lang]);

  useEffect(() => {
    const unsub = listenToRegistrations(tournamentId, setRegistrations);
    return unsub;
  }, [tournamentId]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return registrations;
    return registrations.filter((r) => r.status === filter);
  }, [registrations, filter]);

  const confirmedCount = registrations.filter((r) => r.status === 'CONFIRMED').length;
  const paidCount = registrations.filter(
    (r) => r.status === 'CONFIRMED' && r.payment?.isPaid
  ).length;
  const capacity = tournament?.meta?.capacity ?? null;
  const unlimited = capacity == null || capacity === 0;

  const prizePool = useMemo(() => {
    return calculatePrizePool({
      entryFee: tournament?.finance?.entryFee ?? null,
      confirmedCount: paidCount,
      payoutPercent: tournament?.finance?.payoutPercent ?? null,
      sponsorMoney: tournament?.finance?.addedSponsorMoney ?? null,
    });
  }, [tournament, paidCount]);

  const distribution = useMemo(() => {
    const template = getDistributionTemplate(paidCount || confirmedCount);
    return distributePrizePool(prizePool.prizePool, template);
  }, [prizePool.prizePool, paidCount, confirmedCount]);

  const runAction = async (id, fn) => {
    setActionId(id);
    try {
      await fn();
    } catch (err) {
      setError(String(err?.message ?? t('preregErrGeneric')));
    } finally {
      setActionId(null);
    }
  };

  const handleCopyInviteLink = async () => {
    setCopyFeedback('');
    try {
      const url = await getAdminInviteLinkForTournament(tournamentId);
      await navigator.clipboard.writeText(url);
      setCopyFeedback(t('preregAdminInviteCopied'));
      setTimeout(() => setCopyFeedback(''), 2500);
    } catch {
      setCopyFeedback(t('preregAdminInviteCopyErr'));
      setTimeout(() => setCopyFeedback(''), 2500);
    }
  };

  if (loading) {
    return (
      <main className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="max-w-lg mx-auto p-6">
        <p className="text-amber-400">{error || t('preregErrNotFound')}</p>
        <button type="button" onClick={onBack} className="mt-4 text-slate-400 hover:text-white text-sm">
          {t('tournBack')}
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 pb-24 space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> {t('tournBack')}
      </button>

      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white">{tournament.meta?.name || t('preregUntitled')}</h1>
          <p className="text-xs font-mono text-slate-500 break-all">{getPublicRegistrationUrl(tournamentId)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-slate-700 text-cyan-400 hover:bg-slate-700"
          >
            <Link2 className="w-4 h-4" />
            {t('preregAdminCopyInvite')}
            <Copy className="w-3.5 h-3.5" />
          </button>
          {copyFeedback && <span className="text-xs text-emerald-400">{copyFeedback}</span>}
        </div>
      </header>

      {needsLogin && (
        <div className="p-4 rounded-xl border border-amber-500/50 bg-amber-900/20 space-y-3">
          <p className="text-sm text-amber-200">{t('preregAdminInviteLoginHint')}</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
          <p className="text-xs uppercase tracking-widest text-slate-500">{t('preregAdminSummaryPlayers')}</p>
          <p className="text-2xl font-black text-white mt-1">
            {confirmedCount}
            {!unlimited && ` / ${capacity}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {t('preregAdminPaidCount')}: {paidCount}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
          <p className="text-xs uppercase tracking-widest text-slate-500">{t('preregAdminPrizePool')}</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">
            {prizePool.prizePool.toLocaleString('cs-CZ')} Kč
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {t('preregAdminGross')}: {prizePool.gross.toLocaleString('cs-CZ')} Kč
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
          <p className="text-xs uppercase tracking-widest text-slate-500">{t('preregAdminWaitlist')}</p>
          <p className="text-2xl font-black text-amber-400 mt-1">
            {registrations.filter((r) => r.status === 'WAITLIST').length}
          </p>
        </div>
      </div>

      {distribution.length > 0 && (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
            {t('preregAdminDistribution')}
          </p>
          <div className="flex flex-wrap gap-2">
            {distribution.map((row) => (
              <span
                key={row.place}
                className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300"
              >
                {row.place} {row.amount.toLocaleString('cs-CZ')} Kč
              </span>
            ))}
          </div>
        </div>
      )}

      <ImportToTournamentButton
        lang={lang}
        registrations={registrations}
        onImport={(players) =>
          onImportToSetup?.({
            players,
            tournamentName: tournament.meta?.name ?? null,
          })
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border ${
                filter === f
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {t(`preregFilter${f}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-slate-800 border border-slate-700 text-emerald-400 hover:bg-slate-700 text-sm"
        >
          <Plus className="w-4 h-4" /> {t('preregManualBtn')}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-500/50 text-amber-300 text-sm">{error}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead className="bg-slate-900 text-xs uppercase tracking-widest text-slate-500">
            <tr>
              <th className="p-3">{t('preregColName')}</th>
              <th className="p-3">{t('preregColContact')}</th>
              <th className="p-3">{t('preregColPayment')}</th>
              <th className="p-3">{t('preregColStatus')}</th>
              <th className="p-3">{t('preregColActions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const busy = actionId === r.id;
              const isCancelled = r.status === 'CANCELLED';
              return (
                <tr key={r.id} className="border-t border-slate-800 bg-slate-900/40">
                  <td className="p-3">
                    <div className="font-bold text-white">{r.player?.name}</div>
                    {r.player?.csoRank != null && (
                      <div className="text-xs text-slate-500 font-mono">#{r.player.csoRank}</div>
                    )}
                  </td>
                  <td className="p-3 text-slate-400 text-xs">
                    {r.player?.email && <div>{r.player.email}</div>}
                    {r.player?.phone && <div>{r.player.phone}</div>}
                  </td>
                  <td className="p-3 text-xs">
                    <div className="text-slate-300">
                      {r.payment?.method === 'QR' ? t('preregPayQr') : r.payment?.method === 'CASH' ? t('preregPayCash') : '–'}
                    </div>
                    <div className={r.payment?.isPaid ? 'text-emerald-400' : 'text-amber-400'}>
                      {r.payment?.isPaid ? t('preregPaid') : t('preregUnpaid')}
                    </div>
                    {r.payment?.variableSymbol && (
                      <div className="font-mono text-slate-500">VS {r.payment.variableSymbol}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="text-xs font-bold uppercase">{r.status}</span>
                    {r.attendance?.checkedIn && (
                      <div className="text-emerald-400 text-xs flex items-center gap-1 mt-1">
                        <UserCheck className="w-3 h-3" /> {t('preregCheckedIn')}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {!isCancelled && (
                      <div className="flex flex-wrap gap-1">
                        {!r.payment?.isPaid && r.payment?.method === 'QR' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction(r.id, () => markRegistrationPaid(tournamentId, r.id, 'QR'))
                            }
                            className="p-2 rounded-lg bg-slate-800 text-cyan-400 hover:bg-slate-700"
                            title={t('preregMarkPaidQr')}
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        )}
                        {!r.payment?.isPaid && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction(r.id, () => markRegistrationPaid(tournamentId, r.id, 'CASH'))
                            }
                            className="p-2 rounded-lg bg-slate-800 text-amber-400 hover:bg-slate-700"
                            title={t('preregMarkPaidCash')}
                          >
                            <Banknote className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            runAction(r.id, () =>
                              toggleRegistrationCheckIn(tournamentId, r.id, !r.attendance?.checkedIn)
                            )
                          }
                          className={`p-2 rounded-lg bg-slate-800 hover:bg-slate-700 ${
                            r.attendance?.checkedIn ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                          title={t('preregToggleCheckIn')}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            runAction(r.id, () =>
                              cancelRegistration(tournamentId, r.id, r.status)
                            )
                          }
                          className="p-2 rounded-lg bg-slate-800 text-red-400 hover:bg-slate-700"
                          title={t('preregCancelReg')}
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  {t('preregNoRegistrations')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {manualOpen && (
        <ManualRegistrationModal
          lang={lang}
          tournament={tournament}
          onClose={() => setManualOpen(false)}
          onSaved={() => setManualOpen(false)}
        />
      )}
    </main>
  );
}
