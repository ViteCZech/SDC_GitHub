export function isOnSiteRegistrationSource(source) {
  const normalized = String(source ?? '').trim().toUpperCase();
  return normalized === 'ON_SITE' || normalized === 'ADMIN_MANUAL';
}

export function isOnSiteRegistration(registration) {
  return isOnSiteRegistrationSource(registration?.source);
}

export function resolveRegistrationAmount(registration, fallbackEntryFee) {
  const rawAmount = registration?.payment?.amount;
  if (rawAmount != null && rawAmount !== '') {
    const parsed = Number(rawAmount);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const fallback = Number(fallbackEntryFee);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  return 0;
}

export function sumConfirmedEntryFees(registrations, entryFee, { paidOnly = false } = {}) {
  return (registrations || []).reduce((sum, row) => {
    if (String(row?.status ?? '') !== 'CONFIRMED') return sum;
    if (paidOnly && !row?.payment?.isPaid) return sum;
    return sum + resolveRegistrationAmount(row, entryFee);
  }, 0);
}
