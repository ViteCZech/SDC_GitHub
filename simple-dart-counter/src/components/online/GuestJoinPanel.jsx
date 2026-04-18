import React from 'react';
import { VideoOff } from 'lucide-react';
import { useLobbyMedia } from '../../hooks/useLobbyMedia';

const fieldLabel = 'block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5';
const fieldInput =
  'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60';

/**
 * Zadání jména + náhled kamery/mikrofonu před zápisem join do Firebase.
 */
export default function GuestJoinPanel({ t, draft, guestName, onGuestNameChange, onConfirm, onCancel, busy }) {
  const {
    videoRef,
    handoffStream,
    videoInputs,
    audioInputs,
    selectedVideoId,
    setSelectedVideoId,
    selectedAudioId,
    setSelectedAudioId,
    setIncludeAudio,
    mediaErrorVideo,
    mediaErrorAudio,
    previewReady,
    stopAll,
  } = useLobbyMedia({ t, active: true });

  const canJoin = previewReady && !busy && String(guestName || '').trim().length > 0;

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
        <label className={fieldLabel} htmlFor="online-guest-video-source">
          {t('onlineCameraSourceLabel')}
        </label>
        <select
          id="online-guest-video-source"
          className={fieldInput}
          value={selectedVideoId}
          disabled={busy}
          onChange={(e) => setSelectedVideoId(e.target.value)}
        >
          {videoInputs.length === 0 ? (
            <option value="">{t('onlineCameraEnumerating')}</option>
          ) : (
            videoInputs.map((d) => (
              <option key={d.deviceId || d.label} value={d.deviceId}>
                {d.label || d.deviceId || 'Camera'}
              </option>
            ))
          )}
        </select>
        {mediaErrorVideo && (
          <p className="mt-1.5 text-xs font-semibold text-amber-400" role="alert">
            {mediaErrorVideo}
          </p>
        )}
      </div>

      <div>
        <label className={fieldLabel} htmlFor="online-guest-audio-source">
          {t('onlineAudioSourceLabel')}
        </label>
        <select
          id="online-guest-audio-source"
          className={fieldInput}
          value={selectedAudioId}
          disabled={busy}
          onChange={(e) => {
            setIncludeAudio(true);
            setSelectedAudioId(e.target.value);
          }}
        >
          {audioInputs.length === 0 ? (
            <option value="">{t('onlineCameraEnumerating')}</option>
          ) : (
            audioInputs.map((d) => (
              <option key={d.deviceId || d.label} value={d.deviceId}>
                {d.label || d.deviceId || 'Microphone'}
              </option>
            ))
          )}
        </select>
        {mediaErrorAudio && (
          <p className="mt-1.5 text-xs font-semibold text-amber-400" role="alert">
            {mediaErrorAudio}
          </p>
        )}
        <p className="mt-1 text-[10px] text-slate-500">{t('onlineCameraRequiredHint')}</p>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-700 bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {!previewReady && !busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/85 text-slate-400 text-xs px-3 text-center">
            <VideoOff className="w-8 h-8" />
            <span>{mediaErrorVideo ? t('onlineCameraRequiredHint') : t('onlineCameraEnumerating')}</span>
          </div>
        )}
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
        disabled={!canJoin}
        onClick={() => onConfirm?.(handoffStream())}
        className="w-full py-4 rounded-xl font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 disabled:opacity-40 transition-colors"
      >
        {busy ? t('onlineConnectingToGame') : t('onlineJoinConfirmButton')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          stopAll();
          onCancel?.();
        }}
        className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600 transition-colors"
      >
        {t('cancel')}
      </button>
    </div>
  );
}
