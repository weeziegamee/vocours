/**
 * Vocourse — modèles de données de l'appli (V3.0 + avenant Canada).
 *
 * Conventions :
 * - Aucun prix n'est estimé ni affiché par Vocourse : seuls ceux d'Instacart font foi.
 * - Dates au format ISO 8601 avec fuseau (type `IsoDateTime`).
 * - Tout est `readonly` : l'état est remplacé, jamais muté.
 * - Le contrat avec le serveur (corps de requête et de réponse) est défini ici et
 *   vérifié par le test de bout en bout `__tests__/contract.test.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Types utilitaires                                                          */
/* -------------------------------------------------------------------------- */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Date-heure ISO 8601 avec fuseau, ex. « 2026-10-14T09:14:03-04:00 ». */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;
/** Date ISO 8601 sans heure, ex. « 2027-10-14 ». */
export type IsoDate = Brand<string, 'IsoDate'>;
/** Score de confiance entre 0 et 1 (inclus). */
export type Confidence = Brand<number, 'Confidence'>;
/** Code postal canadien normalisé « A1A 1A1 ». */
export type CanadianPostalCode = Brand<string, 'CanadianPostalCode'>;

export type ListId = Brand<string, 'ListId'>;
export type ItemId = Brand<string, 'ItemId'>;
export type UtteranceId = Brand<string, 'UtteranceId'>;
export type UserId = Brand<string, 'UserId'>;

/** Tableau de 1 à N éléments, garanti non vide à la compilation. */
export type NonEmptyArray<T> = readonly [T, ...T[]];

/* -------------------------------------------------------------------------- */
/* Langue, marché                                                             */
/* -------------------------------------------------------------------------- */

/** Français canadien par défaut ; anglais canadien au choix de l'aidant. */
export type AppLocale = 'fr-CA' | 'en-CA';

/** Provinces et territoires (codes de Postes Canada). */
export type Province = 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';

/** Gammes de panier (cahier V3.0 §3.3), sans montant. */
export type BasketTier = 'economy' | 'balanced' | 'premium_organic';

/** Rayons, indépendants de la langue ; le pictogramme en découle. */
export type Category =
  | 'dairy'
  | 'bakery'
  | 'pantry'
  | 'deli'
  | 'meat'
  | 'beverages'
  | 'produce'
  | 'frozen'
  | 'snacks'
  | 'household'
  | 'personal_care'
  | 'other';

/* -------------------------------------------------------------------------- */
/* Liste de courses                                                           */
/* -------------------------------------------------------------------------- */

export type ShoppingListStatus =
  | 'draft'
  | 'needs_disambiguation'
  | 'ready'
  | 'sent_to_caregiver' // lien Instacart transmis à l'aidant
  | 'archived';

export type ItemStatus = 'confirmed' | 'pending_choice' | 'removed';

/** Unités internes Vocourse (affichage et voix). */
export type DomainUnit =
  | 'unit'
  | 'carton'
  | 'bag'
  | 'can'
  | 'box'
  | 'jar'
  | 'bottle'
  | 'package'
  | 'dozen'
  | 'case'
  | 'bunch'
  | 'head'
  | 'g'
  | 'kg'
  | 'lb'
  | 'mL'
  | 'L';

export interface PackageSize {
  readonly value: number;
  readonly unit: 'g' | 'kg' | 'lb' | 'mL' | 'L';
}

/** Une prise de parole. Seul le texte reconnu sur le téléphone est envoyé, jamais l'audio. */
export interface Utterance {
  readonly utteranceId: UtteranceId;
  readonly locale: AppLocale;
  readonly rawTranscript: string;
  readonly cleanTranscript: string;
  readonly sttConfidence: Confidence;
  readonly capturedAt: IsoDateTime;
  /** Vrai si la dictée a transité par la file hors ligne (V3.0 §4.5). */
  readonly fromOfflineQueue: boolean;
}

