/**
 * Spočítá rozdělení financí turnaje na základě počtu zaplacených/potvrzených hráčů.
 * Žádné vynucené defaulty — chybí-li entryFee nebo confirmedCount, vrátí nuly.
 *
 * @param {{ entryFee?: number|null, confirmedCount?: number|null, payoutPercent?: number|null, sponsorMoney?: number|null }} params
 * @returns {{ gross: number, net: number, organizerFee: number, prizePool: number }}
 */
export function calculatePrizePool({ entryFee, confirmedCount, payoutPercent, sponsorMoney }) {
  if (entryFee == null || confirmedCount == null || Number(confirmedCount) <= 0) {
    return { gross: 0, net: 0, organizerFee: 0, prizePool: 0 };
  }

  const fee = Number(entryFee);
  const count = Number(confirmedCount);
  const sponsor = sponsorMoney != null ? Number(sponsorMoney) : 0;

  if (!Number.isFinite(fee) || fee <= 0 || !Number.isFinite(count) || count <= 0) {
    return { gross: 0, net: 0, organizerFee: 0, prizePool: 0 };
  }

  const gross = fee * count + (Number.isFinite(sponsor) ? sponsor : 0);

  const payoutRatio =
    payoutPercent != null && Number.isFinite(Number(payoutPercent))
      ? Number(payoutPercent) / 100
      : 1;

  const net = Math.floor(gross * payoutRatio);
  const organizerFee = gross - net;

  return {
    gross,
    net,
    organizerFee,
    prizePool: net,
  };
}

/** @typedef {'TOP4'|'TOP8'} PrizeDistributionTemplate */

/**
 * Určí šablonu rozdělení odměn (Top 4 vs Top 8).
 * Do 32 hráčů včetně → TOP4, nad 32 → TOP8.
 *
 * @param {number|null|undefined} playerCount
 * @returns {PrizeDistributionTemplate|null}
 */
export function getDistributionTemplate(playerCount) {
  if (playerCount == null || !Number.isFinite(Number(playerCount)) || Number(playerCount) <= 0) {
    return null;
  }
  return Number(playerCount) > 32 ? 'TOP8' : 'TOP4';
}

/** Poměry výher v rámci prize poolu (součet = 1). */
export const PRIZE_DISTRIBUTION_RATIOS = {
  TOP4: [
    { place: '1.', ratio: 0.5 },
    { place: '2.', ratio: 0.25 },
    { place: '3.–4.', ratio: 0.125, sharedPlaces: 2 },
  ],
  TOP8: [
    { place: '1.', ratio: 0.4 },
    { place: '2.', ratio: 0.2 },
    { place: '3.–4.', ratio: 0.1, sharedPlaces: 2 },
    { place: '5.–8.', ratio: 0.05, sharedPlaces: 4 },
  ],
};

/**
 * Rozdělí prize pool podle šablony TOP4/TOP8.
 *
 * @param {number} prizePool
 * @param {PrizeDistributionTemplate|null} template
 * @returns {Array<{ place: string, amount: number, ratio: number }>}
 */
export function distributePrizePool(prizePool, template) {
  if (!template || prizePool == null || prizePool <= 0) return [];
  const rows = PRIZE_DISTRIBUTION_RATIOS[template];
  if (!rows) return [];

  return rows.map(({ place, ratio }) => ({
    place,
    ratio,
    amount: Math.floor(prizePool * ratio),
  }));
}
