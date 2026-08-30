import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, QrCode, Wifi, WifiOff, X } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { translations } from '../translations';
import { db } from '../firebase';
import {
  buildTabletBoardQrUrl,
  ensureBoardAuthTokens,
  isBoardOnline,
  resolveTotalBoards,
} from '../utils/tabletBoardQr';
import VenueTvLinkCard from './VenueTvLinkCard';

const ACTIVE_TOURNAMENTS_COLL = 'active_tournaments';

function BoardQrModal({ lang, board, url, online, connected, onClose }) {
  const t = (k) => translations[lang]?.[k] ?? k;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-400">
              {t('tabletQrModalTitle') || 'QR kód pro tablet'}
            </p>
            <p className="text-lg font-black text-white mt-1">
              {(t('tabletQrBoardLabel') || 'Terč {n}').replace('{n}', String(board))}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {connected ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="w-16 h-16 text-emerald-400" />
            <p className="text-center font-bold text-emerald-300">
              {(t('tabletQrConnectedSuccess') || 'Terč {n} úspěšně připojen!').replace(
                '{n}',
                String(board)
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="flex justify-center p-4 rounded-xl bg-white">
              <QRCodeSVG value={url} size={220} level="M" includeMargin />
            </div>
            <p className="text-xs text-center text-slate-400">
              {t('tabletQrScanHint') ||
                'Naskenujte kód na herním tabletu. Po připojení se stav okamžitě aktualizuje.'}
            </p>
            {online ? (
              <p className="text-xs text-center font-bold text-emerald-400 flex items-center justify-center gap-1">
                <Wifi className="w-4 h-4" />
                {t('tabletQrAlreadyOnline') || 'Tablet je již online'}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function BoardGrid({ lang, boards, boardStatuses, tokens, nowMs, onOpenBoard }) {
  const t = (k) => translations[lang]?.[k] ?? k;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {boards.map((board) => {
        const online = isBoardOnline(boardStatuses, board, nowMs);
        const token = tokens[String(board)];
        return (
          <button
            key={board}
            type="button"
            onClick={() => {
              if (!token) return;
              onOpenBoard(board);
            }}
            disabled={!token}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all active:scale-95 ${
              online
                ? 'border-emerald-500/60 bg-emerald-900/25'
                : 'border-slate-700 bg-slate-800 hover:border-emerald-500/40'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {(t('tabletQrBoardLabel') || 'Terč {n}').replace('{n}', String(board))}
            </span>
            {online ? (
              <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                <Wifi className="w-4 h-4" />
                {t('tabletQrStatusOnline') || 'Online'}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-500 text-xs font-bold">
                <WifiOff className="w-4 h-4" />
                {t('tabletQrStatusOffline') || 'Offline'}
              </span>
            )}
            <QrCode className="w-5 h-5 text-emerald-400 mt-1" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Admin: QR kódy pro terče + real-time potvrzení připojení.
 * @param {{ compact?: boolean }} props — compact = ikona v menu, panel v modalu
 */
export default function TabletBoardQrPanel({
  lang = 'cs',
  pin,
  tournamentData,
  onNotify,
  onEnsureTokens,
  compact = false,
}) {
  const t = (k) => translations[lang]?.[k] ?? k;
  const tabletConnectedMsgTemplate = useMemo(
    () => translations[lang]?.tabletQrConnectedSuccess || 'Terč {n} úspěšně připojen!',
    [lang]
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [boardStatuses, setBoardStatuses] = useState({});
  const [openBoard, setOpenBoard] = useState(null);
  const [connectedBoard, setConnectedBoard] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const prevStatusesRef = useRef({});
  const notifiedRef = useRef(new Set());

  const tdWithTokens = useMemo(
    () => ensureBoardAuthTokens(tournamentData),
    [tournamentData]
  );
  const totalBoards = resolveTotalBoards(tdWithTokens);
  const tokens = tdWithTokens?.boardAuthTokens ?? {};

  useEffect(() => {
    if (!onEnsureTokens || !tdWithTokens?.boardAuthTokens) return;
    if (tournamentData?.boardAuthTokens) return;
    onEnsureTokens(tdWithTokens);
  }, [tdWithTokens, tournamentData?.boardAuthTokens, onEnsureTokens]);

  useEffect(() => {
    const id = String(pin ?? '').trim();
    if (!db || !/^\d{4}$/.test(id)) return undefined;

    const ref = doc(db, ACTIVE_TOURNAMENTS_COLL, id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
        if (!exists) {
          setBoardStatuses({});
          return;
        }
        const raw = snap.data()?.boardStatuses;
        setBoardStatuses(raw && typeof raw === 'object' ? raw : {});
      },
      (err) => console.warn('TabletBoardQrPanel snapshot:', err)
    );
    return () => unsub();
  }, [pin]);

  useEffect(() => {
    const prev = prevStatusesRef.current;
    for (const [boardKey, status] of Object.entries(boardStatuses)) {
      const wasOnline = prev[boardKey]?.status === 'online';
      const isOnlineNow = status?.status === 'online';
      if (!wasOnline && isOnlineNow) {
        const notifyKey = `${pin}:${boardKey}:${status?.lastSeen?.seconds ?? Date.now()}`;
        if (!notifiedRef.current.has(notifyKey)) {
          notifiedRef.current.add(notifyKey);
          const boardNum = parseInt(boardKey, 10);
          const msg = tabletConnectedMsgTemplate.replace(
            '{n}',
            String(boardNum)
          );
          onNotify?.(msg, 'success');
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(200);
          }
          if (openBoard === boardNum) {
            setConnectedBoard(boardNum);
            window.setTimeout(() => {
              setOpenBoard(null);
              setConnectedBoard(null);
            }, 1400);
          }
        }
      }
    }
    prevStatusesRef.current = boardStatuses;
  }, [boardStatuses, pin, openBoard, onNotify, tabletConnectedMsgTemplate]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (totalBoards <= 0) return null;

  const boards = Array.from({ length: totalBoards }, (_, i) => i + 1);
  const onlineCount = boards.filter((b) => isBoardOnline(boardStatuses, b, nowMs)).length;

  const handleOpenBoard = (board) => {
    setConnectedBoard(null);
    setOpenBoard(board);
  };

  const boardQrModal =
    openBoard != null && tokens[String(openBoard)] ? (
      <BoardQrModal
        lang={lang}
        board={openBoard}
        url={buildTabletBoardQrUrl({
          pin: String(pin),
          board: openBoard,
          token: tokens[String(openBoard)],
        })}
        online={isBoardOnline(boardStatuses, openBoard, nowMs)}
        connected={connectedBoard === openBoard}
        onClose={() => {
          setOpenBoard(null);
          setConnectedBoard(null);
        }}
      />
    ) : null;

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="relative p-2 rounded-lg bg-slate-800 border border-slate-700 text-emerald-400 hover:text-emerald-300 hover:bg-slate-700 transition-colors"
          title={t('tabletQrOpenMenu') || 'Terče / QR kódy pro tablety'}
          aria-label={t('tabletQrOpenMenu') || 'Terče / QR kódy pro tablety'}
        >
          <QrCode className="w-4 h-4" />
          {onlineCount > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-emerald-500 text-[9px] font-black text-white flex items-center justify-center">
              {onlineCount}
            </span>
          ) : null}
        </button>

        {panelOpen ? (
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/70"
            role="dialog"
            aria-modal="true"
            onClick={() => setPanelOpen(false)}
          >
            <div
              className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-400">
                    {t('tabletQrSectionTitle') || 'Terče / Tablety'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {t('tabletQrSectionHint') ||
                      'Zobrazte QR kód pro daný terč. Po naskenování tabletu uvidíte okamžité potvrzení připojení.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="p-2 text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <VenueTvLinkCard lang={lang} pin={pin} isLoggedIn cloudEnabled compact />
              <BoardGrid
                lang={lang}
                boards={boards}
                boardStatuses={boardStatuses}
                tokens={tokens}
                nowMs={nowMs}
                onOpenBoard={handleOpenBoard}
              />
            </div>
          </div>
        ) : null}

        {boardQrModal}
      </>
    );
  }

  return (
    <>
      <section className="mb-6 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="flex items-center gap-2 mb-3">
          <QrCode className="w-5 h-5 text-emerald-400 shrink-0" />
          <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400">
            {t('tabletQrSectionTitle') || 'Terče / Tablety'}
          </h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {t('tabletQrSectionHint') ||
            'Zobrazte QR kód pro daný terč. Po naskenování tabletu uvidíte okamžité potvrzení připojení.'}
        </p>
        <div className="mb-4">
          <VenueTvLinkCard lang={lang} pin={pin} isLoggedIn cloudEnabled compact />
        </div>
        <BoardGrid
          lang={lang}
          boards={boards}
          boardStatuses={boardStatuses}
          tokens={tokens}
          nowMs={nowMs}
          onOpenBoard={handleOpenBoard}
        />
      </section>
      {boardQrModal}
    </>
  );
}
