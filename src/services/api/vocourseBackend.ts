/**
 * Client HTTPS du serveur Vocourse (hébergé au Canada). Contrat : server/src/app.ts.
 *
 * Sécurité :
 * - HTTPS obligatoire (sauf adresse locale en développement, sur demande explicite).
 * - Jeton d'accès court fourni par la session à chaque appel ; jamais journalisé.
 * - Aucune donnée d'identité dans les corps : le serveur identifie le compte par le jeton.
 * - La clé API Instacart n'existe que côté serveur ; l'appli n'appelle jamais Instacart.
 * - Clé d'idempotence identique sur toutes les tentatives d'un même appel.
 * - Chaque réponse est validée à l'exécution avant d'être utilisée.
 *
 * Note React Native : la classe `URL` y est incomplète (`protocol` non implémenté) ;
 * les adresses sont donc assemblées et vérifiées comme du texte.
 */

import type {
  AccessToken,
  BackendError,
  BackendErrorKind,
  CaregiverAlert,
  CaregiverSettings,
  CaregiverSettingsSaved,
  CaregiverStatus,
  ConfirmedItem,
  Consent,
  DeviceId,
  DeviceRegistration,
  DeviceRegistrationRequest,
  DisambiguationCandidate,
  HandoffId,
  HandoffRequest,
  HandoffResponse,
  IdempotencyKey,
  InterpretRequest,
  InterpretResponse,
  IsoDateTime,
  PendingChoiceItem,
  Result,
  Retailer,
  VerificationPurpose,
  VerificationStarted,
} from '../../types/vocourse';
import type { TokenResult } from '../auth/session';

export type BackendResult<T> = Result<T, BackendError>;

/** Contrat commun au client réel et à la simulation (mockVocourseBackend). */
export interface VocourseBackend {
  health(): Promise<boolean>;
  registerDevice(request: DeviceRegistrationRequest): Promise<BackendResult<DeviceRegistration>>;
  exchangeToken(deviceId: DeviceId, deviceSecret: string): Promise<BackendResult<AccessToken>>;
  interpretUtterance(request: InterpretRequest, idempotencyKey: IdempotencyKey): Promise<BackendResult<InterpretResponse>>;
  saveCaregiverSettings(settings: CaregiverSettings, idempotencyKey: IdempotencyKey): Promise<BackendResult<CaregiverSettingsSaved>>;
  caregiverStatus(): Promise<BackendResult<CaregiverStatus>>;
  startVerification(purpose: VerificationPurpose): Promise<BackendResult<VerificationStarted>>;
  confirmVerification(purpose: VerificationPurpose, code: string): Promise<BackendResult<{ readonly verified: true }>>;
  nearbyRetailers(): Promise<BackendResult<readonly Retailer[]>>;
  submitHandoff(request: HandoffRequest, idempotencyKey: IdempotencyKey): Promise<BackendResult<HandoffResponse>>;
  sendAlert(alert: CaregiverAlert): Promise<BackendResult<{ readonly notified: boolean }>>;
  updateConsent(consent: Consent): Promise<BackendResult<{ readonly savedAt: IsoDateTime }>>;
  exportAccount(): Promise<BackendResult<unknown>>;
  deleteAccount(): Promise<BackendResult<{ readonly deleted: true }>>;
}

