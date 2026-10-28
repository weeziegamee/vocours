/**
 * Contrat appli ↔ serveur, de bout en bout : le VRAI client de l'appli parle au VRAI
 * serveur (base en mémoire, Instacart et Twilio simulés), sur une vraie connexion HTTP.
 * Vérifie aussi que l'empreinte de liste calculée sur le téléphone (SHA-256 en TypeScript
 * pur) est celle que le serveur recalcule (node:crypto).
 *
 * Exclu du typage de l'appli (il importe le serveur, typé avec Node) : voir tsconfig.json.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { loadConfig } from '../server/src/config.ts';
import { openDatabase } from '../server/src/db.ts';
import { createLogger } from '../server/src/log.ts';
import { createApp } from '../server/src/app.ts';
import { createRequestListener } from '../server/src/http.ts';
import type { InstacartClient } from '../server/src/services/instacart.ts';

import { createVocourseBackend, type VocourseBackend } from '../src/services/api/vocourseBackend';
import { createSession, type Session } from '../src/services/auth/session';
import { createMemorySecureStore } from '../src/services/security/memorySecureStore';
import { emptyForm, validateSettingsForm } from '../src/services/caregiver/settings';
import { basketReducer, initialBasketState } from '../src/screens/basketMachine';
import { createEmptyList, listReducer } from '../src/state/listReducer';
import { stringsFor } from '../src/i18n';
import { isConfirmed, isPendingChoice } from '../src/types/vocourse';
import type { IdempotencyKey, IsoDateTime, ListId, UserId, UtteranceId } from '../src/types/vocourse';

const iso = (ms: number): IsoDateTime => new Date(ms).toISOString() as IsoDateTime;

describe('Contrat appli ↔ serveur', () => {
  let server: Server;
  let backend: VocourseBackend;
  let session: Session;
  const texts: string[] = [];
  const payloads: unknown[] = [];

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: 'test', RATE_LIMIT_REGISTER_PER_HOUR: '100' });
    const db = openDatabase(':memory:');
    const log = createLogger(() => undefined);
    const instacart: InstacartClient = {
      async createShoppingList(p) {
        payloads.push(p);
        return { ok: true, value: 'https://www.instacart.ca/store/shopping_lists/123' };
      },
      async nearbyRetailers() {
        return { ok: true, value: [{ key: 'maxi', name: 'Maxi', logoUrl: null }] };
      },
    };
    const app = createApp({
      config,
      db,
      log,
      instacart,
      sms: {
        async send(_to, body) {
          texts.push(body);
          return 'sent';
        },
      },
    });
    server = createServer(createRequestListener(app.routes, log, 0));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    session = createSession({ store: createMemorySecureStore(), exchange: (c) => backend.exchangeToken(c.deviceId, c.deviceSecret) });
    backend = createVocourseBackend({
      baseUrl: base,
      allowLocalHttp: true,
      getAccessToken: () => session.getAccessToken(),
      invalidateToken: () => session.invalidate(),
      sleep: async () => undefined,
    });
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('parcours complet : inscription → réglages → cellulaire → dictée → panier → texto → export → suppression', async () => {
    expect(await backend.health()).toBe(true);

    // 1. Inscription du téléphone (consentement).
    const reg = await backend.registerDevice({
      locale: 'fr-CA',
      platform: 'android',
      consent: { version: '2026-10', acceptedAt: iso(Date.now()), cloudSpeech: false },
    });
    if (!reg.ok) throw new Error(JSON.stringify(reg.error));
    await session.start({ deviceId: reg.value.deviceId, deviceSecret: reg.value.deviceSecret }, { accessToken: reg.value.accessToken, expiresIn: reg.value.expiresIn });

    // 2. Réglages de l'aidant (validés par l'appli, puis par le serveur).
    const form = validateSettingsForm(
      {
        ...emptyForm('fr-CA'),
        seniorFirstName: 'Jeanne',
        caregiverFirstName: 'Paul',
        caregiverMobile: '514 555-0123',
        smsConsent: true,
        civicNumber: '1234',
        street: 'rue Saint-Denis',
        city: 'Montréal',
        postalCode: 'H2T 1S6',
        preferredRetailer: { key: 'maxi', name: 'Maxi' },
      },
      iso(Date.now()),
    );
    if (!form.ok) throw new Error('formulaire attendu valide');
    const saved = await backend.saveCaregiverSettings(form.value, 'set-contract-1' as IdempotencyKey);
    expect(saved.ok ? saved.value.caregiverMobileVerified : null).toBe(false);
    const retailers = await backend.nearbyRetailers();
    expect(retailers.ok ? retailers.value.map((r) => r.name) : null).toEqual(['Maxi']);

    // 3. Cellulaire confirmé par le code reçu par texto.
    const started = await backend.startVerification('mobile');
    expect(started.ok ? started.value.sentTo : null).toBe('•••-•••-0123');
    const code = /(\d{6})/.exec(texts[texts.length - 1] ?? '')?.[1] ?? '';
    const bad = await backend.confirmVerification('mobile', code === '000000' ? '111111' : '000000');
    expect(bad.ok ? null : [bad.error.code, bad.error.attemptsLeft]).toEqual(['invalid_code', 4]);
    expect((await backend.confirmVerification('mobile', code)).ok).toBe(true);
    const status = await backend.caregiverStatus();
    expect(status.ok ? status.value : null).toEqual({ settingsSaved: true, caregiverMobileVerified: true, caregiverOptedOut: false });

    // 4. Dictée analysée par le serveur, question résolue sur le téléphone.
    const interpreted = await backend.interpretUtterance(
      {
        utteranceId: 'utt_c1' as UtteranceId,
        transcript: 'Deux cartons de lait 2 % pis du beur et du pâté chinois',
        locale: 'fr-CA',
        capturedAt: iso(Date.now()),
        fromOfflineQueue: false,
        regionalDictionary: true,
        register: 'vous',
        sttConfidence: 0.93,
      },
      'utt-utt_c1' as IdempotencyKey,
    );
    if (!interpreted.ok) throw new Error(JSON.stringify(interpreted.error));
    let list = createEmptyList('lst_c1' as ListId, 'usr_c' as UserId, iso(Date.now()));
    list = listReducer(list, { type: 'ADD_INTERPRETATION', utterance: interpreted.value.utterance, items: interpreted.value.items, now: iso(Date.now()) });
    const doubt = list.items.find(isPendingChoice);
    if (!doubt) throw new Error('question attendue pour « beur »');
    list = listReducer(list, { type: 'RESOLVE_DOUBT', itemId: doubt.itemId, answer: { kind: 'candidate', rank: 1, method: 'voice' }, now: iso(Date.now()) });
    const items = list.items.filter(isConfirmed);
    expect(items.map((i) => i.productKey)).toEqual(['lait-2-2l', 'beurre', 'free:pate-chinois']);

    // 5. Écran B : relecture, deux confirmations, envoi.
    const S = stringsFor('fr-CA', 'vous');
    const t0 = Date.now();
    let b = initialBasketState('economy');
    b = basketReducer(b, { type: 'START_READBACK', startedAt: iso(t0), text: S.basket.v.readback('economy', items, 'Paul', 'Maxi'), items });
    b = basketReducer(b, { type: 'READBACK_DONE', completedAt: iso(t0 + 15_000) });
    b = basketReducer(b, { type: 'FIRST_CONFIRM', confirmation: { method: 'tap', at: iso(t0 + 16_000) } });
    b = basketReducer(b, {
      type: 'SECOND_CONFIRM',
      confirmation: { method: 'long_press', durationMs: 2050, at: iso(t0 + 19_000) },
      listId: list.listId,
      items,
      key: 'hnd-contract-1' as IdempotencyKey,
      locale: 'fr-CA',
    });
    if (b.phase.name !== 'sending') throw new Error('envoi attendu');
    const sent = await backend.submitHandoff(b.phase.request, b.phase.key);
    if (!sent.ok) throw new Error(JSON.stringify(sent.error));
    expect(sent.value.smsStatus).toBe('sent');
    expect(sent.value.caregiverFirstName).toBe('Paul');
    const sms = texts[texts.length - 1] ?? '';
    expect(sms).toMatch(/Jeanne vous envoie sa liste d’épicerie \(3 produits, panier Économique\)/);
    expect(sms).not.toMatch(/lait|beurre|pâté/i);
    const payload = JSON.stringify(payloads[payloads.length - 1]);
    expect(payload).toMatch(/"name":"2% milk"/);
    expect(payload).toMatch(/"name":"pâté chinois"/);
    expect(payload).not.toMatch(/Jeanne|Paul|Saint-Denis/);

    // Même clé : aucune seconde transmission.
    const again = await backend.submitHandoff(b.phase.request, b.phase.key);
    expect(again).toEqual(sent);
    expect(payloads.length).toBe(1);

    // 6. Droit d'accès, puis suppression.
    const exported = await backend.exportAccount();
    expect(exported.ok ? JSON.stringify(exported.value) : '').toMatch(/rue Saint-Denis/);
    const deleted = await backend.deleteAccount();
    expect(deleted.ok).toBe(true);
    session.invalidate();
    let lost = false;
    session.onLost(() => (lost = true));
    const after = await backend.caregiverStatus();
    expect(after.ok ? null : after.error.kind).toBe('unauthorized');
    expect(lost).toBe(true);
  });
});
