/**
 * Dictée SIMULÉE (simulateur sans micro, démonstrations) : rejoue des phrases scriptées,
 * mot par mot, comme une reconnaissance en flux. Fin de prise après 4 s de silence ou au
 * second appui (`stop`).
 */

import type { AppLocale, SpeechCallbacks, SpeechPort } from '../../types/vocourse';
import { theme } from '../../theme/theme';

export interface MockSpeechOptions {
  readonly utterances: Readonly<Record<AppLocale, readonly string[]>>;
  /** Intervalle entre deux mots simulés. */
  readonly wordIntervalMs?: number;
  /** Silence avant fin de prise automatique (4 s par défaut). */
  readonly endOfSpeechMs?: number;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export const createMockSpeech = (options: MockSpeechOptions): SpeechPort => {
  const wordMs = options.wordIntervalMs ?? 350;
  const endMs = options.endOfSpeechMs ?? theme.timing.endOfSpeechSilenceMs;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let locale: AppLocale = 'fr-CA';
  let next = 0;
  let timers: unknown[] = [];
  let heard: string[] = [];
  let active: SpeechCallbacks | null = null;

  const clear = (): void => {
    timers.forEach(clearTimer);
    timers = [];
  };

  const finish = (): void => {
    const cb = active;
    active = null;
    clear();
    if (!cb) return;
    const text = heard.join(' ');
    heard = [];
    if (text.trim() === '') cb.onError('no_speech');
    else cb.onFinal(text, 0.9);
  };

  return {
    setLocale(l) {
      locale = l;
    },
    setCloudAllowed() {
      // Sans objet : rien ne sort du téléphone.
    },
    worksOffline: async () => true,
    start(callbacks) {
      if (active) finish();
      const list = options.utterances[locale];
      if (list.length === 0) {
        callbacks.onError('unavailable');
        return;
      }
      active = callbacks;
      heard = [];
      const phrase = list[next % list.length] ?? '';
      next += 1;
      const words = phrase.split(' ');
      words.forEach((word, i) => {
        timers.push(
          setTimer(() => {
            heard.push(word);
            active?.onPartial(heard.join(' '));
          }, wordMs * (i + 1)),
        );
      });
      timers.push(setTimer(finish, wordMs * words.length + endMs));
    },
    stop() {
      finish();
    },
  };
};