/** Candidat de levée de doute (3 au maximum, V3.0 §2 étape 5). */
export interface DisambiguationCandidate {
  readonly rank: 1 | 2 | 3;
  readonly label: string;
  readonly normalizedProduct: string;
  readonly score: Confidence;
  /** Repris tels quels par le produit si ce candidat est choisi. */
  readonly category: Category;
  readonly pictogram: Category;
  readonly unit: DomainUnit;
  readonly packageSize: PackageSize | null;
  readonly sensitive: boolean;
}

/** 1, 2 ou 3 candidats : le type interdit une 4e carte. */
export type DisambiguationCandidates =
  | readonly [DisambiguationCandidate]
  | readonly [DisambiguationCandidate, DisambiguationCandidate]
  | readonly [DisambiguationCandidate, DisambiguationCandidate, DisambiguationCandidate];

export type ResolutionMethod = 'tap' | 'voice' | 'redictation';

export type DisambiguationResolution =
  | { readonly state: 'unresolved' }
  | {
      readonly state: 'resolved';
      readonly selectedRank: 1 | 2 | 3;
      readonly method: ResolutionMethod;
      readonly resolvedAt: IsoDateTime;
    }
  | { readonly state: 'none_matched'; readonly resolvedAt: IsoDateTime };

export interface Disambiguation {
  readonly threshold: Confidence;
  readonly candidates: DisambiguationCandidates;
  /** Phrase lue : « Vouliez-vous du beurre ou des œufs ? » */
  readonly ttsPrompt: string;
  readonly resolution: DisambiguationResolution;
}

interface ShoppingListItemBase {
  readonly itemId: ItemId;
  readonly sourceUtteranceId: UtteranceId;
  /** Fragment dicté : « deux pintes de lait 2 % ». */
  readonly spokenText: string;
  readonly quantity: number;
  readonly unit: DomainUnit;
  readonly packageSize: PackageSize | null;
  readonly confidence: Confidence;
  readonly upcs: readonly string[];
  /**
   * Catégorie sensible (santé implicite : incontinence, tests, suppléments…).
   * Exclue des suggestions et des notifications (avenant CA-3.3), jamais filtrée chez Instacart.
   */
  readonly sensitive: boolean;
}

/** Produit confirmé : libellé obligatoire, aucun doute en suspens. */
export interface ConfirmedItem extends ShoppingListItemBase {
  readonly status: 'confirmed';
  /** Clé du lexique (« lait-2-2l ») ou produit libre (« free:pate-chinois »). */
  readonly productKey: string;
  readonly productLabel: string;
  readonly category: Category;
  readonly disambiguation: Disambiguation | null;
}

/** Produit en attente de choix : levée de doute obligatoire et non résolue. */
export interface PendingChoiceItem extends ShoppingListItemBase {
  readonly status: 'pending_choice';
  readonly productKey: null;
  readonly productLabel: null;
  readonly category: null;
  readonly disambiguation: Disambiguation & {
    readonly resolution: { readonly state: 'unresolved' };
  };
}

export interface RemovedItem extends ShoppingListItemBase {
  readonly status: 'removed';
  readonly productKey: string | null;
  readonly productLabel: string | null;
  readonly category: Category | null;
  readonly disambiguation: Disambiguation | null;
  readonly removedAt: IsoDateTime;
}

export type ShoppingListItem = ConfirmedItem | PendingChoiceItem | RemovedItem;

export interface ShoppingList {
  readonly listId: ListId;
  readonly userId: UserId;
  readonly status: ShoppingListStatus;
  readonly locale: AppLocale;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /** Conservation 12 mois au plus (Loi 25 / avenant CA-3.2). */
  readonly retentionUntil: IsoDate;
  readonly utterances: readonly Utterance[];
  readonly items: readonly ShoppingListItem[];
  /** Nombre de dictées en file locale hors ligne (pastille de l'écran A). */
  readonly offlineQueuedCount: number;
}

