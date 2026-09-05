import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { SyncAdapterProvider } from './context/SyncAdapterContext';
import { createCloudSyncAdapter } from './services/syncAdapter/cloudSyncAdapter';
import { createLanSyncAdapter } from './services/syncAdapter/lanSyncAdapter';
import { resolveLanRelayConfig } from './services/syncAdapter/lanRelayConfig';
import { ensureLocale, prefetchOtherLocales } from './translations';
import {
  parseVenueDisplayRouteFromUrl,
  resolveAppEntry,
  resolveVenueLang,
} from './utils/venueDisplayRoutes';

const AppMain = lazy(() => import('./AppMain.jsx'));
const VenueDisplayView = lazy(() => import('./components/VenueDisplayView.jsx'));

function ShellFallback() {
  return <div className="bg-slate-50 dark:bg-slate-950 w-full h-[100dvh]" />;
}

const venueRouteAtBoot = parseVenueDisplayRouteFromUrl();
if (!venueRouteAtBoot) {
  void import('./AppMain.jsx');
}

export default function App() {
  const entry = resolveAppEntry();
  const venueRoute = entry.kind === 'venue' ? entry : null;
  const [lang, setLangState] = useState(() => (venueRoute ? resolveVenueLang() : 'cs'));
  const [localeReady, setLocaleReady] = useState(() => (venueRoute ? resolveVenueLang() : 'cs') === 'cs');
  const lanCfg = useMemo(() => resolveLanRelayConfig(), []);
  const syncAdapter = useMemo(
    () => (lanCfg ? createLanSyncAdapter(lanCfg) : createCloudSyncAdapter()),
    [lanCfg]
  );

  const setLang = React.useCallback((next) => {
    void ensureLocale(next).then(() => {
      setLangState(next);
      setLocaleReady(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void ensureLocale(lang).then(() => {
      if (!cancelled) setLocaleReady(true);
    });
    const idle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback
        : (cb) => window.setTimeout(cb, 1);
    const idleId = idle(() => prefetchOtherLocales(lang));
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function') {
        try {
          cancelIdleCallback(idleId);
        } catch {
          /* ignore */
        }
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [lang]);

  if (!localeReady) {
    return <ShellFallback />;
  }

  if (venueRoute) {
    return (
      <SyncAdapterProvider adapter={syncAdapter}>
        <Suspense fallback={<ShellFallback />}>
          <VenueDisplayView pin={venueRoute.pin} invalidPin={venueRoute.invalid} lang={lang} />
        </Suspense>
      </SyncAdapterProvider>
    );
  }

  return (
    <SyncAdapterProvider adapter={syncAdapter}>
      <Suspense fallback={<ShellFallback />}>
        <AppMain lang={lang} setLang={setLang} />
      </Suspense>
    </SyncAdapterProvider>
  );
}