export interface BackendConfig {
  readonly baseUrl: string;
  readonly getAccessToken: () => Promise<TokenResult>;
  /** Jeton refusé par le serveur : la session en redemandera un. */
  readonly invalidateToken?: () => void;
  readonly fetchImpl?: typeof fetch;
  /** Délai par tentative. */
  readonly timeoutMs?: number;
  /** Nombre maximal de tentatives (première comprise) pour les appels sans effet en double. */
  readonly maxAttempts?: number;
  /** Attente avant la tentative n (1-indexée) ; injectable pour les tests. */
  readonly backoffMs?: (attempt: number) => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Développement seulement : autorise http:// vers localhost, 127.0.0.1 ou 10.0.2.2. */
  readonly allowLocalHttp?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Validation des réponses                                                    */
/* -------------------------------------------------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isScore = (v: unknown): boolean => typeof v === 'number' && v >= 0 && v <= 1;
const UNITS = new Set(['unit', 'carton', 'bag', 'can', 'box', 'jar', 'bottle', 'package', 'dozen', 'case', 'bunch', 'head', 'g', 'kg', 'lb', 'mL', 'L']);
const CATEGORIES = new Set(['dairy', 'bakery', 'pantry', 'deli', 'meat', 'beverages', 'produce', 'frozen', 'snacks', 'household', 'personal_care', 'other']);
const isSize = (v: unknown): boolean =>
  v === null || (isRecord(v) && typeof v['value'] === 'number' && ['g', 'kg', 'lb', 'mL', 'L'].includes(String(v['unit'])));

export const parseHandoffResponse = (body: unknown): HandoffResponse | null => {
  if (!isRecord(body)) return null;
  const { handoffId, status, caregiverNotified, caregiverFirstName, receivedAt, smsStatus, linkExpiresAt } = body;
  if (!isNonEmptyString(handoffId) || status !== 'sent_to_caregiver' || typeof caregiverNotified !== 'boolean') return null;
  if (!isNonEmptyString(caregiverFirstName) || !isIso(receivedAt) || !isIso(linkExpiresAt)) return null;
  if (smsStatus !== 'sent' && smsStatus !== 'pending' && smsStatus !== 'opted_out') return null;
  return {
    handoffId: handoffId as HandoffId,
    status,
    caregiverNotified,
    smsStatus,
    caregiverFirstName,
    receivedAt: receivedAt as IsoDateTime,
    linkExpiresAt: linkExpiresAt as IsoDateTime,
  };
};

const isCandidate = (v: unknown): v is DisambiguationCandidate =>
  isRecord(v) &&
  (v['rank'] === 1 || v['rank'] === 2 || v['rank'] === 3) &&
  isNonEmptyString(v['label']) &&
  isNonEmptyString(v['normalizedProduct']) &&
  isScore(v['score']) &&
  CATEGORIES.has(String(v['category'])) &&
  UNITS.has(String(v['unit'])) &&
  isSize(v['packageSize']) &&
  typeof v['sensitive'] === 'boolean';

const isItemBase = (v: Record<string, unknown>): boolean =>
  isNonEmptyString(v['itemId']) &&
  isNonEmptyString(v['sourceUtteranceId']) &&
  typeof v['spokenText'] === 'string' &&
  typeof v['quantity'] === 'number' &&
  v['quantity'] > 0 &&
  UNITS.has(String(v['unit'])) &&
  isSize(v['packageSize']) &&
  isScore(v['confidence']) &&
  Array.isArray(v['upcs']) &&
  typeof v['sensitive'] === 'boolean';

const isInterpretedItem = (v: unknown): v is ConfirmedItem | PendingChoiceItem => {
  if (!isRecord(v) || !isItemBase(v)) return false;
  if (v['status'] === 'confirmed') {
    return isNonEmptyString(v['productKey']) && isNonEmptyString(v['productLabel']) && CATEGORIES.has(String(v['category']));
  }
  if (v['status'] !== 'pending_choice') return false;
  const d = v['disambiguation'];
  if (!isRecord(d) || !Array.isArray(d['candidates'])) return false;
  const c = d['candidates'];
  const resolution = d['resolution'];
  return c.length >= 1 && c.length <= 3 && c.every(isCandidate) && isNonEmptyString(d['ttsPrompt']) && isRecord(resolution) && resolution['state'] === 'unresolved';
};

export const parseInterpretResponse = (body: unknown): InterpretResponse | null => {
  if (!isRecord(body) || !isRecord(body['utterance']) || !Array.isArray(body['items'])) return null;
  const u = body['utterance'];
  if (!isNonEmptyString(u['utteranceId']) || typeof u['cleanTranscript'] !== 'string') return null;
  if (!body['items'].every(isInterpretedItem)) return null;
  return body as unknown as InterpretResponse;
};

const parseRegistration = (b: unknown): DeviceRegistration | null =>
  isRecord(b) && isNonEmptyString(b['deviceId']) && isNonEmptyString(b['deviceSecret']) && isNonEmptyString(b['accessToken']) && typeof b['expiresIn'] === 'number'
    ? { deviceId: b['deviceId'] as DeviceId, deviceSecret: b['deviceSecret'], accessToken: b['accessToken'], expiresIn: b['expiresIn'] }
    : null;

const parseToken = (b: unknown): AccessToken | null =>
  isRecord(b) && isNonEmptyString(b['accessToken']) && typeof b['expiresIn'] === 'number'
    ? { accessToken: b['accessToken'], expiresIn: b['expiresIn'] }
    : null;

export const parseSettingsSaved = (b: unknown): CaregiverSettingsSaved | null =>
  isRecord(b) && isIso(b['savedAt']) && typeof b['caregiverMobileVerified'] === 'boolean'
    ? { savedAt: b['savedAt'] as IsoDateTime, caregiverMobileVerified: b['caregiverMobileVerified'] }
    : null;

const parseStatus = (b: unknown): CaregiverStatus | null =>
  isRecord(b) && typeof b['settingsSaved'] === 'boolean' && typeof b['caregiverMobileVerified'] === 'boolean' && typeof b['caregiverOptedOut'] === 'boolean'
    ? { settingsSaved: b['settingsSaved'], caregiverMobileVerified: b['caregiverMobileVerified'], caregiverOptedOut: b['caregiverOptedOut'] }
    : null;

const parseStarted = (b: unknown): VerificationStarted | null =>
  isRecord(b) && isNonEmptyString(b['sentTo']) && typeof b['expiresInSeconds'] === 'number'
    ? { sentTo: b['sentTo'], expiresInSeconds: b['expiresInSeconds'] }
    : null;

const parseRetailers = (b: unknown): readonly Retailer[] | null => {
  if (!isRecord(b) || !Array.isArray(b['retailers'])) return null;
  const out: Retailer[] = [];
  for (const r of b['retailers']) {
    if (!isRecord(r) || !isNonEmptyString(r['key']) || !isNonEmptyString(r['name'])) return null;
    out.push({ key: r['key'], name: r['name'], logoUrl: typeof r['logoUrl'] === 'string' ? r['logoUrl'] : null });
  }
  return out;
};

const exactly =
  <K extends string>(key: K) =>
  (b: unknown): Readonly<Record<K, true>> | null =>
    isRecord(b) && b[key] === true ? ({ [key]: true } as Record<K, true>) : null;

const parseNotified = (b: unknown): { readonly notified: boolean } | null =>
  isRecord(b) && typeof b['notified'] === 'boolean' ? { notified: b['notified'] } : null;

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const classifyStatus = (status: number): BackendErrorKind =>
  status === 401 || status === 403
    ? 'unauthorized'
    : status === 409
      ? 'conflict'
      : status === 429
        ? 'rate_limited'
        : status >= 500 || status === 408
          ? 'server'
          : 'rejected';

const isRetryable = (kind: BackendErrorKind): boolean => kind === 'server' || kind === 'timeout' || kind === 'offline';

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(\/|$)/;

export const checkBaseUrl = (url: string, allowLocalHttp: boolean): string => {
  const trimmed = url.replace(/\/+$/, '');
  if (/^https:\/\/[^/\s]+/.test(trimmed)) return trimmed;
  if (allowLocalHttp && LOCAL_HTTP.test(`${trimmed}/`)) return trimmed;
  throw new Error('Le serveur Vocourse doit être joint en HTTPS.');
};

export const HANDOFF_TIMEOUT_MS = 60_000;

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface CallOptions<T> {
  readonly method: Method;
  readonly path: string;
  readonly body?: unknown;
  readonly auth: boolean;
  readonly key?: IdempotencyKey;
  /** Nouvelle tentative automatique : seulement si l'appel ne peut pas produire d'effet en double. */
  readonly retry: boolean;
  readonly parse: (json: unknown) => T | null;
  readonly locale?: string;
  /** Délai propre à l'appel (l'envoi du panier attend Instacart puis le texto). */
  readonly timeoutMs?: number;
}

