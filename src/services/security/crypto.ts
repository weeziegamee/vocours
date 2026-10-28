/**
 * SHA-256, HMAC-SHA-256 et PBKDF2-HMAC-SHA-256 en TypeScript pur (FIPS 180-4, RFC 2104,
 * RFC 8018), sans module natif, pour hacher le code PIN de l'aidant.
 *
 * Limite assumée : un code à 6 chiffres n'a qu'un million de valeurs. Le hachage évite
 * de stocker le code en clair, mais ne résiste pas seul à une attaque hors ligne ; la
 * protection repose sur le stockage chiffré de l'appareil (Keychain / Keystore) et sur
 * le verrouillage après 3 essais (pinVault.ts).
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

export const sha256 = (data: Uint8Array): Uint8Array => {
  const bitLen = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x1_0000_0000));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15] ?? 0;
      const b = w[i - 2] ?? 0;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h[0] ?? 0, b = h[1] ?? 0, c = h[2] ?? 0, d = h[3] ?? 0;
    let e = h[4] ?? 0, f = h[5] ?? 0, g = h[6] ?? 0, hh = h[7] ?? 0;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = ((h[0] ?? 0) + a) >>> 0; h[1] = ((h[1] ?? 0) + b) >>> 0;
    h[2] = ((h[2] ?? 0) + c) >>> 0; h[3] = ((h[3] ?? 0) + d) >>> 0;
    h[4] = ((h[4] ?? 0) + e) >>> 0; h[5] = ((h[5] ?? 0) + f) >>> 0;
    h[6] = ((h[6] ?? 0) + g) >>> 0; h[7] = ((h[7] ?? 0) + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  h.forEach((v, i) => ov.setUint32(i * 4, v));
  return out;
};

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export const hmacSha256 = (key: Uint8Array, message: Uint8Array): Uint8Array => {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const ipad = block.map((b) => b ^ 0x36);
  const opad = block.map((b) => b ^ 0x5c);
  return sha256(concat(opad, sha256(concat(ipad, message))));
};

/** PBKDF2-HMAC-SHA-256 (RFC 8018 §5.2). */
export const pbkdf2Sha256 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): Uint8Array => {
  if (!Number.isSafeInteger(iterations) || iterations < 1) throw new RangeError('Itérations invalides');
  const blocks = Math.ceil(keyLength / 32);
  const out = new Uint8Array(blocks * 32);
  for (let i = 1; i <= blocks; i += 1) {
    const counter = new Uint8Array([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]);
    let u = hmacSha256(password, concat(salt, counter));
    const t = u.slice();
    for (let j = 1; j < iterations; j += 1) {
      u = hmacSha256(password, u);
      for (let k = 0; k < 32; k += 1) t[k] = (t[k] ?? 0) ^ (u[k] ?? 0);
    }
    out.set(t, (i - 1) * 32);
  }
  return out.slice(0, keyLength);
};

export const utf8 = (s: string): Uint8Array => {
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(bytes);
};

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error('Hexadécimal invalide');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Comparaison en temps constant (ne s'arrête pas au premier octet différent). */
export const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
};

/**
 * Octets aléatoires cryptographiques : `crypto.getRandomValues`, fourni sur le téléphone par
 * expo-crypto (src/platform/polyfills.ts, chargé en premier par index.js). Aucun repli
 * non cryptographique : sans source sûre, l'appli refuse de créer un code plutôt que
 * d'en créer un prévisible.
 */
export const randomBytes = (n: number): Uint8Array => {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!c?.getRandomValues) throw new Error('Source d’aléa cryptographique indisponible');
  return c.getRandomValues(out);
};

/** Empreinte SHA-256 d'un texte, en hexadécimal. */
export const sha256Hex = (s: string): string => toHex(sha256(utf8(s)));
