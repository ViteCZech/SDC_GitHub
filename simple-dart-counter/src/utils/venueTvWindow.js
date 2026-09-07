let venueTvWindowRef = null;
const VENUE_TV_WINDOW_NAME = 'sdc-venue-tv-display';

function normalizeVenueUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  if (typeof window === 'undefined') return '';
  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function getActiveWindow() {
  if (!venueTvWindowRef) return null;
  try {
    if (venueTvWindowRef.closed) {
      venueTvWindowRef = null;
      return null;
    }
    return venueTvWindowRef;
  } catch {
    venueTvWindowRef = null;
    return null;
  }
}

export function isVenueTvWindowOpen() {
  return !!getActiveWindow();
}

export function openVenueTvWindow(url) {
  const href = normalizeVenueUrl(url);
  if (!href || typeof window === 'undefined') {
    return { action: 'blocked', isOpen: isVenueTvWindowOpen() };
  }

  const existing = getActiveWindow();
  if (existing) {
    try {
      if (existing.location?.href !== href) existing.location.href = href;
      existing.focus?.();
    } catch {
      /* cross-origin access */
    }
    return { action: 'focused', isOpen: true };
  }

  let win = null;
  try {
    win = window.open(href, VENUE_TV_WINDOW_NAME, 'noopener,noreferrer');
  } catch {
    win = null;
  }
  if (!win) return { action: 'blocked', isOpen: false };
  try {
    win.opener = null;
  } catch {
    /* ignore */
  }
  venueTvWindowRef = win;
  try {
    win.focus?.();
  } catch {
    /* ignore */
  }
  return { action: 'opened', isOpen: true };
}

export function closeVenueTvWindow() {
  const existing = getActiveWindow();
  if (!existing) return { action: 'already_closed', isOpen: false };
  try {
    existing.close?.();
  } catch {
    /* ignore */
  }
  venueTvWindowRef = null;
  return { action: 'closed', isOpen: false };
}

export function toggleVenueTvWindow(url) {
  if (isVenueTvWindowOpen()) return closeVenueTvWindow();
  return openVenueTvWindow(url);
}

export function __resetVenueTvWindowForTests() {
  venueTvWindowRef = null;
}
