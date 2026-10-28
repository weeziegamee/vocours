import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCrypto, itemsDigest } from '../src/crypto.ts';
import { loadConfig, ConfigError } from '../src/config.ts';
import { provinceOfPostalCode } from '../src/validate.ts';
import { clientIp } from '../src/http.ts';
import { buildProductLinkPayload, createInstacartClient, measurementsFor, storeBrandsFor, type HandoffLine } from '../src/services/instacart.ts';
import { createTwilioSender } from '../src/services/sms.ts';

const key = (n: number): Buffer => Buffer.alloc(32, n);

describe('chiffrement', () => {
  const c = createCrypto(key(7), key(8));

  it('chiffre et déchiffre, lié au contexte', () => {
    const sealed = c.encrypt('1234, rue Saint-Denis', 'settings:acc_1');
    assert.notEqual(sealed, c.encrypt('1234, rue Saint-Denis', 'settings:acc_1'), 'vecteur aléatoire');
    assert.equal(c.decrypt(sealed, 'settings:acc_1'), '1234, rue Saint-Denis');
    assert.throws(() => c.decrypt(sealed, 'settings:acc_2'));
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith('A') ? 'B' : 'A'}A`;
    assert.throws(() => c.decrypt(tampered, 'settings:acc_1'));
  });

  it('signe des jetons qui expirent', () => {
    const t = c.signAccessToken({ a: 'acc_1', d: 'dev_1', e: 1000 });
    assert.deepEqual(c.verifyAccessToken(t, 999), { a: 'acc_1', d: 'dev_1', e: 1000 });
    assert.equal(c.verifyAccessToken(t, 1000), null);
    assert.equal(createCrypto(key(7), key(9)).verifyAccessToken(t, 0), null, 'autre clé');
  });

  it('empreinte de liste indépendante de l’ordre', () => {
    const a = { itemId: 'a', productKey: 'beurre', quantity: 1, unit: 'package' };
    const b = { itemId: 'b', productKey: 'oeufs', quantity: 2, unit: 'dozen' };
    assert.equal(itemsDigest([a, b]), itemsDigest([b, a]));
    assert.notEqual(itemsDigest([a, b]), itemsDigest([a, { ...b, quantity: 3 }]));
    assert.match(itemsDigest([a]), /^[0-9a-f]{64}$/);
  });
});

describe('configuration', () => {
  it('refuse de démarrer en production sans clés ni services réels', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), ConfigError);
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: 'production',
          DATA_ENCRYPTION_KEY: key(1).toString('base64'),
          TOKEN_SIGNING_KEY: key(2).toString('base64'),
          INSTACART_API_KEY: 'k',
          SMS_PROVIDER: 'console',
        }),
      /console est interdit/,
    );
  });

  it('accepte une configuration de production complète', () => {
    const c = loadConfig({
      NODE_ENV: 'production',
      DATA_ENCRYPTION_KEY: key(1).toString('base64'),
      TOKEN_SIGNING_KEY: key(2).toString('base64'),
      INSTACART_API_KEY: 'k',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 't',
      TWILIO_FROM: '+15145550100',
    });
    assert.equal(c.instacart.baseUrl, 'https://connect.instacart.com');
    assert.equal(c.sms.provider, 'twilio');
  });
});

describe('adresse IP du client', () => {
  it('lit l’entrée ajoutée par le répartiteur, pas celle inventée par le client', () => {
    assert.equal(clientIp('6.6.6.6, 203.0.113.9', '10.0.0.2', 1), '203.0.113.9');
    assert.equal(clientIp('6.6.6.6, 203.0.113.9, 10.0.0.3', '10.0.0.2', 2), '203.0.113.9');
    assert.equal(clientIp('6.6.6.6', '10.0.0.2', 0), '10.0.0.2');
    assert.equal(clientIp(undefined, '10.0.0.2', 1), '10.0.0.2');
  });
});

describe('provinces', () => {
  it('déduit la province de la première lettre du code postal', () => {
    const cases: [string, string][] = [
      ['A1C 5M2', 'NL'], ['B3H 4R2', 'NS'], ['C1A 7N8', 'PE'], ['E1C 4M3', 'NB'], ['H2T 1S6', 'QC'], ['G1R 4P5', 'QC'],
      ['J4K 2T5', 'QC'], ['K1A 0B1', 'ON'], ['M5V 3L9', 'ON'], ['R3C 4T3', 'MB'], ['S4P 3Y2', 'SK'], ['T2P 1J9', 'AB'],
      ['V6B 4Y8', 'BC'], ['X1A 2L9', 'NT'], ['X0A 0H0', 'NU'], ['Y1A 6A4', 'YT'],
    ];
    for (const [postal, province] of cases) assert.equal(provinceOfPostalCode(postal), province, postal);
    assert.equal(provinceOfPostalCode('D1A 1A1'), null);
    assert.equal(provinceOfPostalCode('12345'), null);
  });
});

describe('Instacart', () => {
  const line = (over: Partial<HandoffLine> = {}): HandoffLine => ({
    itemId: 'i1', productKey: 'lait-2-2l', productLabel: 'Lait 2 %, 2 L', quantity: 2, unit: 'carton',
    packageSize: { value: 2, unit: 'L' }, sensitive: false, category: 'dairy', ...over,
  });

  it('mesures : nombre d’articles puis volume total', () => {
    assert.deepEqual(measurementsFor(line()), [{ quantity: 2, unit: 'each' }, { quantity: 4, unit: 'l' }]);
    assert.deepEqual(measurementsFor(line({ unit: 'dozen', quantity: 2, packageSize: null })), [{ quantity: 24, unit: 'each' }]);
  });

  it('marques maison selon l’enseigne', () => {
    assert.deepEqual(storeBrandsFor('Maxi'), ['no name', 'No Name', 'sans nom']);
    assert.deepEqual(storeBrandsFor('Super C'), ['Selection', 'Sélection']);
    assert.deepEqual(storeBrandsFor('IGA extra'), ['Compliments']);
    assert.deepEqual(storeBrandsFor('Walmart'), ['Great Value']);
    assert.equal(storeBrandsFor('Épicerie du coin'), null);
    assert.equal(storeBrandsFor(null), null);
  });

  it('payload : filtres par gamme, rien de personnel, libellés dans la langue', () => {
    const now = new Date('2026-10-28T15:00:00Z');
    const base = { locale: 'fr-CA' as const, preferredRetailerName: 'Metro', linkbackUrl: null, expiresInDays: 2, now };
    const lines = [line(), line({ itemId: 'i2', productKey: 'papier-hygienique', productLabel: 'Papier hygiénique', category: 'household', unit: 'package', packageSize: null, quantity: 1 })];
    const eco = buildProductLinkPayload({ ...base, lines, tier: 'economy' });
    assert.equal(eco?.title, 'Épicerie du 28 octobre');
    assert.equal(eco?.line_items[0]?.name, '2% milk');
    assert.equal(eco?.line_items[0]?.display_text, 'Lait 2 %, 2 L — Qté : 2');
    assert.deepEqual(eco?.line_items[0]?.filters, { brand_filters: ['Selection', 'Sélection'] });
    const bio = buildProductLinkPayload({ ...base, lines, tier: 'premium_organic' });
    assert.deepEqual(bio?.line_items[0]?.filters, { health_filters: ['ORGANIC'] });
    assert.equal(bio?.line_items[1]?.filters, undefined, 'pas de BIO pour le papier hygiénique');
    const bal = buildProductLinkPayload({ ...base, lines, tier: 'balanced' });
    assert.equal(bal?.line_items[0]?.filters, undefined);
    const en = buildProductLinkPayload({ ...base, locale: 'en-CA', lines, tier: 'balanced' });
    assert.equal(en?.title, 'Groceries — October 28');
    assert.equal(buildProductLinkPayload({ ...base, lines: [], tier: 'economy' }), null);
  });

  it('client : appel authentifié, nouvelles tentatives sur 5xx, refus sur 4xx', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let status = 503;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (status === 503 && calls.length < 3) return new Response('{}', { status: 503 });
      if (status === 400) return new Response('{"error":{"message":"bad","code":1001}}', { status: 400 });
      return new Response(JSON.stringify({ products_link_url: 'https://instacart.ca/x' }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createInstacartClient({ apiKey: 'secret', baseUrl: 'https://connect.instacart.com', fetchImpl, sleep: async () => undefined });
    const payload = buildProductLinkPayload({ lines: [line()], tier: 'balanced', locale: 'fr-CA', preferredRetailerName: null, linkbackUrl: null, expiresInDays: 2, now: new Date() });
    assert.ok(payload);
    const r = await client.createShoppingList(payload);
    assert.deepEqual(r, { ok: true, value: 'https://instacart.ca/x' });
    assert.equal(calls.length, 3);
    assert.equal(calls[0]?.url, 'https://connect.instacart.com/idp/v1/products/products_link');
    assert.equal((calls[0]?.init.headers as Record<string, string>)['Authorization'], 'Bearer secret');
    status = 400;
    const rejected = await client.createShoppingList(payload);
    assert.deepEqual(rejected, { ok: false, reason: 'rejected', status: 400 });
  });
});

describe('Twilio', () => {
  it('envoie un formulaire authentifié et reconnaît un désabonnement (21610)', async () => {
    const seen: { url: string; body: string; auth: string }[] = [];
    let reply: Response = new Response('{}', { status: 201 });
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: String(init.body), auth: (init.headers as Record<string, string>)['Authorization'] ?? '' });
      return reply;
    }) as unknown as typeof fetch;
    const s = createTwilioSender({ accountSid: 'AC123', authToken: 'tok', from: '+15145550100', fetchImpl });
    assert.equal(await s.send('+15145550123', 'Bonjour'), 'sent');
    assert.equal(seen[0]?.url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    assert.match(seen[0]?.body ?? '', /To=%2B15145550123/);
    assert.match(seen[0]?.body ?? '', /From=%2B15145550100/);
    assert.equal(seen[0]?.auth, `Basic ${Buffer.from('AC123:tok').toString('base64')}`);
    reply = new Response('{"code":21610}', { status: 400 });
    assert.equal(await s.send('+15145550123', 'x'), 'opted_out');
  });
});
