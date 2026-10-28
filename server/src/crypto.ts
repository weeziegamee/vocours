/**
 * Chiffrement des données personnelles (AES-256-GCM), empreintes de recherche (HMAC),
 * jetons d'accès signés et codes à usage unique. Uniquement `node:crypto`.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export interface Crypto {
  /** Chiffre `plain`, lié à `context` (ex. « settings.data ») : un champ ne peut pas être déplacé. */
  encrypt(plain: string, context: string): string;
  decrypt(sealed: string, context: string): string;
  /** Empreinte stable et secrète (recherche sans stocker la valeur en clair). */
  lookupHash(value: string, context: string): string;
  signAccessToken(claims: AccessClaims): string;
  verifyAccessToken(token: string, nowSeconds: number): AccessClaims | null;
}

export interface AccessClaims {
  /** Compte. */
  readonly a: string;
  /** Appareil. */
  readonly d: string;
  /** Expiration, en secondes depuis l'époque. */
  readonly e: number;
}

const b64u = (b: Buffer): string => b.toString('base64url');

export const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

export const randomId = (prefix: string, bytes = 16): string => `${prefix}_${b64u(randomBytes(bytes))}`;

export const randomSecret = (bytes = 32): string => b64u(randomBytes(bytes));

/** Code à 6 chiffres, tiré uniformément. */
export const randomCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

export const createCrypto = (dataKey: Buffer, tokenKey: Buffer): Crypto => {
  if (dataKey.length < 32) throw new Error('Clé de chiffrement trop courte');
  const encKey = Buffer.from(hkdfSync('sha256', dataKey, Buffer.alloc(0), 'vocourse/enc/v1', 32));
  const macKey = Buffer.from(hkdfSync('sha256', dataKey, Buffer.alloc(0), 'vocourse/lookup/v1', 32));

  return {
    encrypt(plain, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encKey, iv);
      cipher.setAAD(Buffer.from(context, 'utf8'));
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return `v1.${b64u(Buffer.concat([iv, cipher.getAuthTag(), body]))}`;
    },

    decrypt(sealed, context) {
      if (!sealed.startsWith('v1.')) throw new Error('Format chiffré inconnu');
      const raw = Buffer.from(sealed.slice(3), 'base64url');
      if (raw.length < 28) throw new Error('Données chiffrées tronquées');
      const decipher = createDecipheriv('aes-256-gcm', encKey, raw.subarray(0, 12));
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    },

    lookupHash(value, context) {
      return createHmac('sha256', macKey).update(`${context}\u0000${value}`, 'utf8').digest('hex');
    },

    signAccessToken(claims) {
      const payload = b64u(Buffer.from(JSON.stringify(claims), 'utf8'));
      const sig = b64u(createHmac('sha256', tokenKey).update(`v1.${payload}`).digest());
      return `v1.${payload}.${sig}`;
    },

    verifyAccessToken(token, nowSeconds) {
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== 'v1') return null;
      const [, payload = '', sig = ''] = parts;
      const expected = b64u(createHmac('sha256', tokenKey).update(`v1.${payload}`).digest());
      if (!safeEqual(sig, expected)) return null;
      try {
        const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AccessClaims>;
        if (typeof c.a !== 'string' || typeof c.d !== 'string' || typeof c.e !== 'number') return null;
        if (c.e <= nowSeconds) return null;
        return { a: c.a, d: c.d, e: c.e };
      } catch {
        return null;
      }
    },
  };
};

/**
 * Empreinte d'une liste transmise : identique à celle calculée par l'appli
 * (src/services/handoff/digest.ts). Elle prouve que le panier envoyé est celui relu.
 */
export const itemsDigest = (
  items: readonly { readonly itemId: string; readonly productKey: string; readonly quantity: number; readonly unit: string }[],
): string =>
  sha256Hex(
    items
      .map((i) => [i.itemId, i.productKey, String(i.quantity), i.unit].join('\u001f'))
      .sort()
      .join('\u001e'),
  );
