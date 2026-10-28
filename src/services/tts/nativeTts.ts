/**
 * Voix de l'appli : synthèse vocale du téléphone via expo-speech
 * (AVSpeechSynthesizer sur iOS, TextToSpeech sur Android). Aucun texte ne sort du
 * téléphone. Débit 0,85 (V3.0 §4.1) ; voix fr-CA ou en-CA de meilleure qualité disponible.
 */

import * as Speech from 'expo-speech';

import type { AppLocale, SpeakOptions, TtsPort } from '../../types/vocourse';
import { theme } from '../../theme/theme';
import { pickVoice } from './pickVoice';

export const createNativeTts = (): TtsPort => {
  let locale: AppLocale = 'fr-CA';
  const voiceFor = new Map<AppLocale, string | null>();
  let current: ((o: 'completed' | 'interrupted') => void) | null = null;

  const loadVoice = async (l: AppLocale): Promise<string | null> => {
    if (voiceFor.has(l)) return voiceFor.get(l) ?? null;
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const id = pickVoice(voices, l);
      voiceFor.set(l, id);
      return id;
    } catch {
      voiceFor.set(l, null);
      return null;
    }
  };

  return {
    setLocale(l) {
      locale = l;
      void loadVoice(l);
    },
    async speak(text: string, _options?: SpeakOptions) {
      const voice = await loadVoice(locale);
      return new Promise<'completed' | 'interrupted'>((resolve) => {
        let settled = false;
        const done = (o: 'completed' | 'interrupted'): void => {
          if (settled) return;
          settled = true;
          if (current === done) current = null;
          resolve(o);
        };
        current = done;
        Speech.speak(text, {
          language: locale,
          ...(voice ? { voice } : {}),
          rate: theme.voice.defaultRate,
          onDone: () => done('completed'),
          onStopped: () => done('interrupted'),
          onError: () => done('interrupted'),
        });
      });
    },
    stop() {
      const c = current;
      current = null;
      void Speech.stop();
      c?.('interrupted');
    },
  };
};