type Attempt<T> = Result<T, Omit<BackendError, 'attempts'>>;

export const createVocourseBackend = (config: BackendConfig): VocourseBackend => {
  const base = checkBaseUrl(config.baseUrl, config.allowLocalHttp ?? false);
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 12_000;
  const maxAttempts = Math.max(1, config.maxAttempts ?? 3);
  const backoffMs = config.backoffMs ?? ((attempt: number) => 1000 * 2 ** (attempt - 2)); // 1 s, 2 s
  const sleep = config.sleep ?? defaultSleep;

  const attemptOnce = async <T>(o: CallOptions<T>, retriedAuth = false): Promise<Attempt<T>> => {
    let token: string | null = null;
    if (o.auth) {
      const t = await config.getAccessToken();
      if (!t.ok) return { ok: false, error: { kind: t.reason === 'offline' ? 'offline' : 'unauthorized', status: null } };
      token = t.token;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (o.body !== undefined) headers['Content-Type'] = 'application/json';
      if (o.key) headers['Idempotency-Key'] = o.key;
      if (o.locale) headers['Accept-Language'] = o.locale;
      const res = await doFetch(`${base}${o.path}`, {
        method: o.method,
        headers,
        ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
        signal: controller.signal,
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (!res.ok) {
        const kind = classifyStatus(res.status);
        // Jeton expiré entre-temps : un seul nouvel essai avec un jeton neuf.
        if (kind === 'unauthorized' && o.auth && !retriedAuth) {
          config.invalidateToken?.();
          clearTimeout(timer);
          return attemptOnce(o, true);
        }
        const err = isRecord(json) && isRecord(json['error']) ? json['error'] : {};
        return {
          ok: false,
          error: {
            kind,
            status: res.status,
            ...(typeof err['code'] === 'string' ? { code: err['code'] } : {}),
            ...(typeof err['attemptsLeft'] === 'number' ? { attemptsLeft: err['attemptsLeft'] } : {}),
          },
        };
      }
      const parsed = o.parse(json);
      return parsed !== null ? { ok: true, value: parsed } : { ok: false, error: { kind: 'bad_response', status: res.status } };
    } catch (e: unknown) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return { ok: false, error: { kind: aborted ? 'timeout' : 'offline', status: null } };
    } finally {
      clearTimeout(timer);
    }
  };

  const call = async <T>(o: CallOptions<T>): Promise<BackendResult<T>> => {
    const attempts = o.retry ? maxAttempts : 1;
    let last: Omit<BackendError, 'attempts'> = { kind: 'server', status: null };
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (attempt > 1) await sleep(backoffMs(attempt));
      const result = await attemptOnce(o);
      if (result.ok) return result;
      last = result.error;
      if (!isRetryable(last.kind)) return { ok: false, error: { ...last, attempts: attempt } };
    }
    return { ok: false, error: { ...last, attempts } };
  };

  return {
    async health() {
      const r = await call({ method: 'GET', path: '/v1/health', auth: false, retry: false, parse: (b) => (isRecord(b) && b['status'] === 'ok' ? true : null) });
      return r.ok;
    },
    registerDevice: (request) =>
      call({ method: 'POST', path: '/v1/devices', body: request, auth: false, retry: false, parse: parseRegistration, locale: request.locale }),
    exchangeToken: (deviceId, deviceSecret) =>
      call({ method: 'POST', path: '/v1/auth/token', body: { deviceId, deviceSecret }, auth: false, retry: true, parse: parseToken }),
    interpretUtterance: (request, key) =>
      call({ method: 'POST', path: '/v1/utterances', body: request, auth: true, key, retry: true, parse: parseInterpretResponse, locale: request.locale }),
    saveCaregiverSettings: (settings, key) =>
      call({ method: 'PUT', path: '/v1/caregiver/settings', body: settings, auth: true, key, retry: true, parse: parseSettingsSaved }),
    caregiverStatus: () => call({ method: 'GET', path: '/v1/caregiver/status', auth: true, retry: true, parse: parseStatus }),
    startVerification: (purpose) =>
      call({ method: 'POST', path: '/v1/caregiver/verification', body: { purpose }, auth: true, retry: false, parse: parseStarted }),
    confirmVerification: (purpose, code) =>
      call({ method: 'POST', path: '/v1/caregiver/verification/confirm', body: { purpose, code }, auth: true, retry: false, parse: exactly('verified') }),
    nearbyRetailers: () => call({ method: 'GET', path: '/v1/retailers', auth: true, retry: true, parse: parseRetailers }),
    submitHandoff: (request, key) =>
      call({
        method: 'POST',
        path: '/v1/handoffs',
        body: request,
        auth: true,
        key,
        retry: true,
        parse: parseHandoffResponse,
        locale: request.locale,
        // Le serveur peut réessayer Instacart (jusqu'à ~10 s) puis envoyer le texto : abandonner
        // trop tôt ferait croire à un échec alors que la liste est partie.
        timeoutMs: Math.max(HANDOFF_TIMEOUT_MS, timeoutMs),
      }),
    sendAlert: (alert) => call({ method: 'POST', path: '/v1/alerts', body: alert, auth: true, retry: false, parse: parseNotified }),
    updateConsent: (consent) =>
      call({
        method: 'PUT',
        path: '/v1/account/consent',
        body: consent,
        auth: true,
        retry: true,
        parse: (b) => (isRecord(b) && isIso(b['savedAt']) ? { savedAt: b['savedAt'] as IsoDateTime } : null),
      }),
    exportAccount: () => call({ method: 'GET', path: '/v1/account/export', auth: true, retry: true, parse: (b) => (isRecord(b) ? b : null) }),
    deleteAccount: () => call({ method: 'DELETE', path: '/v1/account', auth: true, retry: true, parse: exactly('deleted') }),
  };
};
