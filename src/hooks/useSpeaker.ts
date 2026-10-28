import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { SpeakOptions, TtsPort } from '../types/vocourse';
import { useScreenReader } from './useAccessibilityPrefs';
import { createSpeechQueue, type SpeakOutcome } from '../services/tts/speechQueue';

export interface Speaker {
  /**
   * Ajoute une phrase à la file : elle sera dite après les précédentes, jamais par-dessus
   * (« J'ai noté… » puis la question de doute). Confiée au lecteur d'écran s'il est actif.
   */
  say(text: string, options?: SpeakOptions): Promise<SpeakOutcome>;
  /** Relit la dernière phrase (« Répète »), en coupant ce qui est en cours. */
  repeat(): void;
  /** Coupe la phrase en cours et vide la file (appui du senior = barge-in au toucher). */
  stop(): void;
  readonly screenReaderEnabled: boolean;
}

export const useSpeaker = (tts: TtsPort): Speaker => {
  const screenReaderEnabled = useScreenReader();
  const srRef = useRef(screenReaderEnabled);
  useEffect(() => {
    srRef.current = screenReaderEnabled;
  }, [screenReaderEnabled]);
  const last = useRef<{ text: string; options?: SpeakOptions } | null>(null);

  const speak = useCallback(async (text: string, options?: SpeakOptions): Promise<SpeakOutcome> => {
    last.current = options ? { text, options } : { text };
    if (srRef.current) {
      AccessibilityInfo.announceForAccessibility(text);
      return 'completed';
    }
    return tts.speak(text, options);
  }, [tts]);

  const queue = useRef<ReturnType<typeof createSpeechQueue<SpeakOptions>> | null>(null);
  useLayoutEffect(() => {
    const activeQueue = createSpeechQueue<SpeakOptions>(speak, () => tts.stop());
    queue.current = activeQueue;
    return () => {
      activeQueue.cancel();
      queue.current = null;
    };
  }, [speak, tts]);

  const say = useCallback((text: string, options?: SpeakOptions) =>
    queue.current?.enqueue(text, options) ?? Promise.resolve<SpeakOutcome>('interrupted'), []);
  const stop = useCallback(() => queue.current?.cancel(), []);
  const repeat = useCallback(() => {
    const l = last.current;
    if (!l) return;
    queue.current?.cancel();
    void queue.current?.enqueue(l.text, l.options);
  }, []);

  return useMemo(() => ({ say, repeat, stop, screenReaderEnabled }), [say, repeat, stop, screenReaderEnabled]);
};
