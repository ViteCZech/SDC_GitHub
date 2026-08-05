import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Hash, Wallet, X } from 'lucide-react';
import { translations } from '../../translations';
import { generateSpdString } from '../../utils/spdQr';
import { resolveBankAccountString } from '../../utils/bankAccount';

/**
 * Modal s platebním QR kódem pro admin panel.
 * @param {{
 *   lang: string,
 *   tournament: object,
 *   registration: object,
 *   onClose: () => void,
 * }} props
 */
export default function PaymentQrModal({ lang, tournament, registration, onClose }) {
  const t = (k) => translations[lang]?.[k] || k;

  const accountNumber = resolveBankAccountString(tournament?.finance?.bankInfo);
  const amount = registration?.payment?.amount ?? tournament?.finance?.entryFee ?? null;
  const variableSymbol = registration?.payment?.variableSymbol ?? null;

  const spdString = useMemo(() => {
    if (!accountNumber) return null;
    return generateSpdString({
      accountNumber,
      amount,
      variableSymbol,
      message: tournament?.meta?.name ?? '',
    });
  }, [accountNumber, amount, variableSymbol, tournament?.meta?.name]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-400">
              {t('preregAdminShowQrTitle')}
            </p>
            <p className="text-sm font-bold text-white mt-1">{registration?.player?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {spdString ? (
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-xl">
              <QRCodeSVG value={spdString} size={280} level="M" includeMargin />
            </div>
            <p className="text-xs text-slate-500 text-center">{t('preregQrScanHint')}</p>
          </div>
        ) : (
          <p className="text-sm text-amber-400 text-center">{t('preregQrUnavailable')}</p>
        )}

        <dl className="grid grid-cols-1 gap-3 text-sm">
          {variableSymbol && (
            <div className="p-3 rounded-lg bg-slate-800 border border-slate-700">
              <dt className="text-xs uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3" /> {t('preregVariableSymbol')}
              </dt>
              <dd className="font-mono text-emerald-400 text-xl">{variableSymbol}</dd>
            </div>
          )}
          {amount != null && Number(amount) > 0 && (
            <div className="p-3 rounded-lg bg-slate-800 border border-slate-700">
              <dt className="text-xs uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-1">
                <Wallet className="w-3 h-3" /> {t('preregAmount')}
              </dt>
              <dd className="font-black text-white text-xl">
                {Number(amount).toLocaleString('cs-CZ')} Kč
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
