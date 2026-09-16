import React from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { translations } from '../translations';

/**
 * Jemný vizuální indikátor Kiosk zámku do hlavičky tabletového rozhraní.
 * Zamčeno → plný zámek; klik vyvolá PIN výzvu k odemčení (řeší rodič).
 * Odemčeno → otevřený zámek; klik zámek rovnou znovu zamkne.
 */
export default function TabletKioskLockBadge({ lang = 'cs', locked = true, onToggle }) {
  const t = (k, fallback) => translations[lang]?.[k] ?? fallback ?? k;
  const Icon = locked ? Lock : LockOpen;
  const osHint = t(
    'kioskOsRecommendation',
    'Pro 100% uzamčení na iPadu zapněte Asistovaný přístup (Guided Access), na Androidu Připnutí aplikace.'
  );
  const badgeTitle = `${t('kioskLockTitle', 'Kiosk zámek desky')} — ${osHint}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      title={badgeTitle}
      aria-label={
        locked
          ? `${t('kioskTapToUnlock', 'Klepnutím odemknete Kiosk zámek (PIN)')}. ${osHint}`
          : `${t('kioskTapToLock', 'Klepnutím zamknete Kiosk zámek')}. ${osHint}`
      }
      aria-pressed={!locked}
      className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors sm:text-xs ${
        locked
          ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40'
          : 'border-amber-500/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
      <span className="hidden sm:inline">
        {locked ? t('kioskLockedShort', 'Zamčeno') : t('kioskUnlockedShort', 'Odemčeno')}
      </span>
    </button>
  );
}
