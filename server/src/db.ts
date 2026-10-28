/**
 * Base de données SQLite (module `node:sqlite` intégré à Node, aucun pilote à installer).
 *
 * Données personnelles (prénoms, cellulaire, adresse, preuve de confirmation, lien de
 * liste) toujours chiffrées dans les colonnes `*_enc`. Les colonnes `*_hash` sont des
 * empreintes HMAC secrètes, utiles aux recherches sans stocker la valeur.
 * Les dictées ne sont jamais conservées (seules les réponses idempotentes, chiffrées, 48 h).
 */

import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  locale TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  cloud_speech_consent INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS devices_account ON devices(account_id);

CREATE TABLE IF NOT EXISTS settings (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  data_enc TEXT NOT NULL,
  mobile_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  province TEXT NOT NULL,
  sms_consent_at INTEGER NOT NULL,
  mobile_verified_at INTEGER,
  sms_opted_out_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  mobile_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, purpose)
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  items_digest TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  proof_enc TEXT NOT NULL,
  link_enc TEXT NOT NULL,
  sms_status TEXT NOT NULL,
  sms_attempts INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  link_expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS handoffs_account ON handoffs(account_id);
CREATE INDEX IF NOT EXISTS handoffs_sms ON handoffs(sms_status, created_at);

