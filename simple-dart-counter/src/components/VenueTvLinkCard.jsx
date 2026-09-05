import React, { useState } from 'react';
import { Check, Cloud, Copy, ExternalLink, Monitor } from 'lucide-react';
import { translations } from '../translations';
import { buildVenueDisplayUrl } from '../utils/venueDisplay';

/**
 * Odkaz na /tv/:pin + stav, proč je (ne)aktivní.
 * TV se nepřihlašuje; aktivní je jen u cloudu pod přihlášeným adminem.
 */
export default function VenueTvLinkCard({
  lang = 'cs',
  pin,
  isLoggedIn = false,
  cloudEnabled = false,
  lanEnabled = false,
  origin,
  onGoogleLogin,
  compact = false,
}) {
  const t = (k) => translations[lang]?.[k] ?? translations.cs?.[k] ?? k;
  const [copied, setCopied] = useState(false);
  const pinOk = /^\d{4}$/.test(String(pin ?? '').trim());
  const url = pinOk ? buildVenueDisplayUrl(pin, origin, lang) : '';
  const active = !!pinOk && (!!lanEnabled || !!(isLoggedIn && cloudEnabled));

  const hint = lanEnabled
    ? t('venueTvHintLan')
    : !isLoggedIn
    ? t('venueTvHintLogin')
    : !cloudEnabled
      ? t('venueTvHintCloudOff')
      : !pinOk
        ? t('venueTvHintNoPin')
        : t('venueTvHintReady');

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard může být zakázaný */
    }
  };

  return (
    <div
      className={`rounded-lg border px-3 py-3 space-y-2 ${
        active
          ? 'border-amber-500/40 bg-amber-950/20'
          : 'border-slate-600/80 bg-slate-900/70'
      }`}
    >
      <div className="flex items-start gap-2">
        <Monitor className={`w-4 h-4 shrink-0 mt-0.5 ${active ? 'text-amber-400' : 'text-slate-500'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/90">
            {t('venueTvOpen')}
          </p>
          <p className={`leading-snug text-slate-300 ${compact ? 'text-[11px]' : 'text-xs'}`}>{hint}</p>
        </div>
      </div>

      {url ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs sm:text-sm text-amber-200 break-all bg-black/40 rounded-md px-2 py-1.5">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide bg-amber-600 text-slate-950 hover:bg-amber-500"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('venueTvOpenTab')}
            </a>
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide bg-slate-800 text-slate-200 border border-slate-600 hover:bg-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? t('venueTvCopied') : t('venueTvCopy')}
            </button>
          </div>
        </div>
      ) : null}

      {!isLoggedIn && !lanEnabled && typeof onGoogleLogin === 'function' ? (
        <button
          type="button"
          onClick={() => onGoogleLogin()}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-bold bg-white text-slate-900 hover:bg-slate-100 border border-slate-200 text-sm"
        >
          <Cloud className="w-4 h-4 text-sky-600" />
          {t('loginWithGoogle') || 'Přihlásit se přes Google'}
        </button>
      ) : null}
    </div>
  );
}
