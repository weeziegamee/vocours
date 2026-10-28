/**
 * Reconnaissance vocale du téléphone via expo-speech-recognition
 * (SFSpeechRecognizer sur iOS, SpeechRecognizer sur Android).
 * La logique de prise (silence, fin unique, choix sur l'appareil / en ligne) est dans
 * speechSession.ts ; ce fichier ne fait que relier la bibliothèque native.
 */

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import type { AppLocale, SpeechPort } from '../../types/vocourse';
import { createSpeechSession, type RecognizerModule } from './speechSession';

/** Langue reconnue sur l'appareil : fr-CA de préférence, sinon une autre variante installée. */
const onDeviceTag = new Map<AppLocale, string | null>();

const findOnDeviceTag = async (locale: AppLocale): Promise<string | null> => {
  if (onDeviceTag.has(locale)) return onDeviceTag.get(locale) ?? null;
  let tag: string | null = null;
  try {
    if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
      const lang = locale.slice(0, 2);
      if (installedLocales.length === 0 && Platform.OS === 'ios') tag = locale; // iOS : moteur intégré
      else tag = installedLocales.find((l) => l === locale) ?? installedLocales.find((l) => l.startsWith(lang)) ?? null;
    }
  } catch {
    tag = null;
  }
  onDeviceTag.set(locale, tag);
  return tag;
};

const recognizer: RecognizerModule = {
  async requestPermissions() {
    const r = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return r.granted;
  },
  supportsOnDevice: async (locale) => (await findOnDeviceTag(locale)) !== null,
  start({ locale, onDevice, contextualStrings }) {
    const lang = onDevice ? (onDeviceTag.get(locale) ?? locale) : locale;
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: Platform.OS === 'ios' || Number(Platform.Version) >= 33,
      requiresOnDeviceRecognition: onDevice,
      addsPunctuation: false,
      maxAlternatives: 1,
      contextualStrings: [...contextualStrings],
      iosTaskHint: 'dictation',
      androidIntentOptions: {
        // La session gère elle-même les 4 s de silence ; Android ne coupe pas avant.
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 6000,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 6000,
        EXTRA_MASK_OFFENSIVE_WORDS: false,
      },
    });
  },
  stop: () => ExpoSpeechRecognitionModule.stop(),
  abort: () => ExpoSpeechRecognitionModule.abort(),
  onResult(cb) {
    const sub = ExpoSpeechRecognitionModule.addListener('result', (e) => {
      const best = e.results[0];
      if (best) cb({ transcript: best.transcript, confidence: typeof best.confidence === 'number' && best.confidence >= 0 ? best.confidence : null, isFinal: e.isFinal });
    });
    return () => sub.remove();
  },
  onError(cb) {
    const sub = ExpoSpeechRecognitionModule.addListener('error', (e) => cb(String(e.error)));
    return () => sub.remove();
  },
  onEnd(cb) {
    const sub = ExpoSpeechRecognitionModule.addListener('end', () => cb());
    return () => sub.remove();
  },
};

export const createNativeSpeech = (isOnline: () => boolean): SpeechPort => createSpeechSession({ module: recognizer, isOnline });
