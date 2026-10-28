import { createSpeechQueue, type SpeakOutcome } from '../src/services/tts/speechQueue';

/** Voix factice : chaque phrase reste « en cours » jusqu'à `finish()` ou `stop()`. */
const fakeVoice = () => {
  const spoken: string[] = [];
  let pending: ((o: SpeakOutcome) => void) | null = null;
  return {
    spoken,
    speak: (text: string) =>
      new Promise<SpeakOutcome>((resolve) => {
        spoken.push(text);
        pending = resolve;
      }),
    stop: () => {
      pending?.('interrupted');
      pending = null;
    },
    finish: () => {
      pending?.('completed');
      pending = null;
    },
  };
};

const tick = () => new Promise<void>((r) => setTimeout(() => r(), 0));

describe('File de répliques', () => {
  it('enchaîne les phrases sans les superposer', async () => {
    const v = fakeVoice();
    const q = createSpeechQueue(v.speak, v.stop);
    const a = q.enqueue('J’ai noté : du pain.');
    const b = q.enqueue('Vouliez-vous du beurre ?');
    await tick();
    expect(v.spoken).toEqual(['J’ai noté : du pain.']);
    v.finish();
    expect(await a).toBe('completed');
    await tick();
    expect(v.spoken).toEqual(['J’ai noté : du pain.', 'Vouliez-vous du beurre ?']);
    v.finish();
    expect(await b).toBe('completed');
  });

  it('abandonne la file quand le senior touche l’écran', async () => {
    const v = fakeVoice();
    const q = createSpeechQueue(v.speak, v.stop);
    const a = q.enqueue('Première');
    const b = q.enqueue('Deuxième');
    await tick();
    q.cancel();
    expect(await a).toBe('interrupted');
    expect(await b).toBe('interrupted');
    expect(v.spoken).toEqual(['Première']);
    const c = q.enqueue('Après l’appui');
    await tick();
    v.finish();
    expect(await c).toBe('completed');
    expect(v.spoken).toEqual(['Première', 'Après l’appui']);
  });

  it('ignore les phrases vides', async () => {
    const v = fakeVoice();
    const q = createSpeechQueue(v.speak, v.stop);
    expect(await q.enqueue('   ')).toBe('completed');
    expect(v.spoken).toEqual([]);
  });
});
