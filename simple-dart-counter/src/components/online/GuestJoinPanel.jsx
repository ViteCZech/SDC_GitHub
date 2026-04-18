import React from 'react';

const fieldLabel = 'block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5';
const fieldInput =
  'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60';

/**
 * Zadání jména připojujícího hráče před zápisem join do Firebase.
 */
export default function GuestJoinPanel({ t, draft, guestName, onGuestNameChange, onConfirm, onCancel, busy }) {
  return (
    <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 mx-auto">
      <h3 className="text-center text-sm font-black uppercase tracking-widest text-emerald-400">
        {t('onlineGuestJoinTitle')}
      </h3>
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400 space-y-1">
        <div>
          <span className="font-bold text-slate-500">{t('onlineGameHostLabel')}:</span>{' '}
          <span className="text-slate-200">{draft?.hostName}</span>
        </div>
        <div>
          <span className="font-bold text-slate-500">{t('gameFormatLabel')}:</span>{' '}
          <span className="font-mono text-emerald-300">{draft?.gameFormat}</span>
          <span className="mx-2 text-slate-600">·</span>
          <span className="font-bold text-slate-500">{t('onlineLegsLabel')}:</span>{' '}
          <span className="font-mono text-slate-200">{draft?.legs}</span>
        </div>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="online-guest-name">
          {t('onlinePlayerNameLabel')}
        </label>
        <input
          id="online-guest-name"
          type="text"
          autoComplete="nickname"
          value={guestName}
          onChange={(e) => onGuestNameChange(e.target.value)}
          className={fieldInput}
          placeholder={t('p2Placeholder')}
        />
      </div>
      <button
        type="button"
        disabled={busy || !String(guestName || '').trim()}
        onClick={onConfirm}
        className="w-full py-4 rounded-xl font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 disabled:opacity-40 transition-colors"
      >
        {busy ? t('onlineConnectingToGame') : t('onlineJoinConfirmButton')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600 transition-colors"
      >
        {t('cancel')}
      </button>
    </div>
  );
}
