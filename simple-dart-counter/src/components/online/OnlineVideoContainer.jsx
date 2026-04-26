import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ONLINE_GAMES_COLLECTION, subscribeOnlineGame } from '../../services/onlineGamesService';
import { translations } from '../../translations';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function stopStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
}

function applyLocalMicToStream(stream, muted) {
  if (!stream) return;
  try {
    stream.getAudioTracks().forEach((tr) => {
      tr.enabled = !muted;
    });
  } catch {
    /* ignore */
  }
}

/**
 * WebRTC (signaling pod `onlineGames/{id}/signaling/signal` + `.../signal/iceCandidates` ve Firestore) + dynamické rozvržení podle tahu.
 * Lokální stream z lobby (`useLobbyMedia` → handoff) se nesmí v této komponentě stopovat — vlastník je App.
 *
 * @param {{
 *  onlineGameId: string,
 *  myRole: 'p1'|'p2',
 *  currentPlayer: 'p1'|'p2',
 *  localStream?: MediaStream | null,
 *  lang?: string,
 *  overlay?: { p1Score?: number, p2Score?: number, p1Legs?: number, p2Legs?: number, p1Sets?: number, p2Sets?: number, matchSets?: number },
 *  matchCompleted?: boolean,
 *  isPostMatch?: boolean,
 * }} props
 */
