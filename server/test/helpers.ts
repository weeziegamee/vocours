/**
 * Serveur de test : base en mémoire, Instacart et Twilio simulés, vrai serveur HTTP sur
 * un port libre. Les textos envoyés sont capturés pour vérifier leur contenu.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { loadConfig, type Config } from '../src/config.ts';
import { openDatabase, type Db } from '../src/db.ts';
import { createLogger } from '../src/log.ts';
import { createApp, type App } from '../src/app.ts';
import { createRequestListener } from '../src/http.ts';
import type { InstacartClient, ProductLinkPayload } from '../src/services/instacart.ts';
import type { SmsOutcome, SmsSender } from '../src/services/sms.ts';

export interface Harness {
  readonly base: string;
  readonly app: App;
  readonly db: Db;
  readonly config: Config;
  readonly sent: { to: string; body: string }[];
  readonly payloads: ProductLinkPayload[];
  readonly logs: string[];
  smsOutcome: SmsOutcome;
  instacartDown: boolean;
  clock: number;
  call(method: string, path: string, body?: unknown, opts?: { token?: string; idem?: string }): Promise<{ status: number; body: any }>;
  close(): Promise<void>;
}

export const startHarness = async (env: Record<string, string> = {}): Promise<Harness> => {
  const config = loadConfig({ NODE_ENV: 'test', RATE_LIMIT_REGISTER_PER_HOUR: '1000', ...env });
  const db = openDatabase(':memory:');
  const logs: string[] = [];
  const log = createLogger((l) => logs.push(l));
  const sent: { to: string; body: string }[] = [];
  const payloads: ProductLinkPayload[] = [];

  const h = {
    smsOutcome: 'sent' as SmsOutcome,
    instacartDown: false,
    clock: Date.parse('2026-10-28T14:00:00Z'),
  };

  const instacart: InstacartClient = {
    async createShoppingList(p) {
      if (h.instacartDown) return { ok: false, reason: 'unavailable', status: 503 };
      payloads.push(p);
      return { ok: true, value: `https://www.instacart.ca/store/s?k=test-${payloads.length}` };
    },
    async nearbyRetailers() {
      return { ok: true, value: [{ key: 'maxi', name: 'Maxi', logoUrl: null }] };
    },
  };
  const sms: SmsSender = {
    async send(to, body) {
      if (h.smsOutcome === 'sent') sent.push({ to, body });
      return h.smsOutcome;
    },
  };

  const app = createApp({ config, db, log, instacart, sms, now: () => h.clock });
  const server: Server = createServer(createRequestListener(app.routes, log, 0));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const harness: Harness = Object.assign(h, {
    base,
    app,
    db,
    config,
    sent,
    payloads,
    logs,
    async call(method: string, path: string, body?: unknown, opts: { token?: string; idem?: string } = {}) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.idem ? { 'Idempotency-Key': opts.idem } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    close: () =>
      new Promise<void>((r) => {
        server.close(() => {
          db.close();
          r();
        });
      }),
  });
  return harness;
};

export const SETTINGS = {
  seniorFirstName: 'Jeanne',
  caregiverFirstName: 'Paul',
  caregiverMobile: '+15145550123',
  smsConsent: true,
  address: { civicNumber: '1234', street: 'rue Saint-Denis', apartment: '305', city: 'Montréal', province: 'QC', postalCode: 'H2T 1S6' },
  preferredRetailer: { key: 'maxi', name: 'Maxi' },
  language: 'fr-CA',
  register: 'vous',
  regionalDictionary: true,
  updatedAt: '2026-10-28T14:00:00.000Z',
};

export const CONSENT = { version: '2026-10', acceptedAt: '2026-10-28T13:59:00.000Z', cloudSpeech: false };
