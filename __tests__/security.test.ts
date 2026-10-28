import { hmacSha256, pbkdf2Sha256, sha256, toHex, utf8, constantTimeEqual } from '../src/services/security/crypto';
import { checkPinStrength } from '../src/services/security/pinPolicy';
import { createPinVault, LOCKOUT_MS, PIN_STORE_KEY } from '../src/services/security/pinVault';
import { createMemorySecureStore } from '../src/services/security/memorySecureStore';

describe('Primitives cryptographiques (vecteurs de référence)', () => {
  it('SHA-256 (FIPS 180-4)', () => {
    expect(toHex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(toHex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(toHex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('HMAC-SHA-256 (RFC 4231, cas 2)', () => {
    expect(toHex(hmacSha256(utf8('Jefe'), utf8('what do ya want for nothing?')))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('PBKDF2-HMAC-SHA-256 (RFC 7914 §11)', () => {
    expect(toHex(pbkdf2Sha256(utf8('passwd'), utf8('salt'), 1, 64))).toBe(
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783',
    );
  });

  it('compare en temps constant, y compris des longueurs différentes', () => {
    expect(constantTimeEqual(utf8('abc'), utf8('abc'))).toBe(true);
    expect(constantTimeEqual(utf8('abc'), utf8('abd'))).toBe(false);
    expect(constantTimeEqual(utf8('abc'), utf8('abcd'))).toBe(false);
  });
});

describe('Robustesse du code PIN', () => {
  it('refuse les codes devinables', () => {
    expect(checkPinStrength('12345')).toBe('length');
    expect(checkPinStrength('12a456')).toBe('length');
    expect(checkPinStrength('000000')).toBe('same_digit');
    expect(checkPinStrength('123456')).toBe('sequence');
    expect(checkPinStrength('876543')).toBe('sequence');
    expect(checkPinStrength('121212')).toBe('repeated_block');
    expect(checkPinStrength('258258')).toBe('repeated_block');
    expect(checkPinStrength('147258')).toBe('common');
  });

  it('accepte un code ordinaire', () => {
    expect(checkPinStrength('583920')).toBeNull();
  });
});

describe('Coffre du code PIN', () => {
  const setup = (start = 1_000_000) => {
    const store = createMemorySecureStore();
    let t = start;
    const clock = { now: () => t, set: (v: number) => (t = v), advance: (ms: number) => (t += ms) };
    const vault = createPinVault({ store, now: clock.now, iterations: 10 });
    return { store, clock, vault };
  };

  it('ne stocke jamais le code en clair', async () => {
    const { store, vault } = setup();
    expect(await vault.status()).toEqual({ state: 'not_set' });
    expect(await vault.setPin('583920')).toEqual({ ok: true });
    const raw = store.snapshot()[PIN_STORE_KEY] ?? '';
    expect(raw.includes('583920')).toBe(false);
    expect(await vault.verify('583920')).toEqual({ ok: true });
  });

  it('refuse un code faible à l’enregistrement', async () => {
    const { vault } = setup();
    expect(await vault.setPin('111111')).toEqual({ ok: false, weakness: 'same_digit' });
    expect(await vault.status()).toEqual({ state: 'not_set' });
  });

  it('bloque 15 minutes après 3 codes erronés et prévient une seule fois', async () => {
    const { vault, clock } = setup();
    await vault.setPin('583920');
    expect(await vault.verify('000001')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: 2 });
    expect(await vault.verify('000002')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: 1 });
    const third = await vault.verify('000003');
    expect(third).toEqual({ ok: false, reason: 'locked', lockedUntil: 1_000_000 + LOCKOUT_MS, justLocked: true });
    // Même le bon code est refusé pendant le blocage, sans nouvelle alerte.
    clock.advance(LOCKOUT_MS - 1000);
    expect(await vault.verify('583920')).toEqual({
      ok: false,
      reason: 'locked',
      lockedUntil: 1_000_000 + LOCKOUT_MS,
      justLocked: false,
    });
    clock.advance(1000);
    expect(await vault.status()).toEqual({ state: 'ready', attemptsLeft: 3 });
    expect(await vault.verify('583920')).toEqual({ ok: true });
  });

  it('remet le compteur à zéro après un code correct', async () => {
    const { vault } = setup();
    await vault.setPin('583920');
    await vault.verify('000001');
    await vault.verify('000002');
    expect(await vault.verify('583920')).toEqual({ ok: true });
    expect(await vault.status()).toEqual({ state: 'ready', attemptsLeft: 3 });
  });

  it('garde le blocage si l’appli est relancée (compteur persisté)', async () => {
    const { store, vault } = setup();
    await vault.setPin('583920');
    await vault.verify('000001');
    await vault.verify('000002');
    const relaunched = createPinVault({ store, now: () => 1_000_000, iterations: 10 });
    expect(await relaunched.status()).toEqual({ state: 'ready', attemptsLeft: 1 });
    const r = await relaunched.verify('000003');
    expect(r.ok ? null : r.reason).toBe('locked');
  });

  it('ne se débloque pas si l’on recule l’horloge du téléphone', async () => {
    const { vault, clock } = setup();
    await vault.setPin('583920');
    for (const pin of ['000001', '000002', '000003']) await vault.verify(pin);
    clock.set(0); // horloge reculée
    const s = await vault.status();
    expect(s.state).toBe('locked');
  });

  it('ignore un enregistrement corrompu', async () => {
    const { store, vault } = setup();
    await store.setItem(PIN_STORE_KEY, '{pas du json');
    expect(await vault.status()).toEqual({ state: 'not_set' });
  });
});
