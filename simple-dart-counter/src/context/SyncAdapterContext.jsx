import React, { createContext, useContext, useMemo } from 'react';
import { createCloudSyncAdapter } from '../services/syncAdapter/cloudSyncAdapter';

const defaultAdapter = createCloudSyncAdapter();
const SyncAdapterContext = createContext(defaultAdapter);

export function SyncAdapterProvider({ adapter, children }) {
  const value = useMemo(() => adapter || defaultAdapter, [adapter]);
  return <SyncAdapterContext.Provider value={value}>{children}</SyncAdapterContext.Provider>;
}

export function useSyncAdapter() {
  return useContext(SyncAdapterContext);
}
