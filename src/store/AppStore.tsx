import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { AppState } from '../domain/types';
import { storage } from './storage';
import { createStore, type Store } from './store';

const StoreContext = createContext<Store | null>(null);

let singleton: Store | null = null;
function getStore(): Store {
  singleton ??= createStore(storage);
  return singleton;
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const store = getStore();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    store.hydrated.then(() => setReady(true));
  }, [store]);
  if (!ready) return null;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside AppStoreProvider');
  return store;
}

export function useAppState<T>(select: (s: AppState) => T): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