CREATE TABLE IF NOT EXISTS idempotency (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status INTEGER NOT NULL,
  body_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, key)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  at INTEGER NOT NULL
);
`;

export interface AccountRow {
  readonly id: string;
  readonly created_at: number;
  readonly locale: string;
  readonly consent_version: string;
  readonly consent_at: number;
  readonly cloud_speech_consent: number;
  readonly last_active_at: number;
}

export interface DeviceRow {
  readonly id: string;
  readonly account_id: string;
  readonly secret_hash: string;
  readonly platform: string;
  readonly created_at: number;
  readonly last_seen_at: number;
  readonly revoked_at: number | null;
}

export interface SettingsRow {
  readonly account_id: string;
  readonly data_enc: string;
  readonly mobile_hash: string;
  readonly language: string;
  readonly province: string;
  readonly sms_consent_at: number;
  readonly mobile_verified_at: number | null;
  readonly sms_opted_out_at: number | null;
  readonly updated_at: number;
}

export interface OtpRow {
  readonly account_id: string;
  readonly purpose: string;
  readonly code_hash: string;
  readonly mobile_hash: string;
  readonly expires_at: number;
  readonly attempts: number;
  readonly created_at: number;
}

export interface HandoffRow {
  readonly id: string;
  readonly account_id: string;
  readonly list_id: string;
  readonly tier: string;
  readonly items_digest: string;
  readonly item_count: number;
  readonly proof_enc: string;
  readonly link_enc: string;
  readonly sms_status: string;
  readonly sms_attempts: number;
  readonly created_at: number;
  readonly link_expires_at: number;
}

export interface IdempotencyRow {
  readonly account_id: string;
  readonly key: string;
  readonly route: string;
  readonly request_hash: string;
  readonly status: number;
  readonly body_enc: string;
  readonly created_at: number;
}

type Param = string | number | null;

export interface Db {
  readonly raw: DatabaseSync;
  close(): void;
  /** Exécute `fn` dans une transaction (tout ou rien). */
  tx<T>(fn: () => T): T;

  insertAccount(a: AccountRow): void;
  getAccount(id: string): AccountRow | undefined;
  touchAccount(id: string, at: number): void;
  deleteAccount(id: string): void;
  updateConsent(id: string, version: string, at: number, cloudSpeech: boolean): void;

  insertDevice(d: DeviceRow): void;
  getDevice(id: string): DeviceRow | undefined;
  touchDevice(id: string, at: number): void;
  listDevices(accountId: string): DeviceRow[];

  upsertSettings(s: SettingsRow): void;
  getSettings(accountId: string): SettingsRow | undefined;
  markMobileVerified(accountId: string, at: number): void;
  markOptedOut(accountId: string, at: number): void;

  putOtp(o: OtpRow): void;
  getOtp(accountId: string, purpose: string): OtpRow | undefined;
  bumpOtpAttempts(accountId: string, purpose: string): void;
  deleteOtp(accountId: string, purpose: string): void;

  insertHandoff(h: HandoffRow): void;
  listHandoffs(accountId: string): HandoffRow[];
  pendingSmsHandoffs(since: number, maxAttempts: number): HandoffRow[];
  setHandoffSms(id: string, status: string, attempts: number): void;

  getIdempotency(accountId: string, key: string): IdempotencyRow | undefined;
  putIdempotency(r: IdempotencyRow): void;

  /** Incrémente un compteur à fenêtre fixe ; renvoie le total de la fenêtre. */
  hit(bucket: string, windowMs: number, now: number): number;

  audit(accountId: string | null, event: string, at: number): void;

  /** Purge selon la politique de conservation ; renvoie le nombre de lignes supprimées par table. */
  purge(now: number, retentionMs: number): Record<string, number>;
}

export const openDatabase = (path: string): Db => {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  db.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));

  const run = (sql: string, ...params: Param[]): number => Number(db.prepare(sql).run(...params).changes);
  const get = <T>(sql: string, ...params: Param[]): T | undefined => db.prepare(sql).get(...params) as T | undefined;
  const all = <T>(sql: string, ...params: Param[]): T[] => db.prepare(sql).all(...params) as T[];

  let depth = 0;
  const tx = <T>(fn: () => T): T => {
    if (depth > 0) return fn();
    depth += 1;
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      depth -= 1;
    }
  };

  return {
    raw: db,
    close: () => db.close(),
    tx,

    insertAccount: (a) =>
      void run(
        'INSERT INTO accounts (id, created_at, locale, consent_version, consent_at, cloud_speech_consent, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        a.id, a.created_at, a.locale, a.consent_version, a.consent_at, a.cloud_speech_consent, a.last_active_at,
      ),
    getAccount: (id) => get<AccountRow>('SELECT * FROM accounts WHERE id = ?', id),
    touchAccount: (id, at) => void run('UPDATE accounts SET last_active_at = ? WHERE id = ?', at, id),
    deleteAccount: (id) => void run('DELETE FROM accounts WHERE id = ?', id),
    updateConsent: (id, version, at, cloudSpeech) =>
      void run('UPDATE accounts SET consent_version = ?, consent_at = ?, cloud_speech_consent = ? WHERE id = ?', version, at, cloudSpeech ? 1 : 0, id),

    insertDevice: (d) =>
      void run(
        'INSERT INTO devices (id, account_id, secret_hash, platform, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        d.id, d.account_id, d.secret_hash, d.platform, d.created_at, d.last_seen_at, d.revoked_at,
      ),
    getDevice: (id) => get<DeviceRow>('SELECT * FROM devices WHERE id = ?', id),
    touchDevice: (id, at) => void run('UPDATE devices SET last_seen_at = ? WHERE id = ?', at, id),
    listDevices: (accountId) => all<DeviceRow>('SELECT * FROM devices WHERE account_id = ? ORDER BY created_at', accountId),

    upsertSettings: (s) =>
      void run(
        `INSERT INTO settings (account_id, data_enc, mobile_hash, language, province, sms_consent_at, mobile_verified_at, sms_opted_out_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET data_enc = excluded.data_enc, mobile_hash = excluded.mobile_hash,
           language = excluded.language, province = excluded.province, sms_consent_at = excluded.sms_consent_at,
           mobile_verified_at = excluded.mobile_verified_at, sms_opted_out_at = excluded.sms_opted_out_at,
           updated_at = excluded.updated_at`,
        s.account_id, s.data_enc, s.mobile_hash, s.language, s.province, s.sms_consent_at, s.mobile_verified_at,
        s.sms_opted_out_at, s.updated_at,
      ),
    getSettings: (accountId) => get<SettingsRow>('SELECT * FROM settings WHERE account_id = ?', accountId),
    markMobileVerified: (accountId, at) =>
      void run('UPDATE settings SET mobile_verified_at = ?, sms_opted_out_at = NULL WHERE account_id = ?', at, accountId),
    markOptedOut: (accountId, at) => void run('UPDATE settings SET sms_opted_out_at = ? WHERE account_id = ?', at, accountId),

    putOtp: (o) =>
      void run(
        `INSERT INTO otps (account_id, purpose, code_hash, mobile_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, purpose) DO UPDATE SET code_hash = excluded.code_hash, mobile_hash = excluded.mobile_hash,
           expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
        o.account_id, o.purpose, o.code_hash, o.mobile_hash, o.expires_at, o.attempts, o.created_at,
      ),
    getOtp: (accountId, purpose) => get<OtpRow>('SELECT * FROM otps WHERE account_id = ? AND purpose = ?', accountId, purpose),
    bumpOtpAttempts: (accountId, purpose) =>
      void run('UPDATE otps SET attempts = attempts + 1 WHERE account_id = ? AND purpose = ?', accountId, purpose),
    deleteOtp: (accountId, purpose) => void run('DELETE FROM otps WHERE account_id = ? AND purpose = ?', accountId, purpose),

    insertHandoff: (h) =>
      void run(
        `INSERT INTO handoffs (id, account_id, list_id, tier, items_digest, item_count, proof_enc, link_enc, sms_status, sms_attempts, created_at, link_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        h.id, h.account_id, h.list_id, h.tier, h.items_digest, h.item_count, h.proof_enc, h.link_enc, h.sms_status,
        h.sms_attempts, h.created_at, h.link_expires_at,
      ),
    listHandoffs: (accountId) => all<HandoffRow>('SELECT * FROM handoffs WHERE account_id = ? ORDER BY created_at', accountId),
    pendingSmsHandoffs: (since, maxAttempts) =>
      all<HandoffRow>(
        "SELECT * FROM handoffs WHERE sms_status = 'failed' AND created_at >= ? AND sms_attempts < ? ORDER BY created_at LIMIT 50",
        since,
        maxAttempts,
      ),
    setHandoffSms: (id, status, attempts) =>
      void run('UPDATE handoffs SET sms_status = ?, sms_attempts = ? WHERE id = ?', status, attempts, id),

    getIdempotency: (accountId, key) =>
      get<IdempotencyRow>('SELECT * FROM idempotency WHERE account_id = ? AND key = ?', accountId, key),
    putIdempotency: (r) =>
      void run(
        'INSERT OR REPLACE INTO idempotency (account_id, key, route, request_hash, status, body_enc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        r.account_id, r.key, r.route, r.request_hash, r.status, r.body_enc, r.created_at,
      ),

    hit(bucket, windowMs, now) {
      return tx(() => {
        const row = get<{ window_start: number; count: number }>('SELECT window_start, count FROM rate_limits WHERE bucket = ?', bucket);
        if (!row || now - row.window_start >= windowMs) {
          run('INSERT OR REPLACE INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)', bucket, now);
          return 1;
        }
        run('UPDATE rate_limits SET count = count + 1 WHERE bucket = ?', bucket);
        return row.count + 1;
      });
    },

    audit: (accountId, event, at) => void run('INSERT INTO audit (account_id, event, at) VALUES (?, ?, ?)', accountId, event, at),

    purge(now, retentionMs) {
      return tx(() => ({
        // Comptes inactifs depuis plus que la durée de conservation : supprimés entièrement.
        accounts: run('DELETE FROM accounts WHERE last_active_at < ?', now - retentionMs),
        handoffs: run('DELETE FROM handoffs WHERE created_at < ?', now - retentionMs),
        audit: run('DELETE FROM audit WHERE at < ?', now - retentionMs),
        idempotency: run('DELETE FROM idempotency WHERE created_at < ?', now - 48 * 3600_000),
        otps: run('DELETE FROM otps WHERE expires_at < ?', now),
        rate_limits: run('DELETE FROM rate_limits WHERE window_start < ?', now - 2 * 86_400_000),
      }));
    },
  };
};