/* -------------------------------------------------------------------------- */
/* Interfaces consommées par les écrans                                       */
/* -------------------------------------------------------------------------- */

/** `offline_recording` : écoute sur l'appareil sans Internet, la dictée est mise en file. */
export type MicState = 'idle' | 'listening' | 'processing' | 'offline_recording';

export type DisambiguationAnswer =
  | { readonly kind: 'candidate'; readonly rank: 1 | 2 | 3; readonly method: 'tap' | 'voice' }
  | { readonly kind: 'none_matched' };

export interface SpeakOptions {
  /**
   * `false` : la phrase va jusqu'au bout malgré la parole du senior (barge-in coupé).
   * Réservé à la relecture finale avant « Je commande » (V3.0 §4.6) ; un appui l'interrompt.
   */
  readonly interruptible: boolean;
}

/** Synthèse vocale (voix du téléphone, fr-CA ou en-CA). */
export interface TtsPort {
  /** Se résout quand la phrase est finie ou interrompue ; ne rejette jamais. */
  speak(text: string, options?: SpeakOptions): Promise<'completed' | 'interrupted'>;
  stop(): void;
  setLocale(locale: AppLocale): void;
}

/** Intentions vocales reconnues sur le téléphone (écran B et questions de doute). */
export type VoiceIntent = { readonly intentId: string } & (
  | { readonly kind: 'yes' }
  | { readonly kind: 'no' }
  | { readonly kind: 'repeat' }
  | { readonly kind: 'choose_tier'; readonly tier: BasketTier }
  /** Phrase « Oui, je commande » : seconde confirmation vocale. */
  | { readonly kind: 'confirm_order' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'choose_candidate'; readonly rank: 1 | 2 | 3 }
  | { readonly kind: 'none_matched' }
);

/* -------------------------------------------------------------------------- */
/* Confirmation souveraine (article 8.7 / 8.10 du mandat)                     */
/* -------------------------------------------------------------------------- */

export interface FirstConfirmation {
  readonly method: 'voice' | 'tap';
  readonly at: IsoDateTime;
}

export type SecondConfirmation =
  | { readonly method: 'long_press'; readonly durationMs: number; readonly at: IsoDateTime }
  | { readonly method: 'voice'; readonly at: IsoDateTime }
  /** Lecteur d'écran : double-tap délibéré sur l'action dédiée. */
  | { readonly method: 'screen_reader_action'; readonly at: IsoDateTime };

export interface SovereignConfirmation {
  readonly readbackStartedAt: IsoDateTime;
  readonly readbackCompletedAt: IsoDateTime;
  /** Texte exact relu, conservé comme preuve (12 mois au plus). */
  readonly readbackText: string;
  readonly first: FirstConfirmation;
  readonly second: SecondConfirmation;
  readonly actor: 'senior';
}

/* -------------------------------------------------------------------------- */
/* Contrat avec le serveur                                                    */
/* -------------------------------------------------------------------------- */

export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
export type HandoffId = Brand<string, 'HandoffId'>;
export type DeviceId = Brand<string, 'DeviceId'>;

export interface Consent {
  /** Version de la politique de confidentialité acceptée. */
  readonly version: string;
  readonly acceptedAt: IsoDateTime;
  /**
   * Autorise la reconnaissance vocale en ligne d'Apple ou de Google quand le téléphone ne
   * sait pas reconnaître la voix sur l'appareil.
   */
  readonly cloudSpeech: boolean;
}

export interface DeviceRegistrationRequest {
  readonly locale: AppLocale;
  readonly platform: 'ios' | 'android';
  readonly consent: Consent;
}

export interface DeviceRegistration {
  readonly deviceId: DeviceId;
  /** Secret long gardé dans le Keychain / Keystore ; échangé contre des jetons courts. */
  readonly deviceSecret: string;
  readonly accessToken: string;
  readonly expiresIn: number;
}

export interface AccessToken {
  readonly accessToken: string;
  readonly expiresIn: number;
}

