import React, { useState } from 'react';

const fieldLabel = 'block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5';
const fieldInput =
  'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60';
const radioBase =
  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors bg-slate-900/40 hover:bg-slate-800/60';
const radioSelected = 'border-emerald-500/70 bg-slate-800/80';
const radioUnselected = 'border-slate-700';

/**
 * Formulář hostitele před vytvořením záznamu ve Firebase.
 */
export default function HostSetupForm({ t, defaultHostName, onSubmit, busy }) {
  const [hostName, setHostName] = useState(() => String(defaultHostName || '').trim() || '');
  const [legs, setLegs] = useState(3);
  const [isPublic, setIsPublic] = useState(true);
  const [startScore, setStartScore] = useState(501);
  const [outMode, setOutMode] = useState('double');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!hostName.trim() || busy) return;
    onSubmit({
      hostName: hostName.trim(),
      gameType: 'x01',
      legs,
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
        <select
          id="online-legs"
          value={legs}
          onChange={(e) => setLegs(Number(e.target.value))}
          className={fieldInput}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
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
