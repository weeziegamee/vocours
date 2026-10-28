/**
 * Ce que l'appli garde sur le téléphone, dans le stockage chiffré :
 *  - la liste en cours (rien n'est perdu si l'appli est fermée ou le téléphone redémarre) ;
 *  - la file des dictées faites hors ligne (30 au plus, 7 jours au plus, V3.0 §4.5) ;
 *  - l'identité de l'appareil (secret échangé contre des jetons courts) ;
 *  - l'état de la configuration initiale.
 * Toute donnée illisible ou trop ancienne est ignorée plutôt qu'utilisée.
 */

import type {
  AppLocale,
  Consent,
  DeviceId,
  IsoDateTime,
  SecureStorePort,
  ShoppingList,
  UtteranceId,
} from '../../types/vocourse';

export const KEYS = {
  list: 'vocourse.list.v1',
  queue: 'vocourse.queue.v1',
  session: 'vocourse.session.v1',
  setup: 'vocourse.setup.v1',
} as const;

const parse = (raw: string | null): unknown => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/* ------------------------------- Liste ----------------------------------- */

export const saveList = (store: SecureStorePort, list: ShoppingList): Promise<void> =>
  store.setItem(KEYS.list, JSON.stringify(list));

/** Liste en cours, si elle est lisible, encore modifiable et pas trop ancienne. */
export const loadList = async (store: SecureStorePort, now: Date): Promise<ShoppingList | null> => {
  const v = parse(await store.getItem(KEYS.list));
  if (!isRecord(v) || typeof v['listId'] !== 'string' || !Array.isArray(v['items']) || !Array.isArray(v['utterances'])) return null;
  const status = v['status'];
  if (status !== 'draft' && status !== 'ready' && status !== 'needs_disambiguation') return null;
  if (typeof v['retentionUntil'] !== 'string' || v['retentionUntil'] < now.toISOString().slice(0, 10)) return null;
  const items = v['items'] as unknown[];
  const shapeOk = items.every(
    (i) =>
      isRecord(i) &&
      typeof i['itemId'] === 'string' &&
      (i['status'] === 'confirmed' || i['status'] === 'pending_choice' || i['status'] === 'removed') &&
      typeof i['quantity'] === 'number',
  );
  return shapeOk ? (v as unknown as ShoppingList) : null;
};

export const clearList = (store: SecureStorePort): Promise<void> => store.removeItem(KEYS.list);

/* -------------------------- File hors ligne ------------------------------ */

export interface QueuedUtterance {
  readonly utteranceId: UtteranceId;
  readonly transcript: string;
  readonly capturedAt: IsoDateTime;
  readonly sttConfidence: number | null;
  /**
   * Fixé à la prise : vrai si elle a été faite hors ligne. Chaque nouvelle tentative envoie
   * exactement la même requête (sinon le serveur refuse la clé d'idempotence réutilisée).
   */
  readonly fromOfflineQueue?: boolean;
}

export const QUEUE_MAX = 30;
export const QUEUE_MAX_AGE_MS = 7 * 24 * 3600_000;

/** Garde les dictées valides de moins de 7 jours, les 30 plus récentes. */
export const pruneQueue = (queue: readonly QueuedUtterance[], now: Date): QueuedUtterance[] =>
  queue
    .filter((q) => now.getTime() - Date.parse(q.capturedAt) <= QUEUE_MAX_AGE_MS)
    .slice(-QUEUE_MAX);

export const saveQueue = (store: SecureStorePort, queue: readonly QueuedUtterance[]): Promise<void> =>
  queue.length === 0 ? store.removeItem(KEYS.queue) : store.setItem(KEYS.queue, JSON.stringify(queue));

export const loadQueue = async (store: SecureStorePort, now: Date): Promise<QueuedUtterance[]> => {
  const v = parse(await store.getItem(KEYS.queue));
  if (!Array.isArray(v)) return [];
  const valid = v.filter(
    (q): q is QueuedUtterance =>
      isRecord(q) &&
      typeof q['utteranceId'] === 'string' &&
      typeof q['transcript'] === 'string' &&
      typeof q['capturedAt'] === 'string' &&
      !Number.isNaN(Date.parse(q['capturedAt'])),
  );
  return pruneQueue(valid, now);
};

/* ------------------------------ Appareil --------------------------------- */

export interface DeviceCredentials {
  readonly deviceId: DeviceId;
  readonly deviceSecret: string;
}

export const saveCredentials = (store: SecureStorePort, c: DeviceCredentials): Promise<void> =>
  store.setItem(KEYS.session, JSON.stringify(c));

export const loadCredentials = async (store: SecureStorePort): Promise<DeviceCredentials | null> => {
  const v = parse(await store.getItem(KEYS.session));
  return isRecord(v) && typeof v['deviceId'] === 'string' && typeof v['deviceSecret'] === 'string'
    ? { deviceId: v['deviceId'] as DeviceId, deviceSecret: v['deviceSecret'] }
    : null;
};

/* --------------------------- Configuration ------------------------------- */

/**
 * Avancement de la configuration initiale (faite par l'aidant).
 * `registered` : compte créé ; `pin` : code choisi ; `settings` : réglages enregistrés ;
 * `done` : cellulaire confirmé (ou reporté) et accueil affiché.
 */
export type SetupStep = 'registered' | 'pin' | 'settings' | 'done';

export interface SetupState {
  readonly locale: AppLocale;
  readonly consent: Consent;
  readonly step: SetupStep;
}

export const saveSetup = (store: SecureStorePort, s: SetupState): Promise<void> => store.setItem(KEYS.setup, JSON.stringify(s));

export const loadSetup = async (store: SecureStorePort): Promise<SetupState | null> => {
  const v = parse(await store.getItem(KEYS.setup));
  if (!isRecord(v) || !isRecord(v['consent'])) return null;
  const locale = v['locale'];
  const step = v['step'];
  if ((locale !== 'fr-CA' && locale !== 'en-CA') || !['registered', 'pin', 'settings', 'done'].includes(String(step))) return null;
  return v as unknown as SetupState;
};

/** Efface tout ce que l'appli a gardé sur le téléphone (suppression du compte). */
export const wipeDevice = async (store: SecureStorePort, extraKeys: readonly string[]): Promise<void> => {
  for (const k of [...Object.values(KEYS), ...extraKeys]) await store.removeItem(k);
};
