/**
 * État de la liste (réducteur pur) + persistance chiffrée : la liste survit à la fermeture
 * de l'appli et au redémarrage du téléphone. Écriture regroupée 400 ms après le dernier
 * changement, jamais avant d'avoir relu la liste gardée (pour ne pas l'écraser).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type {
  AppLocale,
  ConfirmedItem,
  DisambiguationAnswer,
  InterpretResponse,
  ItemId,
  ListId,
  PendingChoiceItem,
  SecureStorePort,
  ShoppingList,
  UserId,
} from '../types/vocourse';
import { isConfirmed, isPendingChoice } from '../types/vocourse';
import { createEmptyList, listReducer } from '../state/listReducer';
import { loadList, saveList } from '../services/storage/persistence';
import { nowIso } from '../utils/ids';

const newListId = (): ListId => `lst_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}` as ListId;

export interface ShoppingListApi {
  readonly list: ShoppingList;
  readonly hydrated: boolean;
  readonly confirmedItems: readonly ConfirmedItem[];
  /** Un seul doute à la fois : le premier en suspens. */
  readonly currentDoubt: PendingChoiceItem | null;
  addInterpretation(response: InterpretResponse): void;
  removeItem(itemId: ItemId): void;
  restoreItem(itemId: ItemId): void;
  setQuantity(itemId: ItemId, quantity: number): void;
  resolveDoubt(itemId: ItemId, answer: DisambiguationAnswer): void;
  setQueuedCount(count: number): void;
  markSent(): void;
  reset(): void;
}

export const useShoppingList = (userId: UserId, store: SecureStorePort, locale: AppLocale): ShoppingListApi => {
  const [list, dispatch] = useReducer(listReducer, undefined, () => createEmptyList(newListId(), userId, nowIso(), locale));
  const [hydrated, setHydrated] = useState(false);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    let active = true;
    void loadList(store, new Date())
      .then((saved) => {
        if (active && saved) dispatch({ type: 'HYDRATE', list: saved });
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [store]);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => void saveList(store, list).catch(() => undefined), 400);
    return () => clearTimeout(t);
  }, [list, hydrated, store]);

  const confirmedItems = useMemo(() => list.items.filter(isConfirmed), [list.items]);
  const currentDoubt = useMemo(() => list.items.find(isPendingChoice) ?? null, [list.items]);

  const addInterpretation = useCallback(
    (r: InterpretResponse) => dispatch({ type: 'ADD_INTERPRETATION', utterance: r.utterance, items: r.items, now: nowIso() }),
    [],
  );
  const removeItem = useCallback((itemId: ItemId) => dispatch({ type: 'REMOVE_ITEM', itemId, now: nowIso() }), []);
  const restoreItem = useCallback((itemId: ItemId) => dispatch({ type: 'RESTORE_ITEM', itemId, now: nowIso() }), []);
  const setQuantity = useCallback(
    (itemId: ItemId, quantity: number) => dispatch({ type: 'SET_QUANTITY', itemId, quantity, now: nowIso() }),
    [],
  );
  const resolveDoubt = useCallback(
    (itemId: ItemId, answer: DisambiguationAnswer) => dispatch({ type: 'RESOLVE_DOUBT', itemId, answer, now: nowIso() }),
    [],
  );
  const setQueuedCount = useCallback((count: number) => dispatch({ type: 'SET_QUEUED', count }), []);
  const markSent = useCallback(() => dispatch({ type: 'MARK_SENT', now: nowIso() }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET', listId: newListId(), now: nowIso(), locale: localeRef.current }), []);

  return {
    list,
    hydrated,
    confirmedItems,
    currentDoubt,
    addInterpretation,
    removeItem,
    restoreItem,
    setQuantity,
    resolveDoubt,
    setQueuedCount,
    markSent,
    reset,
  };
};
