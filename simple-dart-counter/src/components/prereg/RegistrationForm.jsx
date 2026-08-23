import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { translations } from '../../translations';
import { listAvailablePartnersApi, registerPlayerApi } from '../../services/tournamentPreRegService';
import { allowsPairing, normalizeCompetitionType, normalizeFeeMode } from '../../utils/preregCompetition';
import CsoPlayerNameField from './CsoPlayerNameField';

/**
 * @param {{
 *   lang: string,
 *   tournament: object,
 *   onSuccess: (result: object, formSnapshot: object) => void,
 *   defaultEmail?: string,
 * }} props
 */
export default function RegistrationForm({ lang, tournament, onSuccess, defaultEmail = '' }) {
  const t = (k) => translations[lang]?.[k] || k;
  const competitionType = normalizeCompetitionType(tournament?.meta?.competitionType);
  const pairingOn = allowsPairing(competitionType);
  const isMixed = competitionType === 'mixed';
  const feeMode = normalizeFeeMode(tournament);

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
  const [csoPlayerId, setCsoPlayerId] = useState(null);
  const [csoRank, setCsoRank] = useState(null);
  const [gender, setGender] = useState(/** @type {'M'|'F'|null} */ (null));
  const [recreationalGender, setRecreationalGender] = useState(/** @type {'M'|'F'|null} */ (null));
  const [useCsoGender, setUseCsoGender] = useState(true);
  const [email, setEmail] = useState(() => String(defaultEmail ?? '').trim());
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(paymentOptions[0] ?? null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [partnerRegistrationId, setPartnerRegistrationId] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partners, setPartners] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resolvedGender = useCsoGender ? gender : recreationalGender;

  const inputCls =
    'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

  useEffect(() => {
    if (!pairingOn || !tournament?.id) return undefined;
    let cancelled = false;
    setPartnersLoading(true);
    listAvailablePartnersApi(tournament.id, { gender: isMixed ? resolvedGender : null })
      .then((list) => {
        if (!cancelled) setPartners(list);
      })
      .catch(() => {
        if (!cancelled) setPartners([]);
      })
      .finally(() => {
        if (!cancelled) setPartnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pairingOn, tournament?.id, isMixed, resolvedGender]);

  const mapErrorMessage = (err) => {
    const code = err?.code ?? '';
    const msg = String(err?.message ?? '');

    const clean = msg
      .replace(/^Firebase:\s*/i, '')
      .replace(/^functions\/[a-z-]+:\s*/i, '')
      .trim();

    if (clean.includes('GENDER_REQUIRED')) return t('preregErrGender');
    if (clean.includes('PAIR_GENDER')) return t('preregErrPairGender');
    if (clean.includes('PAIR_NOT_AVAILABLE')) return t('preregErrPairTaken');
    if (code === 'failed-precondition') {
      if (clean.includes('podmínk')) return t('preregErrTerms');
      if (clean.includes('limit') || clean.includes('Vypršel')) return t('preregErrDeadline');
      if (clean.includes('otevřeny')) return t('preregErrClosed');
      return clean || t('preregErrPrecondition');
    }
    if (code === 'resource-exhausted') return t('preregErrFull');
    if (code === 'already-exists') {
      const dupPrefix = 'PLAYER_NAME_DUPLICATE:';
      const dupIdx = clean.indexOf(dupPrefix);
      if (dupIdx >= 0) {
        const dupName = clean.slice(dupIdx + dupPrefix.length).trim() || playerName.trim();
        return (t('preregErrDuplicatePlayer') || 'Hráč {name} již je v tomto turnaji zaregistrován.').replace(
          '{name}',
          dupName
        );
      }
      return t('preregErrDuplicateEmail');
    }
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
    if (isMixed && !resolvedGender) {
      setError(t('preregErrGender'));
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
        csoPlayerId,
        csoRank: csoRank ?? undefined,
        paymentMethod: paymentMethod ?? null,
        termsAccepted: requiresTerms ? termsAccepted : false,
        gender: pairingOn || isMixed ? resolvedGender : undefined,
        partnerRegistrationId: pairingOn && partnerRegistrationId ? partnerRegistrationId : undefined,
        partnerName: pairingOn && !partnerRegistrationId && partnerName.trim() ? partnerName.trim() : undefined,
      });

      onSuccess(result, {
        playerName: name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        paymentMethod: paymentMethod ?? null,
        amount: result.amount ?? (partnerRegistrationId && feeMode === 'pair' ? 0 : entryFee),
        csoPlayerId,
        csoRank,
        gender: resolvedGender,
      });
    } catch (err) {
      setError(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <CsoPlayerNameField
        lang={lang}
        playerName={playerName}
        onPlayerNameChange={setPlayerName}
        csoRank={csoRank != null ? String(csoRank) : ''}
        onCsoRankChange={(v) => setCsoRank(v ? Number(v) : null)}
        onCsoPlayerIdChange={setCsoPlayerId}
        onGenderChange={(g) => {
          setUseCsoGender(g != null);
          if (g) setGender(g);
        }}
        inputClassName={inputCls}
        disabled={loading}
        showRankingField={false}
        showAdminControls={false}
        nullableRecreationalId
      />
      <p className="text-xs text-slate-500 -mt-2">
        {t('preregCsoRecreationalHint') ||
          'Pokud nejste v žebříčku ČŠO, zadejte jméno ručně — registrace proběhne bez ČŠO ID.'}
      </p>

      {isMixed && !useCsoGender && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
            {t('preregGender')}
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              ['M', t('preregGenderM')],
              ['F', t('preregGenderF')],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={loading}
                onClick={() => setRecreationalGender(value)}
                className={`px-4 py-2 rounded-xl font-bold border-2 ${
                  recreationalGender === value
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {pairingOn && (
        <div className="p-4 rounded-xl border border-slate-700 bg-slate-950/50 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            {t('preregPartnerTitle')}
          </p>
          <p className="text-xs text-slate-500">{t('preregPartnerHint')}</p>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
              {t('preregPartnerRegistered')}
            </label>
            <select
              value={partnerRegistrationId}
              onChange={(e) => {
                setPartnerRegistrationId(e.target.value);
                if (e.target.value) setPartnerName('');
              }}
              disabled={loading || partnersLoading}
              className={inputCls}
            >
              <option value="">{t('preregPartnerNone')}</option>
              {partners.map((p) => (
                <option key={p.registrationId} value={p.registrationId}>
                  {p.name}
                </option>
              ))}
            </select>
            {partnersLoading && (
              <p className="text-[10px] text-slate-500 mt-1">{t('preregPartnerLoading')}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
              {t('preregPartnerPending')}
            </label>
            <input
              value={partnerName}
              onChange={(e) => {
                setPartnerName(e.target.value);
                if (e.target.value.trim()) setPartnerRegistrationId('');
              }}
              disabled={loading || !!partnerRegistrationId}
              className={inputCls}
              placeholder={t('preregPartnerPendingPlaceholder')}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
            {t('preregEmail')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
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
            className={inputCls}
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
          {pairingOn && (
            <span className="block text-xs text-slate-500 mt-1">
              {feeMode === 'pair' ? t('preregFeeHintPair') : t('preregFeeHintSplit')}
            </span>
          )}
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
