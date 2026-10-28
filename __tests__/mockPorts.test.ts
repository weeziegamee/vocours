import { createMockSpeech } from '../src/services/speech/mockSpeech';
import { createMockTts, speechDurationMs } from '../src/services/tts/mockTts';
import { createMockNetwork } from '../src/services/network/mockNetwork';

/** Horloge manuelle : les minuteries ne s'exécutent que lorsqu'on avance le temps. */
const fakeClock = () => {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      id += 1;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    advance: (ms: number) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
};

describe('Dictée simulée', () => {
  it('émet la transcription mot à mot puis termine après 4 s de silence', () => {
    const clock = fakeClock();
    const speech = createMockSpeech({ utterances: { 'fr-CA': ['du café'], 'en-CA': [] }, wordIntervalMs: 100, endOfSpeechMs: 4000, ...clock });
    const partials: string[] = [];
    let final = '';
    speech.start({ onPartial: (t) => partials.push(t), onFinal: (t) => (final = t), onError: () => undefined });
    clock.advance(250);
    expect(partials).toEqual(['du', 'du café']);
    expect(final).toBe('');
    clock.advance(4000);
    expect(final).toBe('du café');
  });

  it('termine la prise au second appui avec ce qui a été entendu', () => {
    const clock = fakeClock();
    const speech = createMockSpeech({ utterances: { 'fr-CA': ['deux cartons de lait'], 'en-CA': [] }, wordIntervalMs: 100, ...clock });
    let final = '';
    speech.start({ onPartial: () => undefined, onFinal: (t) => (final = t), onError: () => undefined });
    clock.advance(250);
    speech.stop();
    expect(final).toBe('deux cartons');
  });

  it('signale « rien entendu » si l’on arrête immédiatement', () => {
    const clock = fakeClock();
    const speech = createMockSpeech({ utterances: { 'fr-CA': ['du café'], 'en-CA': [] }, ...clock });
    let error = '';
    speech.start({ onPartial: () => undefined, onFinal: () => undefined, onError: (e) => (error = e) });
    speech.stop();
    expect(error).toBe('no_speech');
  });
});

describe('Voix simulée', () => {
  it('termine une phrase après sa durée de lecture', async () => {
    const clock = fakeClock();
    const tts = createMockTts({ rate: 1, ...clock });
    const p = tts.speak('Votre liste est prête.');
    clock.advance(speechDurationMs('Votre liste est prête.', 1));
    expect(await p).toBe('completed');
  });

  it('est interrompue par stop() ou par une nouvelle phrase', async () => {
    const clock = fakeClock();
    const tts = createMockTts({ ...clock });
    const a = tts.speak('Première phrase assez longue pour durer.');
    const b = tts.speak('Deuxième.');
    expect(await a).toBe('interrupted');
    tts.stop();
    expect(await b).toBe('interrupted');
  });
});

describe('Réseau simulé', () => {
  it('prévient les abonnés à chaque changement réel', () => {
    const net = createMockNetwork({ startOnline: true });
    const seen: boolean[] = [];
    const off = net.subscribe((v) => seen.push(v));
    net.set(false);
    net.set(false);
    net.set(true);
    off();
    net.set(false);
    expect(seen).toEqual([false, true]);
  });
});
