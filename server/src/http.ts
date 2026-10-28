/**
 * Couche HTTP minimale (module `node:http`) : routage, lecture JSON bornée, en-têtes de
 * sécurité, identifiant de requête, journal sans données personnelles.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Invalid } from './validate.ts';
import type { Logger } from './log.ts';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface Ctx {
  readonly method: Method;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: IncomingMessage['headers'];
  readonly body: unknown;
  readonly ip: string;
  readonly requestId: string;
}

export interface Res {
  readonly status: number;
  readonly body?: unknown;
}

export type Handler = (ctx: Ctx) => Promise<Res>;

/** Erreur métier : renvoyée telle quelle au client ({ error: { code, message } }). */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown> | undefined;
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const ok = (body: unknown, status = 200): Res => ({ status, body });

const MAX_BODY = 64 * 1024;

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Frame-Options': 'DENY',
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'too_large', 'Requête trop volumineuse.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

export interface Route {
  readonly method: Method;
  /** Chemin exact (pas de paramètres d'URL : les identifiants passent dans le corps). */
  readonly path: string;
  readonly handler: Handler;
}

/**
 * `proxyHops` : nombre de mandataires de confiance devant le serveur (0 = aucun).
 * L'adresse retenue est celle ajoutée par le dernier mandataire de confiance, jamais
 * l'entrée la plus à gauche de X-Forwarded-For, que le client peut inventer.
 */
export const clientIp = (forwardedFor: string | undefined, socketIp: string | undefined, proxyHops: number): string => {
  if (proxyHops > 0 && forwardedFor) {
    const parts = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
    const ip = parts[parts.length - proxyHops];
    if (ip) return ip;
  }
  return socketIp ?? 'unknown';
};

export const createRequestListener = (routes: readonly Route[], log: Logger, proxyHops: number) => {
  const byPath = new Map<string, Map<Method, Handler>>();
  for (const r of routes) {
    const m = byPath.get(r.path) ?? new Map<Method, Handler>();
    m.set(r.method, r.handler);
    byPath.set(r.path, m);
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const started = Date.now();
    const requestId = randomUUID();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const xff = req.headers['x-forwarded-for'];
    const ip = clientIp(Array.isArray(xff) ? xff.join(',') : xff, req.socket.remoteAddress, proxyHops);
    let status = 500;
    let payload: unknown;

    try {
      const methods = byPath.get(url.pathname);
      const method = (req.method ?? 'GET').toUpperCase() as Method;
      if (!methods) throw new HttpError(404, 'not_found', 'Ressource inconnue.');
      const handler = methods.get(method);
      if (!handler) throw new HttpError(405, 'method_not_allowed', 'Méthode non permise.');

      let body: unknown = null;
      if (method === 'POST' || method === 'PUT') {
        const type = String(req.headers['content-type'] ?? '');
        if (!type.startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type', 'JSON attendu.');
        const raw = await readBody(req);
        try {
          body = raw === '' ? {} : JSON.parse(raw);
        } catch {
          throw new HttpError(400, 'bad_json', 'JSON invalide.');
        }
      }
      const result = await handler({ method, path: url.pathname, query: url.searchParams, headers: req.headers, body, ip, requestId });
      status = result.status;
      payload = result.body;
    } catch (e) {
      if (e instanceof HttpError) {
        status = e.status;
        payload = { error: { code: e.code, message: e.message, ...(e.extra ?? {}) } };
      } else if (e instanceof Invalid) {
        status = 422;
        payload = { error: { code: 'invalid', message: `Champ invalide : ${e.field} (${e.message}).`, field: e.field } };
      } else {
        status = 500;
        payload = { error: { code: 'internal', message: 'Erreur interne.', requestId } };
        log.error('unhandled', { requestId, error: e instanceof Error ? `${e.name}: ${e.message}` : 'unknown' });
      }
    }

    const headers: Record<string, string> = { ...SECURITY_HEADERS, 'X-Request-Id': requestId };
    if (payload === undefined) {
      res.writeHead(status, headers);
      res.end();
    } else {
      const text = JSON.stringify(payload);
      res.writeHead(status, { ...headers, 'Content-Length': String(Buffer.byteLength(text)) });
      res.end(text);
    }
    log.info('request', { requestId, method: req.method, path: url.pathname, status, ms: Date.now() - started });
  };
};
