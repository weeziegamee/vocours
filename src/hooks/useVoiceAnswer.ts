/**
 * Écoute d'une réponse courte (« oui », « répète », « oui, je commande »…) sur l'écran
 * « Mon panier ». Le texte est reconnu et interprété sur le téléphone, sans serveur.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppLocale, SpeechPort, VoiceIntent } from '../types/vocourse';
import { parseVoiceIntent } from '../services/voice/intents';

export interface VoiceAnswer {
  readonly listening: boolean;
  readonly heard: string;
  /** Premier appui : écoute ; second appui : fin de l'écoute. */
  toggle(): void;
}

export const useVoiceAnswer = (
  speech: SpeechPort,
  locale: AppLocale,
  onIntent: (intent: VoiceIntent | null, heard: string) => void,
  beforeListen?: () => void,
): VoiceAnswer => {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const cb = useRef(onIntent);
  cb.current = onIntent;
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      speech.stop();
    },
    [speech],
  );

  const toggle = useCallback(() => {
    if (listening) {
      speech.stop();
      return;
    }
    beforeListen?.();
    setHeard('');
    setListening(true);
    speech.start({
      onPartial: (t) => mounted.current && setHeard(t),
      onFinal: (t) => {
        if (!mounted.current) return;
        setListening(false);
        setHeard(t);
        cb.current(parseVoiceIntent(t, locale), t);
      },
      onError: () => {
        if (!mounted.current) return;
        setListening(false);
        cb.current(null, '');
      },
    });
  }, [listening, speech, locale, beforeListen]);

  return { listening, heard, toggle };
};
