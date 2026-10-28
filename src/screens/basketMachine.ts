/**
 * Automate de l'écran B « Mon panier » — logique pure, sans React Native.
 *
 *  choosing ──(Continuer)──▶ reading_back ──(lecture finie)──▶ awaiting_first
 *     ▲                          │ (lecture arrêtée)                │ « Oui »
 *     └──────────────────────────┴───────── (Annuler / Non) ◀───── armed
 *                                                                   │ appui 2 s / « Oui, je commande »
 *                                    failed ◀──(échec)── sending ◀──┘
 *                                      └──(Réessayer, même clé)──▶ sending ──(succès)──▶ sent
 *
 * Garanties :
 * - Aucune transmission sans relecture complète + deux confirmations distinctes.
 * - La liste transmise est exactement celle qui a été relue (même empreinte), sinon
 *   la transition est refusée ; le serveur refait la même vérification.
 * - Une nouvelle tentative réutilise la même requête et la même clé d'idempotence.
 * - Toute transition non prévue laisse l'état inchangé.
 */

import type {
  AppLocale,
  BackendError,
  BasketTier,
  ConfirmedItem,
  FirstConfirmation,
  HandoffRequest,
  HandoffResponse,
  IdempotencyKey,
  IsoDateTime,
  ListId,
  NonEmptyArray,
  SecondConfirmation,
} from '../types/vocourse';
import { itemsDigest, toHandoffItems } from '../services/handoff/digest';

export interface Readback {
  readonly startedAt: IsoDateTime;
  readonly completedAt: IsoDateTime;
  readonly text: string;
  readonly digest: string;
}

export type BasketPhase =
  | { readonly name: 'choosing' }
  | { readonly name: 'reading_back'; readonly startedAt: IsoDateTime; readonly text: string; readonly digest: string }
  | { readonly name: 'awaiting_first'; readonly readback: Readback }
  | { readonly name: 'armed'; readonly readback: Readback; readonly first: FirstConfirmation }
  | { readonly name: 'sending'; readonly request: HandoffRequest; readonly key: IdempotencyKey }
  | { readonly name: 'sent'; readonly response: HandoffResponse }
  | { readonly name: 'failed'; readonly request: HandoffRequest; readonly key: IdempotencyKey; readonly error: BackendError };

export interface BasketState {
  readonly tier: BasketTier | null;
  readonly phase: BasketPhase;
}

export type BasketAction =
  | { readonly type: 'SELECT_TIER'; readonly tier: BasketTier }
  | { readonly type: 'START_READBACK'; readonly startedAt: IsoDateTime; readonly text: string; readonly items: readonly ConfirmedItem[] }
  | { readonly type: 'READBACK_DONE'; readonly completedAt: IsoDateTime }
  | { readonly type: 'READBACK_INTERRUPTED' }
  | { readonly type: 'FIRST_CONFIRM'; readonly confirmation: FirstConfirmation }
  | {
      readonly type: 'SECOND_CONFIRM';
      readonly confirmation: SecondConfirmation;
      readonly listId: ListId;
      readonly items: readonly ConfirmedItem[];
      readonly key: IdempotencyKey;
      readonly locale: AppLocale;
    }
  | { readonly type: 'CANCEL' }
  | { readonly type: 'SUBMIT_OK'; readonly response: HandoffResponse }
  | { readonly type: 'SUBMIT_FAILED'; readonly error: BackendError }
  | { readonly type: 'RETRY' };

export const initialBasketState = (tier: BasketTier | null): BasketState => ({ tier, phase: { name: 'choosing' } });

const nonEmpty = <T>(xs: readonly T[]): NonEmptyArray<T> | null => {
  const [first, ...rest] = xs;
  return first === undefined ? null : [first, ...rest];
};

export const basketReducer = (state: BasketState, action: BasketAction): BasketState => {
  const { phase } = state;
  switch (action.type) {
    case 'SELECT_TIER':
      return phase.name === 'choosing' ? { ...state, tier: action.tier } : state;

    case 'START_READBACK':
      if (phase.name !== 'choosing' || state.tier === null || action.items.length === 0) return state;
      return {
        ...state,
        phase: { name: 'reading_back', startedAt: action.startedAt, text: action.text, digest: itemsDigest(action.items) },
      };

    case 'READBACK_DONE':
      if (phase.name !== 'reading_back') return state;
      return {
        ...state,
        phase: {
          name: 'awaiting_first',
          readback: { startedAt: phase.startedAt, completedAt: action.completedAt, text: phase.text, digest: phase.digest },
        },
      };

    case 'READBACK_INTERRUPTED':
      return phase.name === 'reading_back' ? { ...state, phase: { name: 'choosing' } } : state;

    case 'FIRST_CONFIRM':
      if (phase.name !== 'awaiting_first') return state;
      return { ...state, phase: { name: 'armed', readback: phase.readback, first: action.confirmation } };

    case 'SECOND_CONFIRM': {
      if (phase.name !== 'armed' || state.tier === null) return state;
      const items = nonEmpty(action.items);
      // La liste transmise doit être celle qui a été relue, produit pour produit.
      if (!items || itemsDigest(items) !== phase.readback.digest) return state;
      const request: HandoffRequest = {
        listId: action.listId,
        tier: state.tier,
        items: toHandoffItems(items),
        itemsDigest: phase.readback.digest,
        locale: action.locale,
        confirmation: {
          readbackStartedAt: phase.readback.startedAt,
          readbackCompletedAt: phase.readback.completedAt,
          readbackText: phase.readback.text,
          first: phase.first,
          second: action.confirmation,
          actor: 'senior',
        },
      };
      return { ...state, phase: { name: 'sending', request, key: action.key } };
    }

    case 'CANCEL':
      return phase.name === 'reading_back' || phase.name === 'awaiting_first' || phase.name === 'armed' || phase.name === 'failed'
        ? { ...state, phase: { name: 'choosing' } }
        : state;

    case 'SUBMIT_OK':
      return phase.name === 'sending' ? { ...state, phase: { name: 'sent', response: action.response } } : state;

    case 'SUBMIT_FAILED':
      return phase.name === 'sending' ? { ...state, phase: { name: 'failed', request: phase.request, key: phase.key, error: action.error } } : state;

    case 'RETRY': {
      // Réessayer n'a de sens que pour une panne passagère ; une demande refusée resterait refusée.
      const retryable = phase.name === 'failed' && ['offline', 'timeout', 'server', 'rate_limited'].includes(phase.error.kind);
      return phase.name === 'failed' && retryable ? { ...state, phase: { name: 'sending', request: phase.request, key: phase.key } } : state;
    }
  }
};
