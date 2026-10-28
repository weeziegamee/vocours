import { useCallback, useEffect, useMemo, useRef } from 'react';
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

  const queue = useMemo(
    () =>
      createSpeechQueue<SpeakOptions>(
        async (text, options) => {
          last.current = options ? { text, options } : { text };
          if (srRef.current) {
            AccessibilityInfo.announceForAccessibility(text);
            return 'completed';
          }
          return tts.speak(text, options);
        },
        () => tts.stop(),
      ),
    [tts],
  );

  const say = useCallback((text: string, options?: SpeakOptions) => queue.enqueue(text, options), [queue]);
  const stop = useCallback(() => queue.cancel(), [queue]);
  const repeat = useCallback(() => {
    const l = last.current;
    if (!l) return;
    queue.cancel();
    void queue.enqueue(l.text, l.options);
  }, [queue]);

  return useMemo(() => ({ say, repeat, stop, screenReaderEnabled }), [say, repeat, stop, screenReaderEnabled]);
};
