import React from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { translations } from '../translations';
import { buildMapsSearchUrl, formatLocationLabel } from '../utils/preregTournamentList';
import { handleExternalLinkClick } from '../utils/openExternalUrl';

/**
 * Místo turnaje + odkaz do map (otevře se mimo PWA, ať se apka nezavře).
 * @param {{
 *   tournament: object,
 *   lang?: string,
 *   className?: string,
 *   textClassName?: string,
 * }} props
 */
export default function VenueMapLink({
  tournament,
  lang = 'cs',
  className = '',
  textClassName = 'text-sm text-slate-400',
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const label = formatLocationLabel(tournament);
  const mapsUrl = buildMapsSearchUrl(tournament);

  if (!label || label === '–') return null;

  if (!mapsUrl) {
    return (
      <span className={`inline-flex items-start gap-1.5 ${textClassName} ${className}`}>
        <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        handleExternalLinkClick(mapsUrl)(e);
      }}
      title={t('preregOpenInMaps')}
      className={`inline-flex items-start gap-1.5 ${textClassName} hover:text-emerald-400 transition-colors ${className}`}
    >
      <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
      <span className="underline decoration-emerald-500/40 underline-offset-2">{label}</span>
      <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden />
      <span className="sr-only">{t('preregOpenInMaps')}</span>
    </a>
  );
}
