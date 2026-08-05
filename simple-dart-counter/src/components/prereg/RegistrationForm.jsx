import React, { useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { translations } from '../../translations';
import {
  registerPlayerApi,
} from '../../services/tournamentPreRegService';

/**
 * @param {{
 *   lang: string,
 *   tournament: object,
 *   onSuccess: (result: object, formSnapshot: object) => void,
 * }} props
 */
export default function RegistrationForm({ lang, tournament, onSuccess }) {
  const t = (k) => translations[lang]?.[k] || k;

  const paymentOptions = useMemo(() => {
    const configured = tournament?.finance?.paymentMethods;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured.filter((m) => m === 'QR' || m === 'CASH');
    }
    return [];
  }, [tournament?.finance?.paymentMethods]);

  const termsText = tournament?.termsAndConditions?.trim() ?? '';
  const requiresTerms = termsText.length > 0;
  const entryFee = tournament?.finance?.entryFee ?? null;

  const [playerName, setPlayerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(paymentOptions[0] ?? null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mapErrorMessage = (err) => {
    const code = err?.code ?? '';
    const msg = String(err?.message ?? '');

    // Firebase někdy prefixuje "Firebase: " / "functions/" — necháme čitelný text
    const clean = msg
      .replace(/^Firebase:\s*/i, '')
      .replace(/^functions\/[a-z-]+:\s*/i, '')
      .trim();

    if (code === 'failed-precondition') {
      if (clean.includes('podmínk')) return t('preregErrTerms');
      if (clean.includes('limit') || clean.includes('Vypršel')) return t('preregErrDeadline');
      if (clean.includes('otevřeny')) return t('preregErrClosed');
      return clean || t('preregErrPrecondition');
    }
    if (code === 'resource-exhausted') return t('preregErrFull');
    if (code === 'already-exists') return t('preregErrDuplicateEmail');
    if (code === 'invalid-argument') return clean || t('preregErrInvalid');
    if (code === 'not-found') return t('preregErrNotFound');
    if (code === 'internal') return clean || t('preregErrGeneric');
    return clean || t('preregErrGeneric');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const name = playerName.trim();
    if (!name) {
      setError(t('preregErrNameRequired'));
      return;
    }
    if (requiresTerms && !termsAccepted) {
      setError(t('preregErrTerms'));
      return;
    }
    if (paymentOptions.length > 0 && !paymentMethod) {
      setError(t('preregErrPaymentRequired'));
      return;
    }

    setLoading(true);
    try {
      const tournamentId = String(tournament?.id ?? '').trim();
      if (!tournamentId) {
        setError(t('preregErrNotFound'));
        return;
      }

      const result = await registerPlayerApi({
        tournamentId,
        playerName: name,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        paymentMethod: paymentMethod ?? null,
        termsAccepted: requiresTerms ? termsAccepted : false,
      });

      onSuccess(result, {
        playerName: name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        paymentMethod: paymentMethod ?? null,
        amount: entryFee,
      });
    } catch (err) {
      setError(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
          {t('preregPlayerName')} *
        </label>
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          placeholder={t('tournPlayerPlaceholder')}
          autoComplete="name"
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
            {t('preregEmail')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            autoComplete="email"
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
            {t('preregPhone')}
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            autoComplete="tel"
            disabled={loading}
          />
        </div>
      </div>

      {paymentOptions.length > 0 && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
            {t('preregPaymentMethod')}
          </label>
          <div className="flex flex-wrap gap-2">
            {paymentOptions.map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                disabled={loading}
                className={`px-4 py-2 rounded-xl font-bold border-2 transition-all ${
                  paymentMethod === method
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {method === 'QR' ? t('preregPayQr') : t('preregPayCash')}
              </button>
            ))}
          </div>
        </div>
      )}

      {entryFee != null && Number(entryFee) > 0 && (
        <p className="text-sm text-slate-400">
          {t('preregEntryFee')}:{' '}
          <span className="text-white font-bold">
            {Number(entryFee).toLocaleString('cs-CZ')} Kč
          </span>
        </p>
      )}

      {requiresTerms && (
        <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-700 bg-slate-900/60 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            disabled={loading}
            className="mt-1 w-4 h-4 rounded border-slate-600 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-slate-300">
            <span className="font-bold block mb-2">{t('preregTermsLabel')}</span>
            <span className="text-slate-400 whitespace-pre-wrap">{termsText}</span>
          </span>
        </label>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/60 text-red-200 text-sm font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" /> {t('preregSubmitting')}
          </>
        ) : (
          <>
            <Send className="w-5 h-5" /> {t('preregSubmit')}
          </>
        )}
      </button>
    </form>
  );
}
