import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const fieldLabel = 'block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5';
const fieldInput =
  'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60';
const radioBase =
  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors bg-slate-900/40 hover:bg-slate-800/60';
const radioSelected = 'border-emerald-500/70 bg-slate-800/80';
const radioUnselected = 'border-slate-700';

const LEGS_MIN = 1;
const LEGS_MAX = 30;

function clampLegs(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return LEGS_MIN;
  return Math.min(LEGS_MAX, Math.max(LEGS_MIN, v));
}

/**
 * Formulář hostitele před vytvořením záznamu ve Firebase.
 */
export default function HostSetupForm({ t, defaultHostName, onSubmit, busy }) {
  const [hostName, setHostName] = useState(() => String(defaultHostName || '').trim() || '');
  const [legs, setLegs] = useState(3);
  const [legsDraft, setLegsDraft] = useState('3');
  const [isPublic, setIsPublic] = useState(true);
  const [startScore, setStartScore] = useState(501);
  const [outMode, setOutMode] = useState('double');

  const commitLegs = (raw) => {
    const next = clampLegs(raw === '' || raw == null ? legs : raw);
    setLegs(next);
    setLegsDraft(String(next));
    return next;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!hostName.trim() || busy) return;
    const finalLegs = commitLegs(legsDraft);
    onSubmit({
      hostName: hostName.trim(),
      gameType: 'x01',
      legs: finalLegs,
      isPublic,
      /** Domluva „kdo začíná“ proběhne až v zápase (oba přihlášeni). */
      startPlayer: 'p1',
      startScore,
      outMode,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid w-full grid-cols-1 gap-4 landscape:grid-cols-2 landscape:grid-rows-[auto_auto_1fr_auto] landscape:gap-x-5 landscape:gap-y-3"
    >
      <div className="landscape:col-span-2">
        <label className={fieldLabel} htmlFor="online-host-name">
          {t('onlinePlayerNameLabel')}
        </label>
        <input
          id="online-host-name"
          type="text"
          autoComplete="nickname"
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          className={fieldInput}
          placeholder={t('p1Placeholder')}
        />
      </div>

      <div>
        <label className={fieldLabel} htmlFor="online-start-score">
          {t('onlineStartScoreLabel')}
        </label>
        <select
          id="online-start-score"
          value={startScore}
          onChange={(e) => setStartScore(Number(e.target.value))}
          className={fieldInput}
        >
          <option value={301}>301</option>
          <option value={501}>501</option>
        </select>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="online-out-mode">
          {t('onlineOutModeLabel')}
        </label>
        <select
          id="online-out-mode"
          value={outMode}
          onChange={(e) => setOutMode(e.target.value)}
          className={fieldInput}
        >
          <option value="single">{t('onlineOutModeSingle')}</option>
          <option value="double">{t('onlineOutModeDouble')}</option>
        </select>
      </div>

      <div className="landscape:col-span-2">
        <label className={fieldLabel} htmlFor="online-legs">
          {t('onlineLegsLabel')}
        </label>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            aria-label={t('onlineLegsDecrease') || '−'}
            disabled={legs <= LEGS_MIN || busy}
            onClick={() => commitLegs(legs - 1)}
            className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          <input
            id="online-legs"
            type="number"
            inputMode="numeric"
            min={LEGS_MIN}
            max={LEGS_MAX}
            value={legsDraft}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 2);
              setLegsDraft(raw);
              if (raw !== '') setLegs(clampLegs(raw));
            }}
            onBlur={() => commitLegs(legsDraft)}
            className={`${fieldInput} text-center font-mono text-lg font-black tabular-nums`}
          />
          <button
            type="button"
            aria-label={t('onlineLegsIncrease') || '+'}
            disabled={legs >= LEGS_MAX || busy}
            onClick={() => commitLegs(legs + 1)}
            className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
          {t('onlineLegsRangeHint')}
        </p>
      </div>

      <div className="space-y-2 landscape:col-span-2">
        <span className={fieldLabel.replace('mb-1.5', 'mb-0')}>{t('onlineVisibilityLabel')}</span>
        <label className={`${radioBase} ${isPublic ? radioSelected : radioUnselected}`}>
          <input
            type="radio"
            name="online-vis"
            className="mt-1"
            checked={isPublic}
            onChange={() => setIsPublic(true)}
          />
          <span className="text-sm font-bold text-slate-200">{t('visibilityPublic')}</span>
        </label>
        <label className={`${radioBase} ${!isPublic ? radioSelected : radioUnselected}`}>
          <input
            type="radio"
            name="online-vis"
            className="mt-1"
            checked={!isPublic}
            onChange={() => setIsPublic(false)}
          />
          <span className="text-sm font-bold text-slate-200">{t('visibilityPrivate')}</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={!hostName.trim() || busy}
        className="w-full py-4 rounded-xl font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 disabled:opacity-40 disabled:pointer-events-none transition-colors landscape:col-span-2"
      >
        {busy ? t('onlineCreating') : t('onlineCreateWaitingRoom')}
      </button>
    </form>
  );
}
