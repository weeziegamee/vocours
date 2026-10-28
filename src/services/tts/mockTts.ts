/**
 * Synthèse vocale SIMULÉE (tests) : chaque phrase « dure » le temps qu'elle prendrait à
 * 0,85× (environ 2,4 mots par seconde). L'appli utilise la voix du téléphone (nativeTts.ts).
 *
 * Une seule phrase à la fois : une nouvelle phrase interrompt la précédente,
 * `stop()` interrompt la phrase en cours (appui du senior).
 */

import type { SpeakOptions, TtsPort } from '../../types/vocourse';
import { theme } from '../../theme/theme';

export interface MockTtsOptions {
  readonly rate?: number;
  readonly onSpeak?: (text: string, options: SpeakOptions | undefined) => void;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/** Durée simulée : 2,8 mots/s à vitesse 1, minimum 600 ms. */
export const speechDurationMs = (text: string, rate: number): number => {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(600, Math.round((words / (2.8 * rate)) * 1000));
};

export const createMockTts = (options: MockTtsOptions = {}): TtsPort => {
  const rate = options.rate ?? theme.voice.defaultRate;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let current: { timer: unknown; resolve: (r: 'completed' | 'interrupted') => void } | null = null;

  const interrupt = (): void => {
    if (!current) return;
    clearTimer(current.timer);
    const { resolve } = current;
    current = null;
    resolve('interrupted');
  };

  return {
    speak(text, speakOptions) {
      interrupt();
      options.onSpeak?.(text, speakOptions);
      return new Promise((resolve) => {
        const timer = setTimer(() => {
          current = null;
          resolve('completed');
        }, speechDurationMs(text, rate));
        current = { timer, resolve };
      });
    },
    stop: interrupt,
    setLocale() {
      // Sans objet pour la simulation.
    },
  };
};
