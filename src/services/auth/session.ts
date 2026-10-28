/**
 * Session de l'appareil : un secret long (Keychain / Keystore) échangé contre un jeton
 * d'accès de 15 minutes, gardé en mémoire seulement.
 * - Un seul échange à la fois, même si plusieurs appels en ont besoin en même temps.
 * - Hors ligne : `offline` (l'appel sera refait plus tard).
 * - Secret refusé par le serveur (compte supprimé, appareil révoqué) : session perdue,
 *   l'appli demande à l'aidant de refaire la configuration.
 */

import type { AccessToken, BackendError, Result, SecureStorePort } from '../../types/vocourse';
import { loadCredentials, saveCredentials, type DeviceCredentials } from '../storage/persistence';

export type TokenResult = { readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: 'offline' | 'lost' | 'none' };

export interface Session {
  getAccessToken(): Promise<TokenResult>;
  /** Le serveur a refusé le jeton : on en redemandera un. */
  invalidate(): void;
  /** Après l'inscription : garde le secret et le premier jeton. */
  start(credentials: DeviceCredentials, initial: AccessToken): Promise<void>;
  hasCredentials(): Promise<boolean>;
  forget(): Promise<void>;
  onLost(listener: () => void): () => void;
}

export interface SessionDeps {
  readonly store: SecureStorePort;
  readonly exchange: (c: DeviceCredentials) => Promise<Result<AccessToken, BackendError>>;
  readonly now?: () => number;
}

const SKEW_MS = 60_000;

export const createSession = (deps: SessionDeps): Session => {
  const now = deps.now ?? (() => Date.now());
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<TokenResult> | null = null;
  let creds: DeviceCredentials | null | undefined;
  const listeners = new Set<() => void>();

  const credentials = async (): Promise<DeviceCredentials | null> => {
    if (creds === undefined) creds = await loadCredentials(deps.store);
    return creds;
  };

  const keep = (t: AccessToken): void => {
    cached = { token: t.accessToken, expiresAt: now() + t.expiresIn * 1000 - SKEW_MS };
  };

  const refresh = async (): Promise<TokenResult> => {
    const c = await credentials();
    if (!c) return { ok: false, reason: 'none' };
    const r = await deps.exchange(c);
    if (r.ok) {
      keep(r.value);
      return { ok: true, token: r.value.accessToken };
    }
    if (r.error.kind === 'unauthorized') {
      cached = null;
      listeners.forEach((l) => l());
      return { ok: false, reason: 'lost' };
    }
    return { ok: false, reason: 'offline' };
  };

  return {
    async getAccessToken() {
      if (cached && cached.expiresAt > now()) return { ok: true, token: cached.token };
      if (!inflight) {
        inflight = refresh().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
    invalidate() {
      cached = null;
    },
    async start(c, initial) {
      await saveCredentials(deps.store, c);
      creds = c;
      keep(initial);
    },
    async hasCredentials() {
      return (await credentials()) !== null;
    },
    async forget() {
      cached = null;
      creds = null;
    },
    onLost(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
