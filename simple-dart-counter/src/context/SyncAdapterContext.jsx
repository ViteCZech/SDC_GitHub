import React, { createContext, useContext, useMemo, useState } from 'react';
import { createCloudSyncAdapter } from '../services/syncAdapter/cloudSyncAdapter';

const defaultAdapter = createCloudSyncAdapter();
const SyncAdapterContext = createContext({
  adapter: defaultAdapter,
  setAdapter: () => {},
});

export function SyncAdapterProvider({ adapter, children }) {
  const [current, setCurrent] = useState(() => adapter || defaultAdapter);
  const value = useMemo(() => ({ adapter: current, setAdapter: setCurrent }), [current]);
  return <SyncAdapterContext.Provider value={value}>{children}</SyncAdapterContext.Provider>;
}

export function useSyncAdapter() {
  const ctx = useContext(SyncAdapterContext);
  return ctx?.adapter || defaultAdapter;
}

export function useSetSyncAdapter() {
  const ctx = useContext(SyncAdapterContext);
  return ctx?.setAdapter || (() => {});
}
