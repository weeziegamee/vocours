/**
 * Routes de l'API Vocourse (v1). Toutes les réponses sont en JSON.
 *
 *   GET    /v1/health                           état du service (sonde de l'appli et du répartiteur)
 *   POST   /v1/devices                          inscription d'un téléphone (consentement) → jetons
 *   POST   /v1/auth/token                       jeton d'accès court à partir du secret de l'appareil
 *   POST   /v1/utterances                       analyse d'une dictée (texte, jamais d'audio)
 *   PUT    /v1/caregiver/settings               réglages de l'aidant (chiffrés)
 *   GET    /v1/caregiver/status                 cellulaire vérifié ? textos refusés ?
 *   POST   /v1/caregiver/verification           envoi d'un code par texto (cellulaire ou code PIN oublié)
 *   POST   /v1/caregiver/verification/confirm   vérification du code
 *   GET    /v1/retailers                        épiceries Instacart proches de l'adresse
 *   POST   /v1/handoffs                         liste confirmée → lien Instacart → texto à l'aidant
 *   POST   /v1/alerts                           alerte à l'aidant (codes erronés, réglages modifiés)
 *   PUT    /v1/account/consent                  consentement mis à jour (reconnaissance vocale en ligne)
 *   GET    /v1/account/export                   toutes les données du compte (droit d'accès)
 *   DELETE /v1/account                          suppression définitive du compte
 */

import type { Config } from './config.ts';
import type { Db, SettingsRow } from './db.ts';
import { createCrypto, itemsDigest, randomCode, randomId, randomSecret, safeEqual, sha256Hex } from './crypto.ts';
import { HttpError, ok, type Ctx, type Res, type Route } from './http.ts';
import type { Logger } from './log.ts';
import {
  PROVINCES,
  arr,
  bool,
  int,
  iso,
  isAllowedMobile,
  maskMobile,
  nullableStr,
  num,
  obj,
  oneOf,
  provinceOfPostalCode,
  str,
  type Obj,
  type Province,
} from './validate.ts';
import { interpretTranscript } from '../../shared/nlp/interpret.ts';
import { buildProductLinkPayload, type HandoffLine, type InstacartClient, type Locale, type Retailer, type Tier } from './services/instacart.ts';
import type { SmsOutcome, SmsSender } from './services/sms.ts';
import { sms as texts } from './services/messages.ts';