/** Texte reconnu d'une prise, envoyé pour analyse. */
export interface InterpretRequest {
  readonly utteranceId: UtteranceId;
  readonly transcript: string;
  readonly locale: AppLocale;
  readonly capturedAt: IsoDateTime;
  readonly fromOfflineQueue: boolean;
  /** Expressions québécoises (« bines », « liqueur », « pinte »…), réglé par l'aidant. */
  readonly regionalDictionary: boolean;
  readonly register: VoiceRegister;
  readonly sttConfidence?: number;
}

/** Produits extraits d'une prise : confirmés, ou en attente de levée de doute. */
export interface InterpretResponse {
  readonly utterance: Utterance;
  readonly items: readonly (ConfirmedItem | PendingChoiceItem)[];
}

/** Ligne transmise au serveur pour la page Instacart. */
export interface HandoffItem {
  readonly itemId: ItemId;
  readonly productKey: string;
  readonly productLabel: string;
  readonly quantity: number;
  readonly unit: DomainUnit;
  readonly packageSize: PackageSize | null;
  readonly sensitive: boolean;
  readonly category: Category;
}

/**
 * Liste confirmée par le senior. Aucune donnée d'identité : le serveur identifie le
 * compte par le jeton, construit la page Instacart (la clé reste serveur) et prévient l'aidant.
 */
export interface HandoffRequest {
  readonly listId: ListId;
  readonly tier: BasketTier;
  readonly items: NonEmptyArray<HandoffItem>;
  /** Empreinte des produits relus ; le serveur refuse une liste différente. */
  readonly itemsDigest: string;
  readonly confirmation: SovereignConfirmation;
  readonly locale: AppLocale;
}

export interface HandoffResponse {
  readonly handoffId: HandoffId;
  readonly status: 'sent_to_caregiver';
  readonly caregiverNotified: boolean;
  /** `pending` : le texto sera renvoyé ; `opted_out` : l'aidant a répondu STOP. */
  readonly smsStatus: 'sent' | 'pending' | 'opted_out';
  readonly caregiverFirstName: string;
  readonly receivedAt: IsoDateTime;
  readonly linkExpiresAt: IsoDateTime;
}

export type BackendErrorKind =
  | 'offline' // pas de réseau
  | 'timeout'
  | 'unauthorized' // 401 / 403 : appareil inconnu ou révoqué
  | 'conflict' // 409 : action impossible dans l'état actuel (voir `code`)
  | 'rejected' // autre 4xx : demande invalide
  | 'rate_limited' // 429
  | 'server' // 5xx après nouvelles tentatives
  | 'bad_response'; // réponse non conforme au contrat

