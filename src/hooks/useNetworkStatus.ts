import { useEffect, useState } from 'react';

import type { NetworkPort } from '../types/vocourse';

/** Joignabilité du backend, mise à jour à chaque changement signalé par le port réseau. */
export const useNetworkStatus = (network: NetworkPort): boolean => {
  const [online, setOnline] = useState(network.isOnline());
  useEffect(() => {
    setOnline(network.isOnline());
    return network.subscribe(setOnline);
  }, [network]);
  return online;
};
