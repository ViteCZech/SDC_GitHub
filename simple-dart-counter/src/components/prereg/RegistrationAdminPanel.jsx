import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Check,
  Copy,
  Link2,
  Loader2,
  Plus,
  QrCode,
  RotateCcw,
  Trash2,
  UserCheck,
  UserX,
  Wallet,
  X,
} from 'lucide-react';
import { translations } from '../../translations';
import {
  cancelRegistration,
  createManualRegistration,
  deletePreRegTournament,
  getAdminInviteLinkForTournament,
  getOwnerTournamentData,
  listenToRegistrations,
  markRegistrationPaid,
  markRegistrationRefunded,
  restoreCancelledRegistration,
  toggleRegistrationCheckIn,
  adminConfirmPair,
} from '../../services/tournamentPreRegService';
import {
  allowsPairing,
  countConfirmedTeams,
  normalizeCompetitionType,
  normalizeFeeMode,
  usesDoublesRanking,
  usesTeamCapacity,
} from '../../utils/preregCompetition';
import { calculatePrizePool, distributePrizePool, getDistributionTemplate } from '../../utils/prizePool';
import { getPublicRegistrationUrl } from '../../utils/preregAdmin';
import { clearAdminInviteSession } from '../../utils/preregStorage';
import {
  loadCsoRanking,
  resolvePlayerLiveRankFromLists,
} from '../../utils/csoRanking';
import ImportToTournamentButton from './ImportToTournamentButton';
import PaymentQrModal from './PaymentQrModal';
import PreRegPageShell from './PreRegPageShell';
import CompetitionTypeBadge from './CompetitionTypeBadge';
import CsoPlayerNameField from './CsoPlayerNameField';
import PlayerDuplicateModal from '../PlayerDuplicateModal';
import {
  findDuplicateRegistration,
  normalizePlayerNameKey,
  resolveCsoPlayerId,
} from '../../utils/playerIdentity';

const FILTERS = ['ALL', 'CONFIRMED', 'WAITLIST', 'CANCELLED', 'REFUND_DUE'];

function isRefundDue(r) {
  return (
    r?.status === 'CANCELLED' &&
    !!r.payment?.isPaid &&
    !!r.payment?.refundDue &&
    !r.payment?.refundedAt
  );
}

function registrationStatusLabel(t, status) {
  const key = `preregStatusLabel${status}`;
  const label = t(key);
  return label === key ? status : label;
}

/** Příjmení pro zápis dvojice (Jalůvka/Armlich). */
function pairSurname(name) {
  const s = String(name ?? '')
    .trim()
    .replace(/_/g, ' ');
  if (!s) return '';
  const parts = s.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^\d+$/.test(last)) {
    return parts[parts.length - 2] || last;
  }
  return last || s;
}

function formatConfirmedPairLine(aName, bName) {
  return `${pairSurname(aName)}/${pairSurname(bName)}`;
}

function pairPayer(a, b) {
  const amt = (r) => Number(r?.payment?.amount ?? 0);
  if (amt(a) > 0 && amt(b) <= 0) return a;
  if (amt(b) > 0 && amt(a) <= 0) return b;
  if (a?.payment?.isPaid && !b?.payment?.isPaid) return a;
  if (b?.payment?.isPaid && !a?.payment?.isPaid) return b;
  return a;
}

/** Potvrzené páry = 1 řádek; nespárovaní zůstanou zvlášť. */
function buildAdminTableRows(list, pairingOn) {
  const byId = new Map((list || []).map((r) => [r.id, r]));
  const used = new Set();
  const rows = [];
  for (const r of list || []) {
    if (used.has(r.id)) continue;
    const partnerId = String(r?.pair?.partnerRegistrationId ?? '').trim();
    const partner =
      pairingOn && String(r?.pair?.status ?? '') === 'CONFIRMED' && partnerId
        ? byId.get(partnerId)
        : null;
    if (partner && String(partner.pair?.status ?? '') === 'CONFIRMED') {
      used.add(r.id);
      used.add(partner.id);
      rows.push({ key: `pair-${r.id}-${partner.id}`, a: r, b: partner });
    } else {
      used.add(r.id);
      rows.push({ key: r.id, a: r, b: null });
    }
  }
  return rows;
}

