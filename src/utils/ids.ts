/**
 * Identifiants et horodatages typés.
 * La clé d'idempotence n'a pas besoin d'être secrète, seulement unique :
 * `crypto.randomUUID` quand il existe, sinon horodatage + aléa.
 */

import type { IdempotencyKey, IsoDateTime } from '../types/vocourse';

export const newIdempotencyKey = (): IdempotencyKey => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID() as IdempotencyKey;
  const rand = (): string => Math.floor(Math.random() * 0x1_0000_0000).toString(16).padStart(8, '0');
  return `${Date.now().toString(16)}-${rand()}-${rand()}-${rand()}` as IdempotencyKey;
};

export const nowIso = (): IsoDateTime => new Date().toISOString() as IsoDateTime;
