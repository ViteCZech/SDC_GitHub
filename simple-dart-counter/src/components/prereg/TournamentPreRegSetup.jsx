import React, { useState } from 'react';
import { ArrowLeft, CheckCircle, Copy, Loader2, Trophy } from 'lucide-react';
import { translations } from '../../translations';
import { createPreRegTournament } from '../../services/tournamentPreRegService';
import {
  isDeadlineAfterStart,
  parseOptionalDateTimeLocal,
  parseOptionalNumber,
  parseOptionalString,
} from '../../utils/preregAdmin';
import PreRegPageShell from './PreRegPageShell';

/**
 * @param {{
 *   lang: string,
 *   user: object|null,
 *   onBack: () => void,
 *   onCreated: (tournamentId: string) => void,
 *   onGoogleLogin?: () => void,
 * }} props
 */
export default function TournamentPreRegSetup({ lang, user, onBack, onCreated, onGoogleLogin }) {
  const t = (k) => translations[lang]?.[k] || k;
  const isLoggedIn = user && !user.isAnonymous;

  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [capacity, setCapacity] = useState('');
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [entryFee, setEntryFee] = useState('');
  const [payoutPercent, setPayoutPercent] = useState('');
  const [sponsorMoney, setSponsorMoney] = useState('');
  const [payQr, setPayQr] = useState(true);
  const [payCash, setPayCash] = useState(true);
  const [accountPrefix, setAccountPrefix] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [vsPrefix, setVsPrefix] = useState('');
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [adminPin, setAdminPin] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdLinks, setCreatedLinks] = useState(null);

  const showBankFields = payQr;

  const handleStartsAtChange = (val) => {
    setStartsAt(val);
    if (registrationDeadline && isDeadlineAfterStart(registrationDeadline, val)) {
      setRegistrationDeadline(val);
    }
  };

  const handleDeadlineChange = (val) => {
    if (startsAt && isDeadlineAfterStart(val, startsAt)) {
      setError(t('preregAdminErrDeadlineAfterStart'));
      return;
    }
    setError('');
    setRegistrationDeadline(val);
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLoggedIn) {
      setError(t('preregAdminLoginRequired'));
      return;
    }
    if (!name.trim()) {
      setError(t('preregAdminErrName'));
      return;
    }
    if (!adminPin.trim() || adminPin.trim().length < 4) {
      setError(t('preregAdminErrPin'));
      return;
    }

    const paymentMethods = [];
    if (payQr) paymentMethods.push('QR');
    if (payCash) paymentMethods.push('CASH');

    if (payQr && (!accountNumber.trim() || !bankCode.trim())) {
      setError(t('preregAdminErrAccount'));
      return;
    }

    if (startsAt && registrationDeadline && isDeadlineAfterStart(registrationDeadline, startsAt)) {
      setError(t('preregAdminErrDeadlineAfterStart'));
      return;
    }

    setLoading(true);
    try {
      const result = await createPreRegTournament({
        name: name.trim(),
        venue: parseOptionalString(venue),
        startsAt: parseOptionalDateTimeLocal(startsAt),
        capacity: parseOptionalNumber(capacity),
        waitlistEnabled,
        registrationDeadline: parseOptionalDateTimeLocal(registrationDeadline),
        entryFee: parseOptionalNumber(entryFee),
        payoutPercent: parseOptionalNumber(payoutPercent),
        addedSponsorMoney: parseOptionalNumber(sponsorMoney),
        paymentMethods,
        accountPrefix: showBankFields ? parseOptionalString(accountPrefix) : null,
        accountNumber: showBankFields ? parseOptionalString(accountNumber) : null,
        bankCode: showBankFields ? parseOptionalString(bankCode) : null,
        vsPrefix: showBankFields ? parseOptionalString(vsPrefix) : null,
        termsAndConditions: parseOptionalString(termsAndConditions),
        adminPin: adminPin.trim(),
      });
      setCreatedLinks(result);
    } catch (err) {
      setError(String(err?.message ?? t('preregAdminErrCreate')));
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50';
  const labelCls = 'block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1';

  if (createdLinks) {
    return (
      <PreRegPageShell wide={false}>
        <div className="space-y-6">
        <div className="p-5 rounded-xl border border-emerald-500/50 bg-emerald-900/20 text-center space-y-3">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
          <h2 className="text-xl font-black text-white">{t('preregAdminCreatedTitle')}</h2>
          <p className="text-sm text-slate-400">{t('preregAdminCreatedHint')}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>{t('preregAdminPublicLink')}</label>
            <div className="flex gap-2">
              <input readOnly value={createdLinks.publicUrl} className={`${inputCls} font-mono text-sm`} />
              <button
                type="button"
                onClick={() => copyText(createdLinks.publicUrl)}
                className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('preregAdminInviteLink')}</label>
            <div className="flex gap-2">
              <input readOnly value={createdLinks.adminInviteUrl} className={`${inputCls} font-mono text-sm`} />
              <button
                type="button"
                onClick={() => copyText(createdLinks.adminInviteUrl)}
                className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onCreated?.(createdLinks.tournamentId)}
          className="w-full py-4 rounded-xl font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {t('preregAdminOpenPanel')}
        </button>
        </div>
      </PreRegPageShell>
    );
  }

  return (
    <PreRegPageShell>
      <div className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> {t('tournBack')}
      </button>

      <header>
        <div className="flex items-center gap-2 text-emerald-400 mb-2">
          <Trophy className="w-6 h-6" />
          <span className="text-xs font-black uppercase tracking-widest">{t('preregAdminSetupTitle')}</span>
        </div>
        <h1 className="text-2xl font-black text-white">{t('preregAdminSetupHeading')}</h1>
      </header>

      {!isLoggedIn && (
        <div className="p-4 rounded-xl border border-amber-500/50 bg-amber-900/20 space-y-3">
          <p className="text-sm text-amber-200">{t('preregAdminLoginRequired')}</p>
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

      <form onSubmit={handleSubmit} className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">
        <section className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-4 lg:col-span-2">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
            {t('preregAdminSectionBasic')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>{t('preregAdminName')} *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} disabled={loading} />
            </div>
            <div>
              <label className={labelCls}>{t('preregAdminVenue')}</label>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputCls} disabled={loading} />
            </div>
            <div>
              <label className={labelCls}>{t('preregAdminStartsAt')}</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => handleStartsAtChange(e.target.value)}
                className={inputCls}
                disabled={loading}
              />
            </div>
          </div>
        </section>

        <section className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
            {t('preregAdminSectionCapacity')}
          </h2>
          <div>
            <label className={labelCls}>{t('preregAdminCapacity')}</label>
            <input
              type="number"
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={t('preregAdminUnlimitedHint')}
              className={inputCls}
              disabled={loading}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={waitlistEnabled}
              onChange={(e) => setWaitlistEnabled(e.target.checked)}
              disabled={loading}
            />
            {t('preregAdminWaitlist')}
          </label>
          <div>
            <label className={labelCls}>{t('preregAdminDeadline')}</label>
            <input
              type="datetime-local"
              value={registrationDeadline}
              onChange={(e) => handleDeadlineChange(e.target.value)}
              max={startsAt || undefined}
              className={inputCls}
              disabled={loading}
            />
            {startsAt && (
              <p className="text-[10px] text-slate-500 mt-1">{t('preregAdminDeadlineHint')}</p>
            )}
          </div>
        </section>

        <section className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
            {t('preregAdminSectionFinance')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('preregAdminEntryFee')}</label>
              <input
                type="number"
                min="0"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                className={inputCls}
                disabled={loading}
              />
            </div>
            <div>
              <label className={labelCls}>{t('preregAdminPayoutPercent')}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={payoutPercent}
                onChange={(e) => setPayoutPercent(e.target.value)}
                placeholder="100"
                className={inputCls}
                disabled={loading}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('preregAdminSponsor')}</label>
              <input
                type="number"
                min="0"
                value={sponsorMoney}
                onChange={(e) => setSponsorMoney(e.target.value)}
                className={inputCls}
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <span className={labelCls}>{t('preregPaymentMethod')}</span>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={payQr} onChange={(e) => setPayQr(e.target.checked)} disabled={loading} />
                {t('preregPayQr')}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={payCash} onChange={(e) => setPayCash(e.target.checked)} disabled={loading} />
                {t('preregPayCash')}
              </label>
            </div>
          </div>
          {showBankFields && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>{t('preregAdminAccountPrefix')}</label>
                  <input
                    value={accountPrefix}
                    onChange={(e) => setAccountPrefix(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className={`${inputCls} font-mono`}
                    disabled={loading}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('preregAdminAccountNumber')} *</label>
                  <input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="1234567890"
                    className={`${inputCls} font-mono`}
                    disabled={loading}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('preregAdminBankCode')} *</label>
                  <input
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0100"
                    className={`${inputCls} font-mono`}
                    disabled={loading}
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-500">{t('preregAdminAccountFormatHint')}</p>
              <div>
                <label className={labelCls}>{t('preregAdminVsPrefix')}</label>
                <input
                  value={vsPrefix}
                  onChange={(e) => setVsPrefix(e.target.value)}
                  className={inputCls}
                  disabled={loading}
                />
              </div>
            </>
          )}
        </section>

        <section className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
            {t('preregAdminSectionTerms')}
          </h2>
          <textarea
            value={termsAndConditions}
            onChange={(e) => setTermsAndConditions(e.target.value)}
            rows={5}
            className={`${inputCls} resize-y min-h-[100px]`}
            placeholder={t('preregAdminTermsPlaceholder')}
            disabled={loading}
          />
        </section>

        <section className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
            {t('preregAdminSectionSecurity')}
          </h2>
          <div>
            <label className={labelCls}>{t('preregAdminPin')} *</label>
            <input
              type="password"
              inputMode="numeric"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              maxLength={8}
              className={inputCls}
              disabled={loading}
            />
          </div>
        </section>

        {error && (
          <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-500/50 text-amber-300 text-sm lg:col-span-2">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || !isLoggedIn}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 lg:col-span-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> {t('preregAdminCreating')}
            </>
          ) : (
            t('preregAdminCreateBtn')
          )}
        </button>
      </form>
      </div>
    </PreRegPageShell>
  );
}
