import { createChunkedStore } from '../src/services/storage/chunkedStore';
import { createMemorySecureStore } from '../src/services/security/memorySecureStore';
import { createSession } from '../src/services/auth/session';
import {
  KEYS,
  QUEUE_MAX,
  loadCredentials,
  loadList,
  loadQueue,
  loadSetup,
  saveList,
  saveQueue,
  saveSetup,
  wipeDevice,
  type QueuedUtterance,
} from '../src/services/storage/persistence';
import { createSpeechSession, mapErrorCode, type RecognizerModule } from '../src/services/speech/speechSession';
import { createReachability } from '../src/services/network/reachability';
import { parseVoiceIntent } from '../src/services/voice/intents';
import { pickVoice } from '../src/services/tts/pickVoice';
import { itemsDigest } from '../src/services/handoff/digest';
import { randomBytes } from '../src/services/security/crypto';
import type { AccessToken, BackendError, DeviceId, IsoDateTime, Result, SpeechErrorReason, UtteranceId } from '../src/types/vocourse';
import { at, listWith } from './fixtures';

/* ----------------------------- Stockage ---------------------------------- */

describe('Stockage chiffré découpé', () => {
  it('garde des valeurs plus grandes qu’un morceau, et remplace proprement', async () => {
    const raw = createMemorySecureStore();
    const store = createChunkedStore(raw, 10);
    const big = 'x'.repeat(35);
    await store.setItem('k', big);
    expect(await store.getItem('k')).toBe(big);
    await store.setItem('k', 'court');
    expect(await store.getItem('k')).toBe('court');
    // L'ancienne génération est supprimée : il ne reste que le sommaire et 1 morceau.
    expect(Object.keys(raw.snapshot()).sort()).toEqual(['k', 'k.g2.0']);
    await store.removeItem('k');
    expect(raw.snapshot()).toEqual({});
    expect(await store.getItem('absent')).toBeNull();
  });

  it('ignore une valeur incomplète (morceau manquant)', async () => {
    const raw = createMemorySecureStore();
    const store = createChunkedStore(raw, 4);
    await store.setItem('k', 'abcdefgh');
    await raw.removeItem('k.g1.1');
    expect(await store.getItem('k')).toBeNull();
  });
});

describe('Persistance', () => {
  it('retrouve la liste en cours, mais pas une liste envoyée ou trop ancienne', async () => {
    const store = createMemorySecureStore();
    const list = listWith('du café');
    await saveList(store, list);
    expect((await loadList(store, new Date('2026-10-29T00:00:00Z')))?.listId).toBe(list.listId);
    expect(await loadList(store, new Date('2028-01-01T00:00:00Z'))).toBeNull();
    await saveList(store, { ...list, status: 'sent_to_caregiver' });
    expect(await loadList(store, new Date('2026-10-29T00:00:00Z'))).toBeNull();
    await store.setItem(KEYS.list, '{pas du json');
    expect(await loadList(store, new Date())).toBeNull();
  });

  it('file hors ligne : 30 au plus, 7 jours au plus', async () => {
    const store = createMemorySecureStore();
    const q = (i: number, iso: string): QueuedUtterance => ({ utteranceId: `u${i}` as UtteranceId, transcript: `t${i}`, capturedAt: iso as IsoDateTime, sttConfidence: null });
    const many = Array.from({ length: 40 }, (_, i) => q(i, '2026-10-28T10:00:00Z'));
    await saveQueue(store, [q(99, '2026-10-01T10:00:00Z'), ...many]);
    const loaded = await loadQueue(store, new Date('2026-10-28T12:00:00Z'));
    expect(loaded.length).toBe(QUEUE_MAX);
    expect(loaded[0]?.utteranceId).toBe('u10');
    await saveQueue(store, []);
    expect(await store.getItem(KEYS.queue)).toBeNull();
  });

  it('configuration et effacement complet du téléphone', async () => {
    const store = createMemorySecureStore();
    await saveSetup(store, { locale: 'en-CA', consent: { version: '2026-10', acceptedAt: at('x'), cloudSpeech: false }, step: 'pin' });
    expect((await loadSetup(store))?.step).toBe('pin');
    await store.setItem('vocourse.caregiver.pin.v1', 'x');
    await wipeDevice(store, ['vocourse.caregiver.pin.v1']);
    expect(store.snapshot()).toEqual({});
  });
});

/* ------------------------------ Session ---------------------------------- */

