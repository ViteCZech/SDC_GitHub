import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Loader2, MapPin, Trophy } from 'lucide-react';
import { translations } from '../../translations';
import {
  getPublicTournamentData,
  PREREG_NOT_FOUND,
} from '../../services/tournamentPreRegService';
import { loadStoredRegistration, saveStoredRegistration } from '../../utils/preregStorage';
import RegistrationForm from './RegistrationForm';
import SpdQrCard from './SpdQrCard';
import PreRegPageShell from './PreRegPageShell';

/**
 * @param {{
 *   tournamentId: string,
 *   lang: string,
 *   onBack?: () => void,
 * }} props
 */
export default function PublicTournamentPage({ tournamentId, lang, onBack }) {
  const t = (k) => translations[lang]?.[k] || k;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tournament, setTournament] = useState(null);
  const [registration, setRegistration] = useState(() => loadStoredRegistration(tournamentId));

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
      savedAt: new Date().toISOString(),
    };
    saveStoredRegistration(tournamentId, stored);
    setRegistration(stored);
  };

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
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> {t('tournBack')}
          </button>
        )}
        <div className="p-6 rounded-xl border border-amber-500/50 bg-amber-900/20 text-amber-200 text-center">
          {error || t('preregErrNotFound')}
        </div>
        </div>
      </PreRegPageShell>
    );
  }

  const startsAtLabel = formatDate(tournament.meta?.startsAt);
  const showForm = isRegistrationOpen && !registration;
  const showConfirmation = !!registration;
  const showClosedOnly = !isRegistrationOpen && !registration;

  return (
    <PreRegPageShell wide={false}>
      <div className="space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> {t('tournBack')}
        </button>
      )}

      <header className="space-y-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <Trophy className="w-6 h-6" />
          <span className="text-xs font-black uppercase tracking-widest">{t('preregTitle')}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          {tournament.meta?.name || t('preregUntitled')}
        </h1>
        <div className="flex flex-wrap gap-3 text-sm text-slate-400">
          {startsAtLabel && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> {startsAtLabel}
            </span>
          )}
          {tournament.meta?.venue && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> {tournament.meta.venue}
            </span>
          )}
        </div>
      </header>

      {showClosedOnly && (
        <div className="p-5 rounded-xl border border-slate-700 bg-slate-900/80 text-center">
          <p className="text-slate-300 font-bold">{t('preregClosedTitle')}</p>
          <p className="text-sm text-slate-500 mt-2">{t('preregClosedHint')}</p>
        </div>
      )}

      {!isRegistrationOpen && registration && (
        <p className="text-sm text-slate-500">{t('preregClosedButRegistered')}</p>
      )}

      {showConfirmation && (
        <section className="p-5 rounded-xl border border-slate-800 bg-slate-900/80">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">
            {t('preregLobbyTitle')}
          </h2>
          <SpdQrCard lang={lang} tournament={tournament} registration={registration} />
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
            onSuccess={handleRegistrationSuccess}
          />
        </section>
      )}
      </div>
    </PreRegPageShell>
  );
}
