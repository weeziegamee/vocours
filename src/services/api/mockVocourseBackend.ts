/**
 * Serveur Vocourse SIMULÉ — mode démonstration, sans réseau.
 *
 * Même contrat que le client réel (`VocourseBackend`) et même analyseur de dictée que le
 * serveur (shared/nlp). Rien ne sort de l'appareil : le code de vérification est toujours
 * 123456 et le lien Instacart est fictif (domaine réservé `.invalid`).
 * Les scénarios (`MockScenario`) permettent de rejouer pannes et cas limites.
 */

import type {
  CaregiverSettings,
  DeviceId,
  HandoffId,
  HandoffRequest,
  HandoffResponse,
  IdempotencyKey,
  InterpretResponse,
  IsoDateTime,
  Retailer,
} from '../../types/vocourse';
import type { BackendResult, VocourseBackend } from './vocourseBackend';
import { interpretTranscript } from '../../../shared/nlp/interpret.ts';
import { itemsDigest } from '../handoff/digest';

export interface MockScenario {
  /** Latence simulée par appel, en millisecondes. */
  readonly latencyMs: number;
  /** Échoue la 1re transmission (pour tester « Réessayer » et l'idempotence). */
  readonly failFirstHandoff: 'server' | 'offline' | null;
  /** L'aidant ne reçoit pas le texto (réplique dédiée). */
  readonly caregiverUnreachable: boolean;
}

export interface MockBackendOptions {
  readonly scenario?: Partial<MockScenario>;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (event: string, data?: unknown) => void;
}

export const DEMO_CODE = '123456';

const DEMO_RETAILERS: readonly Retailer[] = [
  { key: 'demo-maxi', name: 'Maxi', logoUrl: null },
  { key: 'demo-metro', name: 'Metro', logoUrl: null },
  { key: 'demo-iga', name: 'IGA', logoUrl: null },
  { key: 'demo-loblaws', name: 'Loblaws', logoUrl: null },
  { key: 'demo-walmart', name: 'Walmart', logoUrl: null },
];

export interface MockOutboxEntry {
  readonly handoffId: HandoffId;
  readonly idempotencyKey: IdempotencyKey;
  readonly request: HandoffRequest;
  /** Lien FICTIF : domaine réservé `.invalid`, jamais un vrai lien Instacart. */
  readonly productsLinkUrl: string;
  readonly sms: string | null;
}

export interface MockVocourseBackend extends VocourseBackend {
  readonly outbox: readonly MockOutboxEntry[];
  readonly settings: () => CaregiverSettings | null;
}

