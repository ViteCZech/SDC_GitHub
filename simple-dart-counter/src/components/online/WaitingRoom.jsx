import React, { useEffect, useRef, useState } from 'react';
import { VideoOff } from 'lucide-react';
import { subscribeOnlineGame } from '../../services/onlineGamesService';

function stopMediaStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((tr) => tr.stop());
  } catch (e) {
    /* ignore */
  }
}

/**
 * Čekací obrazovka hostitele: kamera, PIN, real-time posluchač až do připojení soupeře.
 */
export default function WaitingRoom({ t, session, onLeave, onOnlineGameStart }) {
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const [cameraError, setCameraError] = useState(false);
  const [pairBanner, setPairBanner] = useState(null);
  const pairHandledRef = useRef(false);

  const stopCamera = () => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch (e) {
        /* ignore */
      }
    }
  };

  useEffect(() => {
    if (session?.role !== 'host') return undefined;
    let alive = true;
    let stream;
    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (!alive) {
          stopMediaStream(stream);
          return;
        }
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraError(false);
      } catch (e) {
        console.warn('online waiting room camera', e);
        if (alive) setCameraError(true);
      }
    };
    run();
    return () => {
      alive = false;
      stopCamera();
    };
  }, [session?.role, session?.gameId]);

  useEffect(() => {
    pairHandledRef.current = false;
    setPairBanner(null);
  }, [session?.gameId]);

  useEffect(() => {
    if (session?.role !== 'host' || !session?.gameId || typeof onOnlineGameStart !== 'function') {
      return undefined;
    }
    let cancelled = false;
    let pairTimer;

    const unsub = subscribeOnlineGame(
      session.gameId,
      (docData) => {
        if (cancelled || pairHandledRef.current || !docData) return;
        if (docData.status === 'playing' && String(docData.guestName || '').trim()) {
          pairHandledRef.current = true;
          stopCamera();
          const name = String(docData.guestName).trim();
          setPairBanner(String(t('onlineOpponentJoined')).replace(/\{name\}/g, name));
          pairTimer = window.setTimeout(() => {
            if (!cancelled) {
              onOnlineGameStart(docData, session.gameId);
            }
          }, 2000);
        }
      },
      () => {}
    );

    return () => {
      cancelled = true;
      if (pairTimer) window.clearTimeout(pairTimer);
      try {
        unsub();
      } catch (e) {
        /* ignore */
      }
    };
  }, [session?.role, session?.gameId, onOnlineGameStart]);

  const showPin = session?.role === 'host' && !session?.isPublic && session?.pin;
  const hint =
    session?.role === 'host' ? t('onlineWaitingHostHint') : t('onlineWaitingGuestHint');

  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto">
      <h2 className="text-lg font-black tracking-widest text-center text-emerald-400 uppercase">
        {t('onlineWaitingTitle')}
      </h2>

      {pairBanner && (
        <div className="rounded-xl border border-emerald-500/60 bg-emerald-950/40 px-4 py-3 text-center text-sm font-black text-emerald-200">
          {pairBanner}
        </div>
      )}

      {session?.role === 'host' && !pairBanner && (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-700 bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-slate-400 text-sm px-4 text-center">
              <VideoOff className="w-10 h-10" />
              {t('onlineCameraDenied')}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 space-y-2 text-sm text-slate-300">
        <div>
          <span className="font-bold text-slate-500">{t('onlineGameHostLabel')}:</span>{' '}
          <span className="font-bold text-white">{session?.hostName}</span>
        </div>
        <div>
          <span className="font-bold text-slate-500">{t('gameFormatLabel')}:</span>{' '}
          <span className="font-mono text-emerald-300">{session?.gameFormat}</span>
        </div>
        <div>
          <span className="font-bold text-slate-500">{t('onlineLegsLabel')}:</span>{' '}
          <span className="font-mono text-white">{session?.legs}</span>
        </div>
        {showPin && (
          <div className="pt-2 border-t border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">
              {t('onlinePinCodeLabel')}
            </div>
            <div className="text-3xl font-black tracking-[0.3em] font-mono text-amber-300">{session.pin}</div>
          </div>
        )}
        <p className="text-xs text-slate-500 pt-1">{hint}</p>
      </div>

      <button
        type="button"
        disabled={!!pairBanner}
        onClick={() => {
          stopCamera();
          onLeave?.();
        }}
        className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-600 transition-colors disabled:opacity-50"
      >
        {t('onlineLeaveWaitingRoom')}
      </button>
    </div>
  );
}
