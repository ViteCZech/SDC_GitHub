import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { translations } from '../../translations';
import {
  confirmPairApi,
  declinePairApi,
  listAvailablePartnersApi,
  requestPairApi,
} from '../../services/tournamentPreRegService';

/**
 * Stav páru na veřejné stránce přihlášky + potvrzení / odmítnutí / nový výběr.
 * @param {{
 *   lang: string,
 *   tournamentId: string,
 *   registrationId: string,
 *   pair: object|null,
 *   gender?: 'M'|'F'|null,
 *   registrationOpen: boolean,
 *   onPairChange: (pair: object) => void,
 * }} props
 */
export default function PairStatusPanel({
  lang,
  tournamentId,
  registrationId,
  pair,
  gender = null,
  registrationOpen,
  onPairChange,
}) {
  const t = (k) => translations[lang]?.[k] || k;
  const [partners, setPartners] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const status = String(pair?.status ?? 'NONE');
  const canRequest = registrationOpen && !!pair?.canRequestPartner;
  const canConfirm = registrationOpen && !!pair?.canConfirm;
  const canDecline = registrationOpen && !!pair?.canDecline;

  useEffect(() => {
    if (!canRequest || !tournamentId) return undefined;
    let cancelled = false;
    listAvailablePartnersApi(tournamentId, { excludeRegistrationId: registrationId, gender })
      .then((list) => {
        if (!cancelled) setPartners(list);
      })
      .catch(() => {
        if (!cancelled) setPartners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canRequest, tournamentId, registrationId, gender]);

  const mapPairError = (err) => {
    const msg = String(err?.message ?? '');
    if (msg.includes('PAIR_GENDER')) return t('preregErrPairGender');
    if (msg.includes('PAIR_NOT_AVAILABLE') || msg.includes('PAIR_NOT_PENDING')) return t('preregErrPairTaken');
    if (err?.code === 'resource-exhausted') return t('preregErrFull');
    return t('preregPairActionErr');
  };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(mapPairError(err));
    } finally {
      setBusy(false);
    }
  };

  const statusText = {
    NONE: t('preregPairNone'),
    WAITING_PARTNER: t('preregPairWaiting'),
    PENDING_INVITE: pair?.canConfirm ? t('preregPairIncoming') : t('preregPairOutgoing'),
    CONFIRMED: t('preregPairConfirmed'),
    DECLINED: t('preregPairDeclined'),
    BROKEN: t('preregPairBroken'),
  }[status] || t('preregPairNone');

  return (
    <div className="mt-4 p-4 rounded-xl border border-slate-700 bg-slate-950/40 space-y-3">
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">{t('preregPartnerTitle')}</p>
      <p className="text-sm text-slate-200 font-bold">{statusText}</p>
      {(pair?.partnerName || pair?.pendingName) && (
        <p className="text-sm text-slate-400">
          {t('preregPartnerLabel')}:{' '}
          <span className="text-white">{pair.partnerName || pair.pendingName}</span>
        </p>
      )}

      {canConfirm && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await confirmPairApi(tournamentId, registrationId);
                onPairChange({
                  ...pair,
                  status: 'CONFIRMED',
                  canConfirm: false,
                  canDecline: false,
                  canRequestPartner: false,
                });
              })
            }
            className="flex-1 py-3 rounded-xl font-black uppercase tracking-wide text-sm text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('preregPairConfirmBtn')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await declinePairApi(tournamentId, registrationId);
                onPairChange({
                  status: 'NONE',
                  partnerRegistrationId: null,
                  partnerName: null,
                  pendingName: null,
                  canConfirm: false,
                  canDecline: false,
                  canRequestPartner: true,
                });
              })
            }
            className="flex-1 py-3 rounded-xl font-bold text-sm text-red-200 bg-red-950/40 border border-red-500/40 hover:bg-red-950/70 disabled:opacity-50"
          >
            {t('preregPairDeclineBtn')}
          </button>
        </div>
      )}

      {canDecline && !canConfirm && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await declinePairApi(tournamentId, registrationId);
              onPairChange({
                status: 'NONE',
                partnerRegistrationId: null,
                partnerName: null,
                canConfirm: false,
                canDecline: false,
                canRequestPartner: true,
              });
            })
          }
          className="w-full py-3 rounded-xl font-bold text-sm text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50"
        >
          {t('preregPairCancelInviteBtn')}
        </button>
      )}

      {canRequest && partners.length > 0 && (
        <div className="space-y-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={busy}
            className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white"
          >
            <option value="">{t('preregPartnerNone')}</option>
            {partners.map((p) => (
              <option key={p.registrationId} value={p.registrationId}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selectedId}
            onClick={() =>
              run(async () => {
                await requestPairApi(tournamentId, registrationId, selectedId);
                const picked = partners.find((p) => p.registrationId === selectedId);
                onPairChange({
                  status: 'PENDING_INVITE',
                  partnerRegistrationId: selectedId,
                  partnerName: picked?.name ?? null,
                  initiatedBy: registrationId,
                  canConfirm: false,
                  canDecline: true,
                  canRequestPartner: false,
                });
                setSelectedId('');
              })
            }
            className="w-full py-3 rounded-xl font-bold text-sm text-white bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50"
          >
            {t('preregPairRequestBtn')}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-amber-300">{error}</p>}
    </div>
  );
}
