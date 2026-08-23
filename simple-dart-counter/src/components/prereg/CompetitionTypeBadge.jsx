import React from 'react';
import { normalizeCompetitionType } from '../../utils/preregCompetition';

const TYPE_CLASS = {
  singles: 'bg-slate-800 border-slate-600 text-slate-300',
  doubles: 'bg-sky-950/80 border-sky-500/40 text-sky-300',
  mixed: 'bg-fuchsia-950/80 border-fuchsia-500/40 text-fuchsia-300',
  random_doubles: 'bg-amber-950/80 border-amber-500/40 text-amber-300',
};

/**
 * @param {{
 *   type?: string|null,
 *   t: (key: string) => string,
 *   className?: string,
 * }} props
 */
export default function CompetitionTypeBadge({ type, t, className = '' }) {
  const id = normalizeCompetitionType(type);
  return (
    <span
      className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border shrink-0 ${TYPE_CLASS[id] ?? TYPE_CLASS.singles} ${className}`}
    >
      {t(`preregCompType_${id}`)}
    </span>
  );
}
