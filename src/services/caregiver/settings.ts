/**
 * Réglages de l'aidant : validation du formulaire, stockage chiffré, résumé des
 * changements annoncé au senior (V3.0 §6.2 : « toute modification est annoncée »).
 *
 * Formats canadiens : code postal « H2T 1S6 » (province déduite de la première lettre),
 * mobile « 514 555-0123 » stocké en E.164. Les messages d'erreur sont des clés
 * traduites par l'écran (src/i18n).
 */

import type {
  AppLocale,
  CanadianPostalCode,
  CaregiverSettings,
  E164Phone,
  IsoDateTime,
  Province,
  Result,
  SecureStorePort,
  VoiceRegister,
} from '../../types/vocourse';
import type { ChangeKey, SettingsErrorKey, SettingsFieldKey } from '../../i18n/types';

/* -------------------------------------------------------------------------- */
/* Formulaire                                                                 */
/* -------------------------------------------------------------------------- */

export interface SettingsForm {
  readonly seniorFirstName: string;
  readonly caregiverFirstName: string;
  readonly caregiverMobile: string;
  readonly smsConsent: boolean;
  readonly civicNumber: string;
  readonly street: string;
  readonly apartment: string;
  readonly city: string;
  readonly postalCode: string;
  readonly preferredRetailer: { readonly key: string; readonly name: string } | null;
  readonly language: AppLocale;
  readonly register: VoiceRegister;
  readonly regionalDictionary: boolean;
}

export type SettingsErrors = Partial<Record<SettingsFieldKey, SettingsErrorKey>>;

/** Ordre d'affichage des erreurs (celui du formulaire). */
export const FIELD_ORDER: readonly SettingsFieldKey[] = [
  'seniorFirstName',
  'caregiverFirstName',
  'caregiverMobile',
  'smsConsent',
  'civicNumber',
  'apartment',
  'street',
  'city',
  'postalCode',
  'preferredRetailer',
  'language',
  'register',
  'regionalDictionary',
];

export const emptyForm = (language: AppLocale): SettingsForm => ({
  seniorFirstName: '',
  caregiverFirstName: '',
  caregiverMobile: '',
  smsConsent: false,
  civicNumber: '',
  street: '',
  apartment: '',
  city: '',
  postalCode: '',
  preferredRetailer: null,
  language,
  register: 'vous',
  regionalDictionary: language === 'fr-CA',
});

/* -------------------------------------------------------------------------- */
/* Champs unitaires                                                           */
/* -------------------------------------------------------------------------- */

/** Lettres admises par Postes Canada (ni D, F, I, O, Q, U ; ni W, Z en 1re position). */
const POSTAL_RE = /^([ABCEGHJ-NPRSTVXY])(\d)([ABCEGHJ-NPRSTV-Z])(\d)([ABCEGHJ-NPRSTV-Z])(\d)$/;

export type PostalCheck =
  | { readonly ok: true; readonly value: CanadianPostalCode; readonly province: Province }
  | { readonly ok: false };

/** Province d'après la première lettre ; X0A, X0B, X0C : Nunavut, autres X : T.N.-O. */
const provinceFor = (compact: string): Province => {
  switch (compact[0]) {
    case 'A': return 'NL';
    case 'B': return 'NS';
    case 'C': return 'PE';
    case 'E': return 'NB';
    case 'G': case 'H': case 'J': return 'QC';
    case 'K': case 'L': case 'M': case 'N': case 'P': return 'ON';
    case 'R': return 'MB';
    case 'S': return 'SK';
    case 'T': return 'AB';
    case 'V': return 'BC';
    case 'X': return ['X0A', 'X0B', 'X0C'].includes(compact.slice(0, 3)) ? 'NU' : 'NT';
    default: return 'YT';
  }
};

/** « h2t1s6 », « H2T-1S6 », « H2T 1S6 » → « H2T 1S6 » et sa province. */
export const checkPostalCode = (input: string): PostalCheck => {
  const compact = input.toUpperCase().replace(/[\s\- ]/g, '');
  if (!POSTAL_RE.test(compact)) return { ok: false };
  return { ok: true, value: `${compact.slice(0, 3)} ${compact.slice(3)}` as CanadianPostalCode, province: provinceFor(compact) };
};

/** Numéro nord-américain à 10 chiffres → E.164 (« +15145550123 »), ou `null`. */
/**
 * Indicatifs refusés : plan nord-américain hors Canada et États-Unis (Caraïbes, territoires)
 * et numéros non géographiques ou sans frais. Même liste que le serveur
 * (server/src/validate.ts) : le serveur refuse de toute façon ces numéros.
 */
export const BLOCKED_AREA_CODES: ReadonlySet<string> = new Set([
  '242', '246', '264', '268', '284', '340', '345', '441', '473', '649', '658', '664', '670', '671', '684', '721',
  '758', '767', '784', '787', '809', '829', '849', '868', '869', '876', '939',
  '500', '521', '522', '523', '524', '525', '533', '544', '566', '577', '588', '600', '622', '700', '710', '800',
  '833', '844', '855', '866', '877', '888', '900',
]);

export const parseMobile = (input: string): E164Phone | null => {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d\d$/.test(area) || !/^[2-9]\d\d$/.test(exchange)) return null;
  if (area.endsWith('11') || exchange.endsWith('11')) return null; // 911, 411…
  if (BLOCKED_AREA_CODES.has(area)) return null; // Caraïbes, sans frais, non géographiques
  return `+1${digits}` as E164Phone;
};

