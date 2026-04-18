import React, { useEffect, useRef, useState } from 'react';
import { VideoOff } from 'lucide-react';

const fieldLabel = 'block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5';
const fieldInput =
  'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60';

function stopStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((tr) => tr.stop());
  } catch (e) {
    /* ignore */
  }
}

/**
 * Zadání jména + kamera před zápisem join do Firebase.
 */
export default function GuestJoinPanel({ t, draft, guestName, onGuestNameChange, onConfirm, onCancel, busy }) {
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      setCameraError(false);
      setCameraReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings?.() || {};
        const curId = settings.deviceId || '';
        setSelectedDeviceId(curId);

        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter((d) => d.kind === 'videoinput');
        setVideoInputs(inputs);
        if (!curId && inputs[0]?.deviceId) {
          setSelectedDeviceId(inputs[0].deviceId);
        }
        setCameraReady(true);
      } catch (e) {
        console.warn('GuestJoinPanel camera', e);
        if (!cancelled) {
          setCameraError(true);
          setCameraReady(false);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      stopStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = null;
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, []);

  const handleDeviceChange = async (deviceId) => {
    if (!deviceId || busy) return;
    setSelectedDeviceId(deviceId);
    stopStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError(false);
      setCameraReady(true);
    } catch (e) {
      console.warn('GuestJoinPanel switch camera', e);
      setCameraError(true);
      setCameraReady(false);
    }
  };

  const canJoin = cameraReady && !busy && String(guestName || '').trim().length > 0;

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
        <label className={fieldLabel} htmlFor="online-guest-cam-source">
          {t('onlineCameraSourceLabel')}
        </label>
        {videoInputs.length > 0 ? (
          <select
            id="online-guest-cam-source"
            className={fieldInput}
            value={selectedDeviceId || videoInputs[0]?.deviceId || ''}
            disabled={busy}
            onChange={(e) => handleDeviceChange(e.target.value)}
          >
            {videoInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId || 'Camera'}
              </option>
            ))}
          </select>
        ) : (
          <div className={fieldInput}>{t('onlineCameraEnumerating')}</div>
        )}
        <p className="mt-1 text-[10px] text-slate-500">{t('onlineCameraRequiredHint')}</p>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-700 bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {(cameraError || !cameraReady) && !busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-slate-400 text-xs px-3 text-center">
            <VideoOff className="w-8 h-8" />
            {cameraError ? t('onlineCameraDenied') : t('onlineCameraRequiredHint')}
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
