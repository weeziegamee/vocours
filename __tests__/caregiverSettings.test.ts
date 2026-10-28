import {
  checkPostalCode,
  describeChanges,
  emptyForm,
  formatMobile,
  formFromSettings,
  loadSettings,
  parseMobile,
  saveSettings,
  SETTINGS_STORE_KEY,
  validateSettingsForm,
  type SettingsForm,
} from '../src/services/caregiver/settings';
import { createMemorySecureStore } from '../src/services/security/memorySecureStore';
import { stringsFor } from '../src/i18n';
import type { CaregiverSettings, E164Phone } from '../src/types/vocourse';
import { at } from './fixtures';

const now = at('2026-10-28T14:00:00.000Z');

const valid: SettingsForm = {
  ...emptyForm('fr-CA'),
  seniorFirstName: 'Jeanne',
  caregiverFirstName: 'Paul',
  caregiverMobile: '514 555-0123',
  smsConsent: true,
  civicNumber: '1234',
  street: 'rue Saint-Denis',
  apartment: '305',
  city: 'Montréal',
  postalCode: 'h2t1s6',
  preferredRetailer: { key: 'maxi', name: 'Maxi' },
};

const settings = (over: Partial<SettingsForm> = {}): CaregiverSettings => {
  const r = validateSettingsForm({ ...valid, ...over }, now);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe('Champs des réglages (tout le Canada)', () => {
  it('normalise le code postal et en déduit la province', () => {
    expect(checkPostalCode('h2t1s6')).toEqual({ ok: true, value: 'H2T 1S6', province: 'QC' });
    expect(checkPostalCode('M5V-3L9')).toEqual({ ok: true, value: 'M5V 3L9', province: 'ON' });
    expect(checkPostalCode('v6b 4y8')).toEqual({ ok: true, value: 'V6B 4Y8', province: 'BC' });
    expect(checkPostalCode('X0A 0H0')).toEqual({ ok: true, value: 'X0A 0H0', province: 'NU' });
    expect(checkPostalCode('X1A 2L9')).toEqual({ ok: true, value: 'X1A 2L9', province: 'NT' });
    expect(checkPostalCode('D1A 1A1').ok).toBe(false);
    expect(checkPostalCode('12345').ok).toBe(false);
  });

  it('valide le cellulaire et le stocke en E.164', () => {
    expect(parseMobile('514 555-0123')).toBe('+15145550123');
    expect(parseMobile('1 (416) 555-0123')).toBe('+14165550123');
    // Caraïbes et sans frais : refusés (fraude aux textos), comme sur le serveur.
    expect(parseMobile('876 555-0123')).toBeNull();
    expect(parseMobile('1 800 555-0123')).toBeNull();
    expect(parseMobile('911 555 0123')).toBeNull();
    expect(parseMobile('555-0123')).toBeNull();
    expect(formatMobile('+15145550123' as E164Phone)).toBe('514 555-0123');
  });
});

describe('Validation du formulaire', () => {
  it('produit des réglages normalisés, sans montant', () => {
    const s = settings();
    expect(s.address).toEqual({ civicNumber: '1234', street: 'rue Saint-Denis', apartment: '305', city: 'Montréal', province: 'QC', postalCode: 'H2T 1S6' });
    expect(s.caregiverMobile).toBe('+15145550123');
    expect(s.seniorFirstName).toBe('Jeanne');
    expect(JSON.stringify(s)).not.toMatch(/budget|tip|pourboire/i);
  });

  it('accepte une adresse en Ontario, en anglais, sans expressions québécoises', () => {
    const s = settings({ city: 'Toronto', postalCode: 'M5V 3L9', language: 'en-CA', regionalDictionary: true, seniorFirstName: '' });
    expect(s.address.province).toBe('ON');
    expect(s.language).toBe('en-CA');
    expect(s.regionalDictionary).toBe(false);
    expect(s.seniorFirstName).toBeNull();
  });

  it('liste toutes les erreurs d’un formulaire vide, par clé traduisible', () => {
    const r = validateSettingsForm(emptyForm('fr-CA'), now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.error).sort()).toEqual(['caregiverFirstName', 'caregiverMobile', 'city', 'civicNumber', 'postalCode', 'smsConsent', 'street']);
    const fr = stringsFor('fr-CA').settings.errors;
    const en = stringsFor('en-CA').settings.errors;
    for (const k of Object.values(r.error)) {
      if (!k) continue;
      expect(fr[k].length > 0).toBe(true);
      expect(en[k].length > 0).toBe(true);
    }
  });

  it('exige le consentement aux textos', () => {
    const r = validateSettingsForm({ ...valid, smsConsent: false }, now);
    expect(r.ok ? null : r.error.smsConsent).toBe('smsConsent');
  });

  it('refait le formulaire à l’identique à partir des réglages', () => {
    const s = settings();
    expect(validateSettingsForm(formFromSettings(s, 'fr-CA'), now)).toEqual({ ok: true, value: s });
  });

  it('liste les réglages modifiés et les annonce dans la langue et le registre choisis', () => {
    const before = settings();
    const after = settings({ postalCode: 'H2T 1S7', preferredRetailer: { key: 'metro', name: 'Metro' }, register: 'tu' });
    const changes = describeChanges(before, after);
    expect(changes).toEqual(['address', 'preferredRetailer', 'register']);
    expect(stringsFor('fr-CA', 'tu').voice.settingsChanged('Paul', changes)).toBe(
      'Paul a changé l’adresse de livraison, l’épicerie préférée et la façon de te parler. Tu peux lui en parler.',
    );
    expect(stringsFor('en-CA').voice.settingsChanged('Paul', changes)).toBe(
      'Paul changed the delivery address, the preferred store and the way I speak to you. You can talk to them about it.',
    );
    expect(describeChanges(null, after)).toEqual([]);
  });

  it('relit les réglages enregistrés et ignore des données corrompues', async () => {
    const store = createMemorySecureStore();
    await saveSettings(store, settings());
    expect((await loadSettings(store))?.caregiverFirstName).toBe('Paul');
    await store.setItem(SETTINGS_STORE_KEY, '{"caregiverFirstName": 3}');
    expect(await loadSettings(store)).toBeNull();
  });
});