/** « +15145550123 » → « 514 555-0123 » */
export const formatMobile = (e164: E164Phone): string => {
  const d = e164.replace(/^\+1/, '');
  return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
};

const NAME_RE = /^[\p{L}][\p{L}'’\- ]{0,39}$/u;

/* -------------------------------------------------------------------------- */
/* Validation du formulaire complet                                           */
/* -------------------------------------------------------------------------- */

export const validateSettingsForm = (form: SettingsForm, now: IsoDateTime): Result<CaregiverSettings, SettingsErrors> => {
  const errors: SettingsErrors = {};
  const senior = form.seniorFirstName.trim();
  if (senior !== '' && !NAME_RE.test(senior)) errors.seniorFirstName = 'seniorFirstName';
  const firstName = form.caregiverFirstName.trim();
  if (!NAME_RE.test(firstName)) errors.caregiverFirstName = 'firstName';

  const mobile = parseMobile(form.caregiverMobile);
  if (!mobile) errors.caregiverMobile = 'mobile';
  if (!form.smsConsent) errors.smsConsent = 'smsConsent';

  const civic = form.civicNumber.trim();
  if (!/^\d{1,6}[A-Za-z]?$/.test(civic)) errors.civicNumber = 'civicNumber';
  const street = form.street.trim();
  if (street.length < 2 || street.length > 80) errors.street = 'street';
  const apartment = form.apartment.trim();
  if (apartment !== '' && !/^[\p{L}\d\- ]{1,10}$/u.test(apartment)) errors.apartment = 'apartment';
  const city = form.city.trim();
  if (city.length < 2 || city.length > 60) errors.city = 'city';

  const postal = checkPostalCode(form.postalCode);
  if (!postal.ok) errors.postalCode = 'postalFormat';

  if (Object.keys(errors).length > 0 || !mobile || !postal.ok || !form.smsConsent) return { ok: false, error: errors };
  return {
    ok: true,
    value: {
      seniorFirstName: senior === '' ? null : senior,
      caregiverFirstName: firstName,
      caregiverMobile: mobile,
      smsConsent: true,
      address: {
        civicNumber: civic.toUpperCase(),
        street,
        apartment: apartment === '' ? null : apartment,
        city,
        province: postal.province,
        postalCode: postal.value,
      },
      preferredRetailer: form.preferredRetailer,
      language: form.language,
      register: form.register,
      // Les expressions québécoises ne concernent que le français.
      regionalDictionary: form.language === 'fr-CA' && form.regionalDictionary,
      updatedAt: now,
    },
  };
};

export const formFromSettings = (s: CaregiverSettings | null, language: AppLocale): SettingsForm =>
  s === null
    ? emptyForm(language)
    : {
        seniorFirstName: s.seniorFirstName ?? '',
        caregiverFirstName: s.caregiverFirstName,
        caregiverMobile: formatMobile(s.caregiverMobile),
        smsConsent: s.smsConsent,
        civicNumber: s.address.civicNumber,
        street: s.address.street,
        apartment: s.address.apartment ?? '',
        city: s.address.city,
        postalCode: s.address.postalCode,
        preferredRetailer: s.preferredRetailer,
        language: s.language,
        register: s.register,
        regionalDictionary: s.regionalDictionary,
      };

/* -------------------------------------------------------------------------- */
/* Changements annoncés au senior                                             */
/* -------------------------------------------------------------------------- */

/** Réglages modifiés, dans l'ordre du formulaire (libellés traduits par src/i18n). */
export const describeChanges = (before: CaregiverSettings | null, after: CaregiverSettings): ChangeKey[] => {
  if (before === null) return [];
  const changes: ChangeKey[] = [];
  if (before.seniorFirstName !== after.seniorFirstName) changes.push('seniorFirstName');
  if (before.caregiverFirstName !== after.caregiverFirstName) changes.push('caregiverFirstName');
  if (before.caregiverMobile !== after.caregiverMobile) changes.push('caregiverMobile');
  if (JSON.stringify(before.address) !== JSON.stringify(after.address)) changes.push('address');
  if ((before.preferredRetailer?.key ?? null) !== (after.preferredRetailer?.key ?? null)) changes.push('preferredRetailer');
  if (before.language !== after.language) changes.push('language');
  if (before.register !== after.register) changes.push('register');
  if (before.regionalDictionary !== after.regionalDictionary) changes.push('regionalDictionary');
  return changes;
};

/* -------------------------------------------------------------------------- */
/* Stockage chiffré                                                           */
/* -------------------------------------------------------------------------- */

export const SETTINGS_STORE_KEY = 'vocourse.caregiver.settings.v2';

export const loadSettings = async (store: SecureStorePort): Promise<CaregiverSettings | null> => {
  const raw = await store.getItem(SETTINGS_STORE_KEY);
  if (raw === null) return null;
  try {
    const s = JSON.parse(raw) as CaregiverSettings;
    // Revalidation complète : des données corrompues ne sont jamais utilisées.
    const check = validateSettingsForm(formFromSettings(s, s.language), s.updatedAt);
    return check.ok ? check.value : null;
  } catch {
    return null;
  }
};

export const saveSettings = (store: SecureStorePort, s: CaregiverSettings): Promise<void> =>
  store.setItem(SETTINGS_STORE_KEY, JSON.stringify(s));
