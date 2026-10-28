/**
 * Démarrage du serveur Vocourse.
 *   npm start                (variables d'environnement : voir .env.example)
 * Tâches périodiques : nouvel essai des textos en échec (5 min), purge de conservation (1 h).
 * Arrêt propre sur SIGTERM / SIGINT (déploiements sans coupure).
 */

import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { ConfigError, loadConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { createLogger } from './log.ts';
import { createApp } from './app.ts';
import { createRequestListener } from './http.ts';
import { createInstacartClient, createOfflineInstacartClient } from './services/instacart.ts';
import { createConsoleSender, createTwilioSender } from './services/sms.ts';

const log = createLogger();

let config;
try {
  config = loadConfig();
} catch (e) {
  log.error('config', { error: e instanceof ConfigError ? e.message : String(e) });
  process.exit(1);
}

if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true });
const db = openDatabase(config.databasePath);

const logEvent = (event: string, data: Record<string, unknown>): void => log.warn(event, data);

const instacart = config.instacart.apiKey
  ? createInstacartClient({ apiKey: config.instacart.apiKey, baseUrl: config.instacart.baseUrl, log: logEvent })
  : createOfflineInstacartClient(logEvent);

const sms =
  config.sms.provider === 'twilio'
    ? createTwilioSender({ accountSid: config.sms.accountSid, authToken: config.sms.authToken, from: config.sms.from, log: logEvent })
    : createConsoleSender((line) => log.info('sms_dev', { line }));

if (config.env !== 'production') {
  log.warn('mode_developpement', {
    instacart: config.instacart.apiKey ? config.instacart.baseUrl : 'liens factices',
    sms: config.sms.provider,
    note: 'Clés de chiffrement éphémères si non fournies : ne pas utiliser avec de vraies données.',
  });
}

const app = createApp({ config, db, log, instacart, sms });
const server = createServer(createRequestListener(app.routes, log, config.proxyHops));
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

server.listen(config.port, config.host, () => log.info('listening', { port: config.port, env: config.env }));

const smsTimer = setInterval(() => {
  app.retryPendingSms().catch((e: unknown) => log.error('sms_retry', { error: String(e) }));
}, 5 * 60_000);
const purgeTimer = setInterval(() => {
  try {
    app.purge();
  } catch (e) {
    log.error('purge', { error: String(e) });
  }
}, 3600_000);
app.purge();

const shutdown = (signal: string): void => {
  log.info('shutdown', { signal });
  clearInterval(smsTimer);
  clearInterval(purgeTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
