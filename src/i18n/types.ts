/**
 * Contrat des textes de l'appli. Chaque langue (fr.ts, en.ts) fournit exactement ces
 * clés : TypeScript refuse une traduction incomplète.
 *
 * Charte de la voix (V3.0 §5) : phrases courtes, ton calme, jamais « erreur » ni « échec ».
 */

import type {
  AppLocale,
  BackendErrorKind,
  BasketTier,
  ConfirmedItem,
  DomainUnit,
  MicState,
  Province,
} from '../types/vocourse';
import type { PinWeakness } from '../services/security/pinPolicy';

export type SettingsFieldKey =
  | 'seniorFirstName'
  | 'caregiverFirstName'
  | 'caregiverMobile'
  | 'smsConsent'
  | 'civicNumber'
  | 'street'
  | 'apartment'
  | 'city'
  | 'postalCode'
  | 'preferredRetailer'
  | 'language'
  | 'register'
  | 'regionalDictionary';

export type SettingsErrorKey =
  | 'firstName'
  | 'seniorFirstName'
  | 'mobile'
  | 'smsConsent'
  | 'civicNumber'
  | 'street'
  | 'apartment'
  | 'city'
  | 'postalFormat';

export type ChangeKey =
  | 'seniorFirstName'
  | 'caregiverFirstName'
  | 'caregiverMobile'
  | 'address'
  | 'preferredRetailer'
  | 'language'
  | 'register'
  | 'regionalDictionary';

export interface Strings {
  readonly locale: AppLocale;

  readonly common: {
    readonly back: string;
    readonly close: string;
    readonly cancel: string;
    readonly save: string;
    readonly saving: string;
    readonly retry: string;
    readonly repeat: string;
    readonly repeatHint: string;
    readonly yes: string;
    readonly no: string;
    readonly continue: string;
    readonly optional: string;
    readonly errorPrefix: string;
    readonly ofN: (i: number, n: number) => string;
  };

  readonly format: {
    readonly quantity: (q: number) => string;
    readonly quantityWithUnit: (q: number, unit: DomainUnit) => string;
    /** « 2 cartons de lait 2 % » — lu par la voix et le lecteur d'écran. */
    readonly itemSpoken: (item: ConfirmedItem) => string;
    readonly countProducts: (n: number) => string;
    readonly tierLabel: (tier: BasketTier) => string;
    readonly tierPhrase: (tier: BasketTier) => string;
    readonly tierDescription: (tier: BasketTier, store: string | null) => string;
    readonly province: (p: Province) => string;
    readonly joinAnd: (parts: readonly string[]) => string;
    readonly countdown: (ms: number) => { readonly visual: string; readonly spoken: string };
    readonly shortName: (label: string) => string;
  };

  /** Répliques de la voix sur l'écran « Ma liste » et pendant la dictée. */
  readonly voice: {
    readonly welcome: (firstName: string | null) => string;
    readonly noting: string;
    readonly noted: (items: readonly ConfirmedItem[]) => string;
    readonly doubtResolved: (label: string) => string;
    readonly redictate: string;
    readonly removed: (label: string) => string;
    readonly restored: (label: string) => string;
    readonly quantityChanged: (item: ConfirmedItem) => string;
    readonly listReady: string;
    readonly nothingHeard: string;
    readonly micPermission: string;
    readonly needsNetwork: string;
    readonly cloudNotAllowed: string;
    readonly speechUnavailable: string;
    readonly offlineListening: string;
    readonly offlineSaved: string;
    readonly queueFull: string;
    readonly backOnline: string;
    readonly interpretFailed: string;
    /** Une prise gardée a été refusée par le serveur : elle est retirée de la file. */
    readonly interpretDropped: string;
    readonly newList: string;
    readonly settingsChanged: (caregiver: string, changes: readonly ChangeKey[]) => string;
    readonly notUnderstood: string;
  };