describe('Session de l’appareil', () => {
  const ok = (t: string): Result<AccessToken, BackendError> => ({ ok: true, value: { accessToken: t, expiresIn: 900 } });

  it('garde le jeton jusqu’à son expiration, puis en redemande un seul à la fois', async () => {
    const store = createMemorySecureStore();
    let clock = 0;
    let exchanges = 0;
    const s = createSession({ store, now: () => clock, exchange: async () => ok(`t${(exchanges += 1)}`) });
    await s.start({ deviceId: 'dev_1' as DeviceId, deviceSecret: 'secret' }, { accessToken: 't0', expiresIn: 900 });
    expect(await loadCredentials(store)).toEqual({ deviceId: 'dev_1', deviceSecret: 'secret' });
    expect(await s.getAccessToken()).toEqual({ ok: true, token: 't0' });
    clock = 900_000;
    const [a, b] = await Promise.all([s.getAccessToken(), s.getAccessToken()]);
    expect(a).toEqual({ ok: true, token: 't1' });
    expect(b).toEqual(a);
    expect(exchanges).toBe(1);
  });

  it('hors ligne : réessaiera ; secret refusé : session perdue', async () => {
    const store = createMemorySecureStore();
    let reply: Result<AccessToken, BackendError> = { ok: false, error: { kind: 'offline', status: null, attempts: 1 } };
    const s = createSession({ store, exchange: async () => reply });
    await s.start({ deviceId: 'dev_1' as DeviceId, deviceSecret: 'x' }, { accessToken: 't', expiresIn: 0 });
    let lost = 0;
    s.onLost(() => (lost += 1));
    expect(await s.getAccessToken()).toEqual({ ok: false, reason: 'offline' });
    reply = { ok: false, error: { kind: 'unauthorized', status: 401, attempts: 1 } };
    expect(await s.getAccessToken()).toEqual({ ok: false, reason: 'lost' });
    expect(lost).toBe(1);
  });

  it('sans appareil inscrit : aucun jeton', async () => {
    const s = createSession({ store: createMemorySecureStore(), exchange: async () => ok('x') });
    expect(await s.getAccessToken()).toEqual({ ok: false, reason: 'none' });
    expect(await s.hasCredentials()).toBe(false);
  });
});

/* ----------------------- Reconnaissance vocale --------------------------- */

const fakeRecognizer = (onDevice: boolean) => {
  const listeners = { result: [] as ((e: { transcript: string; confidence: number | null; isFinal: boolean }) => void)[], error: [] as ((c: string) => void)[], end: [] as (() => void)[] };
  const calls: { start: unknown[]; stop: number } = { start: [], stop: 0 };
  const module: RecognizerModule = {
    requestPermissions: async () => true,
    supportsOnDevice: async () => onDevice,
    start: (o) => void calls.start.push(o),
    stop: () => {
      calls.stop += 1;
      listeners.end.forEach((l) => l());
    },
    abort: () => undefined,
    onResult: (cb) => (listeners.result.push(cb), () => (listeners.result = listeners.result.filter((x) => x !== cb))),
    onError: (cb) => (listeners.error.push(cb), () => (listeners.error = listeners.error.filter((x) => x !== cb))),
    onEnd: (cb) => (listeners.end.push(cb), () => (listeners.end = listeners.end.filter((x) => x !== cb))),
  };
  return { module, listeners, calls };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Prise de dictée', () => {
  const clock = () => {
    const timers: { fn: () => void; ms: number; id: number }[] = [];
    let id = 0;
    return {
      setTimer: (fn: () => void, ms: number) => (timers.push({ fn, ms, id: (id += 1) }), id),
      clearTimer: (t: unknown) => {
        const i = timers.findIndex((x) => x.id === t);
        if (i >= 0) timers.splice(i, 1);
      },
      fireLast: () => timers.pop()?.fn(),
    };
  };

  it('assemble le texte, s’arrête après le silence et ne rend qu’un seul résultat', async () => {
    const r = fakeRecognizer(true);
    const c = clock();
    const s = createSpeechSession({ module: r.module, isOnline: () => false, setTimer: c.setTimer, clearTimer: c.clearTimer });
    const finals: string[] = [];
    const partials: string[] = [];
    s.start({ onPartial: (t) => partials.push(t), onFinal: (t) => finals.push(t), onError: () => finals.push('ERREUR') });
    await flush();
    expect(r.calls.start).toEqual([{ locale: 'fr-CA', onDevice: true, contextualStrings: expect.anything() }]);
    r.listeners.result.forEach((l) => l({ transcript: 'deux cartons', confidence: null, isFinal: false }));
    r.listeners.result.forEach((l) => l({ transcript: 'deux cartons de lait', confidence: 0.92, isFinal: true }));
    c.fireLast(); // 4 s de silence → stop() → fin
    r.listeners.end.forEach((l) => l());
    expect(partials).toEqual(['deux cartons', 'deux cartons de lait']);
    expect(finals).toEqual(['deux cartons de lait']);
  });

  it('sans reconnaissance sur l’appareil : en ligne seulement, et seulement si l’aidant l’a permis', async () => {
    const r = fakeRecognizer(false);
    let online = true;
    const s = createSpeechSession({ module: r.module, isOnline: () => online });
    const errors: SpeechErrorReason[] = [];
    const cb = { onPartial: () => undefined, onFinal: () => undefined, onError: (e: SpeechErrorReason) => errors.push(e) };
    s.start(cb);
    await flush();
    s.setCloudAllowed(true);
    online = false;
    s.start(cb);
    await flush();
    expect(errors).toEqual(['cloud_not_allowed', 'needs_network']);
    expect(r.calls.start.length).toBe(0);
  });

  it('deux appuis rapides : une seule prise ; arrêt pendant le démarrage : annulée sans message', async () => {
    const r = fakeRecognizer(true);
    const s = createSpeechSession({ module: r.module, isOnline: () => true });
    const errors: SpeechErrorReason[] = [];
    const cb = { onPartial: () => undefined, onFinal: () => undefined, onError: (e: SpeechErrorReason) => errors.push(e) };
    s.start(cb);
    s.start(cb);
    await flush();
    expect(r.calls.start.length).toBe(1);
    s.stop();
    await flush();
    const r2 = fakeRecognizer(true);
    const s2 = createSpeechSession({ module: r2.module, isOnline: () => true });
    s2.start(cb);
    s2.stop();
    await flush();
    expect(r2.calls.start.length).toBe(0);
    expect(errors).toEqual(['no_speech', 'cancelled']);
  });

  it('traduit les codes d’erreur de la bibliothèque', () => {
    expect(mapErrorCode('not-allowed')).toBe('permission_denied');
    expect(mapErrorCode('no-speech')).toBe('no_speech');
    expect(mapErrorCode('network')).toBe('needs_network');
    expect(mapErrorCode('busy')).toBe('unavailable');
  });
});

