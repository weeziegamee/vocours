import { useCallback, useSyncExternalStore } from 'react';

import type { NetworkPort } from '../types/vocourse';

/** Joignabilité du backend, mise à jour à chaque changement signalé par le port réseau. */
export const useNetworkStatus = (network: NetworkPort): boolean => {
  const subscribe = useCallback((onChange: () => void) => network.subscribe(onChange), [network]);
  const getSnapshot = useCallback(() => network.isOnline(), [network]);
  return useSyncExternalStore(subscribe, getSnapshot);
};
