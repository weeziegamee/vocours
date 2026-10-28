/**
 * Stockage chiffré sans limite de taille au-dessus du Keychain / Keystore.
 *
 * expo-secure-store déconseille les valeurs de plus de 2 Ko ; une liste de courses peut
 * dépasser. La valeur est donc découpée en morceaux, écrits sous une nouvelle
 * « génération » avant que le sommaire ne bascule dessus : une coupure pendant
 * l'écriture laisse l'ancienne valeur intacte.
 */

import type { SecureStorePort } from '../../types/vocourse';

export const CHUNK_SIZE = 1800;

interface Manifest {
  readonly v: 1;
  readonly g: number;
  readonly n: number;
}

const parseManifest = (raw: string | null): Manifest | null => {
  if (raw === null) return null;
  try {
    const m = JSON.parse(raw) as Partial<Manifest>;
    return m.v === 1 && typeof m.g === 'number' && typeof m.n === 'number' ? { v: 1, g: m.g, n: m.n } : null;
  } catch {
    return null;
  }
};

const chunkKey = (key: string, g: number, i: number): string => `${key}.g${g}.${i}`;

export const createChunkedStore = (raw: SecureStorePort, chunkSize = CHUNK_SIZE): SecureStorePort => {
  /** Écritures d'une même clé, l'une après l'autre. */
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    queues.set(key, next.catch(() => undefined));
    return next;
  };

  const dropGeneration = async (key: string, m: Manifest): Promise<void> => {
    for (let i = 0; i < m.n; i += 1) await raw.removeItem(chunkKey(key, m.g, i));
  };

  return {
    async getItem(key) {
      const m = parseManifest(await raw.getItem(key));
      if (!m) return null;
      const parts: string[] = [];
      for (let i = 0; i < m.n; i += 1) {
        const part = await raw.getItem(chunkKey(key, m.g, i));
        if (part === null) return null; // valeur incomplète : jamais utilisée
        parts.push(part);
      }
      return parts.join('');
    },

    setItem: (key, value) =>
      serial(key, async () => {
        const old = parseManifest(await raw.getItem(key));
        const g = old ? old.g + 1 : 1;
        const n = Math.max(1, Math.ceil(value.length / chunkSize));
        for (let i = 0; i < n; i += 1) await raw.setItem(chunkKey(key, g, i), value.slice(i * chunkSize, (i + 1) * chunkSize));
        await raw.setItem(key, JSON.stringify({ v: 1, g, n } satisfies Manifest));
        if (old) await dropGeneration(key, old);
      }),

    removeItem: (key) =>
      serial(key, async () => {
        const old = parseManifest(await raw.getItem(key));
        await raw.removeItem(key);
        if (old) await dropGeneration(key, old);
      }),
  };
};
