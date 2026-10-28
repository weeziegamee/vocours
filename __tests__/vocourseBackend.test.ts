import { checkBaseUrl, createVocourseBackend, parseHandoffResponse } from '../src/services/api/vocourseBackend';
import type { TokenResult } from '../src/services/auth/session';
import type { HandoffRequest, IdempotencyKey, ItemId, ListId } from '../src/types/vocourse';
import { at, handoffOk } from './fixtures';

const request: HandoffRequest = {
  listId: 'lst_1' as ListId,
  tier: 'balanced',
  items: [{ itemId: 'itm_1' as ItemId, productKey: 'cafe', productLabel: 'Café moulu, 300 g', quantity: 1, unit: 'package', packageSize: { value: 300, unit: 'g' }, sensitive: false, category: 'pantry' }],
  itemsDigest: 'a'.repeat(64),
  locale: 'fr-CA',
  confirmation: {
    readbackStartedAt: at('t0'),
    readbackCompletedAt: at('t1'),
    readbackText: 'relecture',
    first: { method: 'tap', at: at('t2') },
    second: { method: 'long_press', durationMs: 2000, at: at('t3') },
    actor: 'senior',
  },
};
const key = 'idem-123' as IdempotencyKey;

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

const fakeFetch = (responses: readonly (() => Promise<Response>)[]) => {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (!next) throw new Error('aucune réponse prévue');
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
};

const json = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const make = (fetchImpl: typeof fetch, token: TokenResult = { ok: true, token: 'tok' }, invalidate?: () => void) =>
  createVocourseBackend({
    baseUrl: 'https://api.vocourse.ca/',
    getAccessToken: async () => token,
    ...(invalidate ? { invalidateToken: invalidate } : {}),
    fetchImpl,
    sleep: async () => undefined,
  });

const headers = (c: Call | undefined): Record<string, string> => (c?.init.headers ?? {}) as Record<string, string>;

describe('Client du serveur Vocourse', () => {
  it('exige HTTPS (sauf serveur local en développement, sur demande)', () => {
    expect(() => checkBaseUrl('http://api.vocourse.ca', false)).toThrow();
    expect(() => checkBaseUrl('ftp://x', true)).toThrow();
    expect(checkBaseUrl('https://api.vocourse.ca/', false)).toBe('https://api.vocourse.ca');
    expect(checkBaseUrl('http://10.0.2.2:8080', true)).toBe('http://10.0.2.2:8080');
    expect(() => checkBaseUrl('http://10.0.2.2:8080', false)).toThrow();
  });

  it('envoie la liste avec jeton et clé d’idempotence, sans identité', async () => {
    const { impl, calls } = fakeFetch([json(200, handoffOk)]);
    const r = await make(impl).submitHandoff(request, key);
    expect(r.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://api.vocourse.ca/v1/handoffs');
    expect(headers(calls[0])['Authorization']).toBe('Bearer tok');
    expect(headers(calls[0])['Idempotency-Key']).toBe(key);
    expect(String(calls[0]?.init.body)).not.toMatch(/Jeanne|Paul|rue|\+1/);
  });

  it('réessaie les erreurs serveur avec la même clé, puis réussit', async () => {
    const { impl, calls } = fakeFetch([json(503, {}), json(502, {}), json(200, handoffOk)]);
    const r = await make(impl).submitHandoff(request, key);
    expect(r.ok).toBe(true);
    expect(calls.length).toBe(3);
    expect(calls.every((c) => headers(c)['Idempotency-Key'] === key)).toBe(true);
  });

  it('s’arrête après 3 tentatives', async () => {
    const { impl, calls } = fakeFetch([json(503, {})]);
    const r = await make(impl).submitHandoff(request, key);
    expect(r.ok ? null : r.error).toEqual({ kind: 'server', status: 503, attempts: 3 });
    expect(calls.length).toBe(3);
  });

  it('ne réessaie pas un refus, et en garde le code', async () => {
    const { impl, calls } = fakeFetch([json(409, { error: { code: 'caregiver_unverified', message: 'x' } })]);
    const r = await make(impl).submitHandoff(request, key);
    expect(r.ok ? null : r.error).toEqual({ kind: 'conflict', status: 409, attempts: 1, code: 'caregiver_unverified' });
    expect(calls.length).toBe(1);
  });

  it('rapporte les essais restants d’un code de vérification', async () => {
    const { impl } = fakeFetch([json(422, { error: { code: 'invalid_code', attemptsLeft: 3 } })]);
    const r = await make(impl).confirmVerification('mobile', '000000');
    expect(r.ok ? null : r.error).toEqual({ kind: 'rejected', status: 422, attempts: 1, code: 'invalid_code', attemptsLeft: 3 });
  });

  it('n’envoie pas deux fois un texto de vérification', async () => {
    const { impl, calls } = fakeFetch([json(503, {})]);
    await make(impl).startVerification('mobile');
    expect(calls.length).toBe(1);
  });

  it('jeton refusé : en redemande un et réessaie une seule fois', async () => {
    const { impl, calls } = fakeFetch([json(401, {}), json(200, handoffOk)]);
    let invalidated = 0;
    const r = await make(impl, { ok: true, token: 'tok' }, () => (invalidated += 1)).submitHandoff(request, key);
    expect(r.ok).toBe(true);
    expect(invalidated).toBe(1);
    expect(calls.length).toBe(2);
  });

  it('classe une coupure réseau comme « hors ligne »', async () => {
    const { impl } = fakeFetch([async () => Promise.reject(new TypeError('Network request failed'))]);
    const r = await make(impl).submitHandoff(request, key);
    expect(r.ok ? null : r.error.kind).toBe('offline');
  });

  it('n’appelle pas le réseau sans jeton ; hors ligne si le jeton ne peut pas être obtenu', async () => {
    const { impl, calls } = fakeFetch([json(200, handoffOk)]);
    const lost = await make(impl, { ok: false, reason: 'lost' }).submitHandoff(request, key);
    expect(lost.ok ? null : lost.error.kind).toBe('unauthorized');
    const offline = await make(impl, { ok: false, reason: 'offline' }).caregiverStatus();
    expect(offline.ok ? null : offline.error.kind).toBe('offline');
    expect(calls.length).toBe(0);
  });

  it('rejette une réponse hors contrat', () => {
    expect(parseHandoffResponse({ ...handoffOk, status: 'ordered' })).toBeNull();
    expect(parseHandoffResponse({ ...handoffOk, smsStatus: 'maybe' })).toBeNull();
    expect(parseHandoffResponse({ ...handoffOk, linkExpiresAt: 'demain' })).toBeNull();
    expect(parseHandoffResponse(handoffOk)).toEqual(handoffOk);
  });
});
