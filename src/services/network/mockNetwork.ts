/**
 * Réseau SIMULÉ, pilotable, pour rejouer les coupures (V3.0 §4.5, avenant V1.1 §8).
 * En production : sonde de joignabilité du backend (+ @react-native-community/netinfo).
 */

import type { NetworkPort } from '../../types/vocourse';

export interface MockNetwork extends NetworkPort {
  set(online: boolean): void;
}

export interface MockNetworkOptions {
  readonly startOnline: boolean;
  /** Rétablit la connexion après ce délai (démonstration de la file hors ligne). */
  readonly goOnlineAfterMs?: number | null;
}

export const createMockNetwork = (options: MockNetworkOptions): MockNetwork => {
  let online = options.startOnline;
  const listeners = new Set<(online: boolean) => void>();
  const net: MockNetwork = {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(value) {
      if (value === online) return;
      online = value;
      listeners.forEach((l) => l(online));
    },
  };
  if (!options.startOnline && options.goOnlineAfterMs != null) {
    setTimeout(() => net.set(true), options.goOnlineAfterMs);
  }
  return net;
};
