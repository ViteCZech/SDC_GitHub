import React from 'react';
import { CircleHelp } from 'lucide-react';
import { translations } from '../translations';
import { getCurrentRoute } from '../utils/contextHelp';

export default function ContextHelpButton({
  topicId,
  lang = 'cs',
  onOpenContextHelp,
  className = '',
}) {
  if (!topicId || typeof onOpenContextHelp !== 'function') return null;
  const label =
    translations[lang]?.contextHelpOpen ??
    translations.cs?.contextHelpOpen ??
    'Open contextual help';

  return (
    <button
      type="button"
      onClick={() =>
        onOpenContextHelp?.(topicId, {
          returnRoute: getCurrentRoute(),
        })
      }
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-amber-700 transition-colors hover:bg-slate-100 hover:text-amber-800 dark:border-slate-600 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-slate-700 dark:hover:text-amber-200 ${className}`}
    >
      <CircleHelp className="h-4 w-4" />
    </button>
  );
}
