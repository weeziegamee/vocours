import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CONSENT, SETTINGS, startHarness, type Harness } from './helpers.ts';
import { itemsDigest } from '../src/crypto.ts';

const register = async (h: Harness, locale = 'fr-CA') => {
  const r = await h.call('POST', '/v1/devices', { locale, platform: 'ios', consent: CONSENT });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body as { deviceId: string; deviceSecret: string; accessToken: string; expiresIn: number };
};

/** Compte prêt : réglages enregistrés et cellulaire vérifié. */
const readyAccount = async (h: Harness, settings: Record<string, unknown> = SETTINGS) => {
  const dev = await register(h);
  const saved = await h.call('PUT', '/v1/caregiver/settings', settings, { token: dev.accessToken, idem: `set-${dev.deviceId}` });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const before = h.sent.length;
  const start = await h.call('POST', '/v1/caregiver/verification', { purpose: 'mobile' }, { token: dev.accessToken });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const code = /(\d{6})/.exec(h.sent[before]?.body ?? '')?.[1];
  assert.ok(code, 'code reçu par texto');
  const confirm = await h.call('POST', '/v1/caregiver/verification/confirm', { purpose: 'mobile', code }, { token: dev.accessToken });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  return dev;
};

const interpret = async (h: Harness, token: string, transcript: string, id = 'utt_1') => {
  const r = await h.call(
    'POST',
    '/v1/utterances',
    { utteranceId: id, transcript, locale: 'fr-CA', capturedAt: '2026-10-28T14:00:00Z', fromOfflineQueue: false, regionalDictionary: true },
    { token, idem: `utt-${id}` },
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { items: any[] };
};

const handoffBody = (items: any[], overrides: Record<string, unknown> = {}) => {
  const lines = items.map((i) => ({
    itemId: i.itemId,
    productKey: i.productKey,
    productLabel: i.productLabel,
    quantity: i.quantity,
    unit: i.unit,
    packageSize: i.packageSize,
    sensitive: i.sensitive,
    category: i.category,
  }));
  return {
    listId: 'lst_1',
    tier: 'economy',
    items: lines,
    itemsDigest: itemsDigest(lines),
    locale: 'fr-CA',
    confirmation: {
      readbackStartedAt: '2026-10-28T14:01:00Z',
      readbackCompletedAt: '2026-10-28T14:01:20Z',
      readbackText: 'Vous choisissez le panier Économique : 2 produits. C’est bien ça ?',
      first: { method: 'tap', at: '2026-10-28T14:01:25Z' },
      second: { method: 'long_press', at: '2026-10-28T14:01:30Z', durationMs: 2000 },
      actor: 'senior',
    },
    ...overrides,
  };
};

describe('API Vocourse', () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  after(async () => {
    await h.close();
  });

  it('répond à la sonde de santé, avec les en-têtes de sécurité', async () => {
    const res = await fetch(`${h.base}/v1/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('strict-transport-security'));
  });

  it('refuse les routes inconnues, les méthodes et les corps non JSON', async () => {
    assert.equal((await h.call('GET', '/v1/nope')).status, 404);
    assert.equal((await h.call('GET', '/v1/handoffs')).status, 405);
    const res = await fetch(`${h.base}/v1/devices`, { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } });
    assert.equal(res.status, 415);
  });

  it('inscrit un appareil et échange son secret contre un jeton', async () => {
    const dev = await register(h);
    assert.match(dev.deviceId, /^dev_/);
    assert.ok(dev.deviceSecret.length >= 40);
    const t = await h.call('POST', '/v1/auth/token', { deviceId: dev.deviceId, deviceSecret: dev.deviceSecret });
    assert.equal(t.status, 200);
    assert.match(t.body.accessToken, /^v1\./);
    const bad = await h.call('POST', '/v1/auth/token', { deviceId: dev.deviceId, deviceSecret: 'faux' });
    assert.equal(bad.status, 401);
  });

  it('exige un jeton valide et non expiré', async () => {
    assert.equal((await h.call('GET', '/v1/caregiver/status')).status, 401);
    assert.equal((await h.call('GET', '/v1/caregiver/status', undefined, { token: 'v1.abc.def' })).status, 401);
    const dev = await register(h);
    h.clock += 16 * 60_000; // jeton de 15 minutes
    assert.equal((await h.call('GET', '/v1/caregiver/status', undefined, { token: dev.accessToken })).status, 401);
    h.clock -= 16 * 60_000;
  });

  it('valide les réglages : code postal et province doivent concorder', async () => {
    const dev = await register(h);
    const wrong = await h.call(
      'PUT',
      '/v1/caregiver/settings',
      { ...SETTINGS, address: { ...SETTINGS.address, postalCode: 'M5V 3L9' } },
      { token: dev.accessToken, idem: 'set-wrong-province' },
    );
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.error.field, 'body.address.province');
    const toronto = await h.call(
      'PUT',
      '/v1/caregiver/settings',
      { ...SETTINGS, language: 'en-CA', address: { ...SETTINGS.address, city: 'Toronto', province: 'ON', postalCode: 'm5v3l9' } },
      { token: dev.accessToken, idem: 'set-toronto' },
    );
    assert.equal(toronto.status, 200, JSON.stringify(toronto.body));
    assert.equal(toronto.body.caregiverMobileVerified, false);
    const noConsent = await h.call('PUT', '/v1/caregiver/settings', { ...SETTINGS, smsConsent: false }, { token: dev.accessToken, idem: 'set-noconsent' });
    assert.equal(noConsent.status, 422);
  });

  it('vérifie le cellulaire par code : 5 essais au plus, puis le code est invalidé', async () => {
    const dev = await register(h);
    await h.call('PUT', '/v1/caregiver/settings', SETTINGS, { token: dev.accessToken, idem: `s-${dev.deviceId}` });
    const start = await h.call('POST', '/v1/caregiver/verification', { purpose: 'mobile' }, { token: dev.accessToken });
    assert.equal(start.status, 200);
    assert.equal(start.body.sentTo, '•••-•••-0123');
    for (let i = 4; i >= 0; i -= 1) {
      const r = await h.call('POST', '/v1/caregiver/verification/confirm', { purpose: 'mobile', code: '000000' }, { token: dev.accessToken });
      // Le vrai code pourrait (rarement) être 000000 : ce test le tolère.
      if (r.status === 200) return;
      assert.equal(r.status, 422);
      assert.equal(r.body.error.attemptsLeft, i);
    }
    const after5 = await h.call('POST', '/v1/caregiver/verification/confirm', { purpose: 'mobile', code: '123456' }, { token: dev.accessToken });
    assert.equal(after5.status, 410);
  });

  it('limite l’envoi de codes par texto', async () => {
    const dev = await register(h);
    await h.call('PUT', '/v1/caregiver/settings', { ...SETTINGS, caregiverMobile: '+14385550199' }, { token: dev.accessToken, idem: `s2-${dev.deviceId}` });
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await h.call('POST', '/v1/caregiver/verification', { purpose: 'mobile' }, { token: dev.accessToken })).status, 200);
    }
    const sixth = await h.call('POST', '/v1/caregiver/verification', { purpose: 'mobile' }, { token: dev.accessToken });
    assert.equal(sixth.status, 429);
  });

  it('analyse une dictée et la rejoue à l’identique avec la même clé', async () => {
    const dev = await register(h);
    const a = await interpret(h, dev.accessToken, 'Deux cartons de lait 2 % pis du jus de canneberge', 'utt_replay');
    assert.equal(a.items.length, 2);
    assert.equal(a.items[0].productKey, 'lait-2-2l');
    assert.equal(a.items[1].productKey, 'free:jus-canneberge');
    const b = await interpret(h, dev.accessToken, 'Deux cartons de lait 2 % pis du jus de canneberge', 'utt_replay');
    assert.deepEqual(b, a);
    const mismatch = await h.call(
      'POST',
      '/v1/utterances',
      { utteranceId: 'utt_replay', transcript: 'autre chose', locale: 'fr-CA', capturedAt: '2026-10-28T14:00:00Z', fromOfflineQueue: false, regionalDictionary: true },
      { token: dev.accessToken, idem: 'utt-utt_replay' },
    );
    assert.equal(mismatch.status, 422);
    assert.equal(mismatch.body.error.code, 'idempotency_mismatch');
  });

  it('refuse la transmission tant que le cellulaire n’est pas vérifié, puis l’accepte avec la même clé', async () => {
    const dev = await register(h);
    await h.call('PUT', '/v1/caregiver/settings', { ...SETTINGS, caregiverMobile: '+15145550177' }, { token: dev.accessToken, idem: `s3-${dev.deviceId}` });
    const { items } = await interpret(h, dev.accessToken, 'du beurre et des œufs', 'utt_unv');
    const r = await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-unverified' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'caregiver_unverified');
    const before = h.sent.length;
    await h.call('POST', '/v1/caregiver/verification', { purpose: 'mobile' }, { token: dev.accessToken });
    const code = /(\d{6})/.exec(h.sent[before]?.body ?? '')?.[1];
    await h.call('POST', '/v1/caregiver/verification/confirm', { purpose: 'mobile', code }, { token: dev.accessToken });
    // Un refus « provisoire » (409) n'est pas rejoué : la même clé réussit maintenant.
    const ok = await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-unverified' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  it('refuse les numéros des Caraïbes et non géographiques (fraude aux textos)', async () => {
    const dev = await register(h);
    for (const m of ['+18765550123', '+18095550123', '+18005550123']) {
      const r = await h.call('PUT', '/v1/caregiver/settings', { ...SETTINGS, caregiverMobile: m }, { token: dev.accessToken, idem: `blocked-${m.slice(1)}` });
      assert.equal(r.status, 422, m);
    }
    const us = await h.call('PUT', '/v1/caregiver/settings', { ...SETTINGS, caregiverMobile: '+12125550123' }, { token: dev.accessToken, idem: 'us-number-ok' });
    assert.equal(us.status, 200);
  });

  it('transmet la liste confirmée : lien Instacart, texto sans nom de produit, rejeu sans doublon', async () => {
    const dev = await readyAccount(h);
    const { items } = await interpret(h, dev.accessToken, 'du beurre et des tampons', 'utt_ok');
    const sentBefore = h.sent.length;
    const r = await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-ok-1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'sent_to_caregiver');
    assert.equal(r.body.caregiverNotified, true);
    assert.equal(r.body.caregiverFirstName, 'Paul');

    const text = h.sent[sentBefore]?.body ?? '';
    assert.match(text, /Jeanne vous envoie sa liste/);
    assert.match(text, /de préférence Maxi/);
    assert.match(text, /https:\/\/www\.instacart\.ca/);
    assert.doesNotMatch(text, /beurre|tampon/i);

    const payload = h.payloads[h.payloads.length - 1];
    assert.ok(payload);
    assert.equal(payload.link_type, 'shopping_list');
    assert.equal(payload.expires_in, 2);
    assert.doesNotMatch(JSON.stringify(payload), /Jeanne|Paul|Saint-Denis|0123/);
    const butter = payload.line_items.find((l) => l.name === 'salted butter');
    assert.deepEqual(butter?.filters, { brand_filters: ['no name', 'No Name', 'sans nom'] });
    const tampons = payload.line_items.find((l) => l.name === 'tampons');
    assert.equal(tampons?.filters, undefined, 'aucun filtre sur un produit sensible');

    const again = await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-ok-1' });
    assert.deepEqual(again.body, r.body);
    assert.equal(h.sent.length, sentBefore + 1, 'aucun second texto');
  });

  it('refuse une liste modifiée après la relecture ou une confirmation dans le désordre', async () => {
    const dev = await readyAccount(h);
    const { items } = await interpret(h, dev.accessToken, 'du café', 'utt_digest');
    const tampered = handoffBody(items);
    (tampered.items as any[])[0].quantity = 9;
    const r = await h.call('POST', '/v1/handoffs', tampered, { token: dev.accessToken, idem: 'hnd-tampered' });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'digest_mismatch');

    const base = handoffBody(items);
    const early = handoffBody(items, {
      confirmation: { ...(base.confirmation as object), second: { method: 'long_press', at: '2026-10-28T14:01:30Z', durationMs: 500 } },
    });
    const r2 = await h.call('POST', '/v1/handoffs', early, { token: dev.accessToken, idem: 'hnd-short-press' });
    assert.equal(r2.status, 422);
    assert.equal(r2.body.error.code, 'confirmation_invalid');
  });

  it('garde la liste quand le texto échoue, puis le renvoie', async () => {
    const dev = await readyAccount(h);
    const { items } = await interpret(h, dev.accessToken, 'du pain', 'utt_smsfail');
    h.smsOutcome = 'failed';
    const r = await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-smsfail' });
    assert.equal(r.status, 200);
    assert.equal(r.body.caregiverNotified, false);
    assert.equal(r.body.smsStatus, 'pending');
    h.smsOutcome = 'sent';
    const before = h.sent.length;
    assert.equal(await h.app.retryPendingSms(), 1);
    assert.equal(h.sent.length, before + 1);
    assert.equal(await h.app.retryPendingSms(), 0);
  });

  it('répond 503 sans rien enregistrer si Instacart est indisponible', async () => {
    const dev = await readyAccount(h);
    const { items } = await interpret(h, dev.accessToken, 'du riz', 'utt_down');
    h.instacartDown = true;
    const r = await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-down' });
    assert.equal(r.status, 503);
    h.instacartDown = false;
    const retry = await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-down' });
    assert.equal(retry.status, 200);
  });

  it('marque l’aidant désabonné (STOP) et bloque les envois suivants', async () => {
    const dev = await readyAccount(h, { ...SETTINGS, caregiverMobile: '+15815550111' });
    const { items } = await interpret(h, dev.accessToken, 'du thé', 'utt_stop');
    h.smsOutcome = 'opted_out';
    const r = await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-stop' });
    assert.equal(r.body.smsStatus, 'opted_out');
    h.smsOutcome = 'sent';
    const status = await h.call('GET', '/v1/caregiver/status', undefined, { token: dev.accessToken });
    assert.equal(status.body.caregiverOptedOut, true);
    const next = await h.call('POST', '/v1/handoffs', handoffBody(items, { listId: 'lst_2' }), { token: dev.accessToken, idem: 'hnd-stop-2' });
    assert.equal(next.body.error.code, 'caregiver_opted_out');
  });

  it('envoie les alertes à l’aidant (code PIN bloqué)', async () => {
    const dev = await readyAccount(h, { ...SETTINGS, caregiverMobile: '+18195550122' });
    const before = h.sent.length;
    const r = await h.call('POST', '/v1/alerts', { kind: 'pin_lockout' }, { token: dev.accessToken });
    assert.equal(r.body.notified, true);
    assert.match(h.sent[before]?.body ?? '', /3 codes erronés/);
  });

  it('code PIN oublié : code envoyé au cellulaire vérifié', async () => {
    const dev = await readyAccount(h, { ...SETTINGS, caregiverMobile: '+14505550133' });
    const before = h.sent.length;
    const start = await h.call('POST', '/v1/caregiver/verification', { purpose: 'pin_reset' }, { token: dev.accessToken });
    assert.equal(start.status, 200);
    const code = /(\d{6})/.exec(h.sent[before]?.body ?? '')?.[1];
    const ok = await h.call('POST', '/v1/caregiver/verification/confirm', { purpose: 'pin_reset', code }, { token: dev.accessToken });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.verified, true);
  });

  it('liste les épiceries proches de l’adresse', async () => {
    const dev = await readyAccount(h, { ...SETTINGS, caregiverMobile: '+14185550144' });
    const r = await h.call('GET', '/v1/retailers', undefined, { token: dev.accessToken });
    assert.deepEqual(r.body.retailers, [{ key: 'maxi', name: 'Maxi', logoUrl: null }]);
  });

  it('enregistre le changement de consentement à la reconnaissance vocale en ligne', async () => {
    const dev = await register(h);
    const r = await h.call('PUT', '/v1/account/consent', { version: '2026-10', acceptedAt: '2026-10-28T15:00:00Z', cloudSpeech: true }, { token: dev.accessToken });
    assert.equal(r.status, 200);
    const exp = await h.call('GET', '/v1/account/export', undefined, { token: dev.accessToken });
    assert.equal(exp.body.account.cloudSpeechConsent, true);
  });

  it('exporte toutes les données, puis supprime définitivement le compte', async () => {
    const dev = await readyAccount(h, { ...SETTINGS, caregiverMobile: '+15145550155' });
    const { items } = await interpret(h, dev.accessToken, 'des bananes', 'utt_export');
    await h.call('POST', '/v1/handoffs', handoffBody(items), { token: dev.accessToken, idem: 'hnd-export' });
    const exp = await h.call('GET', '/v1/account/export', undefined, { token: dev.accessToken });
    assert.equal(exp.status, 200);
    assert.equal(exp.body.settings.caregiverMobile, '+15145550155');
    assert.equal(exp.body.handoffs.length, 1);
    assert.equal(exp.body.handoffs[0].proof.items[0].productLabel, 'Bananes');

    const del = await h.call('DELETE', '/v1/account', undefined, { token: dev.accessToken });
    assert.deepEqual(del.body, { deleted: true });
    assert.equal((await h.call('GET', '/v1/caregiver/status', undefined, { token: dev.accessToken })).status, 401);
    const left = h.db.raw.prepare('SELECT COUNT(*) AS n FROM handoffs WHERE account_id IN (SELECT account_id FROM devices WHERE id = ?)').get(dev.deviceId) as { n: number };
    assert.equal(left.n, 0);
    assert.equal(h.db.getDevice(dev.deviceId), undefined);
  });

  it('chiffre les données personnelles en base', async () => {
    const dev = await readyAccount(h, { ...SETTINGS, caregiverMobile: '+15145550166' });
    const rows = JSON.stringify(h.db.raw.prepare('SELECT * FROM settings').all());
    assert.doesNotMatch(rows, /Saint-Denis|5550166|Paul|Jeanne/);
    assert.ok(dev);
  });

  it('purge les comptes inactifs après la durée de conservation', async () => {
    const dev = await register(h);
    h.clock += 366 * 86_400_000;
    const counts = h.app.purge();
    assert.ok((counts['accounts'] ?? 0) >= 1);
    assert.equal(h.db.getDevice(dev.deviceId), undefined);
    h.clock -= 366 * 86_400_000;
  });

  it('n’écrit aucune donnée personnelle dans le journal', () => {
    const all = h.logs.join('\n');
    assert.doesNotMatch(all, /Saint-Denis|5550123|Jeanne|canneberge|beurre/);
  });
});

describe('Compte de démonstration pour l’examen des boutiques', () => {
  it('accepte le code fixe sans envoyer de texto', async () => {
    const h = await startHarness({ REVIEW_DEMO_MOBILE: '+15145550100', REVIEW_DEMO_CODE: '246810' });
    try {
      const dev = await register(h);
      await h.call('PUT', '/v1/caregiver/settings', { ...SETTINGS, caregiverMobile: '+15145550100' }, { token: dev.accessToken, idem: 'review-set' });
      await h.call('POST', '/v1/caregiver/verification', { purpose: 'mobile' }, { token: dev.accessToken });
      const ok = await h.call('POST', '/v1/caregiver/verification/confirm', { purpose: 'mobile', code: '246810' }, { token: dev.accessToken });
      assert.equal(ok.status, 200);
      assert.equal(h.sent.length, 0);
    } finally {
      await h.close();
    }
  });
});
