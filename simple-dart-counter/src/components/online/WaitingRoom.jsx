import React, { useEffect, useRef, useState } from 'react';
import { VideoOff } from 'lucide-react';
import { cancelOnlineGame, subscribeOnlineGame, updateHeartbeat } from '../../services/onlineGamesService';
import { useLobbyMedia } from '../../hooks/useLobbyMedia';

const fieldLabel = 'block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5';
const fieldInput =
  'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60';

/**
 * Čekací obrazovka hostitele: kamera, mikrofon, PIN, real-time posluchač až do připojení soupeře.
 * Výběr zařízení zůstává viditelný po celou dobu v lobby; stream se uvolní až při odchodu / startu hry.
 */
export default function WaitingRoom({
  t,
  session,
  onLeave,
  onOnlineGameStart,
  hideFooterLeave = false,
  onHostWaitingHeaderState,
}) {
  const pairHandledRef = useRef(false);
  const lastStatusRef = useRef(null);
  const lastPlayingDocRef = useRef(null);
  const startingGameRef = useRef(false);
  const onStartRef = useRef(onOnlineGameStart);
  const handoffRef = useRef(null);
  const onLeaveRef = useRef(onLeave);
  const tRef = useRef(t);
  const [pairBanner, setPairBanner] = useState(null);

  onStartRef.current = onOnlineGameStart;
  onLeaveRef.current = onLeave;
  tRef.current = t;

  const isHost = session?.role === 'host';
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
  } = useLobbyMedia({ t, active: isHost });

  handoffRef.current = handoffStream;

  const enterGameNow = (docData) => {
    if (startingGameRef.current) return;
    const data = docData || lastPlayingDocRef.current;
    if (!data || !session?.gameId) return;
    startingGameRef.current = true;
    const start = onStartRef.current;
    if (typeof start === 'function') {
      start(data, session.gameId, typeof handoffRef.current === 'function' ? handoffRef.current() : null);
    }
  };

  useEffect(() => {
    pairHandledRef.current = false;
    startingGameRef.current = false;
    lastPlayingDocRef.current = null;
    lastStatusRef.current = null;
    setPairBanner(null);
  }, [session?.gameId]);

  useEffect(() => {
    if (!isHost || !session?.gameId) {
      return undefined;
    }
    let cancelled = false;
    let pairTimer;

    const unsub = subscribeOnlineGame(
      session.gameId,
      (docData) => {
        if (cancelled || !docData || startingGameRef.current) return;
        lastStatusRef.current = docData.status ?? null;
        if (docData.status === 'playing' && String(docData.guestName || '').trim()) {
          lastPlayingDocRef.current = docData;
          if (pairHandledRef.current) return;
          pairHandledRef.current = true;
          const name = String(docData.guestName).trim();
          setPairBanner(String(tRef.current('onlineOpponentJoined')).replace(/\{name\}/g, name));
          pairTimer = window.setTimeout(() => {
            if (cancelled || startingGameRef.current) return;
            enterGameNow(docData);
          }, 2000);
        }
      },
      () => {}
    );

    return () => {
      cancelled = true;
      // Nezrušovat timer, pokud už přecházíme do hry — jinak hostitel zůstane v čekárně.
      if (pairTimer && !startingGameRef.current) {
        window.clearTimeout(pairTimer);
      }
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
    // Callbacky a t přes refs — nestabilní props nesmí restartovat subscribe / zrušit start.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only resubscribe on game id
  }, [isHost, session?.gameId]);

  // Heartbeat hostitele i ve waiting (aby lobby mohla filtrovat mrtvé hry).
  useEffect(() => {
    if (!isHost || !session?.gameId) return undefined;
    const tick = () => {
      void updateHeartbeat(session.gameId, 'p1').catch((e) => console.warn('updateHeartbeat(waiting)', e));
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [isHost, session?.gameId]);

  // Cleanup on unmount: host opustí waiting room → hru zneplatnit (a/nebo smazat).
  useEffect(() => {
    if (!isHost || !session?.gameId) return undefined;
    const gid = session.gameId;
    return () => {
      if (startingGameRef.current) return;
      const st = lastStatusRef.current;
      if (st === 'waiting') {
        void cancelOnlineGame(gid).catch(() => console.warn('cancelOnlineGame(unmount)'));
      }
    };
  }, [isHost, session?.gameId]);

  useEffect(() => {
    if (!onHostWaitingHeaderState) return undefined;
    onHostWaitingHeaderState({
      leaveDisabled: !!pairBanner,
      leave: () => {
        if (pairBanner) return;
        stopAll();
        onLeaveRef.current?.();
      },
    });
    return () => onHostWaitingHeaderState(null);
  }, [pairBanner, stopAll, onHostWaitingHeaderState]);

  const showPin = isHost && !session?.isPublic && session?.pin;
  const hint = isHost ? t('onlineWaitingHostHint') : t('onlineWaitingGuestHint');

  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto">
      <h2 className="text-lg font-black tracking-widest text-center text-emerald-400 uppercase">
        {t('onlineWaitingTitle')}
      </h2>

      {pairBanner && (
        <div className="rounded-xl border border-emerald-500/60 bg-emerald-950/40 px-4 py-3 text-center space-y-3">
          <p className="text-sm font-black text-emerald-200">{pairBanner}</p>
          <button
            type="button"
            onClick={() => enterGameNow()}
            className="w-full py-3 rounded-xl font-black uppercase tracking-wider text-sm bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
          >
            {t('onlineEnterGameNow')}
          </button>
        </div>
      )}

      {isHost && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={fieldLabel} htmlFor="online-host-video-source">
              {t('onlineCameraSourceLabel')}
            </label>
            <select
              id="online-host-video-source"
              className={fieldInput}
              value={selectedVideoId}
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
            <label className={fieldLabel} htmlFor="online-host-audio-source">
              {t('onlineAudioSourceLabel')}
            </label>
            <select
              id="online-host-audio-source"
              className={fieldInput}
              value={selectedAudioId}
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
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-700 bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            {!previewReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/85 text-slate-400 text-xs px-3 text-center">
                <VideoOff className="w-8 h-8" />
                <span>{mediaErrorVideo ? t('onlineCameraRequiredHint') : t('onlineCameraEnumerating')}</span>
              </div>
            )}
          </div>
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

      {!hideFooterLeave && (
        <button
          type="button"
          disabled={!!pairBanner}
          onClick={() => {
            stopAll();
            onLeave?.();
          }}
          className="w-full py-3 rounded-xl font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-600 transition-colors disabled:opacity-50"
        >
          {t('onlineLeaveWaitingRoom')}
        </button>
      )}
    </div>
  );
}