/* --------------------------- Voix du téléphone --------------------------- */

describe('Choix de la voix', () => {
  const voices = [
    { identifier: 'fr-fr', language: 'fr-FR', quality: 'Default' },
    { identifier: 'fr-ca', language: 'fr-CA', quality: 'Default' },
    { identifier: 'fr-ca-plus', language: 'fr_CA', quality: 'Enhanced' },
    { identifier: 'en-us', language: 'en-US', quality: 'Default' },
  ];
  it('préfère la variante canadienne améliorée, puis la même langue', () => {
    expect(pickVoice(voices, 'fr-CA')).toBe('fr-ca-plus');
    expect(pickVoice(voices, 'en-CA')).toBe('en-us');
    expect(pickVoice([], 'en-CA')).toBeNull();
  });
});

/* ------------------------------ Réseau ----------------------------------- */

describe('Joignabilité du serveur', () => {
  it('sonde au démarrage, sur changement de connexion et au retour au premier plan', async () => {
    let up = false;
    let connCb: (c: boolean) => void = () => undefined;
    let fgCb: () => void = () => undefined;
    const changes: boolean[] = [];
    const r = createReachability({
      probe: async () => up,
      onConnectivityChange: (cb) => ((connCb = cb), () => undefined),
      onForeground: (cb) => ((fgCb = cb), () => undefined),
      setInterval: () => 1,
      clearInterval: () => undefined,
    });
    r.subscribe((o) => changes.push(o));
    await flush();
    expect(r.isOnline()).toBe(false);
    up = true;
    connCb(true);
    await flush();
    expect(r.isOnline()).toBe(true);
    connCb(false);
    expect(r.isOnline()).toBe(false);
    fgCb();
    await flush();
    expect(changes).toEqual([false, true, false, true]);
    r.dispose();
  });
});

/* ------------------------- Réponses vocales ------------------------------ */

describe('Réponses vocales', () => {
  const kind = (t: string, l: 'fr-CA' | 'en-CA' = 'fr-CA') => parseVoiceIntent(t, l)?.kind ?? null;
  it('comprend oui, non, répète, les gammes et les choix', () => {
    expect(kind('Oui, c’est ça')).toBe('yes');
    expect(kind('non')).toBe('no');
    expect(kind('Répète s’il te plaît')).toBe('repeat');
    expect(kind('Le panier bio')).toBe('choose_tier');
    expect(parseVoiceIntent('le deuxième', 'fr-CA')).toMatchObject({ kind: 'choose_candidate', rank: 2 });
    expect(kind('aucun')).toBe('none_matched');
    expect(kind('the second one', 'en-CA')).toBe('choose_candidate');
    expect(kind('yes', 'en-CA')).toBe('yes');
    expect(kind('blabla')).toBeNull();
  });

  it('« je commande » confirme, mais jamais une phrase négative', () => {
    expect(kind('Oui, je commande')).toBe('confirm_order');
    expect(kind('Yes, place the order', 'en-CA')).toBe('confirm_order');
    expect(kind('Non, je commande pas')).not.toBe('confirm_order');
    expect(kind('Don’t place the order', 'en-CA')).not.toBe('confirm_order');
  });
});

/* ---------------------------- Empreinte ---------------------------------- */

describe('Empreinte de liste', () => {
  it('ne dépend pas de l’ordre, et change avec la quantité', () => {
    const a = { itemId: 'a', productKey: 'beurre', quantity: 1, unit: 'package' };
    const b = { itemId: 'b', productKey: 'oeufs', quantity: 2, unit: 'dozen' };
    expect(itemsDigest([a, b])).toBe(itemsDigest([b, a]));
    expect(itemsDigest([a, b])).not.toBe(itemsDigest([a, { ...b, quantity: 3 }]));
    expect(itemsDigest([a])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuse de produire de l’aléa sans source cryptographique', () => {
    const g = globalThis as { crypto?: unknown };
    const saved = g.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      expect(() => randomBytes(4)).toThrow();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true, writable: true });
    }
  });
});
