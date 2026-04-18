import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ONLINE_GAMES_COLLECTION, subscribeOnlineGame } from '../../services/onlineGamesService';
import { translations } from '../../translations';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function stopStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    /* ignore */
  }
}

/**
 * WebRTC container + dynamické škálování UI podle toho, kdo hází.
 * @param {{
 *  onlineGameId: string,
 *  myRole: 'p1'|'p2',
 *  currentPlayer: 'p1'|'p2',
 *  localStream?: MediaStream | null,
 *  lang?: string,
 *  overlay?: { p1Score?: number, p2Score?: number, p1Legs?: number, p2Legs?: number, p1Sets?: number, p2Sets?: number, matchSets?: number },
 *  matchCompleted?: boolean,
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
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const imThrowing = currentPlayer === myRole;

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const internalStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const unsubscribersRef = useRef([]);
  const iceSeenRef = useRef(new Set());

  const [camError, setCamError] = useState(false);

  const layout = useMemo(() => {
    if (imThrowing) {
      return {
        container: 'h-[110px] sm:h-[130px] md:h-[150px]',
        remoteVideo: 'opacity-95',
        localPiP: 'max-h-[52%] max-w-[42%] sm:max-h-[56%] sm:max-w-[38%]',
        showOpponentOverlay: false,
      };
    }
    return {
      container: 'h-[180px] sm:h-[220px] md:h-[260px]',
      remoteVideo: 'opacity-100',
      localPiP: 'max-h-[30%] max-w-[30%] sm:max-h-[30%] sm:max-w-[26%]',
      showOpponentOverlay: true,
    };
  }, [imThrowing]);

  useEffect(() => {
    if (!db || !onlineGameId || (myRole !== 'p1' && myRole !== 'p2')) return undefined;

    const gid = String(onlineGameId).trim();
    if (!gid) return undefined;

    const signalDocRef = doc(db, ONLINE_GAMES_COLLECTION, gid, 'signaling', 'signal');
    const iceColRef = collection(db, ONLINE_GAMES_COLLECTION, gid, 'signaling', 'iceCandidates');

    let cancelled = false;

    const pushUnsub = (u) => {
      unsubscribersRef.current.push(u);
    };

    const cleanupPeer = () => {
      unsubscribersRef.current.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          /* ignore */
        }
      });
      unsubscribersRef.current = [];
      iceSeenRef.current = new Set();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {
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
      } catch (e) {
        console.warn('OnlineVideoContainer getUserMedia', e);
        setCamError(true);
        return null;
      }
    };

    const attachVideo = (el, stream) => {
      if (!el) return;
      try {
        el.srcObject = stream || null;
      } catch (e) {
        /* ignore */
      }
    };

    const run = async () => {
      const local = await ensureLocal();
      if (cancelled || !local) return;

      attachVideo(localVideoRef.current, local);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      local.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, local);
        } catch (e) {
          console.warn('OnlineVideoContainer addTrack', e);
        }
      });

      pc.ontrack = (ev) => {
        const [stream] = ev.streams || [];
        if (stream) {
          remoteStreamRef.current = stream;
          attachVideo(remoteVideoRef.current, stream);
        }
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate || cancelled) return;
        void addDoc(iceColRef, {
          from: myRole,
          cand: JSON.stringify(ev.candidate.toJSON()),
          createdAt: serverTimestamp(),
        }).catch((e) => console.warn('OnlineVideoContainer ice addDoc', e));
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
            } catch (e) {
              return;
            }
            try {
              if (pc.signalingState !== 'closed') {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            } catch (e) {
              console.warn('OnlineVideoContainer addIceCandidate', e);
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
        } catch (e) {
          console.warn('OnlineVideoContainer offer flow', e);
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
            } catch (e) {
              console.warn('OnlineVideoContainer setRemote answer', e);
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
            } catch (e) {
              console.warn('OnlineVideoContainer answer flow', e);
            }
          })
        );
      }

      pushUnsub(
        subscribeOnlineGame(gid, (docData) => {
          if (cancelled) return;
          if (docData?.status === 'completed') {
            cleanupPeer();
            const s = internalStreamRef.current;
            if (s) {
              stopStream(s);
              internalStreamRef.current = null;
            }
            if (localStreamProp) {
              stopStream(localStreamProp);
            }
          }
        })
      );
    };

    void run();

    return () => {
      cancelled = true;
      cleanupPeer();

      const s = internalStreamRef.current;
      if (s) {
        stopStream(s);
        internalStreamRef.current = null;
      }
      if (localStreamProp) {
        stopStream(localStreamProp);
      }

      attachVideo(localVideoRef.current, null);
      attachVideo(remoteVideoRef.current, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pc lifecycle podle gameId/role/stream
  }, [onlineGameId, myRole, localStreamProp]);

  useEffect(() => {
    if (matchCompleted) {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {
          /* ignore */
        }
      }
      pcRef.current = null;
    }
  }, [matchCompleted]);

  return (
    <div className="pointer-events-none w-full select-none">
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-slate-700/70 bg-black/40 shadow-2xl ${layout.container}`}
      >
        <video
          ref={remoteVideoRef}
          playsInline
          autoPlay
          className={`h-full w-full object-cover ${layout.remoteVideo}`}
        />

        <video
          ref={localVideoRef}
          playsInline
          autoPlay
          muted
          className={`absolute bottom-2 right-2 rounded-xl border border-slate-600/80 object-cover shadow-lg ${layout.localPiP}`}
        />

        {layout.showOpponentOverlay && (
          <div className="absolute inset-0 flex flex-col justify-between p-3">
            <div className="self-start rounded-xl bg-black/40 backdrop-blur-sm px-3 py-2 border border-white/10">
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-200">
                {t('onlineOpponentThrowing')}
              </p>
            </div>
            {overlay && (
              <div className="self-end rounded-2xl bg-black/40 backdrop-blur-sm px-3 py-2 border border-white/10 text-right">
                <div className="text-[10px] sm:text-xs font-black tracking-widest text-slate-200">
                  {overlay.matchSets && overlay.matchSets > 1 ? (
                    <>
                      <span className="text-emerald-300">SETS {overlay.p1Sets || 0} – {overlay.p2Sets || 0}</span>
                      <span className="mx-2 text-white/20">|</span>
                      <span className="text-yellow-300">LEGS {overlay.p1Legs || 0} – {overlay.p2Legs || 0}</span>
                    </>
                  ) : (
                    <span className="text-yellow-300">LEGS {overlay.p1Legs || 0} – {overlay.p2Legs || 0}</span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline justify-end gap-3 font-mono font-black text-white">
                  <span className="text-xl sm:text-2xl">{overlay.p1Score ?? ''}</span>
                  <span className="text-white/30">:</span>
                  <span className="text-xl sm:text-2xl">{overlay.p2Score ?? ''}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {camError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-2">
            <p className="text-center text-[10px] sm:text-xs font-bold text-amber-200">
              {t('onlineVideoCamDenied')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

