/**
 * État de la liste de courses — réducteur pur (testable sans React Native).
 */

import type {
  AppLocale,
  ConfirmedItem,
  DisambiguationAnswer,
  IsoDate,
  IsoDateTime,
  ItemId,
  ListId,
  PendingChoiceItem,
  RemovedItem,
  ShoppingList,
  ShoppingListItem,
  ShoppingListStatus,
  Utterance,
  UserId,
} from '../types/vocourse';
import { isPendingChoice, isConfirmed } from '../types/vocourse';

export type ListAction =
  | {
      readonly type: 'ADD_INTERPRETATION';
      readonly utterance: Utterance;
      readonly items: readonly (ConfirmedItem | PendingChoiceItem)[];
      readonly now: IsoDateTime;
    }
  | { readonly type: 'REMOVE_ITEM'; readonly itemId: ItemId; readonly now: IsoDateTime }
  /** Remet un produit retiré par erreur (bouton « Annuler »). */
  | { readonly type: 'RESTORE_ITEM'; readonly itemId: ItemId; readonly now: IsoDateTime }
  /** Quantité d'un produit confirmé, bornée entre MIN_QUANTITY et MAX_QUANTITY. */
  | { readonly type: 'SET_QUANTITY'; readonly itemId: ItemId; readonly quantity: number; readonly now: IsoDateTime }
  | {
      readonly type: 'RESOLVE_DOUBT';
      readonly itemId: ItemId;
      readonly answer: DisambiguationAnswer;
      readonly now: IsoDateTime;
    }
  | { readonly type: 'SET_QUEUED'; readonly count: number }
  | { readonly type: 'MARK_SENT'; readonly now: IsoDateTime }
  | { readonly type: 'RESET'; readonly listId: ListId; readonly now: IsoDateTime; readonly locale: AppLocale }
  /** Liste retrouvée dans le stockage au démarrage ; ignorée si la liste en cours a déjà servi. */
  | { readonly type: 'HYDRATE'; readonly list: ShoppingList };

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 50;

/**
 * Bornes du bouton +/− : au moins 1, au dixième près. Une fraction dictée (« un demi kilo »)
 * reste telle quelle tant qu'on n'y touche pas ; « + » la fait passer à 1,5 kg.
 */
export const clampQuantity = (q: number): number =>
  Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.round(q * 10) / 10));

/** Conservation 12 mois au plus (Loi 25 / avenant CA-3.2). */
export const retentionDate = (now: IsoDateTime): IsoDate => {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10) as IsoDate;
};

export const createEmptyList = (listId: ListId, userId: UserId, now: IsoDateTime, locale: AppLocale = 'fr-CA'): ShoppingList => ({
  listId,
  userId,
  status: 'draft',
  locale,
  createdAt: now,
  updatedAt: now,
  retentionUntil: retentionDate(now),
  utterances: [],
  items: [],
  offlineQueuedCount: 0,
});

const statusFor = (items: readonly ShoppingListItem[], current: ShoppingListStatus): ShoppingListStatus => {
  if (current === 'sent_to_caregiver' || current === 'archived') return current;
  if (items.some(isPendingChoice)) return 'needs_disambiguation';
  return items.some(isConfirmed) ? 'ready' : 'draft';
};

const withItems = (list: ShoppingList, items: readonly ShoppingListItem[], now: IsoDateTime): ShoppingList => ({
  ...list,
  items,
  updatedAt: now,
  status: statusFor(items, list.status),
});

/** Une liste transmise à l'aidant n'est plus modifiable (le panier relu fait foi). */
const locked = (list: ShoppingList): boolean => list.status !== 'draft' && list.status !== 'ready' && list.status !== 'needs_disambiguation';

const resolve = (item: PendingChoiceItem, answer: DisambiguationAnswer, now: IsoDateTime): ConfirmedItem | RemovedItem => {
  if (answer.kind === 'none_matched') {
    return {
      ...item,
      status: 'removed',
      removedAt: now,
      disambiguation: { ...item.disambiguation, resolution: { state: 'none_matched', resolvedAt: now } },
    };
  }
  const chosen = item.disambiguation.candidates.find((c) => c.rank === answer.rank);
  if (!chosen) return { ...item, status: 'removed', removedAt: now };
  return {
    ...item,
    status: 'confirmed',
    productKey: chosen.normalizedProduct,
    productLabel: chosen.label,
    category: chosen.category,
    // Contenant dit (« deux sacs ») gardé ; sinon celui du produit choisi.
    unit: item.unit === 'unit' ? chosen.unit : item.unit,
    packageSize: chosen.packageSize,
    sensitive: chosen.sensitive,
    confidence: 1 as ConfirmedItem['confidence'],
    disambiguation: {
      ...item.disambiguation,
      resolution: { state: 'resolved', selectedRank: chosen.rank, method: answer.method, resolvedAt: now },
    },
  };
};

export const listReducer = (list: ShoppingList, action: ListAction): ShoppingList => {
  switch (action.type) {
    case 'ADD_INTERPRETATION':
      if (locked(list)) return list;
      return withItems(
        { ...list, utterances: [...list.utterances, action.utterance] },
        [...list.items, ...action.items],
        action.now,
      );

    case 'REMOVE_ITEM': {
      if (locked(list)) return list;
      const items = list.items.map((i): ShoppingListItem =>
        i.itemId === action.itemId && i.status !== 'removed' ? { ...i, status: 'removed', removedAt: action.now } : i,
      );
      return withItems(list, items, action.now);
    }

    case 'RESTORE_ITEM': {
      if (locked(list)) return list;
      let changed = false;
      const items = list.items.map((i): ShoppingListItem => {
        if (i.itemId !== action.itemId || i.status !== 'removed') return i;
        // Seul un produit qui avait été confirmé peut revenir (pas un doute écarté).
        if (i.productKey === null || i.productLabel === null || i.category === null) return i;
        changed = true;
        const { removedAt: _removedAt, ...rest } = i;
        return { ...rest, status: 'confirmed', productKey: i.productKey, productLabel: i.productLabel, category: i.category };
      });
      return changed ? withItems(list, items, action.now) : list;
    }

    case 'SET_QUANTITY': {
      if (locked(list)) return list;
      const quantity = clampQuantity(action.quantity);
      let changed = false;
      const items = list.items.map((i): ShoppingListItem => {
        if (i.itemId !== action.itemId || i.status !== 'confirmed' || i.quantity === quantity) return i;
        changed = true;
        return { ...i, quantity };
      });
      return changed ? withItems(list, items, action.now) : list;
    }

    case 'RESOLVE_DOUBT': {
      if (locked(list)) return list;
      const items = list.items.map((i) =>
        i.itemId === action.itemId && isPendingChoice(i) ? resolve(i, action.answer, action.now) : i,
      );
      return withItems(list, items, action.now);
    }

    case 'SET_QUEUED':
      return list.offlineQueuedCount === action.count ? list : { ...list, offlineQueuedCount: action.count };

    case 'MARK_SENT':
      return list.status === 'ready' ? { ...list, status: 'sent_to_caregiver', updatedAt: action.now } : list;

    case 'RESET':
      return createEmptyList(action.listId, list.userId, action.now, action.locale);

    case 'HYDRATE':
      return list.items.length === 0 && list.utterances.length === 0 ? action.list : list;
  }
};