  readonly home: {
    readonly brand: string;
    readonly greeting: (hour: number, firstName: string | null, hasItems: boolean) => { readonly title: string; readonly subtitle: string };
    readonly caregiverButton: string;
    readonly caregiverA11y: string;
    readonly caregiverHint: string;
    readonly myList: (n: number) => string;
    readonly exampleTitle: string;
    readonly example: string;
    readonly severalTimes: string;
    readonly removedBanner: (label: string) => string;
    readonly undo: string;
    readonly undoA11y: (label: string) => string;
    readonly undoHint: string;
    readonly micSpeak: string;
    readonly micStop: string;
    readonly micCompactHint: string;
    readonly validate: string;
    readonly validateHintDoubt: string;
    readonly validateHintEmpty: string;
    readonly validateHintReady: string;
    readonly noPricesNote: (caregiver: string | null) => string;
    readonly status: {
      readonly listening: string;
      readonly listeningDetail: (offline: boolean) => string;
      readonly processing: string;
      readonly processingDetail: string;
      readonly added: (n: number) => string;
      readonly doubt: string;
      readonly doubtDetail: string;
      readonly offline: string;
      readonly offlineDetail: string;
      readonly queued: (n: number) => string;
      readonly writing: string;
      readonly idle: string;
      readonly idleEmpty: string;
      readonly idleMore: string;
    };
    readonly mic: Readonly<Record<MicState, { readonly label: string; readonly hint: string }>>;
  };

  readonly item: {
    readonly less: (name: string) => string;
    readonly more: (name: string) => string;
    readonly minHint: string;
    readonly maxHint: (max: number) => string;
    readonly currentHint: (q: string) => string;
    readonly remove: string;
    readonly removeA11y: (name: string) => string;
    readonly removeHint: string;
  };

  readonly doubt: {
    readonly choiceA11y: (rank: number, count: number, label: string) => string;
    readonly choiceHint: string;
    readonly none: string;
    readonly noneHint: string;
    readonly speakHint: string;
  };

  readonly preparing: { readonly title: string; readonly subtitle: string };

  readonly basket: {
    readonly title: string;
    readonly backHint: string;
    readonly preferredStore: (store: string, caregiver: string) => string;
    readonly noPrices: (caregiver: string) => string;
    readonly choiceGroup: string;
    readonly tierA11y: (index: number, count: number, tier: BasketTier, description: string, selected: boolean) => string;
    readonly tierHint: string;
    readonly selected: string;
    readonly continueWith: (tier: BasketTier) => string;
    readonly chooseFirst: string;
    readonly continueHint: string;
    readonly readbackTitle: string;
    readonly stopReading: string;
    readonly stopReadingHint: string;
    readonly change: string;
    readonly changeHint: string;
    readonly confirmYes: string;
    readonly confirmYesHint: string;
    readonly order: string;
    readonly orderSub: (caregiver: string) => string;
    readonly orderHint: string;
    readonly cancelOrder: string;
    readonly cancelOrderHint: string;
    readonly sendingLabel: (caregiver: string) => string;
    readonly backToList: string;
    readonly backToListHint: string;
    readonly keptHint: string;
    readonly retryHint: string;
    readonly sentTitle: string;
    readonly speak: string;
    readonly speakHint: string;
    readonly listening: string;
    readonly why: string;
    readonly whyHint: string;
    /** Répliques. */
    readonly v: {
      readonly announce: (caregiver: string, store: string | null) => string;
      readonly tierSelected: (tier: BasketTier, store: string | null) => string;
      readonly readback: (tier: BasketTier, items: readonly ConfirmedItem[], caregiver: string, store: string | null) => string;
      readonly armLongPress: string;
      readonly holdReleasedTooEarly: string;
      readonly sending: (caregiver: string) => string;
      readonly sent: (caregiver: string) => string;
      readonly sentPending: (caregiver: string) => string;
      readonly sentOptedOut: (caregiver: string) => string;
      readonly cancelled: string;
      readonly whyNoPrice: (caregiver: string) => string;
      readonly failure: (kind: BackendErrorKind, code: string | undefined, caregiver: string) => string;
    };
  };

  readonly longPress: {
    readonly hold: string;
    readonly holding: string;
    readonly unavailable: string;
  };

  readonly pin: {
    readonly title: string;
    readonly blocked: string;
    readonly choose: string;
    readonly confirm: string;
    readonly checking: string;
    readonly enter: string;
    readonly newCodeIntro: string;
    readonly firstAccessIntro: string;
    /** Aucun code enregistré après la configuration : passer par « Code oublié ? ». */
    readonly noCodeUseForgot: string;
    readonly sameAgain: string;
    readonly mismatch: string;
    readonly wrong: (left: number) => string;
    readonly lockedAnnounce: string;
    readonly lockedBanner: string;
    readonly retryIn: (visual: string) => string;
    readonly lockedA11y: (spoken: string) => string;
    readonly unlockedAgain: string;
    readonly codeOk: string;
    readonly codeSaved: string;
    readonly digitEntered: (n: number, total: number) => string;
    readonly digitEnteredLast: string;
    readonly digitErased: (n: number, total: number) => string;
    readonly digitsA11y: (n: number, total: number) => string;
    readonly erase: string;
    readonly cancelHint: string;
    readonly eraseHint: string;
    readonly forgot: string;
    readonly forgotHint: string;
    readonly weakness: (w: PinWeakness) => string;
  };