const LOCALES = ['fr-CA', 'en-CA'] as const;
const TIERS = ['economy', 'balanced', 'premium_organic'] as const;
const UNITS = ['unit', 'carton', 'bag', 'can', 'box', 'jar', 'bottle', 'package', 'dozen', 'case', 'bunch', 'head', 'g', 'kg', 'lb', 'mL', 'L'] as const;
const SIZE_UNITS = ['g', 'kg', 'lb', 'mL', 'L'] as const;
const CATEGORIES = ['dairy', 'bakery', 'pantry', 'deli', 'meat', 'beverages', 'produce', 'frozen', 'snacks', 'household', 'personal_care', 'other'] as const;

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NAME_RE = /^[\p{L}][\p{L}'’\- ]{0,39}$/u;

/**
 * Réponses rejouées pour une même clé d'idempotence : succès et refus définitifs
 * seulement. Jamais 409 (l'état peut changer : cellulaire confirmé ensuite), 429 ni 5xx.
 */
const replayable = (status: number): boolean => status < 300 || status === 400 || status === 422;
const ID_RE = /^[A-Za-z0-9_\-:.]{1,100}$/;

export interface Deps {
  readonly config: Config;
  readonly db: Db;
  readonly log: Logger;
  readonly instacart: InstacartClient;
  readonly sms: SmsSender;
  readonly now?: () => number;
}

/** Réglages stockés chiffrés (colonne settings.data_enc). */
interface StoredSettings {
  readonly seniorFirstName: string | null;
  readonly caregiverFirstName: string;
  readonly caregiverMobile: string;
  readonly address: {
    readonly civicNumber: string;
    readonly street: string;
    readonly apartment: string | null;
    readonly city: string;
    readonly province: Province;
    readonly postalCode: string;
  };
  readonly preferredRetailer: { readonly key: string; readonly name: string } | null;
  readonly language: Locale;
  readonly register: 'vous' | 'tu';
  readonly regionalDictionary: boolean;
  readonly updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Lecture des corps                                                          */
/* -------------------------------------------------------------------------- */

const parseSettings = (body: unknown): StoredSettings => {
  const b = obj(body, 'body');
  const address = obj(b['address'], 'body.address');
  const postalRaw = str(address, 'postalCode', 'body.address', { max: 7 }).toUpperCase().replace(/\s/g, '');
  const postalCode = `${postalRaw.slice(0, 3)} ${postalRaw.slice(3)}`;
  const derived = provinceOfPostalCode(postalCode);
  const province = oneOf(address, 'province', 'body.address', PROVINCES);
  if (!derived) throw new HttpError(422, 'invalid', 'Code postal canadien invalide.', { field: 'body.address.postalCode' });
  if (derived !== province) throw new HttpError(422, 'invalid', 'Le code postal ne correspond pas à la province.', { field: 'body.address.province' });
  if (b['smsConsent'] !== true) throw new HttpError(422, 'invalid', 'Le consentement aux textos est requis.', { field: 'body.smsConsent' });
  const retailer = b['preferredRetailer'];
  let preferredRetailer: StoredSettings['preferredRetailer'] = null;
  if (retailer !== null && retailer !== undefined) {
    const r = obj(retailer, 'body.preferredRetailer');
    preferredRetailer = { key: str(r, 'key', 'body.preferredRetailer', { max: 100 }), name: str(r, 'name', 'body.preferredRetailer', { max: 80 }) };
  }
  return {
    seniorFirstName: nullableStr(b, 'seniorFirstName', 'body', { max: 40, re: NAME_RE }),
    caregiverFirstName: str(b, 'caregiverFirstName', 'body', { max: 40, re: NAME_RE }),
    caregiverMobile: (() => {
      const m = str(b, 'caregiverMobile', 'body', { max: 12 });
      if (!isAllowedMobile(m)) throw new HttpError(422, 'invalid', 'Numéro de cellulaire canadien ou américain attendu.', { field: 'body.caregiverMobile' });
      return m;
    })(),
    address: {
      civicNumber: str(address, 'civicNumber', 'body.address', { max: 7, re: /^\d{1,6}[A-Za-z]?$/ }),
      street: str(address, 'street', 'body.address', { min: 2, max: 80 }),
      apartment: nullableStr(address, 'apartment', 'body.address', { max: 10, re: /^[\p{L}\d\- ]{1,10}$/u }),
      city: str(address, 'city', 'body.address', { min: 2, max: 60 }),
      province,
      postalCode,
    },
    preferredRetailer,
    language: oneOf(b, 'language', 'body', LOCALES),
    register: oneOf(b, 'register', 'body', ['vous', 'tu'] as const),
    regionalDictionary: bool(b, 'regionalDictionary', 'body'),
    updatedAt: iso(b, 'updatedAt', 'body'),
  };
};

const parseLines = (b: Obj): HandoffLine[] =>
  arr(b, 'items', 'body', 1, 100).map((raw, i) => {
    const p = `body.items[${i}]`;
    const it = obj(raw, p);
    const size = it['packageSize'];
    let packageSize: HandoffLine['packageSize'] = null;
    if (size !== null && size !== undefined) {
      const s = obj(size, `${p}.packageSize`);
      packageSize = { value: num(s, 'value', `${p}.packageSize`, 0.001, 100_000), unit: oneOf(s, 'unit', `${p}.packageSize`, SIZE_UNITS) };
    }
    return {
      itemId: str(it, 'itemId', p, { re: ID_RE }),
      productKey: str(it, 'productKey', p, { max: 80 }),
      productLabel: str(it, 'productLabel', p, { max: 120 }),
      quantity: num(it, 'quantity', p, 0.001, 99),
      unit: oneOf(it, 'unit', p, UNITS),
      packageSize,
      sensitive: bool(it, 'sensitive', p),
      category: oneOf(it, 'category', p, CATEGORIES),
    };
  });

interface Confirmation {
  readonly readbackStartedAt: string;
  readonly readbackCompletedAt: string;
  readonly readbackText: string;
  readonly first: { readonly method: string; readonly at: string };
  readonly second: { readonly method: string; readonly at: string; readonly durationMs: number | null };
}

const parseConfirmation = (b: Obj): Confirmation => {
  const c = obj(b['confirmation'], 'body.confirmation');
  const first = obj(c['first'], 'body.confirmation.first');
  const second = obj(c['second'], 'body.confirmation.second');
  if (c['actor'] !== 'senior') throw new HttpError(422, 'confirmation_invalid', 'La confirmation doit venir du senior.');
  const secondMethod = oneOf(second, 'method', 'body.confirmation.second', ['long_press', 'voice', 'screen_reader_action'] as const);
  const conf: Confirmation = {
    readbackStartedAt: iso(c, 'readbackStartedAt', 'body.confirmation'),
    readbackCompletedAt: iso(c, 'readbackCompletedAt', 'body.confirmation'),
    readbackText: str(c, 'readbackText', 'body.confirmation', { max: 6000 }),
    first: { method: oneOf(first, 'method', 'body.confirmation.first', ['voice', 'tap'] as const), at: iso(first, 'at', 'body.confirmation.first') },
    second: {
      method: secondMethod,
      at: iso(second, 'at', 'body.confirmation.second'),
      durationMs: secondMethod === 'long_press' ? int(second, 'durationMs', 'body.confirmation.second', 0, 600_000) : null,
    },
  };
  // Relecture complète, puis 1re confirmation, puis 2de : dans cet ordre (cahier V3.0 §8.7).
  const t = (s: string): number => Date.parse(s);
  if (
    t(conf.readbackCompletedAt) < t(conf.readbackStartedAt) ||
    t(conf.first.at) < t(conf.readbackCompletedAt) ||
    t(conf.second.at) < t(conf.first.at) ||
    (conf.second.durationMs !== null && conf.second.durationMs < 1800)
  ) {
    throw new HttpError(422, 'confirmation_invalid', 'Confirmation incomplète ou dans le désordre.');
  }
  return conf;
};

/* -------------------------------------------------------------------------- */
/* Application                                                                */
/* -------------------------------------------------------------------------- */

export interface App {
  readonly routes: readonly Route[];
  /** Renvoie les textos de transmission restés en échec (tâche périodique). */
  retryPendingSms(): Promise<number>;
  /** Purge selon la politique de conservation (tâche périodique). */
  purge(): Record<string, number>;
}

export const createApp = (deps: Deps): App => {
  const { config, db, log, instacart, sms } = deps;
  const now = deps.now ?? (() => Date.now());
  const crypto = createCrypto(config.dataKey, config.tokenKey);
  const inflight = new Map<string, Promise<Res>>();
  const retailerCache = new Map<string, { at: number; list: Retailer[] }>();

  /* ----------------------------- Outils ---------------------------------- */

  const limit = (bucket: string, max: number, windowMs: number): void => {
    if (db.hit(bucket, windowMs, now()) > max) {
      throw new HttpError(429, 'rate_limited', 'Trop de demandes. Réessayez plus tard.', { retryAfterSeconds: Math.ceil(windowMs / 1000) });
    }
  };

  const authenticate = (ctx: Ctx): { accountId: string; deviceId: string } => {
    const header = String(ctx.headers['authorization'] ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = token ? crypto.verifyAccessToken(token, Math.floor(now() / 1000)) : null;
    if (!claims) throw new HttpError(401, 'unauthorized', 'Jeton absent ou expiré.');
    const device = db.getDevice(claims.d);
    if (!device || device.revoked_at !== null || device.account_id !== claims.a) {
      throw new HttpError(401, 'unauthorized', 'Appareil inconnu ou révoqué.');
    }
    const t = now();
    if (t - device.last_seen_at > HOUR) {
      db.touchDevice(device.id, t);
      db.touchAccount(device.account_id, t);
    }
    return { accountId: claims.a, deviceId: claims.d };
  };

  /** Rejoue la réponse d'une requête déjà traitée (même clé, même contenu). */
  const idempotent = async (ctx: Ctx, accountId: string, route: string, run: () => Promise<Res>): Promise<Res> => {
    const key = String(ctx.headers['idempotency-key'] ?? '');
    if (!/^[A-Za-z0-9_\-:.]{8,100}$/.test(key)) throw new HttpError(400, 'idempotency_key_required', 'En-tête Idempotency-Key manquant ou invalide.');
    const requestHash = sha256Hex(`${route}\u0000${JSON.stringify(ctx.body)}`);
    const existing = db.getIdempotency(accountId, key);
    if (existing) {
      if (existing.route !== route || !safeEqual(existing.request_hash, requestHash)) {
        throw new HttpError(422, 'idempotency_mismatch', 'Cette clé a déjà servi pour une autre requête.');
      }
      return { status: existing.status, body: JSON.parse(crypto.decrypt(existing.body_enc, `idem:${accountId}`)) as unknown };
    }
    const lockKey = `${accountId}\u0000${key}`;
    const running = inflight.get(lockKey);
    if (running) return running;
    const p = (async () => {
      try {
        const res = await run();
        if (replayable(res.status)) {
          db.putIdempotency({
            account_id: accountId,
            key,
            route,
            request_hash: requestHash,
            status: res.status,
            body_enc: crypto.encrypt(JSON.stringify(res.body ?? null), `idem:${accountId}`),
            created_at: now(),
          });
        }
        return res;
      } catch (e) {
        if (e instanceof HttpError && replayable(e.status)) {
          const body = { error: { code: e.code, message: e.message, ...(e.extra ?? {}) } };
          db.putIdempotency({
            account_id: accountId, key, route, request_hash: requestHash, status: e.status,
            body_enc: crypto.encrypt(JSON.stringify(body), `idem:${accountId}`), created_at: now(),
          });
          return { status: e.status, body };
        }
        throw e;
      } finally {
        inflight.delete(lockKey);
      }
    })();
    inflight.set(lockKey, p);
    return p;
  };

  const loadSettings = (accountId: string): { row: SettingsRow; data: StoredSettings } | null => {
    const row = db.getSettings(accountId);
    if (!row) return null;
    return { row, data: JSON.parse(crypto.decrypt(row.data_enc, `settings:${accountId}`)) as StoredSettings };
  };

  const mobileHash = (mobile: string): string => crypto.lookupHash(mobile, 'mobile');
  const isReviewMobile = (mobile: string): boolean => config.review.mobile !== null && mobile === config.review.mobile;

  const sendSms = async (accountId: string, mobile: string, body: string): Promise<SmsOutcome> => {
    if (isReviewMobile(mobile)) return 'sent';
    if (db.hit('global:sms', DAY, now()) > config.smsDailyBudget) {
      log.error('sms_budget_exceeded', { budget: config.smsDailyBudget });
      return 'failed';
    }
    const outcome = await sms.send(mobile, body);
    if (outcome === 'opted_out') db.markOptedOut(accountId, now());
    return outcome;
  };

  /* ----------------------------- Routes ---------------------------------- */

  const health = async (): Promise<Res> => ok({ status: 'ok', time: new Date(now()).toISOString() });

  const registerDevice = async (ctx: Ctx): Promise<Res> => {
    limit(`ip:register:${ctx.ip}`, config.registerPerIpPerHour, HOUR);
    const b = obj(ctx.body, 'body');
    const consent = obj(b['consent'], 'body.consent');
    const locale = oneOf(b, 'locale', 'body', LOCALES);
    const platform = oneOf(b, 'platform', 'body', ['ios', 'android'] as const);
    const version = str(consent, 'version', 'body.consent', { max: 20 });
    const acceptedAt = iso(consent, 'acceptedAt', 'body.consent');
    const cloudSpeech = bool(consent, 'cloudSpeech', 'body.consent');
    const t = now();
    const accountId = randomId('acc');
    const deviceId = randomId('dev');
    const secret = randomSecret(32);
    db.tx(() => {
      db.insertAccount({
        id: accountId, created_at: t, locale, consent_version: version, consent_at: Date.parse(acceptedAt),
        cloud_speech_consent: cloudSpeech ? 1 : 0, last_active_at: t,
      });
      db.insertDevice({ id: deviceId, account_id: accountId, secret_hash: sha256Hex(secret), platform, created_at: t, last_seen_at: t, revoked_at: null });
      db.audit(accountId, 'account_created', t);
    });
    const exp = Math.floor(t / 1000) + config.accessTokenTtlSeconds;
    return ok(
      {
        deviceId,
        deviceSecret: secret,
        accessToken: crypto.signAccessToken({ a: accountId, d: deviceId, e: exp }),
        expiresIn: config.accessTokenTtlSeconds,
      },
      201,
    );
  };

  const token = async (ctx: Ctx): Promise<Res> => {
    limit(`ip:token:${ctx.ip}`, 120, HOUR);
    const b = obj(ctx.body, 'body');
    const deviceId = str(b, 'deviceId', 'body', { re: ID_RE });
    const secret = str(b, 'deviceSecret', 'body', { max: 100 });
    const device = db.getDevice(deviceId);
    if (!device || device.revoked_at !== null || !safeEqual(sha256Hex(secret), device.secret_hash)) {
      throw new HttpError(401, 'unauthorized', 'Appareil inconnu ou révoqué.');
    }
    const t = now();
    db.touchDevice(device.id, t);
    db.touchAccount(device.account_id, t);
    const exp = Math.floor(t / 1000) + config.accessTokenTtlSeconds;
    return ok({ accessToken: crypto.signAccessToken({ a: device.account_id, d: device.id, e: exp }), expiresIn: config.accessTokenTtlSeconds });
  };

  const utterances = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    return idempotent(ctx, accountId, 'utterances', async () => {
      limit(`acct:utt:${accountId}`, 300, HOUR);
      const b = obj(ctx.body, 'body');
      const register = b['register'] === undefined ? 'vous' : oneOf(b, 'register', 'body', ['vous', 'tu'] as const);
      const result = interpretTranscript({
        utteranceId: str(b, 'utteranceId', 'body', { re: ID_RE }),
        transcript: str(b, 'transcript', 'body', { max: 1000 }),
        locale: oneOf(b, 'locale', 'body', LOCALES),
        capturedAt: iso(b, 'capturedAt', 'body'),
        fromOfflineQueue: bool(b, 'fromOfflineQueue', 'body'),
        regionalDictionary: bool(b, 'regionalDictionary', 'body'),
        register,
        ...(typeof b['sttConfidence'] === 'number' ? { sttConfidence: num(b, 'sttConfidence', 'body', 0, 1) } : {}),
        newItemId: () => randomId('itm', 9),
      });
      return ok(result);
    });
  };

  const putSettings = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    return idempotent(ctx, accountId, 'settings', async () => {
      const s = parseSettings(ctx.body);
      const t = now();
      const before = db.getSettings(accountId);
      const hash = mobileHash(s.caregiverMobile);
      const sameMobile = before !== undefined && before.mobile_hash === hash;
      db.upsertSettings({
        account_id: accountId,
        data_enc: crypto.encrypt(JSON.stringify(s), `settings:${accountId}`),
        mobile_hash: hash,
        language: s.language,
        province: s.address.province,
        sms_consent_at: before?.sms_consent_at ?? t,
        // Nouveau numéro : il faut le vérifier de nouveau.
        mobile_verified_at: sameMobile ? (before?.mobile_verified_at ?? null) : null,
        sms_opted_out_at: sameMobile ? (before?.sms_opted_out_at ?? null) : null,
        updated_at: t,
      });
      db.audit(accountId, 'settings_saved', t);
      retailerCache.delete(accountId);
      return ok({ savedAt: new Date(t).toISOString(), caregiverMobileVerified: sameMobile && before?.mobile_verified_at !== null });
    });
  };

  const caregiverStatus = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    const row = db.getSettings(accountId);
    return ok({
      settingsSaved: row !== undefined,
      caregiverMobileVerified: row?.mobile_verified_at != null,
      caregiverOptedOut: row?.sms_opted_out_at != null,
    });
  };

  const startVerification = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    const b = obj(ctx.body, 'body');
    const purpose = oneOf(b, 'purpose', 'body', ['mobile', 'pin_reset'] as const);
    const s = loadSettings(accountId);
    if (!s) throw new HttpError(409, 'setup_incomplete', 'Réglages de l’aidant à enregistrer d’abord.');
    if (purpose === 'pin_reset' && s.row.mobile_verified_at === null) {
      throw new HttpError(409, 'caregiver_unverified', 'Le cellulaire de l’aidant n’est pas vérifié.');
    }
    limit(`acct:otp:${accountId}`, 5, HOUR);
    limit(`mobile:otp:${s.row.mobile_hash}`, 8, DAY);
    const mobile = s.data.caregiverMobile;
    const code = isReviewMobile(mobile) && config.review.code ? config.review.code : randomCode();
    const t = now();
    db.putOtp({
      account_id: accountId, purpose, code_hash: crypto.lookupHash(`${purpose}:${code}`, `otp:${accountId}`),
      mobile_hash: s.row.mobile_hash, expires_at: t + OTP_TTL_MS, attempts: 0, created_at: t,
    });
    const body = purpose === 'mobile' ? texts.verification(s.data.language, code) : texts.pinReset(s.data.language, code);
    const outcome = await sendSms(accountId, mobile, body);
    if (outcome !== 'sent') {
      db.deleteOtp(accountId, purpose);
      throw new HttpError(
        502,
        outcome === 'opted_out' ? 'caregiver_opted_out' : 'sms_failed',
        outcome === 'opted_out' ? 'Ce numéro a refusé les textos de Vocourse (répondre START pour les réactiver).' : 'Le texto n’a pas pu être envoyé.',
      );
    }
    db.audit(accountId, `otp_sent_${purpose}`, t);
    return ok({ sentTo: maskMobile(mobile), expiresInSeconds: OTP_TTL_MS / 1000 });
  };

  const confirmVerification = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    const b = obj(ctx.body, 'body');
    const purpose = oneOf(b, 'purpose', 'body', ['mobile', 'pin_reset'] as const);
    const code = str(b, 'code', 'body', { re: /^\d{6}$/ });
    const otp = db.getOtp(accountId, purpose);
    const t = now();
    if (!otp || otp.expires_at < t) throw new HttpError(410, 'code_expired', 'Code expiré : demandez-en un nouveau.');
    const settings = db.getSettings(accountId);
    const matches =
      settings !== undefined &&
      settings.mobile_hash === otp.mobile_hash &&
      safeEqual(crypto.lookupHash(`${purpose}:${code}`, `otp:${accountId}`), otp.code_hash);
    if (!matches) {
      db.bumpOtpAttempts(accountId, purpose);
      const attemptsLeft = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
      if (attemptsLeft <= 0) db.deleteOtp(accountId, purpose);
      throw new HttpError(422, 'invalid_code', 'Code incorrect.', { attemptsLeft: Math.max(0, attemptsLeft) });
    }
    db.deleteOtp(accountId, purpose);
    db.audit(accountId, `otp_ok_${purpose}`, t);
    if (purpose === 'mobile') {
      db.markMobileVerified(accountId, t);
      const s = loadSettings(accountId);
      if (s) void sendSms(accountId, s.data.caregiverMobile, texts.welcome(s.data.language, s.data.seniorFirstName));
    }
    return ok({ verified: true });
  };

  const retailers = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    const s = loadSettings(accountId);
    if (!s) throw new HttpError(409, 'setup_incomplete', 'Adresse de livraison à enregistrer d’abord.');
    const cached = retailerCache.get(accountId);
    if (cached && now() - cached.at < DAY) return ok({ retailers: cached.list });
    limit(`acct:retailers:${accountId}`, 30, HOUR);
    const r = await instacart.nearbyRetailers(s.data.address.postalCode);
    if (!r.ok) throw new HttpError(503, 'instacart_unavailable', 'Instacart ne répond pas pour le moment.');
    retailerCache.set(accountId, { at: now(), list: r.value });
    return ok({ retailers: r.value });
  };

  const handoffs = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    return idempotent(ctx, accountId, 'handoffs', async () => {
      const b = obj(ctx.body, 'body');
      const listId = str(b, 'listId', 'body', { re: ID_RE });
      const tier = oneOf(b, 'tier', 'body', TIERS) as Tier;
      const lines = parseLines(b);
      const digest = str(b, 'itemsDigest', 'body', { re: /^[0-9a-f]{64}$/ });
      if (!safeEqual(itemsDigest(lines), digest)) {
        throw new HttpError(422, 'digest_mismatch', 'La liste envoyée n’est pas celle qui a été relue.');
      }
      const confirmation = parseConfirmation(b);
      const s = loadSettings(accountId);
      if (!s) throw new HttpError(409, 'setup_incomplete', 'Réglages de l’aidant à enregistrer d’abord.');
      if (s.row.mobile_verified_at === null) throw new HttpError(409, 'caregiver_unverified', 'Le cellulaire de l’aidant n’est pas vérifié.');
      if (s.row.sms_opted_out_at !== null) throw new HttpError(409, 'caregiver_opted_out', 'L’aidant a refusé les textos de Vocourse.');
      limit(`acct:handoff:${accountId}`, 30, DAY);

      const t = now();
      const locale = s.data.language;
      const payload = buildProductLinkPayload({
        lines,
        tier,
        locale,
        preferredRetailerName: s.data.preferredRetailer?.name ?? null,
        linkbackUrl: config.instacart.linkbackUrl,
        expiresInDays: config.instacart.linkExpiresInDays,
        now: new Date(t),
      });
      if (!payload) throw new HttpError(422, 'empty_list', 'Liste vide.');
      const link = await instacart.createShoppingList(payload);
      if (!link.ok) {
        log.warn('handoff_instacart_failed', { reason: link.reason, status: link.status });
        throw new HttpError(503, 'instacart_unavailable', 'Instacart ne répond pas pour le moment.');
      }

      const message = texts.handoff(locale, {
        senior: s.data.seniorFirstName,
        count: lines.length,
        tier,
        store: s.data.preferredRetailer?.name ?? null,
        url: link.value,
        days: config.instacart.linkExpiresInDays,
      });
      const outcome = await sendSms(accountId, s.data.caregiverMobile, message);
      const handoffId = randomId('hnd');
      const linkExpiresAt = t + config.instacart.linkExpiresInDays * DAY;
      db.insertHandoff({
        id: handoffId,
        account_id: accountId,
        list_id: listId,
        tier,
        items_digest: digest,
        item_count: lines.length,
        // Preuve de la confirmation souveraine (12 mois), chiffrée : elle contient les produits relus.
        proof_enc: crypto.encrypt(JSON.stringify({ confirmation, items: lines }), `handoff:${accountId}`),
        link_enc: crypto.encrypt(link.value, `handoff:${accountId}`),
        sms_status: outcome,
        sms_attempts: 1,
        created_at: t,
        link_expires_at: linkExpiresAt,
      });
      db.audit(accountId, 'handoff', t);
      return ok({
        handoffId,
        status: 'sent_to_caregiver',
        caregiverNotified: outcome === 'sent',
        smsStatus: outcome === 'failed' ? 'pending' : outcome,
        caregiverFirstName: s.data.caregiverFirstName,
        receivedAt: new Date(t).toISOString(),
        linkExpiresAt: new Date(linkExpiresAt).toISOString(),
      });
    });
  };

  const alerts = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    const b = obj(ctx.body, 'body');
    const kind = oneOf(b, 'kind', 'body', ['pin_lockout', 'settings_changed'] as const);
    const s = loadSettings(accountId);
    if (!s || s.row.mobile_verified_at === null || s.row.sms_opted_out_at !== null) return ok({ notified: false });
    limit(`acct:alert:${accountId}`, 6, DAY);
    const body = kind === 'pin_lockout' ? texts.pinLockout(s.data.language, s.data.seniorFirstName) : texts.settingsChanged(s.data.language, s.data.seniorFirstName);
    const outcome = await sendSms(accountId, s.data.caregiverMobile, body);
    db.audit(accountId, `alert_${kind}`, now());
    return ok({ notified: outcome === 'sent' });
  };

  const updateConsent = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    const b = obj(ctx.body, 'body');
    const version = str(b, 'version', 'body', { max: 20 });
    const acceptedAt = iso(b, 'acceptedAt', 'body');
    const cloudSpeech = bool(b, 'cloudSpeech', 'body');
    db.updateConsent(accountId, version, Date.parse(acceptedAt), cloudSpeech);
    db.audit(accountId, cloudSpeech ? 'consent_cloud_speech_on' : 'consent_cloud_speech_off', now());
    return ok({ savedAt: new Date(now()).toISOString() });
  };

  const exportAccount = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    limit(`acct:export:${accountId}`, 10, DAY);
    const account = db.getAccount(accountId);
    if (!account) throw new HttpError(404, 'not_found', 'Compte introuvable.');
    const s = loadSettings(accountId);
    const iso8601 = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
    db.audit(accountId, 'export', now());
    return ok({
      generatedAt: new Date(now()).toISOString(),
      account: {
        createdAt: iso8601(account.created_at),
        locale: account.locale,
        consentVersion: account.consent_version,
        consentAt: iso8601(account.consent_at),
        cloudSpeechConsent: account.cloud_speech_consent === 1,
      },
      settings: s
        ? {
            ...s.data,
            caregiverMobileVerifiedAt: iso8601(s.row.mobile_verified_at),
            smsConsentAt: iso8601(s.row.sms_consent_at),
            smsOptedOutAt: iso8601(s.row.sms_opted_out_at),
          }
        : null,
      devices: db.listDevices(accountId).map((d) => ({
        deviceId: d.id,
        platform: d.platform,
        createdAt: iso8601(d.created_at),
        lastSeenAt: iso8601(d.last_seen_at),
        revokedAt: iso8601(d.revoked_at),
      })),
      handoffs: db.listHandoffs(accountId).map((h) => ({
        handoffId: h.id,
        createdAt: iso8601(h.created_at),
        tier: h.tier,
        itemCount: h.item_count,
        instacartLink: crypto.decrypt(h.link_enc, `handoff:${accountId}`),
        linkExpiresAt: iso8601(h.link_expires_at),
        smsStatus: h.sms_status,
        proof: JSON.parse(crypto.decrypt(h.proof_enc, `handoff:${accountId}`)) as unknown,
      })),
      notes: [
        'Les dictées ne sont pas conservées par Vocourse : seules les listes confirmées et transmises le sont, 12 mois au plus.',
      ],
    });
  };

  const deleteAccount = async (ctx: Ctx): Promise<Res> => {
    const { accountId } = authenticate(ctx);
    db.tx(() => db.deleteAccount(accountId));
    retailerCache.delete(accountId);
    log.info('account_deleted', { account: accountId.slice(0, 8) });
    return ok({ deleted: true });
  };

  /* -------------------------- Tâches périodiques ------------------------- */

  const retryPendingSms = async (): Promise<number> => {
    let resent = 0;
    for (const h of db.pendingSmsHandoffs(now() - DAY, 5)) {
      const s = loadSettings(h.account_id);
      if (!s || s.row.sms_opted_out_at !== null) {
        db.setHandoffSms(h.id, 'abandoned', h.sms_attempts);
        continue;
      }
      const url = crypto.decrypt(h.link_enc, `handoff:${h.account_id}`);
      const outcome = await sendSms(
        h.account_id,
        s.data.caregiverMobile,
        texts.handoff(s.data.language, {
          senior: s.data.seniorFirstName,
          count: h.item_count,
          tier: h.tier as Tier,
          store: s.data.preferredRetailer?.name ?? null,
          url,
          days: config.instacart.linkExpiresInDays,
        }),
      );
      db.setHandoffSms(h.id, outcome, h.sms_attempts + 1);
      if (outcome === 'sent') resent += 1;
    }
    return resent;
  };

  const purge = (): Record<string, number> => {
    const counts = db.purge(now(), config.retentionDays * DAY);
    log.info('purge', counts);
    return counts;
  };

  const routes: Route[] = [
    { method: 'GET', path: '/v1/health', handler: health },
    { method: 'POST', path: '/v1/devices', handler: registerDevice },
    { method: 'POST', path: '/v1/auth/token', handler: token },
    { method: 'POST', path: '/v1/utterances', handler: utterances },
    { method: 'PUT', path: '/v1/caregiver/settings', handler: putSettings },
    { method: 'GET', path: '/v1/caregiver/status', handler: caregiverStatus },
    { method: 'POST', path: '/v1/caregiver/verification', handler: startVerification },
    { method: 'POST', path: '/v1/caregiver/verification/confirm', handler: confirmVerification },
    { method: 'GET', path: '/v1/retailers', handler: retailers },
    { method: 'POST', path: '/v1/handoffs', handler: handoffs },
    { method: 'POST', path: '/v1/alerts', handler: alerts },
    { method: 'PUT', path: '/v1/account/consent', handler: updateConsent },
    { method: 'GET', path: '/v1/account/export', handler: exportAccount },
    { method: 'DELETE', path: '/v1/account', handler: deleteAccount },
  ];

  return { routes, retryPendingSms, purge };
};
