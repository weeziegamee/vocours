/**
 * File de répliques : chaque phrase attend la fin de la précédente (aucun chevauchement),
 * et `cancel()` abandonne tout ce qui est en attente (appui du senior).
 * Logique pure, sans React Native.
 */

export type SpeakOutcome = 'completed' | 'interrupted';

export interface SpeechQueue<O> {
  enqueue(text: string, options?: O): Promise<SpeakOutcome>;
  /** Coupe la phrase en cours (via `stopCurrent`) et abandonne les phrases en file. */
  cancel(): void;
}

export const createSpeechQueue = <O>(
  speakNow: (text: string, options?: O) => Promise<SpeakOutcome>,
  stopCurrent: () => void,
): SpeechQueue<O> => {
  let chain: Promise<unknown> = Promise.resolve();
  let generation = 0;

  return {
    enqueue(text, options) {
      if (text.trim() === '') return Promise.resolve('completed');
      const gen = generation;
      const run = chain.then(
        (): Promise<SpeakOutcome> | SpeakOutcome => (gen === generation ? speakNow(text, options) : 'interrupted'),
      );
      chain = run.catch(() => undefined);
      return run;
    },
    cancel() {
      generation += 1;
      chain = Promise.resolve();
      stopCurrent();
    },
  };
};