  readonly verify: {
    readonly titleMobile: string;
    readonly titlePin: string;
    readonly sending: string;
    readonly sent: (sentTo: string) => string;
    readonly codeLabel: string;
    readonly codeHint: string;
    readonly submit: string;
    readonly checking: string;
    readonly resend: string;
    readonly invalid: (left: number) => string;
    readonly expired: string;
    readonly sendFailed: string;
    readonly optedOut: string;
    readonly offline: string;
    readonly rateLimited: string;
    readonly verified: string;
    readonly later: string;
    readonly laterHint: string;
  };

  readonly onboarding: {
    readonly welcomeTitle: string;
    readonly welcomeBody: string;
    readonly whoSetsUp: string;
    readonly privacyTitle: string;
    readonly privacyPoints: readonly string[];
    readonly privacyLink: string;
    readonly privacyLinkHint: string;
    readonly cloudSpeechLabel: string;
    readonly cloudSpeechDescription: (platform: 'ios' | 'android') => string;
    readonly acceptLabel: string;
    readonly acceptDescription: string;
    readonly accept: string;
    readonly acceptRequired: string;
    readonly registering: string;
    readonly needsInternet: string;
    readonly registerFailed: string;
    readonly stepPin: string;
    readonly stepSettings: string;
    readonly stepVerify: string;
    readonly done: string;
    readonly doneBody: (senior: string | null) => string;
    readonly start: string;
    readonly sessionLost: string;
    readonly sessionLostBody: string;
    readonly restart: string;
  };

  readonly settings: {
    readonly title: string;
    readonly setupTitle: string;
    readonly sectionSenior: string;
    readonly sectionCaregiver: string;
    readonly sectionAddress: string;
    readonly sectionStore: string;
    readonly sectionVoice: string;
    readonly sectionSecurity: string;
    readonly sectionPrivacy: string;
    readonly fields: Readonly<Record<SettingsFieldKey, string>>;
    readonly hints: {
      readonly seniorFirstName: string;
      readonly caregiverFirstName: string;
      readonly caregiverMobile: string;
      readonly street: string;
      readonly postalCode: string;
    };
    readonly smsConsentLabel: string;
    readonly smsConsentDescription: string;
    readonly provinceLine: (province: string | null) => string;
    readonly errors: Readonly<Record<SettingsErrorKey, string>> & {
      readonly preferredRetailer: string;
    };
    readonly retailersLoading: string;
    readonly retailersFailed: string;
    readonly retailersNone: string;
    readonly retailersNeedAddress: string;
    readonly noPreference: string;
    readonly storeNote: string;
    readonly languages: Readonly<Record<AppLocale, string>>;
    readonly registerVous: string;
    readonly registerVousHint: string;
    readonly registerTu: string;
    readonly registerTuHint: string;
    readonly registerGroup: string;
    readonly regionalDescription: string;
    readonly changePin: string;
    readonly changePinHint: string;
    readonly mobileVerified: string;
    readonly mobileUnverified: string;
    readonly mobileOptedOut: string;
    readonly verifyNow: string;
    readonly privacyPolicy: string;
    readonly exportData: string;
    readonly exportHint: string;
    readonly exportFailed: string;
    readonly deleteAccount: string;
    readonly deleteHint: string;
    readonly deleteTitle: string;
    readonly deleteBody: string;
    readonly deleteConfirm: string;
    readonly deleteFailed: string;
    readonly discardTitle: string;
    readonly discardBody: string;
    readonly keepEditing: string;
    readonly discard: string;
    readonly saved: string;
    readonly savedShort: string;
    readonly saveOffline: string;
    readonly saveFailed: string;
    readonly errorsCount: (n: number) => string;
    readonly errorsA11y: (n: number, fields: readonly string[]) => string;
    readonly closeHint: string;
    readonly saveHint: string;
    readonly next: string;
  };
}