export default function OnlineVideoContainer({
  onlineGameId,
  myRole,
  currentPlayer,
  localStream: localStreamProp = null,
  lang = 'cs',
  overlay = null,
  matchCompleted = false,
  isPostMatch = false,
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const imThrowing = !isPostMatch && currentPlayer === myRole;

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const internalStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const unsubscribersRef = useRef([]);
  const iceSeenRef = useRef(new Set());

  const [camError, setCamError] = useState(false);
  const [localMicMuted, setLocalMicMuted] = useState(false);
  const localMicMutedRef = useRef(false);
  /** Po pádu WebRTC znovu spustit celý signaling stack (nový offer/answer). */
  const [webrtcSessionKey, setWebrtcSessionKey] = useState(0);
  const webrtcReconnectTimerRef = useRef(null);
  const webrtcReconnectAttemptsRef = useRef(0);

  const layout = useMemo(() => {
    if (isPostMatch) {
      return {
        outer: 'relative z-[12] mb-1.5 w-full max-w-3xl shrink-0 self-center sm:mb-2',
        stage:
          'grid h-[min(22vh,168px)] w-full grid-cols-2 gap-2 sm:h-[min(24vh,200px)] sm:gap-3 md:h-[min(26vh,220px)]',
        remote: 'min-h-0 w-full overflow-hidden rounded-xl border border-slate-600/80 bg-black/40 object-cover shadow-lg',
        local:
          'min-h-0 w-full overflow-hidden rounded-xl border border-slate-600/80 bg-black/40 object-cover shadow-lg',
        showOpponentOverlay: false,
      };
    }
    if (imThrowing) {
      return {
        outer: 'relative z-[12] mb-1 w-full shrink-0 sm:mb-2',
        stage: 'relative mx-auto w-full max-w-md',
        remote:
          'relative z-0 aspect-video max-h-[120px] w-full max-w-[min(100%,22rem)] overflow-hidden rounded-2xl border border-slate-700/70 bg-black/50 object-cover shadow-xl sm:max-h-[150px] md:max-h-[170px]',
        local:
          'absolute bottom-1.5 right-1.5 z-10 aspect-video w-[34%] max-w-[7.5rem] overflow-hidden rounded-xl border border-slate-600/90 object-cover shadow-lg sm:bottom-2 sm:right-2 sm:max-w-[9rem]',
        showOpponentOverlay: false,
      };
    }
    return {
      outer: 'pointer-events-none absolute inset-0 z-[8] overflow-hidden rounded-xl sm:rounded-2xl',
      stage: 'absolute inset-0',
      remote: 'absolute inset-0 z-0 h-full w-full object-cover',
      local:
        'absolute bottom-3 right-3 z-10 aspect-video w-[22%] max-w-[8.5rem] overflow-hidden rounded-xl border border-slate-600/90 object-cover shadow-2xl sm:bottom-4 sm:right-4',
      showOpponentOverlay: true,
    };
  }, [imThrowing, isPostMatch]);

  useEffect(() => {
    webrtcReconnectAttemptsRef.current = 0;
  }, [onlineGameId]);

  useEffect(() => {
    localMicMutedRef.current = localMicMuted;
  }, [localMicMuted]);

  useEffect(() => {
    applyLocalMicToStream(localStreamProp, localMicMuted);
    applyLocalMicToStream(internalStreamRef.current, localMicMuted);
  }, [localStreamProp, localMicMuted, webrtcSessionKey]);

  useEffect(() => {
    if (!db || !onlineGameId || (myRole !== 'p1' && myRole !== 'p2') || matchCompleted) return undefined;

    const gid = String(onlineGameId).trim();
    if (!gid) return undefined;

    const signalDocRef = doc(db, ONLINE_GAMES_COLLECTION, gid, 'signaling', 'signal');
    // Kolekce musí mít lichý počet segmentů: ICE pod dokumentem `signal`, ne vedle něj.
    const iceColRef = collection(db, ONLINE_GAMES_COLLECTION, gid, 'signaling', 'signal', 'iceCandidates');

    let cancelled = false;

    const pushUnsub = (u) => {
      unsubscribersRef.current.push(u);
    };

    const cleanupPeer = () => {
      unsubscribersRef.current.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
      unsubscribersRef.current = [];
      iceSeenRef.current = new Set();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          /* ignore */
        }
        pcRef.current = null;
      }
      remoteStreamRef.current = null;
    };

    const ensureLocal = async () => {
      if (localStreamProp) return localStreamProp;
      if (internalStreamRef.current) return internalStreamRef.current;
      if (!navigator.mediaDevices?.getUserMedia) return null;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stopStream(s);
          return null;
        }
        internalStreamRef.current = s;
        return s;
      } catch {
        console.warn('OnlineVideoContainer getUserMedia');
        setCamError(true);
        return null;
      }
    };

    const attachVideo = (el, stream) => {
      if (!el) return;
      try {
        el.srcObject = stream || null;
      } catch {
        /* ignore */
      }
    };

    const run = async () => {
      const local = await ensureLocal();
      if (cancelled || !local) return;

      attachVideo(localVideoRef.current, local);
      applyLocalMicToStream(local, localMicMutedRef.current);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      const scheduleReconnect = () => {
        if (cancelled) return;
        if (webrtcReconnectAttemptsRef.current >= 12) return;
        webrtcReconnectAttemptsRef.current += 1;
        setWebrtcSessionKey((k) => k + 1);
      };

      const clearReconnectTimer = () => {
        if (webrtcReconnectTimerRef.current != null) {
          clearTimeout(webrtcReconnectTimerRef.current);
          webrtcReconnectTimerRef.current = null;
        }
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        const st = pc.connectionState;
        if (st === 'connected' || st === 'connecting') {
          clearReconnectTimer();
          return;
        }
        if (st === 'failed') {
          clearReconnectTimer();
          scheduleReconnect();
          return;
        }
        if (st === 'disconnected') {
          clearReconnectTimer();
          webrtcReconnectTimerRef.current = window.setTimeout(() => {
            webrtcReconnectTimerRef.current = null;
            if (cancelled || pcRef.current !== pc) return;
            const cur = pc.connectionState;
            if (cur === 'disconnected' || cur === 'failed') {
              scheduleReconnect();
            }
          }, 4000);
        }
      };

      local.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, local);
        } catch {
          console.warn('OnlineVideoContainer addTrack');
        }
      });

      pc.ontrack = (ev) => {
        const [stream] = ev.streams || [];
        if (stream) {
          remoteStreamRef.current = stream;
          attachVideo(remoteVideoRef.current, stream);
          const rv = remoteVideoRef.current;
          if (rv) {
            rv.muted = false;
            try {
              rv.volume = 1;
            } catch {
              /* ignore */
            }
          }
        }
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate || cancelled) return;
        void addDoc(iceColRef, {
          from: myRole,
          cand: JSON.stringify(ev.candidate.toJSON()),
          createdAt: serverTimestamp(),
        }).catch(() => console.warn('OnlineVideoContainer ice addDoc'));
      };

      pushUnsub(
        onSnapshot(iceColRef, (snap) => {
          snap.docChanges().forEach(async (ch) => {
            if (ch.type !== 'added') return;
            const d = ch.doc.data();
            if (!d || d.from === myRole) return;
            const id = ch.doc.id;
            if (iceSeenRef.current.has(id)) return;
            iceSeenRef.current.add(id);
            let cand;
            try {
              cand = JSON.parse(d.cand);
            } catch {
              return;
            }
            try {
              if (pc.signalingState !== 'closed') {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            } catch {
              console.warn('OnlineVideoContainer addIceCandidate');
            }
          });
        })
      );

      if (myRole === 'p1') {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setDoc(
            signalDocRef,
            {
              offer: { type: offer.type, sdp: offer.sdp },
              answer: null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {
          console.warn('OnlineVideoContainer offer flow');
          return;
        }

        pushUnsub(
          onSnapshot(signalDocRef, async (snap) => {
            if (!snap.exists() || cancelled) return;
            const data = snap.data();
            const ans = data?.answer;
            if (!ans || !ans.sdp || pc.signalingState === 'closed') return;
            if (pc.remoteDescription) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(ans));
            } catch {
              console.warn('OnlineVideoContainer setRemote answer');
            }
          })
        );
      } else {
        pushUnsub(
          onSnapshot(signalDocRef, async (snap) => {
            if (!snap.exists() || cancelled) return;
            const data = snap.data();
            const off = data?.offer;
            if (!off || !off.sdp) return;
            if (pc.signalingState === 'closed') return;
            if (pc.remoteDescription) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(off));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await updateDoc(signalDocRef, {
                answer: { type: answer.type, sdp: answer.sdp },
                updatedAt: serverTimestamp(),
              });
            } catch {
              console.warn('OnlineVideoContainer answer flow');
            }
          })
        );
      }

      pushUnsub(
        subscribeOnlineGame(gid, (docData) => {
          if (cancelled) return;
          if (docData?.status === 'completed' || docData?.status === 'abandoned') {
            cleanupPeer();
            const s = internalStreamRef.current;
            if (s) {
              stopStream(s);
              internalStreamRef.current = null;
            }
          }
        })
      );
    };

    void run();

    return () => {
      cancelled = true;
      if (webrtcReconnectTimerRef.current != null) {
        clearTimeout(webrtcReconnectTimerRef.current);
        webrtcReconnectTimerRef.current = null;
      }
      cleanupPeer();

      const s = internalStreamRef.current;
      if (s) {
        stopStream(s);
        internalStreamRef.current = null;
      }

      attachVideo(localVideoRef.current, null);
      attachVideo(remoteVideoRef.current, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pc lifecycle podle gameId/role/stream/dokončení
  }, [onlineGameId, myRole, localStreamProp, matchCompleted, webrtcSessionKey]);

  useEffect(() => {
    if (!matchCompleted) return;
    unsubscribersRef.current.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    unsubscribersRef.current = [];
    iceSeenRef.current = new Set();
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    const internal = internalStreamRef.current;
    if (internal) {
      stopStream(internal);
      internalStreamRef.current = null;
    }
    try {
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    } catch {
      /* ignore */
    }
  }, [matchCompleted]);

  if (matchCompleted) {
    return null;
  }

  return (
    <div className={`w-full select-none ${imThrowing ? '' : 'pointer-events-none'}`}>
      <div className={layout.outer}>
        <div className={layout.stage}>
          <video
            ref={remoteVideoRef}
            playsInline
            autoPlay
            muted={false}
            className={`${layout.remote} ${isPostMatch ? 'h-full min-h-0' : ''}`}
          />

          <div className={`relative pointer-events-auto ${layout.local}`}>
            <video
              ref={localVideoRef}
              playsInline
              autoPlay
              muted
              className="h-full min-h-0 w-full object-cover"
            />
            {!isPostMatch && !matchCompleted && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalMicMuted((m) => !m);
                }}
                title={localMicMuted ? t('onlineLocalMicUnmuteTitle') : t('onlineLocalMicMuteTitle')}
                aria-label={localMicMuted ? t('onlineLocalMicUnmuteTitle') : t('onlineLocalMicMuteTitle')}
                className="absolute bottom-1 left-1 z-30 rounded-full border border-white/15 bg-black/45 p-1.5 text-white/90 shadow-md backdrop-blur-sm transition-colors hover:bg-black/55 sm:bottom-1.5 sm:left-1.5 sm:p-2"
              >
                {localMicMuted ? <MicOff className="h-4 w-4 sm:h-[1.15rem] sm:w-[1.15rem]" /> : <Mic className="h-4 w-4 sm:h-[1.15rem] sm:w-[1.15rem]" />}
              </button>
            )}
          </div>

          {layout.showOpponentOverlay && (
            <div className="absolute inset-0 z-[6] flex flex-col justify-between bg-gradient-to-b from-black/45 via-transparent to-black/50 p-2 sm:p-3">
              <div className="self-start rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur-md sm:px-3 sm:py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-200 sm:text-xs">
                  {t('onlineOpponentThrowing')}
                </p>
              </div>
              {overlay && (
                <div className="self-end rounded-2xl border border-white/10 bg-black/40 px-2.5 py-1.5 text-right backdrop-blur-md sm:px-3 sm:py-2">
                  <div className="text-[10px] font-black tracking-widest text-slate-200 sm:text-xs">
                    {overlay.matchSets && overlay.matchSets > 1 ? (
                      <>
                        <span className="text-emerald-300">
                          SETS {overlay.p1Sets || 0} – {overlay.p2Sets || 0}
                        </span>
                        <span className="mx-2 text-white/20">|</span>
                        <span className="text-yellow-300">
                          LEGS {overlay.p1Legs || 0} – {overlay.p2Legs || 0}
                        </span>
                      </>
                    ) : (
                      <span className="text-yellow-300">
                        LEGS {overlay.p1Legs || 0} – {overlay.p2Legs || 0}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline justify-end gap-2 font-mono font-black text-white sm:gap-3">
                    <span className="text-lg sm:text-2xl">{overlay.p1Score ?? ''}</span>
                    <span className="text-white/30">:</span>
                    <span className="text-lg sm:text-2xl">{overlay.p2Score ?? ''}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {camError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-2">
            <p className="text-center text-[10px] font-bold text-amber-200 sm:text-xs">
              {t('onlineVideoCamDenied')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

