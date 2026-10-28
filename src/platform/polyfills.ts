/**
 * Chargé en tout premier (index.js) : fournit `crypto.getRandomValues` et
 * `crypto.randomUUID` au moteur Hermes, à partir du générateur cryptographique du
 * téléphone (expo-crypto). Sans eux, l'appli refuse de créer un code d'aidant.
 */

import * as ExpoCrypto from 'expo-crypto';

type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  randomUUID?: () => string;
};

const g = globalThis as { crypto?: CryptoLike };
g.crypto = g.crypto ?? {};
if (!g.crypto.getRandomValues) {
  g.crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T =>
    ExpoCrypto.getRandomValues(array as unknown as Uint8Array) as unknown as T;
}
if (!g.crypto.randomUUID) g.crypto.randomUUID = () => ExpoCrypto.randomUUID();
