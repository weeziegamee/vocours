/**
 * Keychain (iOS) / Keystore (Android) via expo-secure-store.
 * - Accessible après le premier déverrouillage, sur cet appareil seulement : jamais copié
 *   dans une sauvegarde iCloud ni restauré sur un autre téléphone.
 * - Sauvegarde Android exclue par le plugin expo-secure-store (app.config.js).
 */

import * as SecureStore from 'expo-secure-store';

import type { SecureStorePort } from '../../types/vocourse';
import { createChunkedStore } from './chunkedStore';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const raw: SecureStorePort = {
  getItem: (key) => SecureStore.getItemAsync(key, OPTIONS),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  removeItem: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
};

export const createDeviceSecureStore = (): SecureStorePort => createChunkedStore(raw);
