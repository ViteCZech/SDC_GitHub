/**
 * Otevře URL mimo PWA / Android TWA.
 * Běžné <a target="_blank"> v nainstalované apce často naviguje stejné okno
 * (žebříček ČŠO, Mapy). Po zavření pak spadne i SDC.
 */

function toAbsoluteHttpUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const abs = new URL(raw, typeof window !== 'undefined' ? window.location.href : 'https://localhost/');
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return '';
    return abs.href;
  } catch {
    return '';
  }
}

function isAndroidStandaloneOrTwa() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!/Android/i.test(navigator.userAgent || '')) return false;
  const standalone =
    (typeof window.matchMedia === 'function' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches)) ||
    window.navigator.standalone === true;
  const twa = String(document.referrer || '').startsWith('android-app://');
  return standalone || twa;
}

function clickAnchor(href, target) {
  const a = document.createElement('a');
  a.href = href;
  if (target) a.target = target;
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * @param {string} url
 * @returns {boolean} true pokud se pokus o otevření provedl
 */
export function openExternalUrl(url) {
  const abs = toAbsoluteHttpUrl(url);
  if (!abs) return false;

  if (isAndroidStandaloneOrTwa()) {
    const rest = abs.replace(/^https:\/\//i, '');
    const intent =
      `intent://${rest}#Intent;scheme=https;action=android.intent.action.VIEW;` +
      `S.browser_fallback_url=${encodeURIComponent(abs)};end`;
    try {
      clickAnchor(intent, '_blank');
      return true;
    } catch {
      /* fallback níže */
    }
  }

  try {
    const win = window.open(abs, '_blank', 'noopener,noreferrer');
    if (win) {
      try {
        win.opener = null;
      } catch {
        /* ignore */
      }
      return true;
    }
  } catch {
    /* ignore */
  }

  clickAnchor(abs, '_blank');
  return true;
}

/**
 * Handler pro <a href> — preventDefault + openExternalUrl, pravé tlačítko / middle-click nechá prohlížeč.
 * @param {string} url
 * @returns {(e: MouseEvent) => void}
 */
export function handleExternalLinkClick(url) {
  return (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openExternalUrl(url);
  };
}
