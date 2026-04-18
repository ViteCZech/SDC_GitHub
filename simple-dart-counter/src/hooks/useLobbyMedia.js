import { useCallback, useEffect, useRef, useState } from 'react';

function stopStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((tr) => tr.stop());
  } catch (e) {
    /* ignore */
  }
}

function buildVideoConstraint(selectedVideoId) {
  if (selectedVideoId) return { deviceId: { exact: selectedVideoId } };
  return { facingMode: 'user' };
}

/**
 * Stav a náhled kamery + mikrofonu v online lobby (host / host před join).
 * @param {{ t: (k: string) => string; active: boolean }} opts active = false zastaví stream a vyčistí náhled
 */
export function useLobbyMedia({ t, active }) {
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [videoInputs, setVideoInputs] = useState([]);
  const [audioInputs, setAudioInputs] = useState([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [mediaErrorVideo, setMediaErrorVideo] = useState(null);
  const [mediaErrorAudio, setMediaErrorAudio] = useState(null);
  const [previewReady, setPreviewReady] = useState(false);

  const stopAll = useCallback(() => {
    stopStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setMediaStream(null);
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch (e) {
        /* ignore */
      }
    }
  }, []);

  /** Předání streamu do hry bez stopnutí tracků (zabrání stopnutí při unmountu lobby). */
  const handoffStream = useCallback(() => {
    const s = mediaStreamRef.current;
    mediaStreamRef.current = null;
    setMediaStream(null);
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch (e) {
        /* ignore */
      }
    }
    setPreviewReady(false);
    return s;
  }, []);

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) {
      stopStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      setMediaStream(null);
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = null;
        } catch (e) {
          /* ignore */
        }
      }
      setPreviewReady(false);
      return undefined;
    }

    let cancelled = false;
    const errVideo = t('onlineMediaSwitchError');
    const errAudio = t('onlineMediaSwitchError');

    const attachAndEnumerate = async (stream) => {
      if (cancelled) {
        stopStream(stream);
        return;
      }
      mediaStreamRef.current = stream;
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      setVideoInputs(all.filter((d) => d.kind === 'videoinput'));
      setAudioInputs(all.filter((d) => d.kind === 'audioinput'));

      const vTrack = stream.getVideoTracks()[0];
      const aTrack = stream.getAudioTracks()[0];
      const vId = vTrack?.getSettings?.()?.deviceId || '';
      const aId = aTrack?.getSettings?.()?.deviceId || '';

      setSelectedVideoId((prev) => (!prev && vId ? vId : prev));
      setSelectedAudioId((prev) => {
        if (prev) return prev;
        if (aId) return aId;
        return prev;
      });

      setPreviewReady(!!vTrack && vTrack.readyState === 'live');
    };

    const run = async () => {
      setMediaErrorVideo(null);
      setMediaErrorAudio(null);
      setPreviewReady(false);
      stopStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = null;
        } catch (e) {
          /* ignore */
        }
      }

      const videoConstraint = buildVideoConstraint(selectedVideoId);
      const withAudio = {
        video: videoConstraint,
        audio:
          includeAudio && selectedAudioId
            ? { deviceId: { exact: selectedAudioId } }
            : includeAudio
              ? true
              : false,
      };
      const videoOnly = {
        video: videoConstraint,
        audio: false,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(withAudio);
        await attachAndEnumerate(stream);
      } catch (e) {
        console.warn('useLobbyMedia getUserMedia', e);
        if (cancelled) return;
        if (includeAudio && withAudio.audio !== false) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia(videoOnly);
            setIncludeAudio(false);
            setMediaErrorAudio(errAudio);
            setMediaErrorVideo(null);
            await attachAndEnumerate(stream);
          } catch (e2) {
            console.warn('useLobbyMedia getUserMedia video-only', e2);
            if (!cancelled) {
              setMediaErrorVideo(errVideo);
              setMediaErrorAudio(null);
              setPreviewReady(false);
            }
          }
        } else {
          setMediaErrorVideo(errVideo);
          setMediaErrorAudio(null);
          setPreviewReady(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      setMediaStream(null);
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = null;
        } catch (e) {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` jen pro text chyby; nechceme restartovat stream při změně jazyka
  }, [active, selectedVideoId, selectedAudioId, includeAudio]);

  return {
    videoRef,
    mediaStream,
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
  };
}