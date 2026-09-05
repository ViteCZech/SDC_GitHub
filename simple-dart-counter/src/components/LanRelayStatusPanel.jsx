import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { HardDrive, Monitor, Wifi, WifiOff } from 'lucide-react';
import { translations } from '../translations';
import { lanHttpBase } from '../services/syncAdapter/lanRelayConfig';
import { buildVenueDisplayUrl } from '../utils/venueDisplayRoutes';

export default function LanRelayStatusPanel({
  lang = 'cs',
  pin,
  health,
  organizerCfg,
  compact = false,
}) {
  const t = (k) => translations[lang]?.[k] ?? translations.cs?.[k] ?? k;
  const th = (k) => translations[lang]?.tournamentHub?.[k] ?? translations.cs?.tournamentHub?.[k] ?? k;
  const pinOk = /^\d{4}$/.test(String(pin ?? '').trim());
  const running = health?.ok === true;
  const port = Number(health?.port) || organizerCfg?.port || 8787;
  const lanIp = Array.isArray(health?.addresses) && health.addresses.length ? health.addresses[0] : null;
  const publicOrigin = lanIp ? `http://${lanIp}:${port}` : lanHttpBase(organizerCfg);
  const tvUrl = pinOk && publicOrigin ? buildVenueDisplayUrl(pin, publicOrigin, lang) : '';
  const tablets = Number(health?.connectedTablets) || 0;

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        running
          ? 'border-emerald-500/40 bg-emerald-950/20'
          : 'border-amber-500/40 bg-amber-950/20'
      }`}
      data-testid="lan-relay-status"
      data-running={running ? '1' : '0'}
    >
      <div className="flex items-start gap-2">
        <HardDrive className={`w-4 h-4 shrink-0 mt-0.5 ${running ? 'text-emerald-400' : 'text-amber-400'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
            {th('lanRelayTitle') || 'Lokální LAN server'}
          </p>
          <p className={`leading-snug ${compact ? 'text-[11px]' : 'text-xs'} text-slate-300 mt-1`}>
            {running
              ? th('lanRelayRunning') || 'Relay běží. Tablety a TV se připojují přes Wi-Fi bez internetu.'
              : th('lanRelayDown') ||
                'Relay neběží. Na počítači pořadatele spusťte npm run lan-server (nebo npm run dev).'}
          </p>
        </div>
        {running ? (
          <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
        )}
      </div>

      {running ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-black/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">
              {th('lanRelayIp') || 'IP adresa'}
            </p>
            <p className="font-mono text-emerald-200 mt-0.5 break-all">
              {lanIp ? `${lanIp}:${port}` : `127.0.0.1:${port}`}
            </p>
          </div>
          <div className="rounded-lg bg-black/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">
              {th('lanRelayTablets') || 'Připojené tablety'}
            </p>
            <p className="font-mono text-emerald-200 mt-0.5">{tablets}</p>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-amber-100/90 leading-snug">
          {th('lanRelayStartHint') ||
            'Po startu serveru se tady objeví IP adresa a odkaz /tv/PIN pro televizi.'}
        </p>
      )}

      {tvUrl ? (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/90 flex items-center gap-1">
            <Monitor className="w-3.5 h-3.5" />
            {t('venueTvOpen') || 'TV obrazovka'}
          </p>
          <p className="font-mono text-xs text-amber-200 break-all bg-black/40 rounded-md px-2 py-1.5">{tvUrl}</p>
          <div className="flex justify-center p-3 rounded-xl bg-white w-fit mx-auto">
            <QRCodeSVG value={tvUrl} size={compact ? 132 : 168} level="M" includeMargin />
          </div>
        </div>
      ) : null}
    </div>
  );
}