export interface BackendError {
  readonly kind: BackendErrorKind;
  readonly status: number | null;
  readonly attempts: number;
  /** Code renvoyé par le serveur (« caregiver_unverified », « invalid_code »…). */
  readonly code?: string;
  /** Essais restants pour un code de vérification. */
  readonly attemptsLeft?: number;
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/* -------------------------------------------------------------------------- */
/* Ports matériels (micro, réseau, stockage)                                  */
/* -------------------------------------------------------------------------- */

export type SpeechErrorReason =
  | 'permission_denied'
  | 'no_speech'
  /** Prise arrêtée avant même d'avoir démarré (second appui rapide, réinitialisation) : rien à dire. */
  | 'cancelled'
  /** Pas d'Internet et reconnaissance sur l'appareil indisponible. */
  | 'needs_network'
  /** Reconnaissance en ligne nécessaire, mais non autorisée par l'aidant. */
  | 'cloud_not_allowed'
  | 'unavailable';

export interface SpeechCallbacks {
  /** Transcription partielle, affichée en direct. */
  readonly onPartial: (text: string) => void;
  /** Fin de prise (silence de 4 s ou second appui). */
  readonly onFinal: (text: string, confidence: number | null) => void;
  readonly onError: (reason: SpeechErrorReason) => void;
}

export interface SpeechPort {
  start(callbacks: SpeechCallbacks): void;
  /** Termine la prise en cours : `onFinal` est appelé avec ce qui a été entendu. */
  stop(): void;
  setLocale(locale: AppLocale): void;
  /** Autorisation donnée par l'aidant d'utiliser la reconnaissance en ligne. */
  setCloudAllowed(allowed: boolean): void;
  /** Vrai si la voix est reconnue sur l'appareil (fonctionne hors ligne). */
  worksOffline(): Promise<boolean>;
}

export interface NetworkPort {
  /** Joignabilité du serveur Vocourse (pas seulement l'état du Wi-Fi). */
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

/** Stockage chiffré de l'appareil (Keychain iOS / Keystore Android). */
export interface SecureStorePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Espace aidant (V3.0 §6, avenant Canada CA-1.4, CA-5)                       */
/* -------------------------------------------------------------------------- */

/** Numéro de mobile au format E.164 nord-américain : « +15145550123 ». */
export type E164Phone = Brand<string, 'E164Phone'>;

/** Formule d'adresse de la voix française : vouvoiement par défaut, tutoiement au choix. */
export type VoiceRegister = 'vous' | 'tu';

export interface DeliveryAddress {
  readonly civicNumber: string;
  readonly street: string;
  readonly apartment: string | null;
  readonly city: string;
  readonly province: Province;
  readonly postalCode: CanadianPostalCode;
}

export interface Retailer {
  readonly key: string;
  readonly name: string;
  readonly logoUrl: string | null;
}

export interface CaregiverSettings {
  /** Prénom du senior, pour la salutation et les textos (facultatif). */
  readonly seniorFirstName: string | null;
  readonly caregiverFirstName: string;
  readonly caregiverMobile: E164Phone;
  /** Consentement exprès aux textos (Loi 25, LCAP) ; requis pour l'envoi du lien Instacart. */
  readonly smsConsent: true;
  readonly address: DeliveryAddress;
  /** Épicerie rappelée à l'aidant ; c'est lui qui choisit le magasin sur Instacart. */
  readonly preferredRetailer: { readonly key: string; readonly name: string } | null;
  /** Langue de l'appli, de la voix et des textos. */
  readonly language: AppLocale;
  readonly register: VoiceRegister;
  readonly regionalDictionary: boolean;
  readonly updatedAt: IsoDateTime;
}

export interface CaregiverSettingsSaved {
  readonly savedAt: IsoDateTime;
  readonly caregiverMobileVerified: boolean;
}

export interface CaregiverStatus {
  readonly settingsSaved: boolean;
  readonly caregiverMobileVerified: boolean;
  readonly caregiverOptedOut: boolean;
}

export type VerificationPurpose = 'mobile' | 'pin_reset';

export interface VerificationStarted {
  /** Numéro masqué : « •••-•••-0123 ». */
  readonly sentTo: string;
  readonly expiresInSeconds: number;
}

export type CaregiverAlert = { readonly kind: 'pin_lockout' } | { readonly kind: 'settings_changed' };

/* -------------------------------------------------------------------------- */
/* Gardes de type                                                             */
/* -------------------------------------------------------------------------- */

export const isPendingChoice = (item: ShoppingListItem): item is PendingChoiceItem =>
  item.status === 'pending_choice';

export const isConfirmed = (item: ShoppingListItem): item is ConfirmedItem =>
  item.status === 'confirmed';

/** « C'est bon » n'est actif que si aucun doute n'est en suspens (V3.0 §3.2). */
export const canValidateList = (list: ShoppingList): boolean =>
  list.items.some(isConfirmed) && !list.items.some(isPendingChoice);

export const BASKET_TIERS: readonly [BasketTier, BasketTier, BasketTier] = [
  'economy',
  'balanced',
  'premium_organic',
];

export const PROVINCES: readonly Province[] = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
