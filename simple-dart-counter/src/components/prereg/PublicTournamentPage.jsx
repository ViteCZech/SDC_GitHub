import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, Loader2, Trophy } from 'lucide-react';
import VenueMapLink from '../VenueMapLink';
import { translations } from '../../translations';
import {
  getPublicTournamentData,
  listMyRegistrationsApi,
  lookupStoredRegistrationApi,
  unregisterPlayerApi,
  PREREG_NOT_FOUND,
} from '../../services/tournamentPreRegService';
import { loadStoredRegistration, saveStoredRegistration } from '../../utils/preregStorage';
import { preferActivePreregistration } from '../../utils/playerIdentity';
import RegistrationForm from './RegistrationForm';
import PairStatusPanel from './PairStatusPanel';
import SpdQrCard from './SpdQrCard';
import PreRegPageShell from './PreRegPageShell';
import CompetitionTypeBadge from './CompetitionTypeBadge';
import { allowsPairing, normalizeCompetitionType } from '../../utils/preregCompetition';

/**
 * @param {{
 *   tournamentId: string,
 *   lang: string,
 *   user?: object|null,
 *   onBack?: () => void,
 * }} props
 */
export default function PublicTournamentPage({ tournamentId, lang, user = null }) {
  const t = (k) => translations[lang]?.[k] || k;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tournament, setTournament] = useState(null);
  const [registration, setRegistration] = useState(() => loadStoredRegistration(tournamentId));
  const [unregisterOpen, setUnregisterOpen] = useState(false);
  const [unregisterBusy, setUnregisterBusy] = useState(false);
  const [unregisterError, setUnregisterError] = useState('');

  const isRegistrationOpen = tournament?.status === 'REGISTRATION_OPEN';

  const loadTournament = useCallback(async () => {
    setLoading(true);
    setError('');
    const tr = (k) => translations[lang]?.[k] || k;
    try {
      const data = await getPublicTournamentData(tournamentId);
      setTournament(data);
    } catch (err) {
      const msg = String(err?.message ?? '');
      setError(msg === PREREG_NOT_FOUND ? tr('preregErrNotFound') : tr('preregErrLoad'));
      setTournament(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, lang]);

  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  useEffect(() => {
    const stored = loadStoredRegistration(tournamentId);
    if (!stored?.registrationId) return undefined;
    let cancelled = false;
    lookupStoredRegistrationApi(tournamentId, stored.registrationId)
      .then((fresh) => {
        if (cancelled || !fresh?.status) return;
        const next = {
          ...stored,
          status: fresh.status,
          playerName: fresh.playerName ?? stored.playerName,
          variableSymbol: fresh.variableSymbol ?? stored.variableSymbol,
          paymentMethod: fresh.paymentMethod ?? stored.paymentMethod,
          amount: fresh.amount ?? stored.amount,
          isPaid: fresh.isPaid ?? stored.isPaid,
          refundDue: fresh.refundDue ?? stored.refundDue,
          gender: fresh.gender ?? stored.gender,
          pair: fresh.pair ?? stored.pair,
        };
        saveStoredRegistration(tournamentId, next);
        setRegistration(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  useEffect(() => {
    if (!user || user.isAnonymous) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const items = await listMyRegistrationsApi();
        if (cancelled) return;
        const mine = (items || []).find((i) => String(i.tournamentId) === String(tournamentId));
        if (!mine?.registrationId) return;
        const stored = loadStoredRegistration(tournamentId);
        let next = {
          registrationId: mine.registrationId,
          status: mine.status,
          variableSymbol: mine.variableSymbol ?? stored?.variableSymbol ?? null,
          paymentMethod: stored?.paymentMethod ?? null,
          playerName: mine.playerName ?? stored?.playerName ?? '',
          email: mine.email ?? stored?.email ?? null,
          isPaid: mine.isPaid ?? stored?.isPaid,
          savedAt: stored?.savedAt || new Date().toISOString(),
        };
        try {
          const fresh = await lookupStoredRegistrationApi(tournamentId, mine.registrationId);
          if (fresh?.status) {
            next = {
              ...next,
              status: fresh.status,
              playerName: fresh.playerName ?? next.playerName,
              variableSymbol: fresh.variableSymbol ?? next.variableSymbol,
              paymentMethod: fresh.paymentMethod ?? next.paymentMethod,
              amount: fresh.amount ?? stored?.amount ?? null,
              isPaid: fresh.isPaid ?? next.isPaid,
              refundDue: fresh.refundDue,
              gender: fresh.gender ?? stored?.gender ?? null,
              pair: fresh.pair,
            };
          }
        } catch {
          /* keep list payload */
        }
        if (cancelled) return;
        const preferred = preferActivePreregistration(
          stored ? { ...stored, source: 'local' } : null,
          { ...next, source: 'server' }
        );
        const toSave = { ...preferred };
        delete toSave.source;
        saveStoredRegistration(tournamentId, toSave);
        setRegistration(toSave);
      } catch {
        /* katalog i tak načte listMyRegistrations zvlášť */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, user?.uid, user?.isAnonymous]);

  const handleRegistrationSuccess = (result, formSnapshot) => {
    const stored = {
      registrationId: result.registrationId,
      status: result.status,
      variableSymbol: result.variableSymbol ?? null,
      paymentMethod: formSnapshot.paymentMethod,
      playerName: formSnapshot.playerName,
      email: formSnapshot.email,
      phone: formSnapshot.phone,
      amount: formSnapshot.amount,
      gender: formSnapshot.gender ?? null,
      savedAt: new Date().toISOString(),
    };
    saveStoredRegistration(tournamentId, stored);
    setRegistration(stored);
    lookupStoredRegistrationApi(tournamentId, result.registrationId)
      .then((fresh) => {
        if (!fresh?.status) return;
        const next = {
          ...stored,
          status: fresh.status,
          pair: fresh.pair,
          gender: fresh.gender ?? stored.gender,
          amount: fresh.amount ?? stored.amount,
        };
        saveStoredRegistration(tournamentId, next);
        setRegistration(next);
      })
      .catch(() => {});
  };

  const handleUnregister = async () => {
    if (!registration?.registrationId) return;
    setUnregisterBusy(true);
    setUnregisterError('');
    try {
      const result = await unregisterPlayerApi(tournamentId, registration.registrationId);
      const next = {
        ...registration,
        status: 'CANCELLED',
        refundDue: !!result.refundDue,
        savedAt: new Date().toISOString(),
      };
      saveStoredRegistration(tournamentId, next);
      setRegistration(next);
      setUnregisterOpen(false);
    } catch (err) {
      const msg = String(err?.message ?? '');
      setUnregisterError(
        msg.includes('otevřen') || msg.includes('open')
          ? t('preregUnregisterErrClosed')
          : t('preregUnregisterErr')
      );
    } finally {
      setUnregisterBusy(false);
    }
  };

  const confirmationRef = useRef(null);
  useEffect(() => {
    if (registration && registration.status !== 'CANCELLED' && confirmationRef.current) {
      confirmationRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [registration]);

  const formatDate = (timestamp) => {
    if (!timestamp) return null;
    try {
      const d = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
      if (Number.isNaN(d.getTime())) return null;
      return new Intl.DateTimeFormat(lang === 'pl' ? 'pl-PL' : lang === 'en' ? 'en-GB' : 'cs-CZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <PreRegPageShell wide={false}>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <p className="text-slate-400">{t('preregLoading')}</p>
        </div>
      </PreRegPageShell>
    );
  }

  if (error || !tournament) {
    return (
      <PreRegPageShell wide={false}>
        <div className="space-y-4">
        <div className="p-6 rounded-xl border border-amber-500/50 bg-amber-900/20 text-amber-200 text-center">
          {error || t('preregErrNotFound')}
        </div>
        </div>
      </PreRegPageShell>
    );
  }

  const competitionType = normalizeCompetitionType(tournament.meta?.competitionType);
  const pairingOn = allowsPairing(competitionType);
  const startsAtLabel = formatDate(tournament.meta?.startsAt);
  const isCancelled = registration?.status === 'CANCELLED';
  const hasActiveRegistration = !!registration && !isCancelled;
  const showForm = isRegistrationOpen && !hasActiveRegistration;
  const showConfirmation = hasActiveRegistration;
  const showClosedOnly = !isRegistrationOpen && !registration;
  const showCancelledNotice = isCancelled;

  return (
    <PreRegPageShell wide={false}>
      <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <Trophy className="w-6 h-6" />
          <span className="text-xs font-black uppercase tracking-widest">{t('preregTitle')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            {tournament.meta?.name || t('preregUntitled')}
          </h1>
          <CompetitionTypeBadge type={competitionType} t={t} />
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-slate-400">
          {startsAtLabel && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> {startsAtLabel}
            </span>
          )}
          <VenueMapLink tournament={tournament} lang={lang} />
        </div>
      </header>

      {showClosedOnly && (
        <div className="p-5 rounded-xl border border-slate-700 bg-slate-900/80 text-center">
          <p className="text-slate-300 font-bold">{t('preregClosedTitle')}</p>
          <p className="text-sm text-slate-500 mt-2">{t('preregClosedHint')}</p>
        </div>
      )}

      {!isRegistrationOpen && hasActiveRegistration && (
        <p className="text-sm text-slate-500">{t('preregClosedButRegistered')}</p>
      )}

      {showCancelledNotice && (
        <div className="p-5 rounded-xl border border-red-500/40 bg-red-950/30">
          <p className="font-black uppercase tracking-wide text-red-300 text-sm">
            {t('preregStatusCancelled')}
          </p>
          {registration?.playerName && (
            <p className="text-slate-300 mt-1">{registration.playerName}</p>
          )}
          <p className="text-sm text-red-200/80 mt-2">{t('preregCancelledHint')}</p>
          {registration?.refundDue && (
            <p className="text-sm text-amber-200 mt-2">{t('preregRefundDueHint')}</p>
          )}
        </div>
      )}

      {showConfirmation && (
        <section
          ref={confirmationRef}
          className="p-5 rounded-xl border border-slate-800 bg-slate-900/80"
        >
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">
            {t('preregLobbyTitle')}
          </h2>
          <SpdQrCard lang={lang} tournament={tournament} registration={registration} />
          {pairingOn && registration?.registrationId && (
            <PairStatusPanel
              lang={lang}
              tournamentId={tournamentId}
              registrationId={registration.registrationId}
              pair={registration.pair}
              gender={registration.gender}
              registrationOpen={isRegistrationOpen}
              onPairChange={(nextPair) => {
                const next = { ...registration, pair: nextPair };
                saveStoredRegistration(tournamentId, next);
                setRegistration(next);
              }}
            />
          )}
          {isRegistrationOpen && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              {!unregisterOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setUnregisterError('');
                    setUnregisterOpen(true);
                  }}
                  className="w-full py-3 rounded-xl font-bold text-sm text-red-300 bg-red-950/40 border border-red-500/40 hover:bg-red-950/70"
                >
                  {t('preregUnregisterBtn')}
                </button>
              ) : (
                <div className="p-4 rounded-xl border border-red-500/40 bg-red-950/30 space-y-3">
                  <p className="text-sm font-black uppercase tracking-wide text-red-200">
                    {t('preregUnregisterConfirmTitle')}
                  </p>
                  <p className="text-sm text-slate-300">{t('preregUnregisterConfirmBody')}</p>
                  {unregisterError && (
                    <p className="text-sm text-amber-300">{unregisterError}</p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={unregisterBusy}
                      onClick={handleUnregister}
                      className="flex-1 py-3 rounded-xl font-black uppercase tracking-wide text-sm text-white bg-red-600 hover:bg-red-500 disabled:opacity-50"
                    >
                      {unregisterBusy ? t('preregUnregisterWorking') : t('preregUnregisterConfirmBtn')}
                    </button>
                    <button
                      type="button"
                      disabled={unregisterBusy}
                      onClick={() => setUnregisterOpen(false)}
                      className="flex-1 py-3 rounded-xl font-bold text-sm text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {showForm && (
        <section className="p-5 rounded-xl border border-slate-800 bg-slate-900/80">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">
            {t('preregFormTitle')}
          </h2>
          <RegistrationForm
            lang={lang}
            tournament={tournament}
            defaultEmail={!user?.isAnonymous ? user?.email || '' : ''}
            onSuccess={handleRegistrationSuccess}
          />
        </section>
      )}
      </div>
    </PreRegPageShell>
  );
}
