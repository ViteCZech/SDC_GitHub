import React, { useEffect, useMemo, useRef, useState } from 'react';
import { translations } from '../../translations';

function fillI18nTemplate(str, vars) {
  let out = String(str || '');
  Object.entries(vars).forEach(([k, v]) => {
    out = out.split(`{${k}}`).join(String(v));
  });
  return out;
}

function sortLegMovesChrono(leg) {
  return [...(leg?.history || [])].sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0));
}

function emptyOnlinePlayerStats() {
  return {
    avg: 0,
    checkoutsMade: 0,
    checkoutAttempts: 0,
    c180: 0,
    c140: 0,
    c100: 0,
    highestThrow: 0,
    totalDarts: 0,
    totalScore: 0,
  };
}

/**
 * Statistiky z pendingMatchRecord pro pozápasovou tabulku (včetně hrubé checkout %).
 * @param {object} record
 * @param {number} startScore startovní body lega (501/301…)
 */
export function computePostMatchX01Stats(record, startScore) {
  const out = { p1: emptyOnlinePlayerStats(), p2: emptyOnlinePlayerStats() };
  const start = Number(startScore) || 501;
  if (!record || !Array.isArray(record.completedLegs)) return out;

  for (const leg of record.completedLegs) {
    const moves = sortLegMovesChrono(leg);
    const rem = { p1: start, p2: start };
    for (const m of moves) {
      if (!m || (m.player !== 'p1' && m.player !== 'p2')) continue;
      const pl = m.player;
      const d = Math.max(1, Number(m.dartsUsed) || 3);
      const sc = Number(m.score) || 0;
      const s = out[pl];
      const remBefore = rem[pl];

      if (!m.isBust && remBefore > 0 && remBefore <= 170) {
        s.checkoutAttempts += 1;
      }

      if (m.isBust) continue;

      s.totalScore += sc;
      s.totalDarts += d;
      if (sc === 180) s.c180 += 1;
      if (sc >= 140) s.c140 += 1;
      if (sc >= 100) s.c100 += 1;
      if (m.remaining === 0) s.checkoutsMade += 1;
      if (sc > s.highestThrow) s.highestThrow = sc;

      rem[pl] = typeof m.remaining === 'number' ? m.remaining : rem[pl];
    }
  }

  for (const pl of ['p1', 'p2']) {
    const s = out[pl];
    s.avg = s.totalDarts > 0 ? (s.totalScore / s.totalDarts) * 3 : 0;
  }

  return out;
}

/**
 * @param {{
 *  lang: string,
 *  record: object,
 *  startScore: number,
 *  onLeaveSession: () => void | Promise<void>,
 *  p1Name: string,
 *  p2Name: string,
 * }} props
 */
export default function PostMatchView({ lang, record, startScore, onLeaveSession, p1Name, p2Name }) {
  const t = (k) => translations[lang]?.[k] || k;
  const [countdown, setCountdown] = useState(10);
  const leaveOnceRef = useRef(false);
  const onLeaveRef = useRef(onLeaveSession);
  onLeaveRef.current = onLeaveSession;

  const stats = useMemo(() => computePostMatchX01Stats(record, startScore), [record, startScore]);

  const runLeave = () => {
    if (leaveOnceRef.current) return;
    leaveOnceRef.current = true;
    void Promise.resolve(onLeaveRef.current()).catch(() => {});
  };

  useEffect(() => {
    leaveOnceRef.current = false;
    setCountdown(10);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          runLeave();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [record]);

  const p1Legs = Number(record?.p1Legs) || 0;
  const p2Legs = Number(record?.p2Legs) || 0;

  const checkoutPct = (s) => {
    if (s.checkoutAttempts <= 0) return '—';
    return `${Math.round((s.checkoutsMade / s.checkoutAttempts) * 100)}%`;
  };

  const row = (label, v1, v2) => (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 border-b border-white/10 py-2 text-xs sm:text-sm">
      <span className="font-semibold text-slate-300">{label}</span>
      <span className="text-right font-mono font-bold text-emerald-300/95 tabular-nums">{v1}</span>
      <span className="text-right font-mono font-bold text-purple-300/95 tabular-nums">{v2}</span>
    </div>
  );

  return (
    <div className="animate-in fade-in zoom-in-95 flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-slate-950/75 p-3 shadow-2xl ring-1 ring-black/20 backdrop-blur-md duration-300 sm:p-4">
      <h2 className="text-center text-sm font-black uppercase tracking-widest text-amber-200/95 sm:text-base">
        {t('onlinePostMatchTitle')}
      </h2>
      <p className="mt-2 text-center font-mono text-2xl font-black text-white sm:text-3xl">
        {p1Legs} : {p2Legs}
      </p>
      <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2 border-b border-white/10 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
        <span />
        <span className="truncate text-right text-emerald-400/90">{p1Name}</span>
        <span className="truncate text-right text-purple-400/90">{p2Name}</span>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {row(t('onlineStatAverage'), stats.p1.avg.toFixed(1), stats.p2.avg.toFixed(1))}
        {row(t('onlineStatMax'), String(stats.p1.highestThrow), String(stats.p2.highestThrow))}
        {row(t('onlineStat100plus'), String(stats.p1.c100), String(stats.p2.c100))}
        {row(t('onlineStat140plus'), String(stats.p1.c140), String(stats.p2.c140))}
        {row(t('onlineStat180'), String(stats.p1.c180), String(stats.p2.c180))}
        {row(t('onlineStatCheckoutPct'), checkoutPct(stats.p1), checkoutPct(stats.p2))}
      </div>
      <div className="mt-3 shrink-0">
        <button
          type="button"
          onClick={() => runLeave()}
          className="w-full rounded-xl border border-amber-600/50 bg-amber-600/90 py-3 text-center text-sm font-black uppercase tracking-widest text-slate-950 shadow-lg transition-colors hover:bg-amber-500 active:scale-[0.99] sm:py-3.5 sm:text-base"
        >
          {fillI18nTemplate(t('onlineExitCountdown'), { seconds: countdown })}
        </button>
      </div>
    </div>
  );
}