function ManualRegistrationModal({
  lang,
  tournament,
  registrations = [],
  user,
  onGoogleLogin,
  onNotify,
  onClose,
  onSaved,
  onGoToExisting,
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const methods = tournament?.finance?.paymentMethods ?? [];

  const [playerName, setPlayerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [csoRank, setCsoRank] = useState('');
  const [csoPlayerId, setCsoPlayerId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(methods[0] ?? null);
  const [isPaid, setIsPaid] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dupModal, setDupModal] = useState(null); // { reg, force?: boolean }

  const inputCls =
    'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

  const buildCandidate = () => {
    const name = playerName.trim();
    const id =
      csoPlayerId ||
      resolveCsoPlayerId({ name, csoPlayerId: null });
    return { name, csoPlayerId: id };
  };

  const persistRegistration = async (opts = {}) => {
    const name = playerName.trim();
    const candidate = buildCandidate();
    await createManualRegistration(tournament.id, {
      playerName: name,
      email: email.trim() || null,
      phone: phone.trim() || null,
      csoRank: csoRank ? Number(csoRank) : null,
      csoPlayerId: candidate.csoPlayerId,
      nameKey: normalizePlayerNameKey(name) || null,
      paymentMethod,
      isPaid,
      checkedIn,
      duplicateOk: !!opts.force,
    });
    onSaved?.();
    onClose?.();
  };

  const mapSaveError = (err) => {
    const code = String(err?.code ?? '');
    const msg = String(err?.message ?? '');
    const clean = msg
      .replace(/^Firebase:\s*/i, '')
      .replace(/^functions\/[a-z-]+:\s*/i, '')
      .trim();
    if (code === 'already-exists' && clean.includes('PLAYER_NAME_DUPLICATE:')) {
      const dupName =
        clean.split('PLAYER_NAME_DUPLICATE:')[1]?.trim() || playerName.trim();
      return (t('preregErrDuplicatePlayer') || 'Hráč {name} již je v tomto turnaji zaregistrován.').replace(
        '{name}',
        dupName
      );
    }
    if (code === 'resource-exhausted') return t('preregErrFull');
    return clean || t('preregErrGeneric');
  };

  const handleSave = async (opts = {}) => {
    if (!playerName.trim()) {
      setError(t('preregErrNameRequired'));
      return;
    }
    setError('');

    if (!opts.force) {
      const dup = findDuplicateRegistration(registrations, buildCandidate());
      if (dup) {
        setDupModal({ reg: dup });
        return;
      }
    }

    setLoading(true);
    try {
      await persistRegistration(opts);
    } catch (err) {
      setError(mapSaveError(err));
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

        <CsoPlayerNameField
          lang={lang}
          playerName={playerName}
          onPlayerNameChange={(name) => {
            setPlayerName(name);
            setCsoPlayerId(resolveCsoPlayerId({ name }));
          }}
          csoRank={csoRank}
          onCsoRankChange={setCsoRank}
          onCsoPlayerIdChange={setCsoPlayerId}
          inputClassName={inputCls}
          disabled={loading}
          showRankingField={false}
          user={user}
          onGoogleLogin={onGoogleLogin}
          onNotify={onNotify}
          rankingKind={
            usesDoublesRanking(tournament?.meta?.competitionType) ? 'doubles' : 'singles'
          }
        />

        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
            {t('preregEmail')}
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('preregEmail')}
            className={inputCls}
            type="email"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
            {t('preregPhone')}
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('preregPhone')}
            className={inputCls}
            type="tel"
            autoComplete="tel"
          />
        </div>

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
          onClick={() => handleSave()}
          disabled={loading}
          className="w-full py-3 rounded-xl font-black uppercase tracking-wide bg-emerald-600 text-white disabled:opacity-50"
        >
          {loading ? t('preregSubmitting') : t('save')}
        </button>
      </div>

      <PlayerDuplicateModal
        open={!!dupModal}
        playerName={playerName.trim()}
        title={t('playerDupTitle')}
        message={(t('playerDupMessageList') || 'Hráč {name} už je v seznamu hráčů zapsán.').replace(
          '{name}',
          playerName.trim()
        )}
        cancelLabel={t('playerDupCancel')}
        addAnywayLabel={t('playerDupAddAnyway')}
        goToExistingLabel={t('playerDupGoExisting')}
        onCancel={() => setDupModal(null)}
        onAddAnyway={() => {
          setDupModal(null);
          handleSave({ force: true });
        }}
        onGoToExisting={() => {
          const reg = dupModal?.reg;
          setDupModal(null);
          onClose?.();
          if (reg) onGoToExisting?.(reg);
        }}
      />
    </div>
  );
}

/**
 * @param {{
 *   lang: string,
 *   tournamentId: string,
 *   user: object|null,
 *   onBack: () => void,
 *   onDeleted?: () => void,
 *   onImportToSetup: (payload: { players: object[], tournamentName: string|null, importMode?: string }) => void,
 *   onGoogleLogin?: () => void,
 *   requireImportMode?: boolean,
 * }} props
 */
export default function RegistrationAdminPanel({
  lang,
  tournamentId,
  user,
  onBack,
  onDeleted,
  onImportToSetup,
  onGoogleLogin,
  onNotify,
  requireImportMode = false,
}) {
  const t = (k) => translations[lang]?.[k] || k;

  const [tournament, setTournament] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [highlightRegId, setHighlightRegId] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checkInConfirm, setCheckInConfirm] = useState(null);
  const [qrModalReg, setQrModalReg] = useState(null);
  const [restoreReg, setRestoreReg] = useState(null);
  const [pairPick, setPairPick] = useState({});
  const isFetchingTournamentRef = useRef(false);
  const [csoLiveLists, setCsoLiveLists] = useState([]);

  const isOwner =
    !!user?.uid &&
    !user?.isAnonymous &&
    tournament?.admin?.ownerUid === user.uid;

  useEffect(() => {
    let cancelled = false;
    const keys = usesDoublesRanking(tournament?.meta?.competitionType)
      ? ['doubles']
      : ['men', 'women'];
    Promise.all(keys.map((key) => loadCsoRanking(key, { bypassCache: true })))
      .then((rows) => {
        if (cancelled) return;
        setCsoLiveLists(rows.map((row) => row?.players ?? []));
      })
      .catch(() => {
        if (!cancelled) setCsoLiveLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tournament?.meta?.competitionType]);

  const liveRankFor = (name) => resolvePlayerLiveRankFromLists(name, ...csoLiveLists);

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
    if (filter === 'REFUND_DUE') return registrations.filter(isRefundDue);
    return registrations.filter((r) => r.status === filter);
  }, [registrations, filter]);

  const confirmedCount = registrations.filter((r) => r.status === 'CONFIRMED').length;
  const paidCount = registrations.filter(
    (r) => r.status === 'CONFIRMED' && r.payment?.isPaid
  ).length;
  const competitionType = normalizeCompetitionType(tournament?.meta?.competitionType);
  const pairingOn = allowsPairing(competitionType);
  const feeMode = normalizeFeeMode(tournament);
  const pairFee = pairingOn && feeMode === 'pair';
  const teamSlots = usesTeamCapacity(competitionType);
  const confirmedTeams = countConfirmedTeams(registrations);
  const capacity = tournament?.meta?.capacity ?? null;
  const unlimited = capacity == null || capacity === 0;
  const unpaired = registrations.filter((r) => {
    if (r.status === 'CANCELLED' || r.status === 'NO_SHOW') return false;
    const st = String(r.pair?.status ?? 'NONE');
    return st !== 'CONFIRMED' && st !== 'PENDING_INVITE';
  });
  const tableRows = useMemo(
    () => buildAdminTableRows(filtered, pairingOn),
    [filtered, pairingOn]
  );

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

  const handleCheckInToggle = (registration, opts = {}) => {
    const nextCheckedIn = !registration.attendance?.checkedIn;
    const pairCovered = !!opts.pairPaid;
    if (nextCheckedIn && !registration.payment?.isPaid && !pairCovered) {
      setCheckInConfirm({
        ...registration,
        _payRegId: opts.payRegId || registration.id,
      });
      return;
    }
    runAction(registration.id, () =>
      toggleRegistrationCheckIn(tournamentId, registration.id, nextCheckedIn)
    );
  };

  const mapRestoreError = (err) => {
    const msg = String(err?.message ?? '');
    if (msg === 'prereg_restore_capacity_full') return t('preregRestoreCapacityFull');
    if (msg === 'prereg_restore_not_cancelled') return t('preregRestoreErr');
    if (msg === 'prereg_restore_duplicate_active') return t('preregRestoreDuplicate');
    return msg || t('preregRestoreErr');
  };

  const handleRestoreCancelled = async (targetStatus) => {
    if (!restoreReg) return;
    const reg = restoreReg;
    setRestoreReg(null);
    await runAction(reg.id, async () => {
      try {
        const result = await restoreCancelledRegistration(tournamentId, reg.id, targetStatus);
        if (result?.status === 'WAITLIST' && targetStatus === 'CONFIRMED') {
          onNotify?.(t('preregRestoreWaitlistNote'), 'success');
        }
        if (result?.status && FILTERS.includes(result.status)) {
          setFilter(result.status);
        } else {
          setFilter('ALL');
        }
        setHighlightRegId(reg.id);
        window.setTimeout(() => setHighlightRegId(null), 4500);
      } catch (err) {
        throw new Error(mapRestoreError(err));
      }
    });
  };

  const handleCheckInPayCashAndConfirm = async () => {
    if (!checkInConfirm) return;
    const reg = checkInConfirm;
    setCheckInConfirm(null);
    await runAction(reg.id, async () => {
      await markRegistrationPaid(tournamentId, reg._payRegId || reg.id, 'CASH');
      await toggleRegistrationCheckIn(tournamentId, reg.id, true);
    });
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

  const handleDeleteTournament = async () => {
    setDeleting(true);
    setError('');
    try {
      await deletePreRegTournament(tournamentId);
      clearAdminInviteSession(tournamentId);
      setDeleteConfirmOpen(false);
      onDeleted?.();
      onBack?.();
    } catch (err) {
      setError(String(err?.message ?? t('preregAdminDeleteErr')));
      setDeleteConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const renderPlayerLineLabel = (name) =>
    name ? (
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {pairSurname(name)}
      </div>
    ) : null;

  const renderPaymentInfo = (r, { label } = {}) => (
    <div className="space-y-0.5">
      {label ? renderPlayerLineLabel(label) : null}
      <div className="text-slate-300">
        {r.payment?.method === 'QR' ? t('preregPayQr') : r.payment?.method === 'CASH' ? t('preregPayCash') : '–'}
      </div>
      <div className={r.payment?.isPaid ? 'text-emerald-400' : 'text-amber-400'}>
        {r.payment?.isPaid ? t('preregPaid') : t('preregUnpaid')}
      </div>
      {r.payment?.variableSymbol && (
        <div className="font-mono text-slate-500">VS {r.payment.variableSymbol}</div>
      )}
    </div>
  );

  const renderPlayerStatus = (r, { label } = {}) => {
    const isCancelled = r.status === 'CANCELLED';
    return (
      <div>
        {label ? renderPlayerLineLabel(label) : null}
        <span
          className={`text-xs font-bold uppercase ${isCancelled ? 'text-red-300' : 'text-slate-200'}`}
        >
          {registrationStatusLabel(t, r.status)}
        </span>
        {r.attendance?.checkedIn && (
          <div className="text-emerald-400 text-xs flex items-center gap-1 mt-0.5">
            <UserCheck className="w-3 h-3" /> {t('preregCheckedIn')}
          </div>
        )}
        {isCancelled && r.cancelledBy === 'PLAYER' && (
          <div className="text-xs text-slate-500 mt-0.5">{t('preregCancelledByPlayer')}</div>
        )}
        {isRefundDue(r) && (
          <div className="text-xs font-bold text-amber-400 mt-0.5">{t('preregRefundDue')}</div>
        )}
        {isCancelled && r.payment?.refundedAt && (
          <div className="text-xs text-emerald-500 mt-0.5">{t('preregRefunded')}</div>
        )}
      </div>
    );
  };

  const renderPaymentActions = (r, busy) => {
    if (r.status === 'CANCELLED' || r.payment?.isPaid) return null;
    return (
      <>
        {r.payment?.method === 'QR' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setQrModalReg(r)}
              className="px-2 py-2 rounded-lg bg-slate-800 text-sky-400 hover:bg-slate-700 text-[10px] sm:text-xs font-bold whitespace-nowrap"
              title={t('preregAdminShowQrBtn')}
            >
              📱 QR
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction(r.id, () => markRegistrationPaid(tournamentId, r.id, 'QR'))}
              className="p-2 rounded-lg bg-slate-800 text-cyan-400 hover:bg-slate-700"
              title={t('preregMarkPaidQr')}
            >
              <QrCode className="w-4 h-4" />
            </button>
          </>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction(r.id, () => markRegistrationPaid(tournamentId, r.id, 'CASH'))}
          className="p-2 rounded-lg bg-slate-800 text-amber-400 hover:bg-slate-700"
          title={t('preregMarkPaidCash')}
        >
          <Banknote className="w-4 h-4" />
        </button>
      </>
    );
  };

  const renderCheckInAction = (r, busy, opts = {}) =>
    r.status === 'CANCELLED' ? null : (
      <button
        type="button"
        disabled={busy}
        onClick={() => handleCheckInToggle(r, opts)}
        className={`p-2 rounded-lg bg-slate-800 hover:bg-slate-700 ${
          r.attendance?.checkedIn ? 'text-emerald-400' : 'text-slate-400'
        }`}
        title={`${t('preregToggleCheckIn')}: ${r.player?.name ?? ''}`}
      >
        <Check className="w-4 h-4" />
      </button>
    );

  const renderCancelAction = (r, busy, title) =>
    r.status === 'CANCELLED' ? null : (
      <button
        type="button"
        disabled={busy}
        onClick={() => runAction(r.id, () => cancelRegistration(tournamentId, r.id, r.status))}
        className="p-2 rounded-lg bg-slate-800 text-red-400 hover:bg-slate-700"
        title={title || t('preregCancelReg')}
      >
        <UserX className="w-4 h-4" />
      </button>
    );

  const renderCancelledActions = (r, busy) => (
    <div className="flex flex-wrap gap-1">
      {isRefundDue(r) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction(r.id, () => markRegistrationRefunded(tournamentId, r.id))}
          className="inline-flex items-center gap-1.5 px-2 py-2 rounded-lg bg-slate-800 text-amber-400 hover:bg-slate-700 text-[10px] sm:text-xs font-bold"
          title={t('preregMarkRefunded')}
        >
          <Wallet className="w-4 h-4" />
          {t('preregMarkRefunded')}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setRestoreReg(r)}
        className="inline-flex items-center gap-1.5 px-2 py-2 rounded-lg bg-slate-800 text-emerald-400 hover:bg-slate-700 text-[10px] sm:text-xs font-bold"
        title={t('preregRestoreReg')}
      >
        <RotateCcw className="w-4 h-4" />
        {t('preregRestoreReg')}
      </button>
    </div>
  );

  const renderLiveRank = (name) => {
    const live = liveRankFor(name);
    if (live == null) return null;
    return (
      <div className="text-xs text-emerald-500/90 font-mono" title={t('tournCsoLiveRank') || 'živý žebříček'}>
        #{live}
      </div>
    );
  };

  if (loading) {
    return (
      <PreRegPageShell>
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
      </PreRegPageShell>
    );
  }

  if (!tournament) {
    return (
      <PreRegPageShell wide={false}>
        <p className="text-amber-400">{error || t('preregErrNotFound')}</p>
      </PreRegPageShell>
    );
  }

  return (
    <PreRegPageShell>
      <div className="space-y-6">
      <header className="space-y-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-white">{tournament.meta?.name || t('preregUntitled')}</h1>
            <CompetitionTypeBadge type={competitionType} t={t} />
          </div>
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
          {isOwner && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-red-950/40 border border-red-500/40 text-red-400 hover:bg-red-950/70"
            >
              <Trash2 className="w-4 h-4" />
              {t('preregAdminDeleteBtn')}
            </button>
          )}
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
          <p className="text-xs uppercase tracking-widest text-slate-500">
            {teamSlots ? t('preregAdminSummaryTeams') : t('preregAdminSummaryPlayers')}
          </p>
          <p className="text-2xl font-black text-white mt-1">
            {teamSlots ? confirmedTeams : confirmedCount}
            {!unlimited && ` / ${capacity}`}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {t('preregAdminPaidCount')}: {paidCount}
            {teamSlots ? ` · ${confirmedCount} ${t('preregCatalogPlayers')}` : ''}
          </p>
          {pairingOn && (
            <p className="text-[10px] text-cyan-400 mt-1 font-bold uppercase tracking-wide">
              {t(`preregCompType_${competitionType}`)}
            </p>
          )}
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
        tournament={tournament}
        registrations={registrations}
        requireImportMode={requireImportMode}
        onImport={(payload) =>
          onImportToSetup?.({
            players: payload.players,
            tournamentName: tournament.meta?.name ?? null,
            importMode: payload.importMode ?? 'fresh',
            competitionType: tournament.meta?.competitionType,
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
            {tableRows.map((row) => {
              const { a: r, b } = row;
              const isPair = !!b;
              const payer = isPair && pairFee ? pairPayer(r, b) : r;
              const busy = actionId === r.id || (b && actionId === b.id);
              const highlighted = highlightRegId === r.id || (b && highlightRegId === b.id);
              return (
                <tr
                  key={row.key}
                  id={`prereg-reg-${r.id}`}
                  className={`border-t border-slate-800 ${
                    highlighted
                      ? 'bg-amber-900/40 ring-2 ring-inset ring-amber-500/60'
                      : 'bg-slate-900/40'
                  }`}
                >
                  <td className="p-3 align-top">
                    {isPair ? (
                      <>
                        <div
                          className="font-bold text-white"
                          title={`${r.player?.name ?? ''} / ${b.player?.name ?? ''}`}
                        >
                          {formatConfirmedPairLine(r.player?.name, b.player?.name)}
                        </div>
                        <div className="text-[10px] text-cyan-400 mt-1 font-bold uppercase tracking-wide">
                          {t('preregPairStatus_CONFIRMED')}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-0.5">
                          {renderLiveRank(r.player?.name)}
                          {renderLiveRank(b.player?.name)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-bold text-white">{r.player?.name}</div>
                        {pairingOn && r.pair?.status && r.pair.status !== 'NONE' && (
                          <div className="text-[10px] text-cyan-400 mt-1 font-bold uppercase tracking-wide">
                            {t(`preregPairStatus_${r.pair.status}`)}
                            {r.pair.partnerName || r.pair.pendingName
                              ? ` · ${r.pair.partnerName || r.pair.pendingName}`
                              : ''}
                          </div>
                        )}
                        {pairingOn &&
                          r.status !== 'CANCELLED' &&
                          String(r.pair?.status ?? 'NONE') !== 'CONFIRMED' &&
                          String(r.pair?.status ?? '') !== 'PENDING_INVITE' && (
                            <div className="mt-2 flex flex-col gap-1">
                              <select
                                value={pairPick[r.id] ?? ''}
                                onChange={(e) =>
                                  setPairPick((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                className="w-full max-w-[180px] px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] text-white"
                              >
                                <option value="">{t('preregAdminPairPick')}</option>
                                {unpaired
                                  .filter((p) => p.id !== r.id)
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.player?.name}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                disabled={busy || !pairPick[r.id]}
                                onClick={() =>
                                  runAction(r.id, async () => {
                                    await adminConfirmPair(tournamentId, r.id, pairPick[r.id]);
                                    setPairPick((prev) => ({ ...prev, [r.id]: '' }));
                                  })
                                }
                                className="px-2 py-1 rounded-lg bg-cyan-900/50 border border-cyan-600/50 text-[10px] font-bold text-cyan-300 disabled:opacity-40"
                              >
                                {t('preregAdminPairConfirm')}
                              </button>
                            </div>
                          )}
                        {renderLiveRank(r.player?.name)}
                      </>
                    )}
                  </td>
                  <td className="p-3 text-slate-400 text-xs align-top">
                    <div>
                      {isPair && renderPlayerLineLabel(r.player?.name)}
                      {r.player?.email || r.player?.phone
                        ? [r.player?.email, r.player?.phone].filter(Boolean).join(' · ')
                        : '–'}
                    </div>
                    {isPair && (
                      <div className="mt-2">
                        {renderPlayerLineLabel(b.player?.name)}
                        {b.player?.email || b.player?.phone
                          ? [b.player?.email, b.player?.phone].filter(Boolean).join(' · ')
                          : '–'}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-xs align-top">
                    {isPair && pairFee ? (
                      renderPaymentInfo(payer)
                    ) : isPair ? (
                      <div className="space-y-2">
                        {renderPaymentInfo(r, { label: r.player?.name })}
                        {renderPaymentInfo(b, { label: b.player?.name })}
                      </div>
                    ) : (
                      renderPaymentInfo(r)
                    )}
                  </td>
                  <td className="p-3 align-top">
                    {isPair ? (
                      <div className="space-y-2">
                        {renderPlayerStatus(r, { label: r.player?.name })}
                        {renderPlayerStatus(b, { label: b.player?.name })}
                      </div>
                    ) : (
                      renderPlayerStatus(r)
                    )}
                  </td>
                  <td className="p-3 align-top">
                    {r.status === 'CANCELLED' && !isPair ? (
                      renderCancelledActions(r, busy)
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          {isPair && pairFee
                            ? (
                              <div className="flex flex-wrap gap-1">{renderPaymentActions(payer, busy)}</div>
                            )
                            : isPair
                              ? (
                                <div className="space-y-2">
                                  <div>
                                    {renderPlayerLineLabel(r.player?.name)}
                                    <div className="flex flex-wrap gap-1">{renderPaymentActions(r, busy)}</div>
                                  </div>
                                  <div>
                                    {renderPlayerLineLabel(b.player?.name)}
                                    <div className="flex flex-wrap gap-1">{renderPaymentActions(b, busy)}</div>
                                  </div>
                                </div>
                              )
                              : (
                                <div className="flex flex-wrap gap-1">{renderPaymentActions(r, busy)}</div>
                              )}
                        </div>
                        <div className="space-y-2">
                          <div>
                            {isPair && renderPlayerLineLabel(r.player?.name)}
                            {renderCheckInAction(r, busy, {
                              pairPaid: isPair && pairFee && !!payer.payment?.isPaid,
                              payRegId: isPair && pairFee ? payer.id : r.id,
                            })}
                          </div>
                          {isPair && (
                            <div>
                              {renderPlayerLineLabel(b.player?.name)}
                              {renderCheckInAction(b, busy, {
                                pairPaid: pairFee && !!payer.payment?.isPaid,
                                payRegId: pairFee ? payer.id : b.id,
                              })}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          {isPair && pairFee ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(r.id, async () => {
                                  await cancelRegistration(tournamentId, r.id, r.status);
                                  await cancelRegistration(tournamentId, b.id, b.status);
                                })
                              }
                              className="p-2 rounded-lg bg-slate-800 text-red-400 hover:bg-slate-700"
                              title={t('preregCancelPair')}
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          ) : (
                            <>
                              <div>
                                {isPair && renderPlayerLineLabel(r.player?.name)}
                                {renderCancelAction(r, busy, t('preregCancelReg'))}
                              </div>
                              {isPair && (
                                <div>
                                  {renderPlayerLineLabel(b.player?.name)}
                                  {renderCancelAction(b, busy, t('preregCancelReg'))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
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
          registrations={registrations}
          user={user}
          onGoogleLogin={onGoogleLogin}
          onNotify={onNotify}
          onClose={() => setManualOpen(false)}
          onSaved={() => setManualOpen(false)}
          onGoToExisting={(reg) => {
            setHighlightRegId(reg?.id ?? null);
            if (reg?.status && FILTERS.includes(reg.status)) {
              setFilter(reg.status);
            } else {
              setFilter('ALL');
            }
            window.setTimeout(() => {
              document.getElementById(`prereg-reg-${reg?.id}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }, 80);
            window.setTimeout(() => setHighlightRegId(null), 4500);
          }}
        />
      )}

      {qrModalReg && (
        <PaymentQrModal
          lang={lang}
          tournament={tournament}
          registration={qrModalReg}
          onClose={() => setQrModalReg(null)}
        />
      )}

      {restoreReg && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-lg font-black text-white">{t('preregRestoreRegTitle')}</h3>
            <p className="text-sm text-slate-400">{t('preregRestoreRegBody')}</p>
            <p className="text-sm font-bold text-white">{restoreReg.player?.name}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleRestoreCancelled('CONFIRMED')}
                className="w-full py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 text-sm"
              >
                {t('preregRestoreConfirmed')}
              </button>
              <button
                type="button"
                onClick={() => handleRestoreCancelled('PENDING_PAYMENT')}
                className="w-full py-3 rounded-xl font-black text-amber-100 bg-amber-700 hover:bg-amber-600 text-sm"
              >
                {t('preregRestorePending')}
              </button>
              <button
                type="button"
                onClick={() => setRestoreReg(null)}
                className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {checkInConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-lg font-black text-white">{t('preregCheckInUnpaidTitle')}</h3>
            <p className="text-sm text-slate-400">{t('preregCheckInUnpaidBody')}</p>
            <p className="text-sm font-bold text-white">{checkInConfirm.player?.name}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCheckInConfirm(null)}
                className="flex-1 py-3 rounded-xl font-bold bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleCheckInPayCashAndConfirm}
                className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm"
              >
                {t('preregCheckInPayCashConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-lg font-black text-white">{t('preregAdminDeleteTitle')}</h3>
            <p className="text-sm text-slate-400 whitespace-pre-line">{t('preregAdminDeleteConfirm')}</p>
            <p className="text-sm font-bold text-white">{tournament.meta?.name || t('preregUntitled')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl font-bold bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700 disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteTournament}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl font-black bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> {t('preregAdminDeleting')}
                  </>
                ) : (
                  t('preregAdminDeleteBtn')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </PreRegPageShell>
  );
}
