import React, { useState } from 'react';
import { translations } from '../translations';
import { getTeamMembers } from '../utils/doublesThrowOrder';

/**
 * Výběr házejícího.
 * Začátek legu: povinná začínající dvojice, druhá volitelně hned.
 * Po prvním hodu: jen strana, která ještě nemá vybraného hráče.
 */
export default function DoublesThrowerPicker({
  lang,
  settings,
  startingPlayer,
  requiredSide,
  allowOptionalOther = false,
  existing = null,
  onConfirm,
}) {
  const t = (k) => translations[lang]?.[k] ?? k;
  const startSide = startingPlayer === 'p2' ? 'p2' : 'p1';
  const mustPick = requiredSide === 'p2' ? 'p2' : 'p1';
  const otherSide = mustPick === 'p1' ? 'p2' : 'p1';
  const showOther = allowOptionalOther && otherSide !== mustPick;

  const [pickP1, setPickP1] = useState(existing?.p1 || null);
  const [pickP2, setPickP2] = useState(existing?.p2 || null);
  const requiredPick = mustPick === 'p1' ? pickP1 : pickP2;
  const ready = Boolean(requiredPick);

  const accents = {
    p1: {
      border: 'border-emerald-500/60',
      bg: 'bg-emerald-950/40',
      text: 'text-emerald-300',
      btnOn: 'border-emerald-400 bg-emerald-600 text-white shadow-lg',
    },
    p2: {
      border: 'border-purple-500/60',
      bg: 'bg-purple-950/40',
      text: 'text-purple-300',
      btnOn: 'border-purple-400 bg-purple-600 text-white shadow-lg',
    },
  };

  const teamBlock = (side, selected, setSelected, { required, optional }) => {
    const members = getTeamMembers(settings, side);
    const teamName =
      settings?.teams?.[side]?.name || (side === 'p1' ? settings?.p1Name : settings?.p2Name);
    const accent = accents[side];
    const starts = startSide === side;
    return (
      <div
        className={`flex-1 min-w-0 rounded-2xl border-2 p-3 sm:p-4 ${
          required ? `${accent.border} ${accent.bg}` : 'border-slate-700 bg-slate-900/80'
        }`}
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
          {required
            ? starts
              ? t('doublesStartsLeg')
              : t('doublesPickNow')
            : optional
              ? t('doublesPickOptional')
              : t('doublesTeam')}
        </p>
        <p className={`text-sm sm:text-base font-black truncate mb-3 ${accent.text}`}>{teamName}</p>
        <div className="flex flex-col gap-2">
          {members.map((m) => {
            const on = selected === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m.id)}
                className={`w-full min-h-[3.25rem] rounded-xl border-2 px-3 py-2 text-sm sm:text-base font-bold transition-all touch-manipulation active:scale-[0.99] ${
                  on
                    ? accent.btnOn
                    : 'border-slate-600 bg-slate-800 text-white hover:border-slate-400'
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-950/95 p-3 sm:p-4">
      <h2 className="text-center text-base sm:text-xl font-black uppercase tracking-wide text-white">
        {showOther ? t('doublesPickThrower') : t('doublesPickThrowerLater')}
      </h2>
      <p className="text-center text-[11px] sm:text-xs text-slate-400 max-w-md leading-snug">
        {showOther ? t('doublesPickThrowerHint') : t('doublesPickThrowerLaterHint')}
      </p>
      <div className="flex w-full max-w-2xl flex-col sm:flex-row gap-2 sm:gap-3">
        {(mustPick === 'p1' || (showOther && otherSide === 'p1')) &&
          teamBlock('p1', pickP1, setPickP1, {
            required: mustPick === 'p1',
            optional: showOther && otherSide === 'p1',
          })}
        {(mustPick === 'p2' || (showOther && otherSide === 'p2')) &&
          teamBlock('p2', pickP2, setPickP2, {
            required: mustPick === 'p2',
            optional: showOther && otherSide === 'p2',
          })}
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={() =>
          ready &&
          onConfirm({
            p1: pickP1 || existing?.p1 || null,
            p2: pickP2 || existing?.p2 || null,
          })
        }
        className={`w-full max-w-md py-3 rounded-xl font-black text-sm uppercase tracking-wider ${
          ready
            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
            : 'bg-slate-800 text-slate-600 cursor-not-allowed'
        }`}
      >
        {showOther && !(mustPick === 'p1' ? pickP2 : pickP1)
          ? t('doublesPickConfirmStart')
          : t('doublesPickConfirm')}
      </button>
    </div>
  );
}
