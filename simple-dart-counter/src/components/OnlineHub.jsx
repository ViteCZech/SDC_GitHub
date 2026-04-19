import React, { useCallback, useEffect, useState } from 'react';
import { db } from '../firebase';
import HostSetupForm from './online/HostSetupForm';
import PublicGamesList from './online/PublicGamesList';
import WaitingRoom from './online/WaitingRoom';
import GuestJoinPanel from './online/GuestJoinPanel';
import {
  createOnlineGame,
  findWaitingGameByPin,
  joinOnlineGame,
  ONLINE_AUTH_FAILED,
  ONLINE_JOIN_ERROR_GUEST_NAME,
  ONLINE_JOIN_ERROR_NOT_AVAILABLE,
  subscribePublicWaitingGames,
} from '../services/onlineGamesService';
import { persistLastOnlineSession, clearLastOnlineSession } from '../online/onlineReconnectStorage';

const tabBtn =
  'flex-1 py-3 text-center text-xs font-black uppercase tracking-widest rounded-xl border transition-colors';
const tabActive = ' bg-emerald-600 text-white border-emerald-500';
const tabIdle = ' bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200';

const pinInputClass =
  'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500/60';

function suggestGuestNameFromSettings(settings) {
  const n = String(settings?.p2Name || '').trim();
  if (!n) return '';
  const low = n.toLowerCase();
  const defaults = ['hosté', 'hoste', 'away', 'goście', 'goscie', 'robot', 'bot'];
  if (defaults.includes(low)) return '';
  return n;
}

function mapJoinError(err, t) {
  const code = err?.message;
  if (code === ONLINE_JOIN_ERROR_NOT_AVAILABLE) return t('onlineJoinGameUnavailable');
  if (code === ONLINE_JOIN_ERROR_GUEST_NAME) return t('onlineGuestNameRequired');
  if (code === 'no_db') return t('onlineErrorNoDb');
  if (code === ONLINE_AUTH_FAILED) return t('onlineErrorAuthFailed');
  return t('onlineJoinGameUnavailable');
}

/**
 * Online lobby: záložky Založit / Najít, Firebase čekárna a veřejný seznam her.
 */