export const createMockVocourseBackend = (options: MockBackendOptions = {}): MockVocourseBackend => {
  const scenario: MockScenario = { latencyMs: 600, failFirstHandoff: null, caregiverUnreachable: false, ...options.scenario };
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = options.log ?? (() => undefined);

  let seq = 0;
  const nextId = (prefix: string): string => `${prefix}_${(seq += 1).toString(36)}`;
  const nowIso = (): IsoDateTime => now().toISOString() as IsoDateTime;
  const replay = new Map<string, unknown>();
  const outbox: MockOutboxEntry[] = [];
  let settings: CaregiverSettings | null = null;
  let verified = false;
  let handoffAttempts = 0;

  const later = async <T>(value: T): Promise<BackendResult<T>> => {
    await sleep(scenario.latencyMs);
    return { ok: true, value };
  };
  const fail = async <T>(kind: 'conflict' | 'rejected', status: number, code: string): Promise<BackendResult<T>> => {
    await sleep(scenario.latencyMs);
    return { ok: false, error: { kind, status, attempts: 1, code } };
  };
  const idempotent = async <T>(key: IdempotencyKey, run: () => T | null, onNull: () => Promise<BackendResult<T>>): Promise<BackendResult<T>> => {
    const cached = replay.get(key);
    if (cached !== undefined) return later(cached as T);
    const value = run();
    if (value === null) return onNull();
    replay.set(key, value);
    return later(value);
  };

  return {
    outbox,
    settings: () => settings,

    health: async () => true,

    registerDevice: async () =>
      later({ deviceId: 'dev_demo' as DeviceId, deviceSecret: 'demo-secret', accessToken: 'demo-token', expiresIn: 3600 }),

    exchangeToken: async () => later({ accessToken: 'demo-token', expiresIn: 3600 }),

    interpretUtterance: (request, key) =>
      idempotent<InterpretResponse>(
        key,
        () => {
          const result = interpretTranscript({
            utteranceId: request.utteranceId,
            transcript: request.transcript,
            locale: request.locale,
            capturedAt: request.capturedAt,
            fromOfflineQueue: request.fromOfflineQueue,
            regionalDictionary: request.regionalDictionary,
            register: request.register,
            ...(request.sttConfidence !== undefined ? { sttConfidence: request.sttConfidence } : {}),
            newItemId: () => nextId('itm'),
          });
          log('utterance', { items: result.items.length });
          return result as unknown as InterpretResponse;
        },
        () => fail('rejected', 422, 'invalid'),
      ),

    saveCaregiverSettings: (next, key) =>
      idempotent(
        key,
        () => {
          const sameMobile = settings?.caregiverMobile === next.caregiverMobile;
          if (!sameMobile) verified = false;
          settings = next;
          return { savedAt: nowIso(), caregiverMobileVerified: verified };
        },
        () => fail('rejected', 422, 'invalid'),
      ),

    caregiverStatus: async () => later({ settingsSaved: settings !== null, caregiverMobileVerified: verified, caregiverOptedOut: false }),

    startVerification: async (purpose) => {
      if (!settings) return fail('conflict', 409, 'setup_incomplete');
      log('verification', `Code de démonstration (${purpose}) : ${DEMO_CODE}`);
      return later({ sentTo: `•••-•••-${settings.caregiverMobile.slice(-4)}`, expiresInSeconds: 600 });
    },

    confirmVerification: async (purpose, code) => {
      await sleep(scenario.latencyMs);
      if (code !== DEMO_CODE) return { ok: false, error: { kind: 'rejected', status: 422, attempts: 1, code: 'invalid_code', attemptsLeft: 4 } };
      if (purpose === 'mobile') verified = true;
      return { ok: true, value: { verified: true } };
    },

    nearbyRetailers: async () => (settings ? later(DEMO_RETAILERS) : fail('conflict', 409, 'setup_incomplete')),

    submitHandoff: async (request, key) => {
      handoffAttempts += 1;
      if (handoffAttempts === 1 && scenario.failFirstHandoff && !replay.has(key)) {
        await sleep(scenario.latencyMs);
        log('handoff_failed_simulated', scenario.failFirstHandoff);
        return { ok: false, error: { kind: scenario.failFirstHandoff, status: scenario.failFirstHandoff === 'server' ? 503 : null, attempts: 3 } };
      }
      if (!settings) return fail('conflict', 409, 'setup_incomplete');
      if (!verified) return fail('conflict', 409, 'caregiver_unverified');
      if (itemsDigest(request.items) !== request.itemsDigest) return fail('rejected', 422, 'digest_mismatch');
      const current = settings;
      return idempotent<HandoffResponse>(
        key,
        () => {
          const handoffId = nextId('hnd') as HandoffId;
          const url = `https://example.invalid/instacart-demo/${handoffId}`;
          const sms = scenario.caregiverUnreachable
            ? null
            : `Vocourse : ${current.seniorFirstName ?? 'votre proche'} vous envoie sa liste (${request.items.length} produits). ${url}`;
          outbox.push({ handoffId, idempotencyKey: key, request, productsLinkUrl: url, sms });
          log('handoff → texto à l’aidant (simulé)', sms ?? 'aidant injoignable (simulé)');
          return {
            handoffId,
            status: 'sent_to_caregiver',
            caregiverNotified: sms !== null,
            smsStatus: sms !== null ? 'sent' : 'pending',
            caregiverFirstName: current.caregiverFirstName,
            receivedAt: nowIso(),
            linkExpiresAt: new Date(now().getTime() + 2 * 86_400_000).toISOString() as IsoDateTime,
          };
        },
        () => fail('rejected', 422, 'invalid'),
      );
    },

    sendAlert: async (alert) => {
      log('alerte aidant (simulée)', alert.kind);
      return later({ notified: verified });
    },

    updateConsent: async () => later({ savedAt: nowIso() }),

    exportAccount: async () => later({ demo: true, settings }),

    deleteAccount: async () => {
      settings = null;
      verified = false;
      return later({ deleted: true });
    },
  };
};

/** Phrases de démonstration pour la dictée simulée (couvre doutes et expressions québécoises). */
export const DEMO_UTTERANCES: Readonly<Record<'fr-CA' | 'en-CA', readonly string[]>> = {
  'fr-CA': [
    'Euh deux cartons de lait 2 % pis une douzaine d’œufs',
    'Du pain tranché, du beur et une canne de soupe aux tomates',
    'Une pinte de lait pis des chips',
    'Deux… non, trois yogourts et du pâté chinois',
    'Des bines pis une poche de patates',
  ],
  'en-CA': [
    'Um two cartons of 2% milk and a dozen eggs',
    'Some sliced bread, budder and a can of tomato soup',
    'A bag of milk and some pop',
    'Two no three yogurts and cranberry juice',
  ],
};
