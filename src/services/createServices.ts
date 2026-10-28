/**
 * Assemblage des services selon le mode :
 * - `live` : serveur Vocourse réel, session d'appareil, réseau sondé ;
 * - `demo` : serveur simulé sur le téléphone (aucun envoi réel).
 * Dans les deux modes : dictée et voix du téléphone, stockage chiffré Keychain / Keystore.
 */

import { Platform } from 'react-native';

import type { NetworkPort, SecureStorePort, SpeechPort, TtsPort } from '../types/vocourse';
import type { AppEnv } from '../config/env';
import { createVocourseBackend, type VocourseBackend } from './api/vocourseBackend';
import { createMockVocourseBackend, DEMO_UTTERANCES } from './api/mockVocourseBackend';
import { createSession, type Session } from './auth/session';
import { createDeviceSecureStore } from './storage/expoSecureStore';
import { createNativeSpeech } from './speech/nativeSpeech';
import { createMockSpeech } from './speech/mockSpeech';
import { createNativeTts } from './tts/nativeTts';
import { createNativeNetwork } from './network/nativeNetwork';
import { createMockNetwork } from './network/mockNetwork';

export interface Services {
  readonly backend: VocourseBackend;
  readonly session: Session;
  readonly speech: SpeechPort;
  readonly tts: TtsPort;
  readonly network: NetworkPort;
  readonly secureStore: SecureStorePort;
  readonly platform: 'ios' | 'android';
}

const devLog = (tag: string) => (msg: unknown, data?: unknown): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[Vocourse ${tag}]`, msg, data ?? '');
  }
};

export const createServices = (env: AppEnv): Services => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const secureStore = createDeviceSecureStore();
  const tts = createNativeTts();

  // Liaison tardive : la session échange le secret auprès du serveur, et le serveur
  // demande ses jetons à la session.
  let backend: VocourseBackend;
  const session = createSession({
    store: secureStore,
    exchange: (c) => backend.exchangeToken(c.deviceId, c.deviceSecret),
  });

  let network: NetworkPort;
  if (env.mode === 'live') {
    backend = createVocourseBackend({
      baseUrl: env.apiUrl,
      getAccessToken: () => session.getAccessToken(),
      invalidateToken: () => session.invalidate(),
      allowLocalHttp: env.allowLocalHttp,
    });
    network = createNativeNetwork(() => backend.health());
  } else {
    backend = createMockVocourseBackend({ scenario: env.demo.scenario, log: devLog('serveur simulé') });
    network = createMockNetwork({ startOnline: !env.demo.startOffline, goOnlineAfterMs: env.demo.goOnlineAfterMs });
  }

  const speech = env.demo.simulatedSpeech
    ? createMockSpeech({ utterances: DEMO_UTTERANCES })
    : createNativeSpeech(() => network.isOnline());

  return { backend, session, speech, tts, network, secureStore, platform };
};