export default function OnlineHub({
  t,
  settings,
  onOnlineGameStart,
  resumeHostWaitingSession = null,
  onResumeHostWaitingConsumed,
  onLobbyChromeChange = null,
}) {
  const [tab, setTab] = useState('host');
  const [waitingSession, setWaitingSession] = useState(null);
  const [guestJoinDraft, setGuestJoinDraft] = useState(null);
  const [guestNameInput, setGuestNameInput] = useState('');
  const [publicGames, setPublicGames] = useState([]);
  const [listError, setListError] = useState(false);
  const [hostBusy, setHostBusy] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [joinPrivateBusy, setJoinPrivateBusy] = useState(false);
  const [joinBusyId, setJoinBusyId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [guestJoinBusy, setGuestJoinBusy] = useState(false);
  const [hostWaitingHeader, setHostWaitingHeader] = useState(null);
  const [guestJoinHeader, setGuestJoinHeader] = useState(null);

  const startOnlineGame = useCallback(
    (gameData, gameId, myRole, localStream = null) => {
      if (typeof onOnlineGameStart === 'function') {
        onOnlineGameStart(gameData, gameId, myRole, localStream);
      }
    },
    [onOnlineGameStart]
  );

  useEffect(() => {
    if (!resumeHostWaitingSession?.gameId) return;
    setWaitingSession({
      role: 'host',
      gameId: resumeHostWaitingSession.gameId,
      pin: resumeHostWaitingSession.pin ?? null,
      hostName: resumeHostWaitingSession.hostName,
      gameFormat: resumeHostWaitingSession.gameFormat,
      legs: resumeHostWaitingSession.legs,
      isPublic: !!resumeHostWaitingSession.isPublic,
    });
    if (typeof onResumeHostWaitingConsumed === 'function') {
      onResumeHostWaitingConsumed();
    }
  }, [resumeHostWaitingSession, onResumeHostWaitingConsumed]);

  useEffect(() => {
    if (tab !== 'join') return undefined;
    const unsub = subscribePublicWaitingGames(
      (list) => {
        setPublicGames(list);
        setListError(false);
      },
      () => setListError(true)
    );
    return () => unsub();
  }, [tab]);

  useEffect(() => {
    if (typeof onLobbyChromeChange !== 'function') return undefined;
    if (waitingSession?.role === 'host') {
      onLobbyChromeChange({
        secondary: {
          kind: 'leave',
          title: t('onlineLeaveWaitingRoom'),
          disabled: !!hostWaitingHeader?.leaveDisabled,
          onClick: () => hostWaitingHeader?.leave?.(),
        },
      });
    } else if (guestJoinDraft) {
      onLobbyChromeChange({
        secondary: {
          kind: 'cancel',
          title: t('cancel'),
          disabled: !!guestJoinHeader?.cancelDisabled,
          onClick: () => guestJoinHeader?.cancel?.(),
        },
      });
    } else {
      onLobbyChromeChange(null);
    }
    return () => {
      if (typeof onLobbyChromeChange === 'function') onLobbyChromeChange(null);
    };
  }, [
    onLobbyChromeChange,
    waitingSession,
    guestJoinDraft,
    hostWaitingHeader,
    guestJoinHeader,
    t,
  ]);

  const defaultHostName = settings?.p1Name || '';

  const openHostWaiting = (payload) => {
    setGuestJoinDraft(null);
    persistLastOnlineSession(payload.gameId, 'p1');
    setWaitingSession({
      role: 'host',
      gameId: payload.gameId,
      pin: payload.pin ?? null,
      hostName: payload.hostName,
      gameFormat: payload.gameFormat,
      legs: payload.legs,
      isPublic: payload.isPublic,
    });
  };

  const openGuestJoinDraft = (row) => {
    setWaitingSession(null);
    setFormError(null);
    setGuestJoinDraft({
      gameId: row.id,
      hostName: row.hostName,
      gameFormat: row.gameFormat,
      legs: row.legs,
      gameType: row.gameType,
      startScore: row.startScore,
      outMode: row.outMode,
      isPublic: row.isPublic,
    });
    setGuestNameInput(suggestGuestNameFromSettings(settings));
  };

  const handleHostSubmit = async (form) => {
    setFormError(null);
    setHostBusy(true);
    try {
      const created = await createOnlineGame(form);
      openHostWaiting({
        gameId: created.gameId,
        pin: created.pin,
        hostName: created.hostName,
        gameFormat: created.gameFormat,
        legs: created.legs,
        isPublic: created.isPublic,
      });
    } catch (e) {
      console.error(e);
      setFormError(
        e?.message === 'no_db'
          ? t('onlineErrorNoDb')
          : e?.message === ONLINE_AUTH_FAILED
            ? t('onlineErrorAuthFailed')
            : String(e?.message || 'error')
      );
    } finally {
      setHostBusy(false);
    }
  };

  const handleJoinPrivate = async () => {
    setFormError(null);
    setJoinPrivateBusy(true);
    try {
      const game = await findWaitingGameByPin(pinInput);
      if (!game) {
        setFormError(t('onlineGameNotFound'));
        return;
      }
      openGuestJoinDraft(game);
      setPinInput('');
    } catch (e) {
      console.error(e);
      setFormError(t('onlineGameNotFound'));
    } finally {
      setJoinPrivateBusy(false);
    }
  };

  const handleJoinPublicRow = (g) => {
    setFormError(null);
    setJoinBusyId(g.id);
    try {
      openGuestJoinDraft(g);
    } finally {
      setJoinBusyId(null);
    }
  };

  const handleGuestJoinConfirm = async (localStream = null) => {
    if (!guestJoinDraft?.gameId) return;
    const name = String(guestNameInput || '').trim();
    if (!name) {
      setFormError(t('onlineGuestNameRequired'));
      return;
    }
    setFormError(null);
    setGuestJoinBusy(true);
    try {
      const gid = guestJoinDraft.gameId;
      const merged = await joinOnlineGame(gid, name);
      setGuestJoinDraft(null);
      startOnlineGame(merged, gid, 'p2', localStream);
    } catch (e) {
      console.error(e);
      setFormError(mapJoinError(e, t));
    } finally {
      setGuestJoinBusy(false);
    }
  };

  if (waitingSession?.role === 'host') {
    return (
      <WaitingRoom
        t={t}
        session={waitingSession}
        hideFooterLeave
        onHostWaitingHeaderState={setHostWaitingHeader}
        onLeave={() => {
          clearLastOnlineSession();
          setWaitingSession(null);
        }}
        onOnlineGameStart={(doc, gid, localStream) => startOnlineGame(doc, gid, 'p1', localStream)}
      />
    );
  }

  if (guestJoinDraft) {
    return (
      <GuestJoinPanel
        t={t}
        draft={guestJoinDraft}
        guestName={guestNameInput}
        onGuestNameChange={setGuestNameInput}
        onConfirm={handleGuestJoinConfirm}
        hideFooterCancel
        onGuestJoinHeaderState={setGuestJoinHeader}
        onCancel={() => {
          setGuestJoinDraft(null);
          setFormError(null);
        }}
        busy={guestJoinBusy}
      />
    );
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-4 mx-auto">
      <div className="flex gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-1">
        <button
          type="button"
          className={`${tabBtn}${tab === 'host' ? tabActive : tabIdle}`}
          onClick={() => {
            setTab('host');
            setFormError(null);
            setListError(false);
          }}
        >
          {t('onlineHostTab')}
        </button>
        <button
          type="button"
          className={`${tabBtn}${tab === 'join' ? tabActive : tabIdle}`}
          onClick={() => {
            setTab('join');
            setFormError(null);
            setListError(false);
          }}
        >
          {t('onlineJoinTab')}
        </button>
      </div>

      {formError && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {formError}
        </div>
      )}

      {tab === 'host' && (
        <HostSetupForm
          t={t}
          defaultHostName={defaultHostName}
          onSubmit={handleHostSubmit}
          busy={hostBusy}
        />
      )}

      {tab === 'join' && (
        <div className="flex flex-col gap-6">
          {!db && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
              {t('onlineErrorNoDb')}
            </p>
          )}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              {t('onlinePrivatePinHeading')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={pinInputClass}
              placeholder={t('enterPinPlaceholder')}
            />
            <button
              type="button"
              disabled={joinPrivateBusy || pinInput.length !== 4}
              onClick={handleJoinPrivate}
              className="mt-3 w-full py-3 rounded-xl font-black uppercase tracking-wider text-sm bg-slate-800 text-white hover:bg-slate-700 border border-slate-600 disabled:opacity-40 transition-colors"
            >
              {joinPrivateBusy ? t('onlineJoining') : t('onlineJoinPrivateButton')}
            </button>
          </div>

          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-3">
              {t('publicGamesList')}
            </h3>
            {listError && (
              <p className="text-xs text-amber-400/90 mb-2">{t('onlineListLoadError')}</p>
            )}
            <PublicGamesList t={t} games={publicGames} onJoinGame={handleJoinPublicRow} joinBusyId={joinBusyId} />
          </div>
        </div>
      )}
    </div>
  );
}
