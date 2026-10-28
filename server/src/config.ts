import { randomBytes } from 'node:crypto';

/**
 * Configuration lue dans les variables d'environnement (voir .env.example).
 * En production, le serveur refuse de démarrer s'il manque une clé ou si un service
 * simulé (textos écrits dans le journal, Instacart absent) est configuré.
 */

export type Env = 'development' | 'test' | 'production';

export interface Config {
  readonly env: Env;
  readonly port: number;
  readonly host: string;
  readonly databasePath: string;
  /** Clé AES-256 (32 octets) des données personnelles chiffrées en base. */
  readonly dataKey: Buffer;
  /** Clé HMAC (≥ 32 octets) des jetons d'accès. */
  readonly tokenKey: Buffer;
  readonly accessTokenTtlSeconds: number;
  /** Nombre de mandataires de confiance (répartiteur de charge) devant le serveur ; 0 = aucun. */
  readonly proxyHops: number;
  /** Plafond global de textos par jour (protection contre la fraude aux textos). */
  readonly smsDailyBudget: number;
  readonly retentionDays: number;
  /** Inscriptions de téléphones par adresse IP et par heure (une box partagée en compte plusieurs). */
  readonly registerPerIpPerHour: number;
  readonly instacart: {
    readonly apiKey: string | null;
    readonly baseUrl: string;
    /** Lien de retour affiché sur la page Instacart (facultatif). */
    readonly linkbackUrl: string | null;
    readonly linkExpiresInDays: number;
  };
  readonly sms:
    | { readonly provider: 'twilio'; readonly accountSid: string; readonly authToken: string; readonly from: string }
    | { readonly provider: 'console' };
  /**
   * Compte de démonstration pour l'examen des boutiques (Apple, Google) : ce numéro reçoit
   * toujours ce code, sans texto envoyé. Laisser vide hors période d'examen.
   */
  readonly review: { readonly mobile: string | null; readonly code: string | null };
}

const read = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const v = env[name];
  return v === undefined || v.trim() === '' ? null : v.trim();
};

const key = (raw: string | null, name: string, minBytes: number): Buffer | null => {
  if (raw === null) return null;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length < minBytes) throw new Error(`${name} doit contenir au moins ${minBytes} octets encodés en base64.`);
  return buf;
};

export class ConfigError extends Error {}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const mode = (read(env, 'NODE_ENV') ?? 'development') as Env;
  if (!['development', 'test', 'production'].includes(mode)) throw new ConfigError(`NODE_ENV inconnu : ${mode}`);
  const prod = mode === 'production';
  const problems: string[] = [];

  const dataKey = key(read(env, 'DATA_ENCRYPTION_KEY'), 'DATA_ENCRYPTION_KEY', 32);
  const tokenKey = key(read(env, 'TOKEN_SIGNING_KEY'), 'TOKEN_SIGNING_KEY', 32);
  if (prod && !dataKey) problems.push('DATA_ENCRYPTION_KEY manquante');
  if (prod && !tokenKey) problems.push('TOKEN_SIGNING_KEY manquante');

  const instacartKey = read(env, 'INSTACART_API_KEY');
  const instacartEnv = read(env, 'INSTACART_ENV') ?? (prod ? 'production' : 'development');
  if (prod && !instacartKey) problems.push('INSTACART_API_KEY manquante');

  const smsProvider = read(env, 'SMS_PROVIDER') ?? (prod ? 'twilio' : 'console');
  let sms: Config['sms'];
  if (smsProvider === 'twilio') {
    const accountSid = read(env, 'TWILIO_ACCOUNT_SID');
    const authToken = read(env, 'TWILIO_AUTH_TOKEN');
    const from = read(env, 'TWILIO_FROM');
    if (!accountSid || !authToken || !from) {
      problems.push('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_FROM sont requis avec SMS_PROVIDER=twilio');
      sms = { provider: 'console' };
    } else {
      sms = { provider: 'twilio', accountSid, authToken, from };
    }
  } else if (smsProvider === 'console') {
    if (prod) problems.push('SMS_PROVIDER=console est interdit en production');
    sms = { provider: 'console' };
  } else {
    problems.push(`SMS_PROVIDER inconnu : ${smsProvider}`);
    sms = { provider: 'console' };
  }

  const reviewMobile = read(env, 'REVIEW_DEMO_MOBILE');
  const reviewCode = read(env, 'REVIEW_DEMO_CODE');
  if ((reviewMobile === null) !== (reviewCode === null)) problems.push('REVIEW_DEMO_MOBILE et REVIEW_DEMO_CODE vont ensemble');
  if (reviewMobile !== null && !/^\+1\d{10}$/.test(reviewMobile)) problems.push('REVIEW_DEMO_MOBILE doit être au format +15145550100');
  if (reviewCode !== null && !/^\d{6}$/.test(reviewCode)) problems.push('REVIEW_DEMO_CODE doit compter 6 chiffres');

  if (problems.length > 0 && (prod || mode === 'development')) {
    // En développement, seules les erreurs de format bloquent ; les clés absentes sont générées.
    const blocking = prod ? problems : problems.filter((p) => !p.includes('manquante') && !p.includes('requis'));
    if (blocking.length > 0) throw new ConfigError(`Configuration invalide :\n- ${blocking.join('\n- ')}`);
  }

  const port = Number(read(env, 'PORT') ?? '8080');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new ConfigError('PORT invalide');

  return {
    env: mode,
    port,
    host: read(env, 'HOST') ?? '0.0.0.0',
    databasePath: read(env, 'DATABASE_PATH') ?? (mode === 'test' ? ':memory:' : './data/vocourse.sqlite'),
    // Clés éphémères hors production : les données ne survivent pas à un redémarrage.
    dataKey: dataKey ?? randomBytes(32),
    tokenKey: tokenKey ?? randomBytes(32),
    accessTokenTtlSeconds: 15 * 60,
    proxyHops: (() => {
      const v = read(env, 'TRUST_PROXY') ?? '0';
      const n = v === 'true' ? 1 : v === 'false' ? 0 : Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 5) throw new ConfigError('TRUST_PROXY doit valoir 0 à 5 (nombre de mandataires)');
      return n;
    })(),
    smsDailyBudget: Number(read(env, 'SMS_DAILY_BUDGET') ?? '2000'),
    retentionDays: Number(read(env, 'RETENTION_DAYS') ?? '365'),
    registerPerIpPerHour: Number(read(env, 'RATE_LIMIT_REGISTER_PER_HOUR') ?? '20'),
    instacart: {
      apiKey: instacartKey,
      baseUrl: instacartEnv === 'production' ? 'https://connect.instacart.com' : 'https://connect.dev.instacart.tools',
      linkbackUrl: read(env, 'INSTACART_LINKBACK_URL'),
      linkExpiresInDays: 2,
    },
    sms,
    review: { mobile: reviewMobile, code: reviewCode },
  };
};
