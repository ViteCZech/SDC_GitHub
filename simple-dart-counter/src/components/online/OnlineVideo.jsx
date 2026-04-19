import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ONLINE_GAMES_COLLECTION } from '../../services/onlineGamesService';
import { translations } from '../../translations';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * WebRTC video (Firebase signalling pod `onlineGames/{gameId}/webrtc/`).
 * @param {{ gameId: string, myRole: 'p1'|'p2', currentPlayer: 'p1'|'p2', localStream?: MediaStream | null, lang?: string }} props
 */
export default function OnlineVideo({ gameId, myRole, currentPlayer, localStream: localStreamProp = null, lang = 'cs' }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const internalStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const unsubscribersRef = useRef([]);
  const iceSeenRef = useRef(new Set());
  const [camError, setCamError] = useState(false);

  useEffect(() => {
    if (!db || !gameId || (myRole !== 'p1' && myRole !== 'p2')) return undefined;

    const gid = String(gameId).trim();
    if (!gid) return undefined;

    const signalRef = doc(db, ONLINE_GAMES_COLLECTION, gid, 'webrtc', 'signal');
    const iceCol = collection(db, ONLINE_GAMES_COLLECTION, gid, 'webrtc', 'signal', 'iceCandidates');
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
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return null;
        }
        internalStreamRef.current = s;
        return s;
      } catch (e) {
        console.warn('OnlineVideo getUserMedia', e);
        setCamError(true);
        return null;
      }
    };

    const attachLocalVideo = (stream) => {
      const el = localVideoRef.current;
      if (el && stream) {
        el.srcObject = stream;
      }
    };

    const attachRemoteVideo = (stream) => {
      const el = remoteVideoRef.current;
      if (el) {
        el.srcObject = stream;
      }
    };

    const run = async () => {
      const local = localStreamProp || (await ensureLocal());
      if (cancelled || !local) return;

      attachLocalVideo(local);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      local.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, local);
        } catch (e) {
          console.warn('OnlineVideo addTrack', e);
        }
      });

      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (stream) {
          remoteStreamRef.current = stream;
          attachRemoteVideo(stream);
        }
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate || cancelled) return;
        void addDoc(iceCol, {
          from: myRole,
          cand: JSON.stringify(ev.candidate.toJSON()),
          createdAt: serverTimestamp(),
        }).catch((e) => console.warn('OnlineVideo ice addDoc', e));
      };

      const applyRemoteIce = async (snap) => {
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
            console.warn('OnlineVideo addIceCandidate', e);
          }
        });
      };

      pushUnsub(
        onSnapshot(iceCol, (snap) => {
          void applyRemoteIce(snap);
        })
      );

      if (myRole === 'p1') {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setDoc(
            signalRef,
            {
              offer: { type: offer.type, sdp: offer.sdp },
              answer: null,
              hostRole: 'p1',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (e) {
          console.warn('OnlineVideo offer', e);
          return;
        }

        pushUnsub(
          onSnapshot(signalRef, async (snap) => {
            if (!snap.exists() || cancelled) return;
            const data = snap.data();
            const ans = data?.answer;
            if (!ans || !ans.sdp || pc.signalingState === 'closed') return;
            if (pc.remoteDescription) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(ans));
            } catch (e) {
              console.warn('OnlineVideo setRemote answer', e);
            }
          })
        );
      } else {
        pushUnsub(
          onSnapshot(signalRef, async (snap) => {
            if (!snap.exists() || cancelled) return;
            const data = snap.data();
            const off = data?.offer;
            if (!off || !off.sdp) return;
            if (pc.signalingState !== 'closed' && !pc.remoteDescription) {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(off));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await updateDoc(signalRef, {
                  answer: { type: answer.type, sdp: answer.sdp },
                  updatedAt: serverTimestamp(),
                });
              } catch (e) {
                console.warn('OnlineVideo answer flow', e);
              }
            }
          })
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
      cleanupPeer();
      if (!localStreamProp) {
        const s = internalStreamRef.current;
        if (s) {
          s.getTracks().forEach((t) => t.stop());
          internalStreamRef.current = null;
        }
      }
      const elL = localVideoRef.current;
      const elR = remoteVideoRef.current;
      if (elL) elL.srcObject = null;
      if (elR) elR.srcObject = null;
    };
  }, [gameId, myRole, localStreamProp]);

  const imThrowing = currentPlayer === myRole;
  const t = (k) => translations[lang]?.[k] || k;

  return (
    <div className="pointer-events-none w-full select-none">
      <div
        className={`relative overflow-hidden rounded-xl border border-slate-700/80 bg-black/40 shadow-lg ${
          imThrowing ? 'aspect-video max-h-[88px]' : 'aspect-video max-h-[min(42vh,220px)]'
        }`}
      >
        <video
          ref={remoteVideoRef}
          playsInline
          autoPlay
          className={`h-full w-full object-cover ${imThrowing ? 'opacity-70' : 'opacity-100'}`}
        />
        <video
          ref={localVideoRef}
          playsInline
          autoPlay
          muted
          className={`absolute bottom-1 right-1 rounded-lg border border-slate-600 object-cover shadow-md ${
            imThrowing ? 'max-h-[38%] max-w-[38%]' : 'max-h-[28%] max-w-[30%]'
          }`}
        />
        {camError && (
          <p className="absolute inset-0 flex items-center justify-center bg-black/60 p-1 text-center text-[9px] font-bold text-amber-200">
            {t('onlineVideoCamDenied') || 'Kamera'}
          </p>
        )}
      </div>
    </div>
  );
}
