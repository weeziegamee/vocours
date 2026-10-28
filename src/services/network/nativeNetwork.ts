/** Connexion réelle : NetInfo (changements signalés par le système) + sonde du serveur. */

import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { createReachability, type Reachability } from './reachability';

export const createNativeNetwork = (probe: () => Promise<boolean>): Reachability =>
  createReachability({
    probe,
    onConnectivityChange: (cb) => NetInfo.addEventListener((state) => cb(state.isConnected !== false)),
    onForeground: (cb) => {
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') cb();
      });
      return () => sub.remove();
    },
  });
