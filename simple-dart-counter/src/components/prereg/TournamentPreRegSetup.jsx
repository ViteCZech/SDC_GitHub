import React, { useMemo, useState } from 'react';
import { BookmarkPlus, CheckCircle, Copy, Eye, EyeOff, Loader2, Trash2, Trophy } from 'lucide-react';
import { translations } from '../../translations';
import { createPreRegTournament } from '../../services/tournamentPreRegService';
import {
  isDeadlineAfterStart,
  parseOptionalDateTimeLocal,
  parseOptionalNumber,
  parseOptionalString,
} from '../../utils/preregAdmin';
import {
  deletePreregSetupTemplate,
  loadPreregSetupTemplates,
  upsertPreregSetupTemplate,
} from '../../utils/preregStorage';
import {
  KNOWN_CITIES,
  REGION_SUGGESTIONS,
  regionForCity,
  uniquePlaces,
} from '../../utils/preregPlaces';
import PreRegPageShell from './PreRegPageShell';
import DateTimeLocalFields from './DateTimeLocalFields';
import PlaceSuggestField from './PlaceSuggestField';
import NumericStepper from '../NumericStepper';
import { allowsPairing, usesTeamCapacity } from '../../utils/preregCompetition';

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
  const [locationCity, setLocationCity] = useState('');
  const [locationVenueName, setLocationVenueName] = useState('');
  const [locationRegion, setLocationRegion] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [capacity, setCapacity] = useState('');
  const [competitionType, setCompetitionType] = useState('singles');
  const [feeMode, setFeeMode] = useState('pair');
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
  const [showAdminPin, setShowAdminPin] = useState(true);

  const [templates, setTemplates] = useState(() => loadPreregSetupTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [includeBank, setIncludeBank] = useState(false);
  const [infoNotice, setInfoNotice] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdLinks, setCreatedLinks] = useState(null);

  const showBankFields = payQr;
  const selectedTemplate = templates.find((row) => row.id === selectedTemplateId) || null;

  const extraCities = useMemo(
    () =>
      templates.flatMap((row) => {
        const city = String(row.fields?.locationCity ?? '').trim();
        const region = String(row.fields?.locationRegion ?? '').trim();
        return city ? [{ name: city, region, hint: region }] : [];
      }),
    [templates]
  );
  const extraRegions = useMemo(
    () =>
      templates
        .map((row) => String(row.fields?.locationRegion ?? '').trim())
        .filter(Boolean)
        .map((regionName) => ({ name: regionName })),
    [templates]
  );
  const cityItems = useMemo(
    () =>
      uniquePlaces([
        ...KNOWN_CITIES.map((c) => ({ name: c.name, hint: c.region, region: c.region })),
        ...extraCities,
      ]),
    [extraCities]
  );
  const regionItems = useMemo(
    () => uniquePlaces([...REGION_SUGGESTIONS, ...extraRegions]),
    [extraRegions]
  );

  const captureTemplateFields = (withBank) => ({
    name: name.trim(),
    locationCity,
    locationVenueName,
    locationRegion,
    isPublic,
    capacity,
    competitionType,
    feeMode,
    waitlistEnabled,
    entryFee,
    payoutPercent,
    sponsorMoney,
    payQr,
    payCash,
    vsPrefix,
    termsAndConditions,
    ...(withBank
      ? { accountPrefix, accountNumber, bankCode }
      : {}),
  });

  const applyTemplate = (template) => {
    if (!template?.fields) return;
    const f = template.fields;
    if (f.name != null) setName(String(f.name));
    setLocationCity(String(f.locationCity ?? ''));
    setLocationVenueName(String(f.locationVenueName ?? ''));
    setLocationRegion(String(f.locationRegion ?? ''));
    setIsPublic(f.isPublic !== false);
    setCapacity(f.capacity != null && f.capacity !== '' ? String(f.capacity) : '');
    setCompetitionType(
      f.competitionType === 'doubles' || f.competitionType === 'mixed' || f.competitionType === 'random_doubles'
        ? f.competitionType
        : 'singles'
    );
    setFeeMode(f.feeMode === 'split' ? 'split' : 'pair');
    setWaitlistEnabled(!!f.waitlistEnabled);
    setEntryFee(f.entryFee != null && f.entryFee !== '' ? String(f.entryFee) : '');
    setPayoutPercent(f.payoutPercent != null && f.payoutPercent !== '' ? String(f.payoutPercent) : '');
    setSponsorMoney(f.sponsorMoney != null && f.sponsorMoney !== '' ? String(f.sponsorMoney) : '');
    setPayQr(f.payQr !== false);
    setPayCash(f.payCash !== false);
    setVsPrefix(String(f.vsPrefix ?? ''));
    setTermsAndConditions(String(f.termsAndConditions ?? ''));
    if (template.includeBank) {
      setAccountPrefix(String(f.accountPrefix ?? ''));
      setAccountNumber(String(f.accountNumber ?? ''));
      setBankCode(String(f.bankCode ?? ''));
      setInfoNotice(t('preregTemplateBankCheck'));
    } else {
      setInfoNotice(t('preregTemplateApplied'));
    }
    setError('');
  };

  const handleSaveTemplate = () => {
    const title = templateTitle.trim();
    if (!title) {
      setError(t('preregTemplateErrName'));
      return;
    }
    const withBank = includeBank && payQr;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tpl_${Date.now()}`;
    const next = upsertPreregSetupTemplate({
      id,
      title,
      savedAt: new Date().toISOString(),
      includeBank: withBank,
      fields: captureTemplateFields(withBank),
    });
    setTemplates(next);
    const saved = next.find(
      (row) => String(row.title || '').trim().toLowerCase() === title.toLowerCase()
    );
    setSelectedTemplateId(saved?.id ?? '');
    setSaveModalOpen(false);
    setInfoNotice(t('preregTemplateSaved'));
    setError('');
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplateId) return;
    const next = deletePreregSetupTemplate(selectedTemplateId);
    setTemplates(next);
    setSelectedTemplateId('');
  };

  const handleCityChange = (v) => {
    setLocationCity(v);
    const mapped = regionForCity(v, extraCities);
    if (mapped && !locationRegion.trim()) setLocationRegion(mapped);
  };

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
        venue: parseOptionalString(locationVenueName),
        locationCity: parseOptionalString(locationCity),
        locationVenueName: parseOptionalString(locationVenueName),
        locationRegion: parseOptionalString(locationRegion),
        isPublic,
        startsAt: parseOptionalDateTimeLocal(startsAt),
        capacity: parseOptionalNumber(capacity),
        competitionType,
        capacityUnit: usesTeamCapacity(competitionType) ? 'teams' : 'players',
        feeMode: allowsPairing(competitionType) ? feeMode : 'split',
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
      <header>
        <div className="flex items-center gap-2 text-emerald-400 mb-2">
          <Trophy className="w-6 h-6" />
          <span className="text-xs font-black uppercase tracking-widest">{t('preregAdminSetupTitle')}</span>
        </div>
        <h1 className="text-2xl font-black text-white">{t('preregAdminSetupHeading')}</h1>
      </header>

      <details className="rounded-xl border border-slate-800 bg-slate-900/80 group">
        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-black uppercase tracking-widest text-slate-400">
              {t('preregTemplateTitle')}
            </span>
            <span className="block text-[11px] text-slate-500 mt-0.5">
              {selectedTemplate
                ? selectedTemplate.title
                : t('preregTemplateCollapsedHint')}
            </span>
          </span>
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wide group-open:rotate-180 transition-transform">
            ▾
          </span>
        </summary>
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
        <p className="text-xs text-slate-500">{t('preregTemplateHint')}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className={`${inputCls} sm:flex-1`}
            disabled={loading}
          >
            <option value="">{t('preregTemplateNone')}</option>
            {templates.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
                {row.includeBank ? ' · QR' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={loading || !selectedTemplate}
            onClick={() => applyTemplate(selectedTemplate)}
            className="px-4 py-3 rounded-xl font-bold bg-slate-800 border border-slate-700 text-emerald-400 hover:bg-slate-700 disabled:opacity-40"
          >
            {t('preregTemplateApply')}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setTemplateTitle(name.trim() || selectedTemplate?.title || '');
              setIncludeBank(false);
              setSaveModalOpen(true);
              setError('');
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold bg-slate-800 border border-slate-700 text-sky-300 hover:bg-slate-700 disabled:opacity-40"
          >
            <BookmarkPlus className="w-4 h-4" />
            {t('preregTemplateSave')}
          </button>
          <button
            type="button"
            disabled={loading || !selectedTemplateId}
            onClick={handleDeleteTemplate}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold bg-slate-800 border border-slate-700 text-red-400 hover:bg-slate-700 disabled:opacity-40"
            title={t('preregTemplateDelete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        {infoNotice && (
          <p className="text-sm text-emerald-300/90">{infoNotice}</p>
        )}
        </div>
      </details>

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
              <input
                value={locationVenueName}
                onChange={(e) => setLocationVenueName(e.target.value)}
                className={inputCls}
                disabled={loading}
                placeholder={t('preregAdminLocationVenueHint')}
              />
            </div>
            <div>
              <PlaceSuggestField
                id="prereg-setup-city"
                label={t('preregAdminLocationCity')}
                value={locationCity}
                onChange={handleCityChange}
                onPick={(item) => {
                  const mapped = item.region || regionForCity(item.name, extraCities);
                  if (mapped) setLocationRegion(mapped);
                }}
                items={cityItems}
                placeholder={t('preregAdminLocationCityHint')}
                disabled={loading}
                inputClassName={inputCls}
              />
            </div>
            <div>
              <PlaceSuggestField
                id="prereg-setup-region"
                label={t('preregAdminLocationRegion')}
                value={locationRegion}
                onChange={setLocationRegion}
                items={regionItems}
                placeholder={t('preregAdminLocationRegionHint')}
                disabled={loading}
                inputClassName={inputCls}
                emptyOpen
                minChars={0}
              />
            </div>
            <p className="text-[10px] text-slate-500 md:col-span-2 -mt-2">
              {t('preregPlaceSuggestHint')}
            </p>
            <div>
              <label className={labelCls}>{t('preregAdminStartsAt')}</label>
              <DateTimeLocalFields
                value={startsAt}
                onChange={handleStartsAtChange}
                inputClassName={inputCls}
                disabled={loading}
                dateLabel={t('preregAdminDate')}
                timeLabel={t('preregAdminTime')}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 pt-1">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={loading}
            />
            {t('preregAdminIsPublic')}
          </label>
        </section>

        <section className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
            {t('preregAdminSectionFormat')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {['singles', 'doubles', 'mixed', 'random_doubles'].map((type) => (
              <button
                key={type}
                type="button"
                disabled={loading}
                onClick={() => setCompetitionType(type)}
                className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border-2 transition-colors ${
                  competitionType === type
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {t(`preregCompType_${type}`)}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500">{t(`preregCompTypeHint_${competitionType}`)}</p>
          {allowsPairing(competitionType) && (
            <div>
              <span className={labelCls}>{t('preregAdminFeeMode')}</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {['pair', 'split'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={loading}
                    onClick={() => setFeeMode(mode)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border-2 ${
                      feeMode === mode
                        ? 'bg-cyan-700 border-cyan-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t(`preregFeeMode_${mode}`)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{t(`preregFeeModeHint_${feeMode}`)}</p>
            </div>
          )}
        </section>

        <section className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
            {t('preregAdminSectionCapacity')}
          </h2>
          <div>
            <label className={labelCls}>
              {usesTeamCapacity(competitionType) ? t('preregAdminCapacityTeams') : t('preregAdminCapacity')}
            </label>
            <NumericStepper
              allowEmpty
              value={capacity === '' ? '' : Number(capacity) || ''}
              onChange={(v) => setCapacity(v === '' ? '' : String(v))}
              min={1}
              max={9999}
              hint={t('preregAdminUnlimitedHint')}
              disabled={loading}
              decreaseLabel={t('numericDecrease') || 'Snížit'}
              increaseLabel={t('numericIncrease') || 'Zvýšit'}
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
            <DateTimeLocalFields
              value={registrationDeadline}
              onChange={handleDeadlineChange}
              max={startsAt || undefined}
              inputClassName={inputCls}
              disabled={loading}
              dateLabel={t('preregAdminDate')}
              timeLabel={t('preregAdminTime')}
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
              <NumericStepper
                allowEmpty
                value={entryFee === '' ? '' : Number(entryFee) || ''}
                onChange={(v) => setEntryFee(v === '' ? '' : String(v))}
                min={0}
                max={999999}
                step={50}
                quickValues={[0, 100, 200, 300, 500]}
                disabled={loading}
                decreaseLabel={t('numericDecrease') || 'Snížit'}
                increaseLabel={t('numericIncrease') || 'Zvýšit'}
              />
            </div>
            <div>
              <label className={labelCls}>{t('preregAdminPayoutPercent')}</label>
              <NumericStepper
                allowEmpty
                value={payoutPercent === '' ? '' : Number(payoutPercent) || ''}
                onChange={(v) => setPayoutPercent(v === '' ? '' : String(v))}
                min={0}
                max={100}
                step={5}
                quickValues={[50, 80, 100]}
                disabled={loading}
                decreaseLabel={t('numericDecrease') || 'Snížit'}
                increaseLabel={t('numericIncrease') || 'Zvýšit'}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('preregAdminSponsor')}</label>
              <NumericStepper
                allowEmpty
                value={sponsorMoney === '' ? '' : Number(sponsorMoney) || ''}
                onChange={(v) => setSponsorMoney(v === '' ? '' : String(v))}
                min={0}
                max={999999}
                step={100}
                disabled={loading}
                decreaseLabel={t('numericDecrease') || 'Snížit'}
                increaseLabel={t('numericIncrease') || 'Zvýšit'}
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
            <div className="relative">
              <input
                type={showAdminPin ? 'text' : 'password'}
                inputMode="numeric"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                maxLength={8}
                className={`${inputCls} pr-12 font-mono tracking-widest`}
                disabled={loading}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowAdminPin((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-white"
                tabIndex={-1}
                aria-label={showAdminPin ? t('preregAdminPinHide') : t('preregAdminPinShow')}
              >
                {showAdminPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
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

      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-lg font-black text-white">{t('preregTemplateSave')}</h3>
            <p className="text-xs text-slate-500">{t('preregTemplateHint')}</p>
            <div>
              <label className={labelCls}>{t('preregTemplateName')}</label>
              <input
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                className={inputCls}
                autoFocus
              />
              {templates.some(
                (row) =>
                  String(row.title || '').trim().toLowerCase() === templateTitle.trim().toLowerCase()
              ) && (
                <p className="text-[10px] text-amber-400 mt-1">{t('preregTemplateOverwriteHint')}</p>
              )}
            </div>
            {payQr && (
              <label className="flex items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={includeBank}
                  onChange={(e) => setIncludeBank(e.target.checked)}
                />
                <span>{t('preregTemplateIncludeBank')}</span>
              </label>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="flex-1 py-3 rounded-xl font-bold bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </PreRegPageShell>
  );
}
