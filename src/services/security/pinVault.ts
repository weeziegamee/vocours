/**
 * Coffre du code PIN de l'aidant (V3.0 §6.1).
 *
 * - Le code n'est jamais stocké ni journalisé : seul un hachage PBKDF2-HMAC-SHA-256 salé
 *   est conservé, dans le stockage chiffré de l'appareil. Le code ne quitte pas l'appareil.
 * - 3 essais infructueux → blocage de 15 minutes. Le compteur et l'échéance sont
 *   persistés : relancer l'appli ne remet pas les essais à zéro.
 * - Recul de l'horloge du téléphone pendant un blocage : le blocage est maintenu
 *   (on ne débloque pas en changeant l'heure).
 * - La comparaison se fait en temps constant.
 */

import type { SecureStorePort } from '../../types/vocourse';
import { checkPinStrength, type PinWeakness } from './pinPolicy';
import { constantTimeEqual, fromHex, pbkdf2Sha256, randomBytes, toHex, utf8 } from './crypto';

export const PIN_STORE_KEY = 'vocourse.caregiver.pin.v1';
export const MAX_ATTEMPTS = 3;
export const LOCKOUT_MS = 15 * 60 * 1000;
/**
 * Coût du hachage. Le moteur Hermes n'a pas de compilateur JIT : 10 000 itérations
 * prendraient plusieurs secondes sur un téléphone d'entrée de gamme. Sur un code à
 * 6 chiffres, les itérations apportent peu ; la protection réelle vient du stockage
 * chiffré et du verrouillage. À mesurer sur l'appareil cible le plus lent.
 */
export const PBKDF2_ITERATIONS = 2_000;

interface PinRecord {
  readonly v: 1;
  readonly salt: string; // hex
  readonly iterations: number;
  readonly hash: string; // hex, 32 octets
  readonly failures: number;
  readonly lockedUntil: number | null; // ms depuis l'époque
  readonly lastFailureAt: number | null;
}

export type PinStatus =
  | { readonly state: 'not_set' }
  | { readonly state: 'ready'; readonly attemptsLeft: number }
  | { readonly state: 'locked'; readonly lockedUntil: number };

export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'wrong'; readonly attemptsLeft: number }
  | { readonly ok: false; readonly reason: 'locked'; readonly lockedUntil: number; readonly justLocked: boolean }
  | { readonly ok: false; readonly reason: 'not_set' };

export type SetPinResult = { readonly ok: true } | { readonly ok: false; readonly weakness: PinWeakness };

export interface PinVault {
  status(): Promise<PinStatus>;
  setPin(pin: string): Promise<SetPinResult>;
  verify(pin: string): Promise<VerifyResult>;
  clear(): Promise<void>;
}

export interface PinVaultOptions {
  readonly store: SecureStorePort;
  readonly now?: () => number;
  readonly iterations?: number;
  readonly random?: (n: number) => Uint8Array;
}

const parseRecord = (raw: string | null): PinRecord | null => {
  if (raw === null) return null;
  try {
    const r = JSON.parse(raw) as Partial<PinRecord>;
    if (
      r.v !== 1 ||
      typeof r.salt !== 'string' ||
      typeof r.hash !== 'string' ||
      typeof r.iterations !== 'number' ||
      typeof r.failures !== 'number'
    ) {
      return null;
    }
    return {
      v: 1,
      salt: r.salt,
      hash: r.hash,
      iterations: r.iterations,
      failures: r.failures,
      lockedUntil: typeof r.lockedUntil === 'number' ? r.lockedUntil : null,
      lastFailureAt: typeof r.lastFailureAt === 'number' ? r.lastFailureAt : null,
    };
  } catch {
    return null;
  }
};

export const createPinVault = (options: PinVaultOptions): PinVault => {
  const now = options.now ?? (() => Date.now());
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const random = options.random ?? randomBytes;
  const { store } = options;

  const load = async (): Promise<PinRecord | null> => parseRecord(await store.getItem(PIN_STORE_KEY));
  const save = (r: PinRecord): Promise<void> => store.setItem(PIN_STORE_KEY, JSON.stringify(r));

  /** Blocage en vigueur, y compris si l'horloge a reculé depuis le dernier échec. */
  const activeLock = (r: PinRecord, t: number): number | null => {
    if (r.lockedUntil === null) return null;
    if (t < r.lockedUntil) return r.lockedUntil;
    if (r.lastFailureAt !== null && t < r.lastFailureAt) return r.lastFailureAt + LOCKOUT_MS;
    return null;
  };

  return {
    async status() {
      const r = await load();
      if (!r) return { state: 'not_set' };
      const lock = activeLock(r, now());
      if (lock !== null) return { state: 'locked', lockedUntil: lock };
      return { state: 'ready', attemptsLeft: r.lockedUntil !== null ? MAX_ATTEMPTS : MAX_ATTEMPTS - r.failures };
    },

    async setPin(pin) {
      const weakness = checkPinStrength(pin);
      if (weakness) return { ok: false, weakness };
      const salt = random(16);
      const hash = pbkdf2Sha256(utf8(pin), salt, iterations, 32);
      await save({
        v: 1,
        salt: toHex(salt),
        iterations,
        hash: toHex(hash),
        failures: 0,
        lockedUntil: null,
        lastFailureAt: null,
      });
      return { ok: true };
    },

    async verify(pin) {
      const stored = await load();
      if (!stored) return { ok: false, reason: 'not_set' };
      const t = now();
      const lock = activeLock(stored, t);
      if (lock !== null) return { ok: false, reason: 'locked', lockedUntil: lock, justLocked: false };

      // Blocage échu : nouvelle série de 3 essais.
      const r: PinRecord = stored.lockedUntil !== null ? { ...stored, failures: 0, lockedUntil: null } : stored;

      const candidate = pbkdf2Sha256(utf8(pin), fromHex(r.salt), r.iterations, 32);
      if (constantTimeEqual(candidate, fromHex(r.hash))) {
        await save({ ...r, failures: 0, lockedUntil: null, lastFailureAt: null });
        return { ok: true };
      }

      const failures = r.failures + 1;
      if (failures >= MAX_ATTEMPTS) {
        const lockedUntil = t + LOCKOUT_MS;
        await save({ ...r, failures, lockedUntil, lastFailureAt: t });
        return { ok: false, reason: 'locked', lockedUntil, justLocked: true };
      }
      await save({ ...r, failures, lastFailureAt: t });
      return { ok: false, reason: 'wrong', attemptsLeft: MAX_ATTEMPTS - failures };
    },

    clear: () => store.removeItem(PIN_STORE_KEY),
  };
};
