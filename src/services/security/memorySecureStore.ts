/**
 * Stockage SIMULÉ, en mémoire : tout est perdu au redémarrage de l'appli.
 * En production, implémenter `SecureStorePort` avec le Keychain iOS et le Keystore
 * Android (par exemple react-native-keychain), avec accès réservé à l'appareil
 * déverrouillé et exclusion des sauvegardes cloud.
 */

import type { SecureStorePort } from '../../types/vocourse';

export const createMemorySecureStore = (): SecureStorePort & { readonly snapshot: () => Record<string, string> } => {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
    snapshot: () => Object.fromEntries(data),
  };
};
