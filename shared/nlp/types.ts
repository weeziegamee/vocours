/**
 * Types de sortie de l'analyseur de dictée, partagés par le serveur et par le mode
 * démonstration de l'appli. Ils sont structurellement identiques aux types de l'appli
 * (`src/types/vocourse.ts`) : un test de contrat le vérifie.
 *
 * Ce dossier ne dépend d'aucune bibliothèque et n'importe que des fichiers `.ts`
 * voisins (extension explicite), pour fonctionner tel quel sous Node et sous Metro.
 */

export type Locale = 'fr-CA' | 'en-CA';
export type Register = 'vous' | 'tu';

export type Unit =
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

export type SizeUnit = 'g' | 'kg' | 'lb' | 'mL' | 'L';

export interface PackageSize {
  readonly value: number;
  readonly unit: SizeUnit;
}

/** Rayons, indépendants de la langue (le pictogramme est choisi par l'appli). */
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

export interface Candidate {
  readonly rank: 1 | 2 | 3;
  readonly label: string;
  readonly normalizedProduct: string;
  readonly score: number;
  readonly category: Category;
  readonly pictogram: Category;
  readonly unit: Unit;
  readonly packageSize: PackageSize | null;
  readonly sensitive: boolean;
}

export type Candidates = readonly [Candidate] | readonly [Candidate, Candidate] | readonly [Candidate, Candidate, Candidate];

interface ItemBase {
  readonly itemId: string;
  readonly sourceUtteranceId: string;
  readonly spokenText: string;
  readonly quantity: number;
  readonly unit: Unit;
  readonly packageSize: PackageSize | null;
  readonly confidence: number;
  readonly upcs: readonly string[];
  readonly sensitive: boolean;
}

export interface ConfirmedOut extends ItemBase {
  readonly status: 'confirmed';
  readonly productKey: string;
  readonly productLabel: string;
  readonly category: Category;
  readonly disambiguation: null;
}

export interface PendingOut extends ItemBase {
  readonly status: 'pending_choice';
  readonly productKey: null;
  readonly productLabel: null;
  readonly category: null;
  readonly disambiguation: {
    readonly threshold: number;
    readonly candidates: Candidates;
    readonly ttsPrompt: string;
    readonly resolution: { readonly state: 'unresolved' };
  };
}

export type InterpretedItem = ConfirmedOut | PendingOut;

export interface UtteranceOut {
  readonly utteranceId: string;
  readonly locale: Locale;
  readonly rawTranscript: string;
  readonly cleanTranscript: string;
  readonly sttConfidence: number;
  readonly capturedAt: string;
  readonly fromOfflineQueue: boolean;
}

export interface InterpretInput {
  readonly utteranceId: string;
  readonly transcript: string;
  readonly locale: Locale;
  readonly capturedAt: string;
  readonly fromOfflineQueue: boolean;
  /** Expressions québécoises (« bines », « liqueur », « pinte »…). Ignoré en anglais. */
  readonly regionalDictionary: boolean;
  /** Vouvoiement ou tutoiement pour les questions de doute (français seulement). */
  readonly register?: Register;
  /** Confiance renvoyée par la reconnaissance vocale du téléphone, si connue. */
  readonly sttConfidence?: number;
  readonly newItemId: () => string;
}

export interface InterpretOutput {
  readonly utterance: UtteranceOut;
  readonly items: InterpretedItem[];
}
