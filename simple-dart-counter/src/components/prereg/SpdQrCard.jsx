import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Banknote, CheckCircle, Clock, Hash, Wallet } from 'lucide-react';
import { translations } from '../../translations';
import { generateSpdString } from '../../utils/spdQr';
import { resolveBankAccountString } from '../../utils/bankAccount';

/**
 * @param {{
 *   lang: string,
 *   tournament: object,
 *   registration: {
 *     status: 'CONFIRMED'|'WAITLIST',
 *     variableSymbol?: string|null,
 *     paymentMethod?: 'QR'|'CASH'|null,
 *     playerName?: string,
 *     amount?: number|null,
 *   },
 * }} props
 */
export default function SpdQrCard({ lang, tournament, registration }) {
  const t = (k) => translations[lang]?.[k] || k;

  const accountNumber = resolveBankAccountString(tournament?.finance?.bankInfo);
  const amount = registration?.amount ?? tournament?.finance?.entryFee ?? null;
  const variableSymbol = registration?.variableSymbol ?? null;
  const paymentMethod = registration?.paymentMethod ?? null;
  const isWaitlist = registration?.status === 'WAITLIST';
  const partnerPays = amount != null && Number(amount) <= 0;
  const showQr = paymentMethod === 'QR' && !isWaitlist && !partnerPays;

  const spdString = useMemo(() => {
    if (!showQr) return null;
    return generateSpdString({
      accountNumber,
      amount,
      variableSymbol,
      message: tournament?.meta?.name ?? '',
    });
  }, [showQr, accountNumber, amount, variableSymbol, tournament?.meta?.name]);

  return (
    <div className="space-y-5">
      <div
        className={`p-4 rounded-xl border ${
          isWaitlist
            ? 'bg-amber-900/20 border-amber-500/50'
            : 'bg-emerald-900/20 border-emerald-500/50'
        }`}
      >
        <div className="flex items-start gap-3">
          {isWaitlist ? (
            <Clock className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-black text-white uppercase tracking-wide text-sm">
              {isWaitlist ? t('preregStatusWaitlist') : t('preregStatusConfirmed')}
            </p>
            {registration?.playerName && (
              <p className="text-slate-300 mt-1">{registration.playerName}</p>
            )}
            {isWaitlist && (
              <p className="text-sm text-amber-200/90 mt-2">{t('preregWaitlistHint')}</p>
            )}
          </div>
        </div>
      </div>

      {!isWaitlist && partnerPays && (
        <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/80">
          <p className="text-sm text-slate-300">{t('preregPartnerPaysHint')}</p>
        </div>
      )}

      {!isWaitlist && paymentMethod === 'CASH' && !partnerPays && (
        <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/80">
          <div className="flex items-center gap-2 text-slate-300 mb-2">
            <Banknote className="w-5 h-5 text-emerald-400" />
            <span className="font-bold">{t('preregPayOnSite')}</span>
          </div>
          <p className="text-sm text-slate-400">{t('preregPayOnSiteHint')}</p>
        </div>
      )}

      {showQr && (
        <div className="p-5 rounded-xl border border-slate-700 bg-slate-900/80 space-y-4">
          <div className="flex items-center gap-2 text-slate-300">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <span className="font-bold uppercase tracking-wide text-sm">{t('preregQrPayment')}</span>
          </div>

          {spdString ? (
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-white rounded-xl">
                <QRCodeSVG value={spdString} size={220} level="M" includeMargin />
              </div>
              <p className="text-xs text-slate-500 text-center max-w-sm">{t('preregQrScanHint')}</p>
            </div>
          ) : (
            <p className="text-sm text-amber-400">{t('preregQrUnavailable')}</p>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {accountNumber && (
              <div className="p-3 rounded-lg bg-slate-800 border border-slate-700">
                <dt className="text-xs uppercase tracking-widest text-slate-500 mb-1">
                  {t('preregAccountNumber')}
                </dt>
                <dd className="font-mono text-white break-all">{accountNumber}</dd>
              </div>
            )}
            {variableSymbol && (
              <div className="p-3 rounded-lg bg-slate-800 border border-slate-700">
                <dt className="text-xs uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3" /> {t('preregVariableSymbol')}
                </dt>
                <dd className="font-mono text-emerald-400 text-lg">{variableSymbol}</dd>
              </div>
            )}
            {amount != null && Number(amount) > 0 && (
              <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 sm:col-span-2">
                <dt className="text-xs uppercase tracking-widest text-slate-500 mb-1">
                  {t('preregAmount')}
                </dt>
                <dd className="font-black text-white text-xl">
                  {Number(amount).toLocaleString('cs-CZ')} Kč
                </dd>
              </div>
            )}
          </dl>

          <p className="text-sm text-slate-400 border-t border-slate-800 pt-4">
            {t('preregPaymentPendingHint')}
          </p>
        </div>
      )}
    </div>
  );
}
